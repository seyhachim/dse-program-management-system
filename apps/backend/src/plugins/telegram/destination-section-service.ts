import { randomUUID } from "node:crypto";
import type { AuthUser } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import {
  TelegramDestinationError,
  telegramDestinationService,
  type TelegramDestinationChatType,
} from "./destination-service.ts";

type SectionScopeRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  cohortId: string;
  cohortCode: string;
  cohortName: string;
  intakeYear: number;
};

type DestinationRow = {
  id: string;
  programmeId: string;
  name: string;
  chatTitle: string | null;
  chatType: TelegramDestinationChatType;
  botKind: "PMS" | "PUBLIC_INFO";
  audienceType: "CLASS_SECTION";
  scopeId: string;
  purpose: string | null;
  status: "PENDING" | "OBSERVED" | "CONNECTED" | "DISABLED";
  enabled: boolean;
  chatId: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

async function resolveManagedProgramme(user: AuthUser, requested?: string) {
  const { programmes } = await telegramDestinationService.listManagedProgrammes(user);
  if (requested) {
    if (!programmes.some((programme) => programme.id === requested)) {
      throw new TelegramDestinationError("FORBIDDEN", "You cannot manage Telegram destinations for this programme");
    }
    return requested;
  }
  if (programmes.length === 1) return programmes[0]!.id;
  throw new TelegramDestinationError("INVALID_PROGRAMME", "Choose a programme before managing Telegram destinations");
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
    scopeId: row.scopeId,
    purpose: row.purpose ?? undefined,
    status: row.status,
    enabled: row.enabled,
    connected: row.status === "CONNECTED" && row.enabled && Boolean(row.chatId),
    verifiedAt: row.verifiedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const telegramDestinationSectionService = {
  async listSections(user: AuthUser, requestedProgrammeId?: string) {
    const programmeId = await resolveManagedProgramme(user, requestedProgrammeId);
    const sections = await prisma.$queryRaw<SectionScopeRow[]>`
      SELECT s."id", s."code", s."name", s."active", c."id" AS "cohortId",
             c."code" AS "cohortCode", c."name" AS "cohortName", c."intakeYear"
      FROM "StudentCohortSection" s
      JOIN "StudentCohort" c ON c."id" = s."cohortId"
      WHERE c."programmeId" = ${programmeId} AND s."active" = TRUE
      ORDER BY c."intakeYear" DESC, c."code" ASC, s."code" ASC
    `;
    return { programmeId, sections };
  },

  async create(user: AuthUser, input: {
    programmeId?: string;
    name: string;
    scopeId?: string;
    purpose?: string;
    chatType?: TelegramDestinationChatType;
  }) {
    const programmeId = await resolveManagedProgramme(user, input.programmeId);
    const name = input.name.trim();
    if (!name || name.length > 120) {
      throw new TelegramDestinationError("INVALID_INPUT", "Destination name must be 1–120 characters");
    }
    const scopeId = input.scopeId?.trim();
    if (!scopeId) {
      throw new TelegramDestinationError("INVALID_INPUT", "Choose a canonical PMS section for this destination");
    }
    const sectionRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT s."id"
      FROM "StudentCohortSection" s
      JOIN "StudentCohort" c ON c."id" = s."cohortId"
      WHERE s."id" = ${scopeId} AND s."active" = TRUE AND c."programmeId" = ${programmeId}
      LIMIT 1
    `;
    if (!sectionRows[0]) {
      throw new TelegramDestinationError("INVALID_INPUT", "The selected section is inactive or does not belong to this programme");
    }

    const id = randomUUID();
    try {
      const rows = await prisma.$queryRaw<DestinationRow[]>`
        INSERT INTO "telegram_security"."TelegramDestination"
          ("id","programmeId","name","chatType","botKind","audienceType","scopeId","purpose","status","enabled","createdBy")
        VALUES (${id},${programmeId},${name},${input.chatType ?? "SUPERGROUP"},'PMS','CLASS_SECTION',${scopeId},${input.purpose?.trim() || null},'PENDING',TRUE,${user.id})
        RETURNING *
      `;
      return view(rows[0]!);
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) {
        throw new TelegramDestinationError("CONFLICT", "That section already has an enabled Telegram destination");
      }
      throw error;
    }
  },
};
