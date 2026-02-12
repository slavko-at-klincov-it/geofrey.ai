#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];

if (arg === "setup") {
  await import(resolve(__dirname, "../dist/onboarding/setup.js"));
} else {
  await import(resolve(__dirname, "../dist/index.js"));
}
