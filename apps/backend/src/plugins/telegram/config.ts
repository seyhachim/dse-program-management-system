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

/**
 * Runtime configuration for the public DSE Information Bot.
 *
 * This intentionally keeps the same common property names used by the public
 * router while separating where the values come from. The optional inherited
 * PMS fields preserve structural compatibility with existing router tests and
 * injected test configurations; public runtime code does not read them.
 */
export interface PublicTelegramConfig extends Partial<TelegramConfig> {
  enabled: boolean;
  botToken?: string;
  botUsername?: string;
  webhookSecret?: string;
  publicProgrammeId: string;
}

const DEFAULT_INIT_DATA_MAX_AGE_SECONDS = 300;
const DEFAULT_INIT_DATA_MAX_FUTURE_SKEW_SECONDS = 30;
const DEFAULT_PUBLIC_PROGRAMME_ID = "dse";

function readEnabled(name: string, value: string | undefined): boolean {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${name} must be either true or false`);
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

function preferred(
  env: NodeJS.ProcessEnv,
  primaryName: string,
  legacyName?: string,
): { name: string; value: string | undefined } {
  if (env[primaryName] !== undefined) {
    return { name: primaryName, value: env[primaryName] };
  }
  if (legacyName) {
    return { name: legacyName, value: env[legacyName] };
  }
  return { name: primaryName, value: undefined };
}

/**
 * Authenticated DSE PMS Bot configuration.
 *
 * `TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` remain
 * temporary PMS-only aliases so an existing Mini App deployment can migrate
 * without an outage. The public bot never falls back to these legacy values.
 */
export function getPmsTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  const enabledInput = preferred(env, "TELEGRAM_PMS_ENABLED", "TELEGRAM_ENABLED");
  const tokenInput = preferred(
    env,
    "TELEGRAM_PMS_BOT_TOKEN",
    "TELEGRAM_BOT_TOKEN",
  );
  const usernameInput = preferred(
    env,
    "TELEGRAM_PMS_BOT_USERNAME",
    "TELEGRAM_BOT_USERNAME",
  );
  const enabled = readEnabled(enabledInput.name, enabledInput.value);

  const config: TelegramConfig = {
    enabled,
    botToken: tokenInput.value?.trim() || undefined,
    botUsername: usernameInput.value?.trim() || undefined,
    miniAppUrl: env.TELEGRAM_MINI_APP_URL?.trim() || undefined,
    miniAppShortName: env.TELEGRAM_MINI_APP_SHORT_NAME?.trim() || undefined,
    webhookSecret: undefined,
    publicProgrammeId: DEFAULT_PUBLIC_PROGRAMME_ID,
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
      [tokenInput.name, config.botToken],
      [usernameInput.name, config.botUsername],
      ["TELEGRAM_MINI_APP_URL", config.miniAppUrl],
      ["TELEGRAM_MINI_APP_SHORT_NAME", config.miniAppShortName],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `Telegram PMS Bot is enabled but required configuration is missing: ${missing.join(", ")}`,
      );
    }

    try {
      new URL(config.miniAppUrl!);
    } catch {
      throw new Error("TELEGRAM_MINI_APP_URL must be a valid URL");
    }
  }

  return config;
}

/** Public DSE Information Bot configuration. No PMS/legacy credential fallback. */
export function getPublicTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): PublicTelegramConfig {
  const enabled = readEnabled(
    "TELEGRAM_PUBLIC_ENABLED",
    env.TELEGRAM_PUBLIC_ENABLED,
  );
  const config: PublicTelegramConfig = {
    enabled,
    botToken: env.TELEGRAM_PUBLIC_BOT_TOKEN?.trim() || undefined,
    botUsername: env.TELEGRAM_PUBLIC_BOT_USERNAME?.trim() || undefined,
    webhookSecret: env.TELEGRAM_PUBLIC_WEBHOOK_SECRET?.trim() || undefined,
    publicProgrammeId:
      env.TELEGRAM_PUBLIC_PROGRAMME_ID?.trim() || DEFAULT_PUBLIC_PROGRAMME_ID,
  };

  if (enabled) {
    const missing = [
      ["TELEGRAM_PUBLIC_BOT_TOKEN", config.botToken],
      ["TELEGRAM_PUBLIC_BOT_USERNAME", config.botUsername],
      ["TELEGRAM_PUBLIC_WEBHOOK_SECRET", config.webhookSecret],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `Telegram Public Information Bot is enabled but required configuration is missing: ${missing.join(", ")}`,
      );
    }
  }

  return config;
}

/** @deprecated Prefer getPmsTelegramConfig for new authenticated-bot code. */
export function getTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  return getPmsTelegramConfig(env);
}

export function validateTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const pms = getPmsTelegramConfig(env);
  const publicBot = getPublicTelegramConfig(env);

  if (
    pms.enabled &&
    publicBot.enabled &&
    pms.botToken &&
    publicBot.botToken &&
    pms.botToken === publicBot.botToken
  ) {
    throw new Error(
      "Telegram PMS Bot and Public Information Bot must use different bot tokens",
    );
  }
}
