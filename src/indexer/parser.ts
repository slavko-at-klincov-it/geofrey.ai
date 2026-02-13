import ts from "typescript";

export interface ExportInfo {
  name: string;
  kind: "function" | "class" | "const" | "let" | "type" | "interface" | "enum" | "default" | "re-export";
  isDefault: boolean;
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  isTypeOnly: boolean;
}

export interface ParseResult {
  exports: ExportInfo[];
  imports: ImportInfo[];
  leadingComment: string | null;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === kind) ?? false;
}

function getExportKind(node: ts.Node): ExportInfo["kind"] {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isVariableStatement(node)) {
    const flags = node.declarationList.flags;
    return flags & ts.NodeFlags.Const ? "const" : "let";
  }
  return "const";
}

function getDeclarationNames(node: ts.Node): string[] {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.name ? [node.name.text] : [];
  }
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations
      .filter((d) => ts.isIdentifier(d.name))
      .map((d) => (d.name as ts.Identifier).text);
  }
  return [];
}

export function parseFile(sourceText: string, fileName: string): ParseResult {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const exports: ExportInfo[] = [];
  const imports: ImportInfo[] = [];

  for (const stmt of sourceFile.statements) {
    // Imports
    if (ts.isImportDeclaration(stmt)) {
      const moduleSpecifier = stmt.moduleSpecifier;
      if (!ts.isStringLiteral(moduleSpecifier)) continue;
      const source = moduleSpecifier.text;
      const isTypeOnly = stmt.importClause?.isTypeOnly ?? false;
      const specifiers: string[] = [];

      if (stmt.importClause) {
        if (stmt.importClause.name) {
          specifiers.push(stmt.importClause.name.text);
        }
        const bindings = stmt.importClause.namedBindings;
        if (bindings) {
          if (ts.isNamespaceImport(bindings)) {
            specifiers.push("*");
          } else if (ts.isNamedImports(bindings)) {
            for (const el of bindings.elements) {
              specifiers.push(el.name.text);
            }
          }
        }
      }

      // Bare import (e.g. import "./side-effect.js")
      if (specifiers.length === 0 && !stmt.importClause) {
        specifiers.push("*");
      }

      imports.push({ source, specifiers, isTypeOnly });
      continue;
    }

    // Export declarations (re-exports and named exports without declaration)
    if (ts.isExportDeclaration(stmt)) {
      if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        // Re-export: export { foo } from "./bar" or export * from "./bar"
        if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
          for (const el of stmt.exportClause.elements) {
            exports.push({
              name: (el.propertyName ?? el.name).text,
              kind: "re-export",
              isDefault: false,
            });
          }
        } else {
          // export * from "./bar"
          exports.push({ name: "*", kind: "re-export", isDefault: false });
        }
      } else if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        // Named export without source: export { foo, bar }
        for (const el of stmt.exportClause.elements) {
          exports.push({
            name: el.name.text,
            kind: "const",
            isDefault: el.name.text === "default",
          });
        }
      }
      continue;
    }

    // Export assignment: export default expr
    if (ts.isExportAssignment(stmt)) {
      const name = ts.isIdentifier(stmt.expression)
        ? stmt.expression.text
        : "default";
      exports.push({ name, kind: "default", isDefault: true });
      continue;
    }

    // Exported declarations
    if (hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) {
      const isDefault = hasModifier(stmt, ts.SyntaxKind.DefaultKeyword);
      const kind = getExportKind(stmt);
      const names = getDeclarationNames(stmt);

      if (names.length === 0 && isDefault) {
        exports.push({ name: "default", kind, isDefault: true });
      }
      for (const name of names) {
        exports.push({ name, kind, isDefault });
      }
    }
  }

  // Leading comment
  let leadingComment: string | null = null;
  const commentRanges = ts.getLeadingCommentRanges(sourceText, 0);
  if (commentRanges && commentRanges.length > 0) {
    const range = commentRanges[0];
    let text = sourceText.slice(range.pos, range.end);
    // Strip comment delimiters
    if (text.startsWith("/**")) {
      text = text.slice(3, text.endsWith("*/") ? -2 : undefined);
    } else if (text.startsWith("/*")) {
      text = text.slice(2, text.endsWith("*/") ? -2 : undefined);
    } else if (text.startsWith("//")) {
      text = text.slice(2);
    }
    text = text
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, "").trim())
      .filter((line) => line.length > 0)
      .join(" ")
      .trim();
    if (text.length > 0) {
      leadingComment = text.length > 120 ? text.slice(0, 117) + "..." : text;
    }
  }

  return { exports, imports, leadingComment };
}
