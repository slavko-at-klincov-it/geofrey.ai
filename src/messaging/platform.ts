import type { Classification } from "../approval/risk-classifier.js";

export type ChatId = string;
export type MessageRef = string;

export interface ImageAttachment {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
  caption?: string;
}

export interface VoiceAttachment {
  buffer: Buffer;
  mimeType: string;
  durationSeconds?: number;
}

export interface MessagingPlatform {
  readonly name: "telegram" | "whatsapp" | "signal" | "webchat" | "slack" | "discord";
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
  sendAudio?(chatId: ChatId, audio: Buffer, filename: string): Promise<MessageRef>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface PlatformCallbacks {
  onMessage(chatId: ChatId, text: string): Promise<void>;
  onImageMessage(chatId: ChatId, image: ImageAttachment): Promise<void>;
  onVoiceMessage(chatId: ChatId, voice: VoiceAttachment): Promise<void>;
  onApprovalResponse(nonce: string, approved: boolean): Promise<void>;
}
