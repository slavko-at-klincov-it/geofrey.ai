import { readFile, writeFile, unlink, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { registerTool } from "./tool-registry.js";

const PROJECT_ROOT = process.cwd();

function confine(path: string): string {
  const resolved = resolve(path);
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(PROJECT_ROOT + "/")) {
    throw new Error(`Path outside project directory: ${path}`);
  }
  return resolved;
}

registerTool({
  name: "read_file",
  description: "Read the contents of a file",
  parameters: z.object({ path: z.string() }),
  source: "native",
  execute: async ({ path }) => {
    const content = await readFile(confine(path), "utf-8");
    return content;
  },
});

registerTool({
  name: "write_file",
  description: "Write content to a file",
  parameters: z.object({ path: z.string(), content: z.string() }),
  source: "native",
  execute: async ({ path, content }) => {
    await writeFile(confine(path), content, "utf-8");
    return `Written: ${path}`;
  },
});

registerTool({
  name: "delete_file",
  description: "Delete a file",
  parameters: z.object({ path: z.string() }),
  source: "native",
  execute: async ({ path }) => {
    await unlink(confine(path));
    return `Deleted: ${path}`;
  },
});

registerTool({
  name: "list_dir",
  description: "List directory contents",
  parameters: z.object({ path: z.string() }),
  source: "native",
  execute: async ({ path }) => {
    const entries = await readdir(confine(path || "."), { withFileTypes: true });
    return entries
      .map((e) => `${e.isDirectory() ? "d" : "f"} ${e.name}`)
      .join("\n");
  },
});
