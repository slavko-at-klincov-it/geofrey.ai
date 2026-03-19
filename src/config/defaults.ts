import { ZodError } from "zod";
import { configSchema, type Config } from "./schema.js";

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return `${path}: ${issue.message}`;
  }).join("\n");
}

export function loadConfig(): Config {
  try {
    return configSchema.parse({
      locale: process.env.LOCALE,
      telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        ownerId: process.env.TELEGRAM_OWNER_ID,
      },
      database: {
        url: process.env.DATABASE_URL,
      },
      dashboard: {
        enabled: process.env.DASHBOARD_ENABLED !== undefined
          ? process.env.DASHBOARD_ENABLED === "true"
          : undefined,
        port: process.env.DASHBOARD_PORT,
        token: process.env.DASHBOARD_TOKEN,
      },
      ais: {
        apiKey: process.env.AISSTREAM_API_KEY,
        enabled: process.env.AISSTREAM_API_KEY ? true : false,
      },
      opensky: {
        user: process.env.OPENSKY_USER,
        pass: process.env.OPENSKY_PASS,
        enabled: process.env.OPENSKY_ENABLED === "true" || !!process.env.OPENSKY_USER,
        pollIntervalMs: process.env.OPENSKY_POLL_INTERVAL_MS,
      },
      dhl: {
        apiKey: process.env.DHL_API_KEY,
        enabled: !!process.env.DHL_API_KEY,
        pollIntervalMs: process.env.DHL_POLL_INTERVAL_MS,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      console.error("\nConfiguration error(s):\n");
      console.error(formatZodError(error));
      console.error("\nRequired: TELEGRAM_BOT_TOKEN, TELEGRAM_OWNER_ID\n");
      throw new Error("Invalid configuration — fix the errors above and restart");
    }
    throw error;
  }
}
