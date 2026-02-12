import type { Classification } from "../approval/risk-classifier.js";

export type ChatId = string;
export type MessageRef = string;

export interface MessagingPlatform {
  readonly name: "telegram" | "whatsapp" | "signal";
  readonly maxMessageLength: number;
  readonly supportsEdit: boolean;

  sendMessage(chatId: ChatId, text: string): Promise<MessageRef>;
  editMessage(chatId: ChatId, ref: MessageRef, text: string): Promise<MessageRef>;
  sendApproval(
    chatId: ChatId,
    nonce: string,
    toolName: string,
    args: Record<string, unknown>,
    classification: Classification,
  ): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface PlatformCallbacks {
  onMessage(chatId: ChatId, text: string): Promise<void>;
  onApprovalResponse(nonce: string, approved: boolean): Promise<void>;
}
