import { execa } from "execa";
import { stepHeader, success, warn, fail, info, spinner } from "../utils/ui.js";
import { askYesNo } from "../utils/prompt.js";
import { validateOllamaConnection } from "../utils/validate.js";

export interface PrerequisiteResult {
  nodeOk: boolean;
  pnpmOk: boolean;
  ollamaOk: boolean;
  modelLoaded: boolean;
  claudeCliOk: boolean;
}

export async function runPrerequisites(model = "qwen3:8b", ollamaUrl = "http://localhost:11434"): Promise<PrerequisiteResult> {
  stepHeader(0, "Voraussetzungen");

  const result: PrerequisiteResult = {
    nodeOk: false,
    pnpmOk: false,
    ollamaOk: false,
    modelLoaded: false,
    claudeCliOk: false,
  };

  // 1. Node.js
  const nodeVersion = parseInt(process.version.slice(1), 10);
  if (nodeVersion >= 22) {
    success(`Node.js ${process.version}`);
    result.nodeOk = true;
  } else {
    fail(`Node.js ${process.version} — Version 22+ erforderlich`);
    info("→ nvm install 22");
    return result;
  }

  // 2. pnpm
  try {
    const { stdout } = await execa("pnpm", ["--version"]);
    success(`pnpm ${stdout.trim()}`);
    result.pnpmOk = true;
  } catch {
    warn("pnpm nicht gefunden");
    info("→ npm install -g pnpm");
  }

  // 3. Ollama
  let ollamaStatus = await validateOllamaConnection(ollamaUrl);
  if (ollamaStatus.connected) {
    success(`Ollama läuft (${ollamaUrl})`);
    result.ollamaOk = true;
  } else {
    warn("Ollama nicht erreichbar");
    const startOllama = await askYesNo("→ Ollama starten? (ollama serve)");
    if (startOllama) {
      try {
        // Start ollama serve detached
        const child = execa("ollama", ["serve"], { detached: true, stdio: "ignore" });
        child.unref();
        // Wait a bit for it to start
        const spin = spinner("Ollama startet...");
        await new Promise((r) => setTimeout(r, 3000));
        ollamaStatus = await validateOllamaConnection(ollamaUrl);
        if (ollamaStatus.connected) {
          spin.succeed("Ollama läuft");
          result.ollamaOk = true;
        } else {
          spin.fail("Ollama konnte nicht gestartet werden");
          info("→ Starte manuell: ollama serve");
        }
      } catch {
        fail("Fehler beim Starten von Ollama");
        info("→ Installieren: https://ollama.com");
      }
    }
  }

  // 4. Model check
  if (result.ollamaOk) {
    if (ollamaStatus.models.some((m) => m.startsWith(model.split(":")[0]))) {
      success(`${model} geladen`);
      result.modelLoaded = true;
    } else {
      warn(`Modell '${model}' nicht geladen`);
      const pullModel = await askYesNo(`→ Modell herunterladen? (~5 GB)`);
      if (pullModel) {
        const spin = spinner(`${model} wird heruntergeladen...`);
        try {
          await execa("ollama", ["pull", model], { timeout: 600_000 });
          spin.succeed(`${model} geladen`);
          result.modelLoaded = true;
        } catch {
          spin.fail(`Fehler beim Herunterladen von ${model}`);
        }
      }
    }
  }

  // 5. Claude Code CLI
  try {
    const { stdout } = await execa("claude", ["--version"]);
    success(`Claude Code CLI ${stdout.trim()}`);
    result.claudeCliOk = true;
  } catch {
    warn("Claude Code CLI nicht gefunden");
    const install = await askYesNo("→ Claude Code installieren?");
    if (install) {
      const spin = spinner("Claude Code wird installiert...");
      try {
        await execa("npm", ["install", "-g", "@anthropic-ai/claude-code"], { timeout: 120_000 });
        spin.succeed("Claude Code installiert");
        result.claudeCliOk = true;
      } catch {
        spin.fail("Installation fehlgeschlagen");
        info("→ npm install -g @anthropic-ai/claude-code");
      }
    }
  }

  return result;
}
