import { createHmac, timingSafeEqual } from "node:crypto";

export const TELEGRAM_INIT_DATA_MAX_LENGTH = 16_384;

export type TelegramInitDataErrorCode =
  | "INVALID_INIT_DATA"
  | "INIT_DATA_EXPIRED";

export class TelegramInitDataError extends Error {
  constructor(
    public readonly code: TelegramInitDataErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TelegramInitDataError";
  }
}

export interface VerifiedTelegramUser {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
}

export interface VerifiedTelegramInitData {
  telegramUser: VerifiedTelegramUser;
  authDate: Date;
  expiresAt: Date;
  queryId?: string;
}

export interface VerifyTelegramInitDataOptions {
  botToken: string;
  maxAgeSeconds: number;
  maxFutureSkewSeconds: number;
  now?: Date;
}

function invalid(message = "Telegram init data is invalid"): never {
  throw new TelegramInitDataError("INVALID_INIT_DATA", message);
}

function parseUser(value: string): VerifiedTelegramUser {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return invalid();
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return invalid();
  const user = parsed as Record<string, unknown>;
  const id = user.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return invalid();

  const optionalString = (key: string): string | undefined => {
    const item = user[key];
    if (item === undefined) return undefined;
    if (typeof item !== "string") return invalid();
    return item;
  };

  return {
    id: String(id),
    username: optionalString("username"),
    firstName: optionalString("first_name"),
    lastName: optionalString("last_name"),
    languageCode: optionalString("language_code"),
  };
}

export function verifyTelegramInitData(
  rawInitData: string,
  options: VerifyTelegramInitDataOptions,
): VerifiedTelegramInitData {
  if (!rawInitData || rawInitData.length > TELEGRAM_INIT_DATA_MAX_LENGTH) return invalid();
  if (!options.botToken) return invalid();

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(rawInitData);
  } catch {
    return invalid();
  }

  const seen = new Set<string>();
  for (const [key] of params.entries()) {
    if (seen.has(key)) return invalid();
    seen.add(key);
  }

  const hashes = params.getAll("hash");
  if (hashes.length !== 1 || !/^[0-9a-fA-F]{64}$/.test(hashes[0] ?? "")) return invalid();

  const signedPairs = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right));
  const dataCheckString = signedPairs.map(([key, value]) => `${key}=${value}`).join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(options.botToken)
    .digest();
  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest();
  const receivedHash = Buffer.from(hashes[0]!, "hex");

  if (
    receivedHash.length !== expectedHash.length ||
    !timingSafeEqual(receivedHash, expectedHash)
  ) {
    return invalid();
  }

  const authDateRaw = params.get("auth_date");
  const userRaw = params.get("user");
  if (!authDateRaw || !/^\d+$/.test(authDateRaw) || !userRaw) return invalid();

  const authDateSeconds = Number(authDateRaw);
  if (!Number.isSafeInteger(authDateSeconds) || authDateSeconds <= 0) return invalid();

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (authDateSeconds < nowSeconds - options.maxAgeSeconds) {
    throw new TelegramInitDataError(
      "INIT_DATA_EXPIRED",
      "Telegram init data has expired",
    );
  }
  if (authDateSeconds > nowSeconds + options.maxFutureSkewSeconds) {
    throw new TelegramInitDataError(
      "INIT_DATA_EXPIRED",
      "Telegram init data timestamp is outside the allowed clock skew",
    );
  }

  const authDate = new Date(authDateSeconds * 1000);
  return {
    telegramUser: parseUser(userRaw),
    authDate,
    expiresAt: new Date((authDateSeconds + options.maxAgeSeconds) * 1000),
    queryId: params.get("query_id") ?? undefined,
  };
}
