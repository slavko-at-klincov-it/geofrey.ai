export interface TelegramBotInfo {
  username: string;
  name: string;
}

export function isValidTelegramToken(token: string): boolean {
  return /^\d{8,12}:[A-Za-z0-9_-]{35}$/.test(token);
}

export function isValidAnthropicKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key);
}

export async function validateTelegramToken(token: string): Promise<TelegramBotInfo | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!res.ok) return null;
    const data = await res.json() as { ok: boolean; result?: { username: string; first_name: string } };
    if (!data.ok || !data.result) return null;
    return { username: data.result.username, name: data.result.first_name };
  } catch {
    return null;
  }
}

export async function validateOllamaConnection(baseUrl: string): Promise<{ connected: boolean; models: string[] }> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return { connected: false, models: [] };
    const data = await res.json() as { models?: Array<{ name: string }> };
    return { connected: true, models: data.models?.map((m) => m.name) ?? [] };
  } catch {
    return { connected: false, models: [] };
  }
}

export async function validateAnthropicKey(key: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    // 200 or 400 (bad request) = key is valid, 401 = invalid
    return res.status !== 401;
  } catch {
    return false;
  }
}
