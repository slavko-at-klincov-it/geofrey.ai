import { createConnection, type Socket } from "node:net";
import type { Classification } from "../../approval/risk-classifier.js";
import type { MessagingPlatform, PlatformCallbacks, ChatId, MessageRef } from "../platform.js";

interface SignalConfig {
  signalCliSocket: string;
  ownerPhone: string;
  botPhone: string;
}

export function createSignalPlatform(
  config: SignalConfig,
  callbacks: PlatformCallbacks,
): MessagingPlatform {
  let socket: Socket | null = null;
  let requestId = 0;
  let msgCounter = 0;
  let buffer = "";

  // Track pending text-based approvals: chatId → nonce
  const pendingTextApprovals = new Map<ChatId, string>();

  // Pending JSON-RPC responses
  const pendingRequests = new Map<number, {
    resolve: (result: unknown) => void;
    reject: (err: Error) => void;
  }>();

  function sendRpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error("Signal socket not connected"));
        return;
      }
      const id = ++requestId;
      pendingRequests.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      socket.write(msg);
    });
  }

  function isOwner(sender: string): boolean {
    return sender === config.ownerPhone;
  }

  async function handleMessage(data: {
    envelope?: {
      source?: string;
      dataMessage?: {
        message?: string;
        timestamp?: number;
      };
    };
  }): Promise<void> {
    const source = data.envelope?.source;
    const text = data.envelope?.dataMessage?.message;
    if (!source || !text || !isOwner(source)) return;

    // Check for pending text-based approval response
    const pendingNonce = pendingTextApprovals.get(source);
    if (pendingNonce) {
      const trimmed = text.trim();
      if (trimmed === "1") {
        pendingTextApprovals.delete(source);
        await callbacks.onApprovalResponse(pendingNonce, true);
        return;
      }
      if (trimmed === "2") {
        pendingTextApprovals.delete(source);
        await callbacks.onApprovalResponse(pendingNonce, false);
        return;
      }
      // Not a valid approval response — clear pending and pass through as message
      pendingTextApprovals.delete(source);
    }

    await callbacks.onMessage(source, text);
  }

  function handleSocketData(chunk: string): void {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as {
          jsonrpc?: string;
          id?: number;
          result?: unknown;
          error?: { message: string };
          method?: string;
          params?: unknown;
        };

        // JSON-RPC response
        if (msg.id && pendingRequests.has(msg.id)) {
          const pending = pendingRequests.get(msg.id)!;
          pendingRequests.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error.message));
          } else {
            pending.resolve(msg.result);
          }
          continue;
        }

        // Incoming message notification
        if (msg.method === "receive" && msg.params) {
          handleMessage(msg.params as Parameters<typeof handleMessage>[0]).catch(
            (err) => console.error("Signal message handler error:", err),
          );
        }
      } catch {
        // Ignore parse errors for partial JSON
      }
    }
  }

  return {
    name: "signal",
    maxMessageLength: 2000,
    supportsEdit: false,

    async sendMessage(chatId: ChatId, text: string): Promise<MessageRef> {
      await sendRpc("send", {
        account: config.botPhone,
        recipient: [chatId],
        message: text,
      });
      msgCounter++;
      return String(msgCounter);
    },

    async editMessage(chatId: ChatId, _ref: MessageRef, text: string): Promise<MessageRef> {
      // Signal CLI doesn't support editing — send new message
      return this.sendMessage(chatId, text);
    },

    async sendApproval(
      chatId: ChatId,
      nonce: string,
      toolName: string,
      args: Record<string, unknown>,
      classification: Classification,
    ): Promise<void> {
      const argsStr = JSON.stringify(args).slice(0, 200);
      const text = [
        `Genehmigung erforderlich [#${nonce}]`,
        ``,
        `Aktion: ${toolName}`,
        `Risiko: ${classification.level} — ${classification.reason}`,
        `Details: ${argsStr}`,
        ``,
        `Antworten Sie mit: 1 = Genehmigen, 2 = Ablehnen`,
      ].join("\n");

      pendingTextApprovals.set(chatId, nonce);
      await this.sendMessage(chatId, text);
    },

    async start(): Promise<void> {
      return new Promise((resolve, reject) => {
        socket = createConnection(config.signalCliSocket);

        socket.on("connect", () => {
          console.log(`Signal adapter connected to ${config.signalCliSocket}`);
          // Subscribe to incoming messages
          sendRpc("subscribe", { account: config.botPhone }).then(
            () => resolve(),
            reject,
          );
        });

        socket.on("data", (data) => handleSocketData(data.toString()));
        socket.on("error", (err) => {
          console.error("Signal socket error:", err);
          reject(err);
        });
        socket.on("close", () => {
          console.log("Signal socket closed");
          socket = null;
        });
      });
    },

    async stop(): Promise<void> {
      // Reject all pending JSON-RPC requests
      for (const [id, pending] of pendingRequests) {
        pending.reject(new Error("Signal adapter shutting down"));
      }
      pendingRequests.clear();
      pendingTextApprovals.clear();

      if (socket) {
        socket.destroy();
        socket = null;
      }
    },
  };
}
