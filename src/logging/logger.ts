export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function resolveMinLevel(): LogLevel {
  const explicit = process.env.LOG_LEVEL;
  if (explicit && explicit in LEVEL_PRIORITY) {
    return explicit as LogLevel;
  }
  if (process.env.NODE_ENV === "development") {
    return "debug";
  }
  return "info";
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export function createLogger(name: string): Logger {
  function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const minLevel = resolveMinLevel();
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) {
      return;
    }

    const entry: Record<string, unknown> = {
      level,
      name,
      msg: message,
      timestamp: new Date().toISOString(),
      ...context,
    };

    process.stdout.write(JSON.stringify(entry) + "\n");
  }

  return {
    debug: (msg, ctx) => emit("debug", msg, ctx),
    info: (msg, ctx) => emit("info", msg, ctx),
    warn: (msg, ctx) => emit("warn", msg, ctx),
    error: (msg, ctx) => emit("error", msg, ctx),
  };
}

export const log = createLogger("geofrey");
