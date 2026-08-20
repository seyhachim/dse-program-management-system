export interface TelegramConfig {
  enabled: boolean;
  botToken?: string;
  botUsername?: string;
  miniAppUrl?: string;
  miniAppShortName?: string;
  webhookSecret?: string;
  publicProgrammeId: string;
  initDataMaxAgeSeconds: number;
  initDataMaxFutureSkewSeconds: number;
}

const DEFAULT_INIT_DATA_MAX_AGE_SECONDS = 300;
const DEFAULT_INIT_DATA_MAX_FUTURE_SKEW_SECONDS = 30;
const DEFAULT_PUBLIC_PROGRAMME_ID = "dse";

function readEnabled(value: string | undefined): boolean {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error("TELEGRAM_ENABLED must be either true or false");
}

function readPositiveInteger(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function getTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  const enabled = readEnabled(env.TELEGRAM_ENABLED);

  const config: TelegramConfig = {
    enabled,
    botToken: env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
    botUsername: env.TELEGRAM_BOT_USERNAME?.trim() || undefined,
    miniAppUrl: env.TELEGRAM_MINI_APP_URL?.trim() || undefined,
    miniAppShortName: env.TELEGRAM_MINI_APP_SHORT_NAME?.trim() || undefined,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined,
    publicProgrammeId: env.TELEGRAM_PUBLIC_PROGRAMME_ID?.trim() || DEFAULT_PUBLIC_PROGRAMME_ID,
    initDataMaxAgeSeconds: readPositiveInteger(
      "TELEGRAM_INIT_DATA_MAX_AGE_SECONDS",
      env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
      DEFAULT_INIT_DATA_MAX_AGE_SECONDS,
    ),
    initDataMaxFutureSkewSeconds: readPositiveInteger(
      "TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS",
      env.TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS,
      DEFAULT_INIT_DATA_MAX_FUTURE_SKEW_SECONDS,
    ),
  };

  if (enabled) {
    const missing = [
      ["TELEGRAM_BOT_TOKEN", config.botToken],
      ["TELEGRAM_BOT_USERNAME", config.botUsername],
      ["TELEGRAM_MINI_APP_URL", config.miniAppUrl],
      ["TELEGRAM_MINI_APP_SHORT_NAME", config.miniAppShortName],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(`Telegram is enabled but required configuration is missing: ${missing.join(", ")}`);
    }

    try {
      new URL(config.miniAppUrl!);
    } catch {
      throw new Error("TELEGRAM_MINI_APP_URL must be a valid URL");
    }
  }

  return config;
}

export function validateTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): void {
  getTelegramConfig(env);
}
