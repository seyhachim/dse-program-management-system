import jwt from "jsonwebtoken";
import { getPmsTelegramConfig } from "./config.ts";

const DEEP_LINK_TTL_SECONDS = 60 * 60;

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is required for Telegram deep links");
  return value;
}

export function createTelegramDeepLink(path: string): string {
  if (!path.startsWith("/telegram/")) throw new Error("Telegram deep links must target the Mini App");
  const token = jwt.sign({ path, aud: "telegram-deep-link" }, secret(), { expiresIn: DEEP_LINK_TTL_SECONDS });
  const config = getPmsTelegramConfig();
  if (!config.miniAppUrl) throw new Error("TELEGRAM_MINI_APP_URL is not configured");
  const url = new URL(config.miniAppUrl);
  url.searchParams.set("startapp", token);
  return url.toString();
}

export function resolveTelegramDeepLink(token: string): string {
  const payload = jwt.verify(token, secret(), { audience: "telegram-deep-link" }) as jwt.JwtPayload;
  if (typeof payload.path !== "string" || !payload.path.startsWith("/telegram/")) {
    throw new Error("Invalid Telegram deep link");
  }
  return payload.path;
}
