import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
  type Message,
  ComponentType,
} from "discord.js";
import type { Classification } from "../../approval/risk-classifier.js";
import type { MessagingPlatform, PlatformCallbacks, ChatId, MessageRef } from "../platform.js";
import { t } from "../../i18n/index.js";

interface DiscordConfig {
  botToken: string;
  channelId: string;
}

function formatApprovalText(
  nonce: string,
  toolName: string,
  args: Record<string, unknown>,
  classification: Classification,
): string {
  const argsStr = JSON.stringify(args).slice(0, 200);
  return [
    `**${t("messaging.approvalRequired")}** [#${nonce}]`,
    ``,
    `**${t("messaging.actionLabel")}** \`${toolName}\``,
    `**${t("messaging.riskLabel")}** ${classification.level} — ${classification.reason}`,
    `**${t("messaging.detailsLabel")}** \`${argsStr}\``,
  ].join("\n");
}

function buildApprovalRow(nonce: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve:${nonce}`)
      .setLabel(t("messaging.approve"))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`deny:${nonce}`)
      .setLabel(t("messaging.deny"))
      .setStyle(ButtonStyle.Danger),
  );
}

export function createDiscordPlatform(
  config: DiscordConfig,
  callbacks: PlatformCallbacks,
): MessagingPlatform {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  let channel: TextChannel | null = null;

  // Handle messages
  client.on("messageCreate", async (message: Message) => {
    // Ignore bot messages and messages from other channels
    if (message.author.bot) return;
    if (message.channelId !== config.channelId) return;
    if (!message.content) return;

    try {
      await callbacks.onMessage(message.channelId, message.content);
    } catch (err) {
      console.error("Discord message handler error:", err);
      if (channel) {
        await channel.send(t("messaging.processingError"));
      }
    }
  });

  // Handle button interactions
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    const approveMatch = customId.match(/^approve:(.+)$/);
    const denyMatch = customId.match(/^deny:(.+)$/);

    if (approveMatch) {
      const nonce = approveMatch[1];
      await interaction.update({
        components: [],
        content: interaction.message.content + `\n\n_${t("messaging.approved")}_`,
      });
      await callbacks.onApprovalResponse(nonce, true);
      return;
    }

    if (denyMatch) {
      const nonce = denyMatch[1];
      await interaction.update({
        components: [],
        content: interaction.message.content + `\n\n_${t("messaging.denied")}_`,
      });
      await callbacks.onApprovalResponse(nonce, false);
      return;
    }
  });

  return {
    name: "discord",
    maxMessageLength: 2000,
    supportsEdit: true,

    async sendMessage(chatId: ChatId, text: string): Promise<MessageRef> {
      const ch = channel ?? (client.channels.cache.get(chatId) as TextChannel | undefined);
      if (!ch) throw new Error(`Discord channel ${chatId} not found`);
      const msg = await ch.send(text);
      return msg.id;
    },

    async editMessage(chatId: ChatId, ref: MessageRef, text: string): Promise<MessageRef> {
      const ch = channel ?? (client.channels.cache.get(chatId) as TextChannel | undefined);
      if (!ch) throw new Error(`Discord channel ${chatId} not found`);
      const msg = await ch.messages.fetch(ref);
      await msg.edit(text);
      return ref;
    },

    async sendApproval(
      chatId: ChatId,
      nonce: string,
      toolName: string,
      args: Record<string, unknown>,
      classification: Classification,
    ): Promise<void> {
      const ch = channel ?? (client.channels.cache.get(chatId) as TextChannel | undefined);
      if (!ch) throw new Error(`Discord channel ${chatId} not found`);
      const text = formatApprovalText(nonce, toolName, args, classification);
      const row = buildApprovalRow(nonce);
      await ch.send({ content: text, components: [row] });
    },

    async start(): Promise<void> {
      await client.login(config.botToken);

      // Wait for the client to be ready
      await new Promise<void>((resolve) => {
        if (client.isReady()) {
          resolve();
        } else {
          client.once("ready", () => resolve());
        }
      });

      // Cache the channel
      const ch = client.channels.cache.get(config.channelId);
      if (ch && ch.isTextBased() && "send" in ch) {
        channel = ch as TextChannel;
      } else {
        // Try to fetch it
        try {
          const fetched = await client.channels.fetch(config.channelId);
          if (fetched && fetched.isTextBased() && "send" in fetched) {
            channel = fetched as TextChannel;
          }
        } catch (err) {
          console.error("Discord: could not fetch channel", config.channelId, err);
        }
      }

      console.log(`Discord adapter started (bot: ${client.user?.tag})`);
    },

    async stop(): Promise<void> {
      client.destroy();
    },
  };
}

export { formatApprovalText, buildApprovalRow };
