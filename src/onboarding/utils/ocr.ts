import { platform } from "node:os";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOKEN_PATTERNS = {
  telegram: /\d{8,12}:[A-Za-z0-9_-]{35}/,
  anthropic: /sk-ant-[A-Za-z0-9_-]{20,}/,
} as const;

export type TokenType = keyof typeof TOKEN_PATTERNS;

export async function captureScreenshot(): Promise<string | null> {
  const { execa } = await import("execa");
  const outPath = join(tmpdir(), `geofrey-ocr-${Date.now()}.png`);

  try {
    const os = platform();
    if (os === "darwin") {
      await execa("screencapture", ["-i", outPath]);
    } else if (os === "win32") {
      // PowerShell: SnippingTool or fallback to clipboard capture
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        Start-Process -FilePath "SnippingTool" -ArgumentList "/clip" -Wait -ErrorAction SilentlyContinue
        if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
          $img = [System.Windows.Forms.Clipboard]::GetImage()
          $img.Save("${outPath.replace(/\\/g, "\\\\")}")
        }
      `.trim();
      await execa("powershell", ["-NoProfile", "-Command", psScript], { timeout: 60_000 });
    } else {
      // Linux: try gnome-screenshot first, fallback to scrot
      try {
        await execa("gnome-screenshot", ["-a", "-f", outPath]);
      } catch {
        await execa("scrot", ["-s", outPath]);
      }
    }
    return existsSync(outPath) ? outPath : null;
  } catch {
    return null;
  }
}

export async function extractTokenFromImage(imagePath: string, tokenType: TokenType): Promise<string | null> {
  if (!existsSync(imagePath)) return null;

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  try {
    const { data: { text } } = await worker.recognize(imagePath);
    const pattern = TOKEN_PATTERNS[tokenType];
    const match = text.match(pattern);
    return match ? match[0] : null;
  } finally {
    await worker.terminate();
  }
}

export function cleanupScreenshot(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // ignore cleanup errors
  }
}
