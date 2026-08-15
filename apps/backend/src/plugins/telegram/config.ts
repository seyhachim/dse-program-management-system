export interface TelegramConfig {
  enabled: boolean;
  botToken?: string;
  botUsername?: string;
  miniAppUrl?: string;
  miniAppShortName?: string;
}

function readEnabled(value: string | undefined): boolean {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error("TELEGRAM_ENABLED must be either true or false");
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
