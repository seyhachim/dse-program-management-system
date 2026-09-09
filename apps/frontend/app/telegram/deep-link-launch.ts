export const TELEGRAM_PENDING_STARTAPP_KEY = "dse.telegram.pending-startapp";

export function telegramStartAppToken(search: string, stored: string | null = null): string | null {
  const params = new URLSearchParams(search);
  const token = params.get("startapp")?.trim() || params.get("tgWebAppStartParam")?.trim();
  return token || stored?.trim() || null;
}

export function isSafeTelegramMiniAppPath(path: string): boolean {
  return path.startsWith("/telegram/") && !path.startsWith("//") && !path.includes("\\");
}
