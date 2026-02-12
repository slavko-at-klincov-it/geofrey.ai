import { readFile, writeFile, unlink, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { registerTool } from "./tool-registry.js";

registerTool({
  name: "read_file",
  description: "Read the contents of a file",
  parameters: z.object({ path: z.string() }),
  source: "native",
  execute: async ({ path }) => {
    const content = await readFile(resolve(path), "utf-8");
    return content;
  },
});

registerTool({
  name: "write_file",
  description: "Write content to a file",
  parameters: z.object({ path: z.string(), content: z.string() }),
  source: "native",
  execute: async ({ path, content }) => {
    await writeFile(resolve(path), content, "utf-8");
    return `Written: ${path}`;
  },
});

registerTool({
  name: "delete_file",
  description: "Delete a file",
  parameters: z.object({ path: z.string() }),
  source: "native",
  execute: async ({ path }) => {
    await unlink(resolve(path));
    return `Deleted: ${path}`;
  },
});

registerTool({
  name: "list_dir",
  description: "List directory contents",
  parameters: z.object({ path: z.string() }),
  source: "native",
  execute: async ({ path }) => {
    const entries = await readdir(resolve(path || "."), { withFileTypes: true });
    return entries
      .map((e) => `${e.isDirectory() ? "d" : "f"} ${e.name}`)
      .join("\n");
  },
});
