import { Bot } from "grammy";
import { t } from "../i18n/index.js";
import type { ShipmentManager } from "../shipments/manager.js";
import type { Config } from "../config/schema.js";

const STATUS_EMOJI: Record<string, string> = {
  pending: "\u23f3",
  in_transit: "\ud83d\ude9a",
  delivered: "\u2705",
  delayed: "\u26a0\ufe0f",
  exception: "\u274c",
  unknown: "\u2753",
};

const TYPE_EMOJI: Record<string, string> = {
  ocean: "\ud83d\udea2",
  air: "\u2708\ufe0f",
  parcel: "\ud83d\udce6",
  road: "\ud83d\ude9b",
};

export function createTelegramBot(config: Config, manager: ShipmentManager) {
  const bot = new Bot(config.telegram.botToken);

  // Owner-only middleware
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== config.telegram.ownerId) return;
    await next();
  });

  bot.command("track", async (ctx) => {
    const input = ctx.match?.trim();
    if (!input) {
      await ctx.reply(t("bot.trackUsage"));
      return;
    }

    const chatId = String(ctx.chat.id);
    const existing = manager.getByTrackingNumber(input, chatId);
    if (existing) {
      await ctx.reply(t("bot.alreadyTracked", { trackingNumber: input }));
      return;
    }

    const { id, type, carrier } = manager.createShipment(input, chatId);
    const emoji = TYPE_EMOJI[type] ?? "\ud83d\udce6";
    await ctx.reply(t("bot.trackingStarted", {
      emoji,
      trackingNumber: input,
      type: t(`type.${type}` as any),
      carrier: carrier ?? t("bot.unknownCarrier"),
    }));
  });

  bot.command("status", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const input = ctx.match?.trim();

    if (input) {
      const shipment = manager.getByTrackingNumber(input, chatId);
      if (!shipment) {
        await ctx.reply(t("bot.notFound", { trackingNumber: input }));
        return;
      }
      const emoji = STATUS_EMOJI[shipment.status] ?? "\u2753";
      const typeEmoji = TYPE_EMOJI[shipment.type] ?? "\ud83d\udce6";
      let msg = `${typeEmoji} ${shipment.trackingNumber}\n`;
      msg += `${emoji} ${t(`status.${shipment.status}` as any)}`;
      if (shipment.carrier) msg += `\n\ud83c\udfe2 ${shipment.carrier}`;
      if (shipment.eta) {
        const etaDate = new Date(shipment.eta).toLocaleDateString();
        msg += `\n\ud83d\udcc5 ETA: ${etaDate}`;
      }
      if (shipment.currentLat && shipment.currentLon) {
        msg += `\n\ud83d\udccd ${shipment.currentLat.toFixed(4)}, ${shipment.currentLon.toFixed(4)}`;
      }
      await ctx.reply(msg);
      return;
    }

    // Show all shipments
    const all = manager.listShipments(chatId);
    if (all.length === 0) {
      await ctx.reply(t("bot.noShipments"));
      return;
    }

    const lines = all.map((s) => {
      const emoji = STATUS_EMOJI[s.status] ?? "\u2753";
      const typeEmoji = TYPE_EMOJI[s.type] ?? "\ud83d\udce6";
      return `${typeEmoji} ${s.trackingNumber} ${emoji} ${t(`status.${s.status}` as any)}`;
    });
    await ctx.reply(lines.join("\n"));
  });

  bot.command("list", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const all = manager.listShipments(chatId);
    if (all.length === 0) {
      await ctx.reply(t("bot.noShipments"));
      return;
    }

    const lines = all.map((s) => {
      const emoji = STATUS_EMOJI[s.status] ?? "\u2753";
      const typeEmoji = TYPE_EMOJI[s.type] ?? "\ud83d\udce6";
      let line = `${typeEmoji} ${s.trackingNumber} ${emoji} ${t(`status.${s.status}` as any)}`;
      if (s.carrier) line += ` (${s.carrier})`;
      return line;
    });
    await ctx.reply(t("bot.listHeader", { count: String(all.length) }) + "\n\n" + lines.join("\n"));
  });

  bot.command("delete", async (ctx) => {
    const input = ctx.match?.trim();
    if (!input) {
      await ctx.reply(t("bot.deleteUsage"));
      return;
    }

    const chatId = String(ctx.chat.id);
    const shipment = manager.getByTrackingNumber(input, chatId);
    if (!shipment) {
      await ctx.reply(t("bot.notFound", { trackingNumber: input }));
      return;
    }

    manager.deleteShipment(shipment.id);
    await ctx.reply(t("bot.deleted", { trackingNumber: input }));
  });

  bot.command("map", async (ctx) => {
    const port = config.dashboard.port;
    await ctx.reply(t("bot.mapLink", { url: `http://localhost:${port}` }));
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(t("bot.help"));
  });

  // Handle unrecognized text
  bot.on("message:text", async (ctx) => {
    await ctx.reply(t("bot.unknownCommand"));
  });

  return {
    bot,
    async start() {
      await bot.start({
        onStart: () => console.log("Telegram bot started"),
      });
    },
    async stop() {
      await bot.stop();
    },
  };
}

export type TelegramBot = ReturnType<typeof createTelegramBot>;
