import { describe, expect, test } from "bun:test";
import {
  getPmsTelegramConfig,
  getPublicTelegramConfig,
  getTelegramConfig,
  validateTelegramConfig,
} from "./config.ts";

describe("Telegram configuration", () => {
  test("keeps both bots disabled by default without requiring secrets", () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(getPmsTelegramConfig(env)).toEqual({
      enabled: false,
      botToken: undefined,
      botUsername: undefined,
      miniAppUrl: undefined,
      miniAppShortName: undefined,
      webhookSecret: undefined,
      publicProgrammeId: "dse",
      initDataMaxAgeSeconds: 300,
      initDataMaxFutureSkewSeconds: 30,
    });
    expect(getPublicTelegramConfig(env)).toEqual({
      enabled: false,
      botToken: undefined,
      botUsername: undefined,
      miniAppUrl: undefined,
      miniAppShortName: undefined,
      webhookSecret: undefined,
      publicProgrammeId: "dse",
      initDataMaxAgeSeconds: 300,
      initDataMaxFutureSkewSeconds: 30,
    });
  });

  test("accepts independent complete PMS and public bot configurations", () => {
    const env = {
      TELEGRAM_PMS_ENABLED: "true",
      TELEGRAM_PMS_BOT_TOKEN: "pms-secret-token",
      TELEGRAM_PMS_BOT_USERNAME: "DSEPMSBot",
      TELEGRAM_MINI_APP_URL: "https://example.com/telegram",
      TELEGRAM_MINI_APP_SHORT_NAME: "pms",
      TELEGRAM_PUBLIC_ENABLED: "true",
      TELEGRAM_PUBLIC_BOT_TOKEN: "public-secret-token",
      TELEGRAM_PUBLIC_BOT_USERNAME: "DSEInformationBot",
      TELEGRAM_PUBLIC_WEBHOOK_SECRET: "public-webhook-secret",
      TELEGRAM_PUBLIC_PROGRAMME_ID: "dse-public",
      TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: "600",
      TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS: "45",
    } as NodeJS.ProcessEnv;

    expect(getPmsTelegramConfig(env)).toEqual({
      enabled: true,
      botToken: "pms-secret-token",
      botUsername: "DSEPMSBot",
      miniAppUrl: "https://example.com/telegram",
      miniAppShortName: "pms",
      webhookSecret: undefined,
      publicProgrammeId: "dse",
      initDataMaxAgeSeconds: 600,
      initDataMaxFutureSkewSeconds: 45,
    });
    expect(getPublicTelegramConfig(env)).toEqual({
      enabled: true,
      botToken: "public-secret-token",
      botUsername: "DSEInformationBot",
      miniAppUrl: undefined,
      miniAppShortName: undefined,
      webhookSecret: "public-webhook-secret",
      publicProgrammeId: "dse-public",
      initDataMaxAgeSeconds: 300,
      initDataMaxFutureSkewSeconds: 30,
    });
    expect(() => validateTelegramConfig(env)).not.toThrow();
  });

  test("keeps legacy shared names as PMS-only migration aliases", () => {
    const env = {
      TELEGRAM_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "legacy-pms-token",
      TELEGRAM_BOT_USERNAME: "LegacyDSEPMSBot",
      TELEGRAM_MINI_APP_URL: "https://example.com/telegram",
      TELEGRAM_MINI_APP_SHORT_NAME: "pms",
      TELEGRAM_WEBHOOK_SECRET: "legacy-public-secret-must-not-be-used",
    } as NodeJS.ProcessEnv;

    expect(getTelegramConfig(env).botToken).toBe("legacy-pms-token");
    expect(getPmsTelegramConfig(env).botUsername).toBe("LegacyDSEPMSBot");
    expect(getPmsTelegramConfig(env).webhookSecret).toBeUndefined();
    expect(getPublicTelegramConfig(env).enabled).toBe(false);
    expect(getPublicTelegramConfig(env).botToken).toBeUndefined();
    expect(getPublicTelegramConfig(env).webhookSecret).toBeUndefined();
  });

  test("new PMS variables override legacy aliases explicitly", () => {
    const value = getPmsTelegramConfig({
      TELEGRAM_PMS_ENABLED: "true",
      TELEGRAM_PMS_BOT_TOKEN: "new-pms-token",
      TELEGRAM_PMS_BOT_USERNAME: "NewPmsBot",
      TELEGRAM_ENABLED: "false",
      TELEGRAM_BOT_TOKEN: "legacy-token",
      TELEGRAM_BOT_USERNAME: "LegacyBot",
      TELEGRAM_MINI_APP_URL: "https://example.com/telegram",
      TELEGRAM_MINI_APP_SHORT_NAME: "pms",
    } as NodeJS.ProcessEnv);

    expect(value.enabled).toBe(true);
    expect(value.botToken).toBe("new-pms-token");
    expect(value.botUsername).toBe("NewPmsBot");
  });

  test("public bot can be enabled while PMS Mini App is disabled", () => {
    const env = {
      TELEGRAM_PUBLIC_ENABLED: "true",
      TELEGRAM_PUBLIC_BOT_TOKEN: "public-token",
      TELEGRAM_PUBLIC_BOT_USERNAME: "DSEInformationBot",
      TELEGRAM_PUBLIC_WEBHOOK_SECRET: "public-secret",
    } as NodeJS.ProcessEnv;

    expect(getPmsTelegramConfig(env).enabled).toBe(false);
    expect(getPublicTelegramConfig(env).enabled).toBe(true);
    expect(() => validateTelegramConfig(env)).not.toThrow();
  });

  test("PMS bot can be enabled without public bot secrets", () => {
    const env = {
      TELEGRAM_PMS_ENABLED: "true",
      TELEGRAM_PMS_BOT_TOKEN: "pms-token",
      TELEGRAM_PMS_BOT_USERNAME: "DSEPMSBot",
      TELEGRAM_MINI_APP_URL: "https://example.com/telegram",
      TELEGRAM_MINI_APP_SHORT_NAME: "pms",
    } as NodeJS.ProcessEnv;

    expect(getPmsTelegramConfig(env).enabled).toBe(true);
    expect(getPublicTelegramConfig(env).enabled).toBe(false);
    expect(() => validateTelegramConfig(env)).not.toThrow();
  });

  test("fails closed if both enabled bots resolve to the same token", () => {
    expect(() =>
      validateTelegramConfig({
        TELEGRAM_PMS_ENABLED: "true",
        TELEGRAM_PMS_BOT_TOKEN: "same-token",
        TELEGRAM_PMS_BOT_USERNAME: "DSEPMSBot",
        TELEGRAM_MINI_APP_URL: "https://example.com/telegram",
        TELEGRAM_MINI_APP_SHORT_NAME: "pms",
        TELEGRAM_PUBLIC_ENABLED: "true",
        TELEGRAM_PUBLIC_BOT_TOKEN: "same-token",
        TELEGRAM_PUBLIC_BOT_USERNAME: "DSEInformationBot",
        TELEGRAM_PUBLIC_WEBHOOK_SECRET: "public-secret",
      } as NodeJS.ProcessEnv),
    ).toThrow("must use different bot tokens");
  });

  test("fails closed when PMS bot is enabled without its token", () => {
    expect(() =>
      getPmsTelegramConfig({
        TELEGRAM_PMS_ENABLED: "true",
        TELEGRAM_PMS_BOT_USERNAME: "DSEPMSBot",
        TELEGRAM_MINI_APP_URL: "https://example.com/telegram",
        TELEGRAM_MINI_APP_SHORT_NAME: "pms",
      } as NodeJS.ProcessEnv),
    ).toThrow("TELEGRAM_PMS_BOT_TOKEN");
  });

  test("fails closed when public bot is enabled without its dedicated secret", () => {
    expect(() =>
      getPublicTelegramConfig({
        TELEGRAM_PUBLIC_ENABLED: "true",
        TELEGRAM_PUBLIC_BOT_TOKEN: "public-token",
        TELEGRAM_PUBLIC_BOT_USERNAME: "DSEInformationBot",
      } as NodeJS.ProcessEnv),
    ).toThrow("TELEGRAM_PUBLIC_WEBHOOK_SECRET");
  });

  test("rejects invalid enabled flag values independently", () => {
    expect(() =>
      getPmsTelegramConfig({ TELEGRAM_PMS_ENABLED: "yes" } as NodeJS.ProcessEnv),
    ).toThrow("TELEGRAM_PMS_ENABLED");
    expect(() =>
      getPublicTelegramConfig({ TELEGRAM_PUBLIC_ENABLED: "yes" } as NodeJS.ProcessEnv),
    ).toThrow("TELEGRAM_PUBLIC_ENABLED");
  });

  test("rejects an invalid Mini App URL when PMS bot is enabled", () => {
    expect(() =>
      getPmsTelegramConfig({
        TELEGRAM_PMS_ENABLED: "true",
        TELEGRAM_PMS_BOT_TOKEN: "pms-token",
        TELEGRAM_PMS_BOT_USERNAME: "DSEPMSBot",
        TELEGRAM_MINI_APP_URL: "not-a-url",
        TELEGRAM_MINI_APP_SHORT_NAME: "pms",
      } as NodeJS.ProcessEnv),
    ).toThrow("TELEGRAM_MINI_APP_URL");
  });

  for (const [name, value] of [
    ["TELEGRAM_INIT_DATA_MAX_AGE_SECONDS", "0"],
    ["TELEGRAM_INIT_DATA_MAX_AGE_SECONDS", "-1"],
    ["TELEGRAM_INIT_DATA_MAX_AGE_SECONDS", "abc"],
    ["TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS", "0"],
    ["TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS", "1.5"],
  ] as const) {
    test(`rejects invalid ${name}`, () => {
      expect(() =>
        getPmsTelegramConfig({ [name]: value } as NodeJS.ProcessEnv),
      ).toThrow(name);
    });
  }
});
