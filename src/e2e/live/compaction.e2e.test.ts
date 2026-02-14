import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../../db/client.js";
import { estimateTokens, shouldCompact, estimateMessagesTokens } from "../../orchestrator/compaction/token-counter.js";
import { pruneToolResults, pruneOldMessages } from "../../orchestrator/compaction/pruner.js";
import {
  setCompactionConfig,
  compactHistory,
} from "../../orchestrator/compaction/compactor.js";
import {
  setDbUrl,
  getOrCreate,
  addMessage,
  getHistory,
} from "../../orchestrator/conversation.js";
import { ensureOllama } from "./helpers/ollama-guard.js";
import { createTestEnv, type TestEnv } from "./helpers/test-env.js";

describe("E2E: Session Compaction (token counting, pruning, Ollama summarization)", { timeout: 300_000 }, () => {
  let env: TestEnv;
  let ollamaAvailable = false;
  let ollamaBaseUrl = "";
  let ollamaModel = "";

  before(async () => {
    env = await createTestEnv();
    getDb(env.dbUrl);
    setDbUrl(env.dbUrl);

    const guard = await ensureOllama();
    ollamaAvailable = !guard.skip;
    ollamaBaseUrl = guard.baseUrl;
    ollamaModel = guard.model;
  });

  after(async () => {
    await env.cleanup();
  });

  it("estimateTokens returns reasonable approximation", () => {
    // The implementation uses ~4 chars per token
    const text = "Dies ist ein Testtext mit genau achtzig Zeichen, um die Token-Schätzung zu prüfen.";
    const tokens = estimateTokens(text);

    // text.length / 4, rounded up
    const expected = Math.ceil(text.length / 4);
    assert.equal(tokens, expected, `Expected ${expected} tokens for ${text.length} chars`);

    // Empty string should return 0
    assert.equal(estimateTokens(""), 0);

    // Single char should return 1
    assert.equal(estimateTokens("a"), 1);

    // A known length: 100 chars should give 25 tokens
    const hundredChars = "a".repeat(100);
    assert.equal(estimateTokens(hundredChars), 25);
  });

  it("shouldCompact returns false for small history", () => {
    const messages = [
      { role: "user", content: "Hallo, wie geht es dir?" },
      { role: "assistant", content: "Mir geht es gut, danke!" },
      { role: "user", content: "Was ist das Wetter heute?" },
      { role: "assistant", content: "Leider kann ich das Wetter nicht abrufen." },
      { role: "user", content: "Okay, dann erzähl mir einen Witz." },
    ];

    const result = shouldCompact(messages, 16384);
    assert.equal(result, false, "5 short messages should not trigger compaction at 16384 context");

    // Verify the token count is actually small
    const tokens = estimateMessagesTokens(messages);
    assert.ok(tokens < 100, `Expected <100 tokens for 5 short messages, got ${tokens}`);
  });

  it("shouldCompact returns true for large history", () => {
    // Create 200+ messages that fill a significant portion of the context
    // Each message ~300 chars = ~75 tokens + 4 overhead = ~79 tokens
    // 200 messages * 79 tokens = ~15800 tokens > 75% of 16384 (12288)
    const messages: Array<{ role: string; content: string }> = [];
    for (let i = 0; i < 200; i++) {
      const role = i % 2 === 0 ? "user" : "assistant";
      const content = `Nachricht Nummer ${i}: ${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(5)}`;
      messages.push({ role, content });
    }

    const tokens = estimateMessagesTokens(messages);
    assert.ok(
      tokens > 16384 * 0.75,
      `Expected tokens (${tokens}) to exceed 75% of 16384 (${16384 * 0.75})`,
    );

    const result = shouldCompact(messages, 16384);
    assert.equal(result, true, "200+ long messages should trigger compaction");
  });

  it("pruneToolResults truncates long tool outputs", () => {
    const longOutput = "x".repeat(1500);
    const messages = [
      { role: "user", content: "Führe den Befehl aus" },
      { role: "tool", content: longOutput },
      { role: "assistant", content: "Der Befehl wurde ausgeführt." },
      { role: "tool", content: "kurze Ausgabe" }, // should NOT be truncated
    ];

    const pruned = pruneToolResults(messages);

    // Long tool output should be truncated to 200 chars + " [truncated]"
    assert.ok(
      pruned[1].content.length < longOutput.length,
      "Long tool output should be truncated",
    );
    assert.ok(
      pruned[1].content.endsWith("[truncated]"),
      "Truncated content should end with [truncated]",
    );
    assert.equal(pruned[1].content.length, 200 + " [truncated]".length);

    // Non-tool messages should be unchanged
    assert.equal(pruned[0].content, "Führe den Befehl aus");
    assert.equal(pruned[2].content, "Der Befehl wurde ausgeführt.");

    // Short tool output should be unchanged
    assert.equal(pruned[3].content, "kurze Ausgabe");
  });

  it("splitOldMessages keeps recent messages intact", () => {
    const messages: Array<{ role: string; content: string }> = [];
    for (let i = 0; i < 20; i++) {
      messages.push({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Nachricht ${i}: ${i < 10 ? "alte Nachricht" : "neuere Nachricht"}`,
      });
    }

    const { old, recent } = pruneOldMessages(messages, 10);

    assert.equal(recent.length, 10, "Should keep 10 recent messages");
    assert.equal(old.length, 10, "Should have 10 old messages");

    // Verify the 10 most recent are messages 10-19
    for (let i = 0; i < 10; i++) {
      assert.equal(
        recent[i].content,
        `Nachricht ${i + 10}: neuere Nachricht`,
        `Recent message ${i} should be message ${i + 10}`,
      );
    }

    // Verify old messages are 0-9
    for (let i = 0; i < 10; i++) {
      assert.equal(
        old[i].content,
        `Nachricht ${i}: alte Nachricht`,
        `Old message ${i} should be message ${i}`,
      );
    }

    // Edge case: fewer messages than keepRecent
    const { old: noOld, recent: allRecent } = pruneOldMessages(messages.slice(0, 5), 10);
    assert.equal(noOld.length, 0, "No old messages when total < keepRecent");
    assert.equal(allRecent.length, 5, "All messages should be recent");
  });

  it("compactHistory reduces message count (Ollama required)", async (t) => {
    if (!ollamaAvailable) {
      t.skip("Ollama not available — skipping compaction E2E");
      return;
    }

    const chatId = `compact-e2e-${Date.now()}`;

    // Configure compaction with a very small context window to guarantee compaction triggers
    setCompactionConfig({
      ollamaBaseUrl,
      ollamaModel,
      maxContextTokens: 512, // very small context so 30 messages easily exceed 75%
      threshold: 0.75,
    });

    // Create a conversation and getOrCreate it
    getOrCreate(chatId);

    // Add 30+ realistic messages — each ~200 chars = ~50 tokens, total ~1500 tokens >> 75% of 512
    const topics = [
      "Wie konfiguriere ich den Scheduler für tägliche Backups? Ich brauche eine zuverlässige Lösung für unser Produktivsystem.",
      "Der Scheduler unterstützt Cron-Ausdrücke und feste Intervalle. Du kannst zum Beispiel '0 3 * * *' für täglich um 3 Uhr nutzen.",
      "Ich brauche ein Backup jeden Tag um 3 Uhr morgens. Die Datenbank ist etwa 2 GB groß und wächst stetig.",
      "Okay, ich richte einen Cron-Job mit '0 3 * * *' ein. Der Backup-Prozess wird in einem Docker-Container ausgeführt.",
      "Kann ich auch E-Mail-Benachrichtigungen bei Fehlern bekommen? Das wäre wichtig für das Operations-Team.",
      "Ja, der Retry-Mechanismus sendet nach 5 Fehlversuchen eine Nachricht. Die Wartezeiten verdoppeln sich exponentiell.",
      "Wie funktioniert die Privacy-Layer bei E-Mails? Werden alle Anhänge ebenfalls anonymisiert und geprüft?",
      "E-Mails werden vor dem Senden an Claude Code anonymisiert. API-Keys und Passwörter werden automatisch erkannt und maskiert.",
      "Was passiert mit Bildern die ich hochlade? Werden Gesichter erkannt und blockiert wie in der Dokumentation beschrieben?",
      "Bilder werden lokal klassifiziert mit Qwen3-VL-2B. Gesichter werden blockiert und verlassen nie den lokalen Rechner.",
      "Kann ich das Verhalten pro Kontakt anpassen? Manche Kontakte sind vertrauenswürdiger als andere im Unternehmen.",
      "Ja, über Privacy-Rules kannst du Regeln pro Kategorie erstellen. Global oder nur für die aktuelle Session anwendbar.",
      "Wie installiere ich ein neues Skill? Gibt es einen Marketplace oder muss ich alles manuell konfigurieren?",
      "Nutze den Skill-Marketplace oder erstelle eigene Skills. SHA-256 Hash-Verifizierung schützt vor manipulierten Downloads.",
      "Der Smart-Home-Integration unterstützt Philips Hue, HomeAssistant und Sonos. Alles über lokale REST-APIs gesteuert.",
    ];

    for (let i = 0; i < 30; i++) {
      const role: "user" | "assistant" = i % 2 === 0 ? "user" : "assistant";
      const topicIdx = i % topics.length;
      addMessage(chatId, {
        role,
        content: `${topics[topicIdx]} (Runde ${Math.floor(i / topics.length) + 1})`,
      });
    }

    const historyBefore = getHistory(chatId);
    assert.equal(historyBefore.length, 30, "Should have 30 messages before compaction");

    const result = await compactHistory(chatId);

    assert.ok(
      result.compactedMessageCount < result.originalMessageCount,
      `Compacted count (${result.compactedMessageCount}) should be less than original (${result.originalMessageCount})`,
    );
    assert.equal(result.originalMessageCount, 30);
    assert.ok(
      result.compactedTokens < result.originalTokens,
      `Compacted tokens (${result.compactedTokens}) should be less than original (${result.originalTokens})`,
    );

    // Verify the history was actually replaced
    const historyAfter = getHistory(chatId);
    assert.ok(
      historyAfter.length < 30,
      `History after compaction (${historyAfter.length}) should be shorter than 30`,
    );

    // The first message should be the summary
    assert.ok(
      historyAfter[0].content.includes("[Previous conversation summary]"),
      "First message should be the compaction summary",
    );
  });
});
