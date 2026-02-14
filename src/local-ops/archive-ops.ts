import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat, readFile, writeFile } from "node:fs/promises";
import { createGzip, createGunzip } from "node:zlib";
import { resolve, relative, basename, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { confine, formatSize } from "./helpers.js";
import { t } from "../i18n/index.js";

/**
 * Create a .tar.gz archive from a directory or list of files.
 * Uses a simple tar implementation via Node.js streams.
 */
export async function archiveCreateOp(
  sources: string[],
  output: string,
): Promise<string> {
  const outPath = confine(output);
  const resolvedSources = sources.map((s) => confine(s));

  // Build tar buffer manually (simplified POSIX tar format)
  const chunks: Buffer[] = [];

  for (const source of resolvedSources) {
    const st = await stat(source);
    if (st.isDirectory()) {
      await addDirectoryToTar(chunks, source, source);
    } else {
      await addFileToTar(chunks, source, basename(source));
    }
  }

  // End-of-archive marker (two 512-byte zero blocks)
  chunks.push(Buffer.alloc(1024));

  const tarBuffer = Buffer.concat(chunks);

  // Gzip compress and write
  const { gzipSync } = await import("node:zlib");
  const compressed = gzipSync(tarBuffer);
  await writeFile(outPath, compressed);

  return t("localOps.archiveCreated", { path: output, size: formatSize(compressed.length) });
}

async function addDirectoryToTar(chunks: Buffer[], rootDir: string, currentDir: string): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(currentDir, entry.name);
    const relativePath = relative(dirname(rootDir), fullPath);

    if (entry.isDirectory()) {
      // Add directory header
      chunks.push(createTarHeader(relativePath + "/", 0, "5"));
      await addDirectoryToTar(chunks, rootDir, fullPath);
    } else {
      await addFileToTar(chunks, fullPath, relativePath);
    }
  }
}

async function addFileToTar(chunks: Buffer[], filePath: string, name: string): Promise<void> {
  const content = await readFile(filePath);
  chunks.push(createTarHeader(name, content.length, "0"));
  chunks.push(content);
  // Pad to 512-byte boundary
  const remainder = content.length % 512;
  if (remainder > 0) {
    chunks.push(Buffer.alloc(512 - remainder));
  }
}

function createTarHeader(name: string, size: number, type: string): Buffer {
  const header = Buffer.alloc(512);

  // Name (0-99)
  header.write(name.slice(0, 100), 0, 100, "utf-8");
  // Mode (100-107)
  header.write("0000755\0", 100, 8, "utf-8");
  // UID (108-115)
  header.write("0001000\0", 108, 8, "utf-8");
  // GID (116-123)
  header.write("0001000\0", 116, 8, "utf-8");
  // Size (124-135) — octal
  header.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "utf-8");
  // Mtime (136-147)
  header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "utf-8");
  // Checksum placeholder (148-155)
  header.write("        ", 148, 8, "utf-8");
  // Type flag (156)
  header.write(type, 156, 1, "utf-8");
  // USTAR magic (257-262)
  header.write("ustar\0", 257, 6, "utf-8");
  // USTAR version (263-264)
  header.write("00", 263, 2, "utf-8");

  // Calculate and write checksum
  let checksum = 0;
  for (let i = 0; i < 512; i++) {
    checksum += header[i];
  }
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf-8");

  return header;
}

/**
 * Extract a .tar.gz archive to a destination directory.
 */
export async function archiveExtractOp(
  archivePath: string,
  destination: string,
): Promise<string> {
  const srcPath = confine(archivePath);
  const destPath = confine(destination);

  await mkdir(destPath, { recursive: true });

  const compressed = await readFile(srcPath);
  const { gunzipSync } = await import("node:zlib");
  const tarBuffer = gunzipSync(compressed);

  let offset = 0;
  let fileCount = 0;

  while (offset < tarBuffer.length - 512) {
    const header = tarBuffer.subarray(offset, offset + 512);

    // Check for end-of-archive (all zeros)
    if (header.every((b) => b === 0)) break;

    const name = header.subarray(0, 100).toString("utf-8").replace(/\0.*$/, "");
    const sizeStr = header.subarray(124, 136).toString("utf-8").replace(/\0.*$/, "").trim();
    const size = parseInt(sizeStr, 8) || 0;
    const typeFlag = header.subarray(156, 157).toString("utf-8");

    offset += 512;

    if (!name) continue;

    const targetPath = resolve(destPath, name);
    // Security: ensure extracted files stay within destination
    if (!targetPath.startsWith(destPath + "/") && targetPath !== destPath) {
      throw new Error(t("localOps.archivePathEscape", { path: name }));
    }

    if (typeFlag === "5" || name.endsWith("/")) {
      // Directory
      await mkdir(targetPath, { recursive: true });
    } else {
      // File
      await mkdir(dirname(targetPath), { recursive: true });
      const content = tarBuffer.subarray(offset, offset + size);
      await writeFile(targetPath, content);
      fileCount++;
    }

    // Advance past file content (padded to 512)
    offset += Math.ceil(size / 512) * 512;
  }

  return t("localOps.archiveExtracted", { count: String(fileCount), destination });
}
