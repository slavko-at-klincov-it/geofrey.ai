import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { isValidTelegramToken, isValidAnthropicKey, validateTelegramToken, validateOllamaConnection, validateAnthropicKey } from "./validate.js";

describe("isValidTelegramToken", () => {
  it("accepts valid token format", () => {
    assert.equal(isValidTelegramToken("12345678:ABCDefgh_ijklmnopqrstuvwxyz12345678"), true);
  });

  it("accepts 12-digit bot ID", () => {
    assert.equal(isValidTelegramToken("123456789012:ABCDefgh_ijklmnopqrstuvwxyz12345678"), true);
  });

  it("rejects token with too few digits", () => {
    assert.equal(isValidTelegramToken("1234567:ABCDefgh_ijklmnopqrstuvwxyz12345678"), false);
  });

  it("rejects empty string", () => {
    assert.equal(isValidTelegramToken(""), false);
  });

  it("rejects token missing colon separator", () => {
    assert.equal(isValidTelegramToken("12345678ABCDefgh_ijklmnopqrstuvwxyz12345678"), false);
  });
});

describe("isValidAnthropicKey", () => {
  it("accepts valid key format", () => {
    assert.equal(isValidAnthropicKey("sk-ant-abc123_DEF456-ghijklmnopqrs"), true);
  });

  it("rejects key without sk-ant- prefix", () => {
    assert.equal(isValidAnthropicKey("sk-abc123_DEF456-ghijklmnopqrs"), false);
  });

  it("rejects empty string", () => {
    assert.equal(isValidAnthropicKey(""), false);
  });

  it("rejects key with too short suffix", () => {
    assert.equal(isValidAnthropicKey("sk-ant-short"), false);
  });
});

describe("validateTelegramToken", () => {
  it("returns bot info for valid token", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => new Response(
      JSON.stringify({ ok: true, result: { username: "test_bot", first_name: "Test Bot" } }),
      { status: 200 },
    )) as unknown as typeof fetch;

    try {
      const result = await validateTelegramToken("12345678:valid-token-here_1234567890abcde");
      assert.deepEqual(result, { username: "test_bot", name: "Test Bot" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null for invalid token", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => new Response(
      JSON.stringify({ ok: false }),
      { status: 401 },
    )) as unknown as typeof fetch;

    try {
      const result = await validateTelegramToken("invalid");
      assert.equal(result, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null on network error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => { throw new Error("network"); }) as unknown as typeof fetch;

    try {
      const result = await validateTelegramToken("12345678:valid-token-here_1234567890abcde");
      assert.equal(result, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("validateOllamaConnection", () => {
  it("returns connected with models", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => new Response(
      JSON.stringify({ models: [{ name: "qwen3:8b" }, { name: "llama3:8b" }] }),
      { status: 200 },
    )) as unknown as typeof fetch;

    try {
      const result = await validateOllamaConnection("http://localhost:11434");
      assert.equal(result.connected, true);
      assert.deepEqual(result.models, ["qwen3:8b", "llama3:8b"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns disconnected on error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;

    try {
      const result = await validateOllamaConnection("http://localhost:11434");
      assert.equal(result.connected, false);
      assert.deepEqual(result.models, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("validateAnthropicKey", () => {
  it("returns true for valid key (200 response)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;

    try {
      assert.equal(await validateAnthropicKey("sk-ant-valid-key-here_12345678"), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns true for valid key (400 response = key valid, bad request)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;

    try {
      assert.equal(await validateAnthropicKey("sk-ant-valid-key-here_12345678"), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns false for invalid key (401 response)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;

    try {
      assert.equal(await validateAnthropicKey("sk-ant-invalid-key_12345678901"), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
