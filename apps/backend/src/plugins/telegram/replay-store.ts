import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";

export class TelegramInitDataReplayError extends Error {
  readonly code = "INIT_DATA_REPLAYED" as const;

  constructor() {
    super("Telegram init data has already been used");
    this.name = "TelegramInitDataReplayError";
  }
}

export interface TelegramReplayInput {
  rawInitData: string;
  telegramUserId: string;
  queryId?: string;
  authDate: Date;
  expiresAt: Date;
}

interface PersistedVerification {
  id: string;
  initDataDigest: string;
  telegramUserId: string;
  queryId: string | null;
  authDate: Date;
  expiresAt: Date;
}

type PersistVerification = (record: PersistedVerification) => Promise<boolean>;

async function persistVerification(record: PersistedVerification): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "telegram_security"."TelegramInitVerification" (
      "id", "initDataDigest", "telegramUserId", "queryId", "authDate", "expiresAt"
    )
    VALUES (
      ${record.id}, ${record.initDataDigest}, ${record.telegramUserId},
      ${record.queryId}, ${record.authDate}, ${record.expiresAt}
    )
    ON CONFLICT ("initDataDigest") DO NOTHING
    RETURNING "id"
  `;
  return rows.length === 1;
}

export function createTelegramReplayStore(
  persist: PersistVerification = persistVerification,
) {
  return {
    async record(input: TelegramReplayInput) {
      const verificationId = randomUUID();
      const initDataDigest = createHash("sha256")
        .update(input.rawInitData)
        .digest("hex");

      const created = await persist({
        id: verificationId,
        initDataDigest,
        telegramUserId: input.telegramUserId,
        queryId: input.queryId ?? null,
        authDate: input.authDate,
        expiresAt: input.expiresAt,
      });
      if (!created) throw new TelegramInitDataReplayError();

      return { verificationId, initDataDigest };
    },
  };
}

export const telegramReplayStore = createTelegramReplayStore();
export type TelegramReplayStore = typeof telegramReplayStore;
