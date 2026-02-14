import { z } from "zod";
import { registerTool } from "../tools/tool-registry.js";
import { mkdirOp, copyFileOp, moveFileOp, fileInfoOp, findFilesOp, searchReplaceOp } from "./file-ops.js";
import { treeOp, dirSizeOp } from "./dir-ops.js";
import { textStatsOp, headOp, tailOp, diffFilesOp, sortLinesOp, base64Op, countLinesOp } from "./text-ops.js";
import { systemInfoOp, diskSpaceOp, envGetOp } from "./system-ops.js";
import { archiveCreateOp, archiveExtractOp } from "./archive-ops.js";

// --- File operations ---

registerTool({
  name: "mkdir",
  description: "Create a directory (recursive). Use for creating project folders, output directories, etc.",
  parameters: z.object({ path: z.string().describe("Directory path to create") }),
  source: "native",
  execute: async ({ path }) => mkdirOp(path),
});

registerTool({
  name: "copy_file",
  description: "Copy a file from source to destination. Use for backups, duplicating configs, etc.",
  parameters: z.object({
    source: z.string().describe("Source file path"),
    destination: z.string().describe("Destination file path"),
  }),
  source: "native",
  execute: async ({ source, destination }) => copyFileOp(source, destination),
});

registerTool({
  name: "move_file",
  description: "Move or rename a file. Use for reorganizing files, renaming.",
  parameters: z.object({
    source: z.string().describe("Current file path"),
    destination: z.string().describe("New file path"),
  }),
  source: "native",
  execute: async ({ source, destination }) => moveFileOp(source, destination),
});

registerTool({
  name: "file_info",
  description: "Get file metadata: size, dates, type, permissions. Use instead of stat commands.",
  parameters: z.object({ path: z.string().describe("File or directory path") }),
  source: "native",
  execute: async ({ path }) => fileInfoOp(path),
});

registerTool({
  name: "find_files",
  description: "Find files matching a pattern (supports * and ** wildcards). Use instead of find/locate commands.",
  parameters: z.object({
    directory: z.string().describe("Directory to search in"),
    pattern: z.string().describe("Glob pattern (e.g. '*.ts', '**/*.test.ts')"),
    maxResults: z.number().optional().describe("Max results (default 50)"),
  }),
  source: "native",
  execute: async ({ directory, pattern, maxResults }) => findFilesOp(directory, pattern, { maxResults }),
});

registerTool({
  name: "search_replace",
  description: "Search and replace text in a file. Supports literal strings and regex. Use for bulk text changes.",
  parameters: z.object({
    path: z.string().describe("File path"),
    search: z.string().describe("Text or regex pattern to find"),
    replace: z.string().describe("Replacement text"),
    regex: z.boolean().optional().describe("Treat search as regex (default false)"),
  }),
  source: "native",
  execute: async ({ path, search, replace, regex }) => searchReplaceOp(path, search, replace, { regex }),
});

// --- Directory operations ---

registerTool({
  name: "tree",
  description: "Show directory structure as a tree. Use to understand project layout.",
  parameters: z.object({
    path: z.string().describe("Directory path"),
    maxDepth: z.number().optional().describe("Max depth (default 4)"),
    maxEntries: z.number().optional().describe("Max entries (default 200)"),
  }),
  source: "native",
  execute: async ({ path, maxDepth, maxEntries }) => treeOp(path, { maxDepth, maxEntries }),
});

registerTool({
  name: "dir_size",
  description: "Calculate total size of a directory recursively. Use to check disk usage.",
  parameters: z.object({ path: z.string().describe("Directory path") }),
  source: "native",
  execute: async ({ path }) => dirSizeOp(path),
});

// --- Text operations ---

registerTool({
  name: "text_stats",
  description: "Get text statistics: line count, word count, character count, file size.",
  parameters: z.object({ path: z.string().describe("File path") }),
  source: "native",
  execute: async ({ path }) => textStatsOp(path),
});

registerTool({
  name: "head",
  description: "Read the first N lines of a file. Default 10 lines.",
  parameters: z.object({
    path: z.string().describe("File path"),
    lines: z.number().optional().describe("Number of lines (default 10)"),
  }),
  source: "native",
  execute: async ({ path, lines }) => headOp(path, lines),
});

registerTool({
  name: "tail",
  description: "Read the last N lines of a file. Default 10 lines.",
  parameters: z.object({
    path: z.string().describe("File path"),
    lines: z.number().optional().describe("Number of lines (default 10)"),
  }),
  source: "native",
  execute: async ({ path, lines }) => tailOp(path, lines),
});

registerTool({
  name: "diff_files",
  description: "Compare two files and show line-by-line differences.",
  parameters: z.object({
    pathA: z.string().describe("First file path"),
    pathB: z.string().describe("Second file path"),
  }),
  source: "native",
  execute: async ({ pathA, pathB }) => diffFilesOp(pathA, pathB),
});

registerTool({
  name: "sort_lines",
  description: "Sort lines of a file alphabetically or numerically. Returns sorted content (does not modify file).",
  parameters: z.object({
    path: z.string().describe("File path"),
    reverse: z.boolean().optional().describe("Reverse sort order"),
    numeric: z.boolean().optional().describe("Sort numerically"),
  }),
  source: "native",
  execute: async ({ path, reverse, numeric }) => sortLinesOp(path, { reverse, numeric }),
});

registerTool({
  name: "base64",
  description: "Encode or decode base64 strings. Use for encoding data, decoding tokens, etc.",
  parameters: z.object({
    input: z.string().describe("Text to encode/decode"),
    action: z.enum(["encode", "decode"]).describe("'encode' or 'decode'"),
  }),
  source: "native",
  execute: async ({ input, action }) => base64Op(input, action),
});

registerTool({
  name: "count_lines",
  description: "Count the number of lines in a file.",
  parameters: z.object({ path: z.string().describe("File path") }),
  source: "native",
  execute: async ({ path }) => countLinesOp(path),
});

// --- System operations ---

registerTool({
  name: "system_info",
  description: "Get system information: CPU, memory, OS, uptime. Use for diagnostics.",
  parameters: z.object({}),
  source: "native",
  execute: async () => systemInfoOp(),
});

registerTool({
  name: "disk_space",
  description: "Get disk space usage for all mounted volumes.",
  parameters: z.object({}),
  source: "native",
  execute: async () => diskSpaceOp(),
});

registerTool({
  name: "env_get",
  description: "Get the value of an environment variable. Sensitive values are redacted.",
  parameters: z.object({ name: z.string().describe("Environment variable name") }),
  source: "native",
  execute: async ({ name }) => envGetOp(name),
});

// --- Archive operations ---

registerTool({
  name: "archive_create",
  description: "Create a .tar.gz archive from files or directories.",
  parameters: z.object({
    sources: z.array(z.string()).describe("Files or directories to archive"),
    output: z.string().describe("Output archive path (.tar.gz)"),
  }),
  source: "native",
  execute: async ({ sources, output }) => archiveCreateOp(sources, output),
});

registerTool({
  name: "archive_extract",
  description: "Extract a .tar.gz archive to a destination directory.",
  parameters: z.object({
    archivePath: z.string().describe("Path to .tar.gz file"),
    destination: z.string().describe("Directory to extract into"),
  }),
  source: "native",
  execute: async ({ archivePath, destination }) => archiveExtractOp(archivePath, destination),
});
