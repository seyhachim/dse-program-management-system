export const TELEGRAM_START_PAYLOAD_MAX_LENGTH = 64;

export type TelegramStartTarget = { type: "home" };

export function buildTelegramStartPayload(target: TelegramStartTarget): string {
  if (target.type === "home") return "v1_home";
  return "v1_home";
}

export function parseTelegramStartPayload(
  payload: string | null | undefined,
): TelegramStartTarget | null {
  if (!payload || payload.length > TELEGRAM_START_PAYLOAD_MAX_LENGTH) return null;
  if (payload === "v1_home") return { type: "home" };
  return null;
}
