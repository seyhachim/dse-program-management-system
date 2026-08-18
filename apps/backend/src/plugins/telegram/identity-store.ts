import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";

export class TelegramLinkError extends Error {
  constructor(
    readonly code:
      | "TELEGRAM_NOT_LINKED"
      | "TELEGRAM_LINK_CONFLICT"
      | "INVALID_INIT_DATA"
      | "INIT_DATA_EXPIRED",
    message: string,
  ) {
    super(message);
    this.name = "TelegramLinkError";
  }
}

export interface TelegramIdentityRecord {
  id: string;
  userId: string;
  telegramUserId: string;
  telegramUsername: string | null;
  linkedAt: Date;
  lastVerifiedAt: Date | null;
  revokedAt: Date | null;
}

async function audit(input: {
  identityId?: string | null;
  userId?: string | null;
  telegramUserId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: unknown;
}) {
  await prisma.$executeRaw`
    INSERT INTO "telegram_security"."TelegramAuditEvent" (
      "id", "identityId", "userId", "telegramUserId", "action",
      "resourceType", "resourceId", "metadata"
    ) VALUES (
      ${randomUUID()}, ${input.identityId ?? null}, ${input.userId ?? null},
      ${input.telegramUserId ?? null}, ${input.action}, ${input.resourceType ?? null},
      ${input.resourceId ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `;
}

export const telegramIdentityStore = {
  async findActiveByTelegramUserId(telegramUserId: string): Promise<TelegramIdentityRecord | null> {
    const rows = await prisma.$queryRaw<TelegramIdentityRecord[]>`
      SELECT "id", "userId", "telegramUserId", "telegramUsername", "linkedAt",
             "lastVerifiedAt", "revokedAt"
      FROM "telegram_security"."TelegramIdentity"
      WHERE "telegramUserId" = ${telegramUserId} AND "revokedAt" IS NULL
      LIMIT 1
    `;
    return rows[0] ?? null;
  },

  async findByUserId(userId: string): Promise<TelegramIdentityRecord | null> {
    const rows = await prisma.$queryRaw<TelegramIdentityRecord[]>`
      SELECT "id", "userId", "telegramUserId", "telegramUsername", "linkedAt",
             "lastVerifiedAt", "revokedAt"
      FROM "telegram_security"."TelegramIdentity"
      WHERE "userId" = ${userId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  },

  async markVerified(identity: TelegramIdentityRecord, telegramUsername?: string) {
    const now = new Date();
    await prisma.$executeRaw`
      UPDATE "telegram_security"."TelegramIdentity"
      SET "lastVerifiedAt" = ${now},
          "telegramUsername" = COALESCE(${telegramUsername ?? null}, "telegramUsername"),
          "updatedAt" = ${now}
      WHERE "id" = ${identity.id} AND "revokedAt" IS NULL
    `;
    await audit({
      identityId: identity.id,
      userId: identity.userId,
      telegramUserId: identity.telegramUserId,
      action: "session_verified",
    });
  },

  async link(userId: string, verificationId: string): Promise<TelegramIdentityRecord> {
    const identityId = randomUUID();
    const now = new Date();

    const identity = await prisma.$transaction(async (tx) => {
      const verificationRows = await tx.$queryRaw<Array<{
        id: string;
        telegramUserId: string;
        expiresAt: Date;
        consumedAt: Date | null;
      }>>`
        SELECT "id", "telegramUserId", "expiresAt", "consumedAt"
        FROM "telegram_security"."TelegramInitVerification"
        WHERE "id" = ${verificationId}
        FOR UPDATE
      `;
      const verification = verificationRows[0];
      if (!verification || verification.consumedAt) {
        throw new TelegramLinkError("INVALID_INIT_DATA", "Telegram verification is invalid or already consumed");
      }
      if (verification.expiresAt.getTime() <= now.getTime()) {
        throw new TelegramLinkError("INIT_DATA_EXPIRED", "Telegram verification has expired");
      }

      const conflicts = await tx.$queryRaw<TelegramIdentityRecord[]>`
        SELECT "id", "userId", "telegramUserId", "telegramUsername", "linkedAt",
               "lastVerifiedAt", "revokedAt"
        FROM "telegram_security"."TelegramIdentity"
        WHERE "userId" = ${userId} OR "telegramUserId" = ${verification.telegramUserId}
        FOR UPDATE
      `;

      const byUser = conflicts.find((item) => item.userId === userId);
      const byTelegram = conflicts.find((item) => item.telegramUserId === verification.telegramUserId);
      if (byTelegram && byTelegram.userId !== userId) {
        throw new TelegramLinkError(
          "TELEGRAM_LINK_CONFLICT",
          "This Telegram account is already linked to another PMS account",
        );
      }
      if (byUser && byUser.telegramUserId !== verification.telegramUserId) {
        throw new TelegramLinkError(
          "TELEGRAM_LINK_CONFLICT",
          "This PMS account is already linked to another Telegram account",
        );
      }

      let linked: TelegramIdentityRecord;
      if (byUser) {
        const rows = await tx.$queryRaw<TelegramIdentityRecord[]>`
          UPDATE "telegram_security"."TelegramIdentity"
          SET "revokedAt" = NULL, "lastVerifiedAt" = ${now}, "updatedAt" = ${now}
          WHERE "id" = ${byUser.id}
          RETURNING "id", "userId", "telegramUserId", "telegramUsername", "linkedAt",
                    "lastVerifiedAt", "revokedAt"
        `;
        linked = rows[0]!;
      } else {
        const rows = await tx.$queryRaw<TelegramIdentityRecord[]>`
          INSERT INTO "telegram_security"."TelegramIdentity" (
            "id", "userId", "telegramUserId", "linkedAt", "lastVerifiedAt", "updatedAt"
          ) VALUES (
            ${identityId}, ${userId}, ${verification.telegramUserId}, ${now}, ${now}, ${now}
          )
          RETURNING "id", "userId", "telegramUserId", "telegramUsername", "linkedAt",
                    "lastVerifiedAt", "revokedAt"
        `;
        linked = rows[0]!;
      }

      await tx.$executeRaw`
        UPDATE "telegram_security"."TelegramInitVerification"
        SET "consumedAt" = ${now}
        WHERE "id" = ${verificationId} AND "consumedAt" IS NULL
      `;
      return linked;
    });

    await audit({
      identityId: identity.id,
      userId,
      telegramUserId: identity.telegramUserId,
      action: "identity_linked",
    });
    return identity;
  },

  async revoke(userId: string): Promise<boolean> {
    const current = await this.findByUserId(userId);
    if (!current || current.revokedAt) return false;
    const now = new Date();
    const changed = await prisma.$executeRaw`
      UPDATE "telegram_security"."TelegramIdentity"
      SET "revokedAt" = ${now}, "updatedAt" = ${now}
      WHERE "userId" = ${userId} AND "revokedAt" IS NULL
    `;
    if (changed > 0) {
      await audit({
        identityId: current.id,
        userId,
        telegramUserId: current.telegramUserId,
        action: "identity_revoked",
      });
    }
    return changed > 0;
  },

  audit,
};

export type TelegramIdentityStore = typeof telegramIdentityStore;
