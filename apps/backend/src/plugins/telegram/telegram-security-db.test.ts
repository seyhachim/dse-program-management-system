import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { telegramIdentityStore } from "./identity-store.ts";
import { createTelegramReplayStore } from "./replay-store.ts";
import { issueTelegramSession, resolveTelegramSession } from "./session.ts";

const dbTestsEnabled = process.env.TELEGRAM_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();
const replayStore = createTelegramReplayStore();
const originalJwtSecret = process.env.JWT_SECRET;

const createdUserIds = new Set<string>();
const telegramUserIds = new Set<string>();

function numericTelegramId(): string {
  return String(1_000_000_000 + Math.floor(Math.random() * 8_000_000_000));
}

async function createUser(label: string) {
  const token = crypto.randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `telegram-${label}-${token}@example.test`,
      name: `Telegram ${label} ${token}`,
    },
  });
  createdUserIds.add(user.id);
  return user;
}

async function createVerification(
  telegramUserId: string,
  options: { expired?: boolean } = {},
) {
  telegramUserIds.add(telegramUserId);
  const now = new Date();
  return replayStore.record({
    rawInitData: `telegram-db-test-${crypto.randomUUID()}`,
    telegramUserId,
    queryId: `query-${crypto.randomUUID()}`,
    authDate: now,
    expiresAt: new Date(now.getTime() + (options.expired ? -1_000 : 5 * 60_000)),
  });
}

beforeAll(() => {
  process.env.JWT_SECRET = "telegram-db-test-secret-at-least-32-characters";
});

afterAll(async () => {
  if (createdUserIds.size > 0 || telegramUserIds.size > 0) {
    const users = [...createdUserIds];
    const telegramIds = [...telegramUserIds];
    await prisma.$executeRaw`
      DELETE FROM "telegram_security"."TelegramAuditEvent"
      WHERE "userId" = ANY(${users}::text[]) OR "telegramUserId" = ANY(${telegramIds}::text[])
    `;
    await prisma.$executeRaw`
      DELETE FROM "telegram_security"."TelegramInitVerification"
      WHERE "telegramUserId" = ANY(${telegramIds}::text[])
    `;
    if (users.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
  }
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  await prisma.$disconnect();
});

describeDb("Telegram identity/session PostgreSQL security", () => {
  test("links only a fresh verified Telegram identity and rejects one-to-one conflicts", async () => {
    const firstUser = await createUser("first");
    const secondUser = await createUser("second");
    const firstTelegramId = numericTelegramId();
    const secondTelegramId = numericTelegramId();

    const firstVerification = await createVerification(firstTelegramId);
    const linked = await telegramIdentityStore.link(firstUser.id, firstVerification.verificationId);

    expect(linked.userId).toBe(firstUser.id);
    expect(linked.telegramUserId).toBe(firstTelegramId);
    expect(linked.revokedAt).toBeNull();
    expect(await telegramIdentityStore.findActiveByTelegramUserId(firstTelegramId)).not.toBeNull();

    const reusedTelegramVerification = await createVerification(firstTelegramId);
    await expect(
      telegramIdentityStore.link(secondUser.id, reusedTelegramVerification.verificationId),
    ).rejects.toMatchObject({ code: "TELEGRAM_LINK_CONFLICT" });

    const switchedTelegramVerification = await createVerification(secondTelegramId);
    await expect(
      telegramIdentityStore.link(firstUser.id, switchedTelegramVerification.verificationId),
    ).rejects.toMatchObject({ code: "TELEGRAM_LINK_CONFLICT" });

    const consumed = await prisma.$queryRaw<Array<{ consumedAt: Date | null }>>`
      SELECT "consumedAt"
      FROM "telegram_security"."TelegramInitVerification"
      WHERE "id" = ${firstVerification.verificationId}
    `;
    expect(consumed[0]?.consumedAt).toBeInstanceOf(Date);

    const audits = await prisma.$queryRaw<Array<{ action: string }>>`
      SELECT "action"
      FROM "telegram_security"."TelegramAuditEvent"
      WHERE "userId" = ${firstUser.id}
    `;
    expect(audits.map((row) => row.action)).toContain("identity_linked");
  });

  test("rejects expired link verifications", async () => {
    const user = await createUser("expired");
    const telegramUserId = numericTelegramId();
    const verification = await createVerification(telegramUserId, { expired: true });

    await expect(
      telegramIdentityStore.link(user.id, verification.verificationId),
    ).rejects.toMatchObject({ code: "INIT_DATA_EXPIRED" });
    expect(await telegramIdentityStore.findActiveByTelegramUserId(telegramUserId)).toBeNull();
  });

  test("revocation immediately invalidates an already-issued Mini App session", async () => {
    const user = await createUser("revoke");
    const telegramUserId = numericTelegramId();
    const verification = await createVerification(telegramUserId);
    const identity = await telegramIdentityStore.link(user.id, verification.verificationId);
    const session = issueTelegramSession(identity);

    expect(await telegramIdentityStore.revoke(user.id)).toBe(true);
    expect(await telegramIdentityStore.findActiveByTelegramUserId(telegramUserId)).toBeNull();
    await expect(resolveTelegramSession(session.token)).rejects.toThrow("revoked");

    const audits = await prisma.$queryRaw<Array<{ action: string }>>`
      SELECT "action"
      FROM "telegram_security"."TelegramAuditEvent"
      WHERE "userId" = ${user.id}
      ORDER BY "createdAt" ASC
    `;
    expect(audits.map((row) => row.action)).toContain("identity_revoked");
  });

  test("a session for an identity absent from PostgreSQL fails closed", async () => {
    const userId = crypto.randomUUID();
    const telegramUserId = numericTelegramId();
    const token = issueTelegramSession({
      id: crypto.randomUUID(),
      userId,
      telegramUserId,
      telegramUsername: null,
      linkedAt: new Date(),
      lastVerifiedAt: new Date(),
      revokedAt: null,
    }).token;

    await expect(resolveTelegramSession(token)).rejects.toThrow("revoked");
  });
});
