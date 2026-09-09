import { expect, test } from "bun:test";
import { isSafeTelegramMiniAppPath, telegramStartAppToken } from "./deep-link-launch";

test("reads signed Mini App start token from URL before stored fallback", () => {
  expect(telegramStartAppToken("?startapp=url-token", "stored-token")).toBe("url-token");
  expect(telegramStartAppToken("?tgWebAppStartParam=telegram-token", "stored-token")).toBe("telegram-token");
  expect(telegramStartAppToken("", "stored-token")).toBe("stored-token");
});

test("accepts only internal Telegram Mini App paths", () => {
  expect(isSafeTelegramMiniAppPath("/telegram/teaching-leave?requestId=abc")).toBe(true);
  expect(isSafeTelegramMiniAppPath("/telegram/schedule-impact?occurrenceId=abc")).toBe(true);
  expect(isSafeTelegramMiniAppPath("https://evil.example/telegram/x")).toBe(false);
  expect(isSafeTelegramMiniAppPath("//evil.example/telegram/x")).toBe(false);
  expect(isSafeTelegramMiniAppPath("/telegram/..\\evil")).toBe(false);
});
