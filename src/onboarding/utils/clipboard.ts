export async function readTokenFromClipboard(pattern: RegExp): Promise<string | null> {
  try {
    const { default: clipboardy } = await import("clipboardy");
    const text = await clipboardy.read();
    const match = text.match(pattern);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}
