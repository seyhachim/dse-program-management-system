import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AuthUser } from "../../core/auth/token.ts";
import { hasRoleInProgramme } from "../../core/auth/token.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { prisma } from "../../core/db/prisma.ts";
import { sendTelegramPmsMessage } from "./notification-service.ts";

export type TelegramDestinationChatType = "GROUP" | "SUPERGROUP" | "CHANNEL";
export type TelegramDestinationAudience = "ALL_LECTURERS" | "ALL_STUDENTS" | "COHORT" | "CLASS_SECTION" | "CUSTOM";
export type TelegramDestinationStatus = "PENDING" | "OBSERVED" | "CONNECTED" | "DISABLED";

export class TelegramDestinationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "TelegramDestinationError";
  }
}

export function telegramDestinationErrorStatus(error: unknown): number | null {
  if (!(error instanceof TelegramDestinationError)) return null;
  if (error.code === "NOT_FOUND") return 404;
  if (error.code === "CONFLICT") return 409;
  if (error.code === "FORBIDDEN") return 403;
  return 400;
}

type DestinationRow = {
  id: string;
  programmeId: string;
  name: string;
  chatId: string | null;
  chatTitle: string | null;
  chatType: TelegramDestinationChatType;
  botKind: "PMS" | "PUBLIC_INFO";
  audienceType: TelegramDestinationAudience;
  scopeId: string | null;
  purpose: string | null;
  status: TelegramDestinationStatus;
  enabled: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type RegistrationRow = {
  id: string;
  destinationId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  observedChatId: string | null;
  observedChatTitle: string | null;
  observedChatType: TelegramDestinationChatType | null;
  observedAt: Date | null;
  confirmedAt?: Date | null;
};

type DeliveryRow = {
  id: string;
  eventKey: string;
  kind: string;
  resourceId: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  lastError: string | null;
  telegramMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function digestRegistrationCode(code: string) {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

function managerProgrammeIds(user: AuthUser): string[] {
  return [...new Set(user.programmeRoles
    .filter((assignment) => assignment.programmeId && ["admin", "program_coordinator"].includes(assignment.role))
    .map((assignment) => assignment.programmeId as string))];
}

function hasGlobalAdmin(user: AuthUser): boolean {
  return user.programmeRoles.some((assignment) => assignment.role === "admin" && assignment.programmeId === null);
}

function resolveProgrammeId(user: AuthUser, requested?: string): string {
  if (requested) {
    if (!hasRoleInProgramme(user, "admin", requested) && !hasRoleInProgramme(user, "program_coordinator", requested)) {
      throw new TelegramDestinationError("FORBIDDEN", "You cannot manage Telegram destinations for this programme");
    }
    return requested;
  }
  const scoped = managerProgrammeIds(user);
  if (scoped.length === 1) return scoped[0]!;
  if (hasGlobalAdmin(user)) return DEFAULT_PROGRAMME_ID;
  throw new TelegramDestinationError("INVALID_PROGRAMME", "Choose a programme before managing Telegram destinations");
}

function assertManager(user: AuthUser, programmeId: string) {
  if (!hasRoleInProgramme(user, "admin", programmeId) && !hasRoleInProgramme(user, "program_coordinator", programmeId)) {
    throw new TelegramDestinationError("FORBIDDEN", "Telegram destination management is limited to programme managers");
  }
}

function view(row: DestinationRow) {
  return {
    id: row.id,
    programmeId: row.programmeId,
    name: row.name,
    chatTitle: row.chatTitle ?? undefined,
    chatType: row.chatType,
    botKind: row.botKind,
    audienceType: row.audienceType,
    scopeId: row.scopeId ?? undefined,
    purpose: row.purpose ?? undefined,
    status: row.status,
    enabled: row.enabled,
    connected: row.status === "CONNECTED" && row.enabled && Boolean(row.chatId),
    verifiedAt: row.verifiedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function destinationForManager(user: AuthUser, id: string): Promise<DestinationRow> {
  const rows = await prisma.$queryRaw<DestinationRow[]>`
    SELECT * FROM "telegram_security"."TelegramDestination" WHERE "id" = ${id} LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new TelegramDestinationError("NOT_FOUND", "Telegram destination not found");
  assertManager(user, row.programmeId);
  return row;
}

async function validateScope(programmeId: string, audienceType: TelegramDestinationAudience, scopeId?: string) {
  if (audienceType === "CLASS_SECTION") {
    throw new TelegramDestinationError(
      "INVALID_INPUT",
      "Class-section destinations are not enabled until PMS has a canonical class-section record",
    );
  }
  if (audienceType === "COHORT") {
    const id = scopeId?.trim();
    if (!id) throw new TelegramDestinationError("INVALID_INPUT", "Choose a PMS cohort for this destination");
    const cohort = await prisma.studentCohort.findFirst({
      where: { id, programmeId },
      select: { id: true },
    });
    if (!cohort) throw new TelegramDestinationError("INVALID_INPUT", "The selected cohort does not belong to this programme");
    return id;
  }
  if (scopeId?.trim()) throw new TelegramDestinationError("INVALID_INPUT", "This audience does not accept a scope");
  return undefined;
}

async function claimDestinationDelivery(destinationId: string, eventKey: string, kind: string, resourceId: string) {
  const id = randomUUID();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "telegram_security"."TelegramDestinationDelivery" AS delivery
      ("id", "destinationId", "eventKey", "kind", "resourceId", "status", "attempts")
    VALUES (${id}, ${destinationId}, ${eventKey}, ${kind}, ${resourceId}, 'pending', 0)
    ON CONFLICT ("destinationId", "eventKey") DO UPDATE
      SET "status"='pending', "lastError"=NULL, "updatedAt"=CURRENT_TIMESTAMP
      WHERE delivery."status"='failed'
    RETURNING "id"
  `;
  return rows[0]?.id ?? null;
}

async function finishDestinationDelivery(deliveryId: string, chatId: string, text: string, url: string) {
  try {
    const messageId = await sendTelegramPmsMessage(chatId, text, url);
    await prisma.$executeRaw`
      UPDATE "telegram_security"."TelegramDestinationDelivery"
      SET "status"='sent', "attempts"="attempts"+1, "lastError"=NULL,
          "telegramMessageId"=${messageId}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${deliveryId}
    `;
    return { status: "sent" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown Telegram delivery failure";
    await prisma.$executeRaw`
      UPDATE "telegram_security"."TelegramDestinationDelivery"
      SET "status"='failed', "attempts"="attempts"+1, "lastError"=${message}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${deliveryId}
    `;
    return { status: "failed" as const, error: message };
  }
}

export const telegramDestinationService = {
  async listManagedProgrammes(user: AuthUser) {
    const ids = managerProgrammeIds(user);
    if (hasGlobalAdmin(user) && !ids.includes(DEFAULT_PROGRAMME_ID)) ids.unshift(DEFAULT_PROGRAMME_ID);
    if (ids.length === 0) {
      throw new TelegramDestinationError("FORBIDDEN", "Telegram destination management is limited to programme managers");
    }
    return { programmes: ids.map((id) => ({ id })) };
  },

  async list(user: AuthUser, requestedProgrammeId?: string) {
    const programmeId = resolveProgrammeId(user, requestedProgrammeId);
    const rows = await prisma.$queryRaw<DestinationRow[]>`
      SELECT * FROM "telegram_security"."TelegramDestination"
      WHERE "programmeId"=${programmeId}
      ORDER BY "enabled" DESC, "name" ASC
    `;
    return { programmeId, destinations: rows.map(view) };
  },

  async listCohorts(user: AuthUser, requestedProgrammeId?: string) {
    const programmeId = resolveProgrammeId(user, requestedProgrammeId);
    const cohorts = await prisma.studentCohort.findMany({
      where: { programmeId },
      orderBy: [{ intakeYear: "desc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, intakeYear: true, status: true },
    });
    return { programmeId, cohorts };
  },

  async create(user: AuthUser, input: {
    programmeId?: string;
    name: string;
    audienceType: TelegramDestinationAudience;
    scopeId?: string;
    purpose?: string;
    chatType?: TelegramDestinationChatType;
  }) {
    const programmeId = resolveProgrammeId(user, input.programmeId);
    const name = input.name.trim();
    if (!name || name.length > 120) throw new TelegramDestinationError("INVALID_INPUT", "Destination name must be 1–120 characters");
    const scopeId = await validateScope(programmeId, input.audienceType, input.scopeId);
    const id = randomUUID();
    const rows = await prisma.$queryRaw<DestinationRow[]>`
      INSERT INTO "telegram_security"."TelegramDestination"
        ("id","programmeId","name","chatType","botKind","audienceType","scopeId","purpose","status","enabled","createdBy")
      VALUES (${id},${programmeId},${name},${input.chatType ?? "SUPERGROUP"},'PMS',${input.audienceType},${scopeId ?? null},${input.purpose?.trim() || null},'PENDING',TRUE,${user.id})
      RETURNING *
    `;
    return view(rows[0]!);
  },

  async update(user: AuthUser, id: string, input: { name?: string; purpose?: string; enabled?: boolean }) {
    await destinationForManager(user, id);
    if (input.name !== undefined && (!input.name.trim() || input.name.trim().length > 120)) {
      throw new TelegramDestinationError("INVALID_INPUT", "Destination name must be 1–120 characters");
    }
    try {
      const rows = await prisma.$queryRaw<DestinationRow[]>`
        UPDATE "telegram_security"."TelegramDestination"
        SET "name"=COALESCE(${input.name?.trim() ?? null}, "name"),
            "purpose"=CASE WHEN ${input.purpose !== undefined} THEN ${input.purpose?.trim() || null} ELSE "purpose" END,
            "enabled"=COALESCE(${input.enabled ?? null}, "enabled"),
            "status"=CASE WHEN ${input.enabled === false} THEN 'DISABLED'
                          WHEN ${input.enabled === true} AND "chatId" IS NOT NULL THEN 'CONNECTED'
                          ELSE "status" END,
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${id}
        RETURNING *
      `;
      return view(rows[0]!);
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) {
        throw new TelegramDestinationError("CONFLICT", "That audience already has an enabled Telegram destination");
      }
      throw error;
    }
  },

  async beginRegistration(user: AuthUser, id: string) {
    const destination = await destinationForManager(user, id);
    if (destination.botKind !== "PMS") {
      throw new TelegramDestinationError("CONFLICT", "Protected destination registration must use the DSE PMS bot");
    }
    const code = randomBytes(18).toString("base64url");
    const digest = digestRegistrationCode(code);
    const registrationId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "telegram_security"."TelegramDestinationRegistration"
        ("id","destinationId","tokenDigest","expiresAt","createdBy")
      VALUES (${registrationId},${id},${digest},CURRENT_TIMESTAMP + INTERVAL '15 minutes',${user.id})
    `;
    return {
      registrationId,
      code,
      expiresInSeconds: 900,
      command: `/pms_register ${code}`,
      destination: view(destination),
    };
  },

  async observeRegistration(input: { code: string; chatId: string; chatTitle?: string; chatType: TelegramDestinationChatType }) {
    const digest = digestRegistrationCode(input.code.trim());
    let mismatchMessage: string | undefined;
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<RegistrationRow[]>`
        UPDATE "telegram_security"."TelegramDestinationRegistration"
        SET "consumedAt"=CURRENT_TIMESTAMP,
            "observedChatId"=${input.chatId},
            "observedChatTitle"=${input.chatTitle?.slice(0, 255) || null},
            "observedChatType"=${input.chatType},
            "observedAt"=CURRENT_TIMESTAMP
        WHERE "tokenDigest"=${digest} AND "consumedAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP
        RETURNING *
      `;
      const registration = rows[0];
      if (!registration) throw new TelegramDestinationError("INVALID_REGISTRATION", "Connection code is invalid, expired, or already used");
      const destinations = await tx.$queryRaw<DestinationRow[]>`
        SELECT * FROM "telegram_security"."TelegramDestination"
        WHERE "id"=${registration.destinationId} FOR UPDATE
      `;
      const destination = destinations[0];
      if (!destination || !["PENDING", "OBSERVED", "DISABLED"].includes(destination.status)) {
        throw new TelegramDestinationError("CONFLICT", "Destination can no longer be connected with this code");
      }
      if (destination.chatType !== input.chatType) {
        mismatchMessage = `Expected a ${destination.chatType.toLowerCase()} but Telegram reported a ${input.chatType.toLowerCase()}. Generate a new connection code for the correct chat type.`;
        return { registrationId: registration.id, observed: false };
      }
      await tx.$executeRaw`
        UPDATE "telegram_security"."TelegramDestination"
        SET "status"='OBSERVED', "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${destination.id}
      `;
      return { registrationId: registration.id, observed: true };
    });
    if (mismatchMessage) throw new TelegramDestinationError("CONFLICT", mismatchMessage);
    return result;
  },

  async pendingRegistration(user: AuthUser, destinationId: string) {
    await destinationForManager(user, destinationId);
    const rows = await prisma.$queryRaw<RegistrationRow[]>`
      SELECT "id","destinationId","expiresAt","consumedAt","observedChatId","observedChatTitle","observedChatType","observedAt","confirmedAt"
      FROM "telegram_security"."TelegramDestinationRegistration"
      WHERE "destinationId"=${destinationId}
      ORDER BY "createdAt" DESC LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      expiresAt: row.expiresAt.toISOString(),
      observed: Boolean(row.observedAt) && !row.confirmedAt,
      observedChatTitle: row.observedChatTitle ?? undefined,
      observedChatType: row.observedChatType ?? undefined,
      observedAt: row.observedAt?.toISOString(),
    };
  },

  async confirmRegistration(user: AuthUser, destinationId: string, registrationId: string) {
    const destination = await destinationForManager(user, destinationId);
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.$queryRaw<RegistrationRow[]>`
          UPDATE "telegram_security"."TelegramDestinationRegistration"
          SET "confirmedAt"=CURRENT_TIMESTAMP, "confirmedBy"=${user.id}
          WHERE "id"=${registrationId} AND "destinationId"=${destinationId}
            AND "confirmedAt" IS NULL AND "observedAt" IS NOT NULL
          RETURNING "id","destinationId","expiresAt","consumedAt","observedChatId","observedChatTitle","observedChatType","observedAt","confirmedAt"
        `;
        const registration = claimed[0];
        if (!registration?.observedChatId || !registration.observedChatType || !registration.observedAt) {
          throw new TelegramDestinationError("CONFLICT", "This Telegram connection is missing, unobserved, or already confirmed");
        }
        if (registration.observedChatType !== destination.chatType) {
          throw new TelegramDestinationError("CONFLICT", "Observed Telegram chat type does not match this destination");
        }
        const destinationRows = await tx.$queryRaw<DestinationRow[]>`
          UPDATE "telegram_security"."TelegramDestination"
          SET "chatId"=${registration.observedChatId}, "chatTitle"=${registration.observedChatTitle},
              "status"='CONNECTED', "enabled"=TRUE,
              "verifiedAt"=CURRENT_TIMESTAMP, "verifiedBy"=${user.id}, "updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${destination.id}
          RETURNING *
        `;
        return destinationRows[0]!;
      });
      return view(updated);
    } catch (error) {
      if (error instanceof TelegramDestinationError) throw error;
      if (String(error).toLowerCase().includes("unique")) throw new TelegramDestinationError("CONFLICT", "That Telegram chat or audience is already connected");
      throw error;
    }
  },

  async test(user: AuthUser, id: string, url: string) {
    const destination = await destinationForManager(user, id);
    if (!destination.enabled || destination.status !== "CONNECTED" || !destination.chatId) {
      throw new TelegramDestinationError("CONFLICT", "Connect and enable this destination before sending a test");
    }
    if (destination.botKind !== "PMS") throw new TelegramDestinationError("CONFLICT", "Protected destination tests must use the DSE PMS bot");
    const eventKey = `destination-test:${randomUUID()}`;
    const deliveryId = await claimDestinationDelivery(destination.id, eventKey, "destination_test", destination.id);
    if (!deliveryId) throw new TelegramDestinationError("CONFLICT", "This test was already sent");
    const result = await finishDestinationDelivery(
      deliveryId,
      destination.chatId,
      `DSE PMS test message\n\n${destination.name}\nThis confirms that this Telegram destination can receive privacy-safe programme notifications.`,
      url,
    );
    if (result.status === "failed") throw new TelegramDestinationError("DELIVERY_FAILED", result.error ?? "Telegram delivery failed");
    return { deliveryId, status: result.status };
  },

  async deliveries(user: AuthUser, id: string) {
    await destinationForManager(user, id);
    const rows = await prisma.$queryRaw<DeliveryRow[]>`
      SELECT "id","eventKey","kind","resourceId","status","attempts","lastError","telegramMessageId","createdAt","updatedAt"
      FROM "telegram_security"."TelegramDestinationDelivery"
      WHERE "destinationId"=${id}
      ORDER BY "updatedAt" DESC LIMIT 50
    `;
    return rows.map((row) => ({
      ...row,
      lastError: row.lastError ?? undefined,
      telegramMessageId: row.telegramMessageId ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  },

  async resolve(programmeId: string, audienceType: TelegramDestinationAudience, scopeId?: string) {
    const rows = await prisma.$queryRaw<DestinationRow[]>`
      SELECT * FROM "telegram_security"."TelegramDestination"
      WHERE "programmeId"=${programmeId} AND "audienceType"=${audienceType}
        AND COALESCE("scopeId", '')=COALESCE(${scopeId ?? null}, '')
        AND "botKind"='PMS' AND "status"='CONNECTED' AND "enabled"=TRUE
      ORDER BY "verifiedAt" DESC LIMIT 1
    `;
    return rows[0] ?? null;
  },

  async deliverToAudience(input: {
    programmeId: string;
    audienceType: TelegramDestinationAudience;
    scopeId?: string;
    eventKey: string;
    kind: string;
    resourceId: string;
    text: string;
    url: string;
  }) {
    const destination = await this.resolve(input.programmeId, input.audienceType, input.scopeId);
    if (!destination?.chatId) return { status: "missing" as const };
    const deliveryId = await claimDestinationDelivery(destination.id, input.eventKey, input.kind, input.resourceId);
    if (!deliveryId) return { status: "duplicate" as const };
    return finishDestinationDelivery(deliveryId, destination.chatId, input.text, input.url);
  },
};