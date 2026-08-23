import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  CreateLecturerPortfolioItemInput,
  LecturerAunQaEvidenceExport,
  LecturerPortfolioItem,
  LecturerPortfolioItemKind,
  LecturerPortfolioVerificationAction,
  LecturerPortfolioVerificationStatus,
  OfferingsServiceContract,
  ReviewLecturerPortfolioItemInput,
  UpdateLecturerPortfolioItemInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { lecturerService } from "./service.ts";

const KIND_TO_DB = {
  qualification: "Qualification",
  research_interest: "ResearchInterest",
  research_project: "ResearchProject",
  publication: "Publication",
  professional_development: "ProfessionalDevelopment",
  certification: "Certification",
  membership: "Membership",
  external_profile: "ExternalProfile",
  supervision: "Supervision",
  academic_service: "AcademicService",
  other: "Other",
} as const;

type DbKind = (typeof KIND_TO_DB)[LecturerPortfolioItemKind];
type DbStatus = "SelfDeclared" | "Verified" | "Rejected";
type DbAction = "Verified" | "Rejected" | "Reset";

type ItemRow = {
  id: string;
  lecturerId: string;
  kind: DbKind;
  title: string;
  organization: string;
  description: string;
  role: string;
  identifier: string;
  url: string;
  startDate: Date | null;
  endDate: Date | null;
  tags: string[];
  isPublic: boolean;
  isFeatured: boolean;
  verificationStatus: DbStatus;
  createdAt: Date;
  updatedAt: Date;
};

type VerificationRow = {
  id: string;
  itemId: string;
  action: DbAction;
  note: string;
  actorId: string;
  actorName: string;
  createdAt: Date;
};

type DbClient = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

const DB_TO_KIND = Object.fromEntries(
  Object.entries(KIND_TO_DB).map(([kind, dbKind]) => [dbKind, kind]),
) as Record<DbKind, LecturerPortfolioItemKind>;

const STATUS_FROM_DB: Record<DbStatus, LecturerPortfolioVerificationStatus> = {
  SelfDeclared: "self_declared",
  Verified: "verified",
  Rejected: "rejected",
};

const ACTION_FROM_DB: Record<DbAction, LecturerPortfolioVerificationAction> = {
  Verified: "verified",
  Rejected: "rejected",
  Reset: "reset",
};

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function ensureDateOrder(startDate: string | null, endDate: string | null): void {
  if (startDate && endDate && endDate < startDate) {
    throw new PortfolioValidationError("End date must be on or after start date");
  }
}

function tagsSql(tags: readonly string[]): Prisma.Sql {
  if (tags.length === 0) return Prisma.sql`ARRAY[]::text[]`;
  return Prisma.sql`ARRAY[${Prisma.join(tags)}]::text[]`;
}

async function findItem(db: DbClient, id: string, lecturerId?: string): Promise<ItemRow | null> {
  const rows = lecturerId
    ? await db.$queryRaw<ItemRow[]>`
        SELECT *
        FROM lecturer_portfolio."LecturerPortfolioItem"
        WHERE "id" = ${id} AND "lecturerId" = ${lecturerId}
        LIMIT 1
      `
    : await db.$queryRaw<ItemRow[]>`
        SELECT *
        FROM lecturer_portfolio."LecturerPortfolioItem"
        WHERE "id" = ${id}
        LIMIT 1
      `;
  return rows[0] ?? null;
}

async function verificationEvents(db: DbClient, itemId: string): Promise<VerificationRow[]> {
  return db.$queryRaw<VerificationRow[]>`
    SELECT v."id", v."itemId", v."action"::text AS "action", v."note",
           v."actorId", u."name" AS "actorName", v."createdAt"
    FROM lecturer_portfolio."LecturerPortfolioVerification" v
    JOIN public."User" u ON u."id" = v."actorId"
    WHERE v."itemId" = ${itemId}
    ORDER BY v."createdAt" ASC, v."id" ASC
  `;
}

async function presentItem(db: DbClient, row: ItemRow): Promise<LecturerPortfolioItem> {
  const events = await verificationEvents(db, row.id);
  return {
    id: row.id,
    lecturerId: row.lecturerId,
    kind: DB_TO_KIND[row.kind],
    title: row.title,
    organization: row.organization,
    description: row.description,
    role: row.role,
    identifier: row.identifier,
    url: row.url,
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    tags: row.tags,
    isPublic: row.isPublic,
    isFeatured: row.isFeatured,
    verificationStatus: STATUS_FROM_DB[row.verificationStatus],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    verificationEvents: events.map((event) => ({
      id: event.id,
      action: ACTION_FROM_DB[event.action],
      note: event.note,
      actor: { id: event.actorId, name: event.actorName },
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

async function listItems(lecturerId: string): Promise<LecturerPortfolioItem[]> {
  const rows = await prisma.$queryRaw<ItemRow[]>`
    SELECT *
    FROM lecturer_portfolio."LecturerPortfolioItem"
    WHERE "lecturerId" = ${lecturerId}
    ORDER BY "isFeatured" DESC, "updatedAt" DESC, "id" ASC
  `;
  return Promise.all(rows.map((row) => presentItem(prisma, row)));
}

export const lecturerPortfolioService = {
  listOwnItems: listItems,

  async createOwnItem(
    lecturerId: string,
    input: CreateLecturerPortfolioItemInput,
  ): Promise<LecturerPortfolioItem> {
    if (!(await lecturerService.getById(lecturerId))) {
      throw new PortfolioNotFoundError("Lecturer profile not found");
    }
    ensureDateOrder(input.startDate, input.endDate);
    const id = randomUUID();
    const dbKind = KIND_TO_DB[input.kind];
    const tags = [...new Set(input.tags)];
    const rows = await prisma.$queryRaw<ItemRow[]>(Prisma.sql`
      INSERT INTO lecturer_portfolio."LecturerPortfolioItem" (
        "id", "lecturerId", "kind", "title", "organization", "description",
        "role", "identifier", "url", "startDate", "endDate", "tags",
        "isPublic", "isFeatured"
      ) VALUES (
        ${id}, ${lecturerId}, ${dbKind}::lecturer_portfolio."LecturerPortfolioItemKind",
        ${input.title}, ${input.organization}, ${input.description}, ${input.role},
        ${input.identifier}, ${input.url}, ${toDate(input.startDate)}, ${toDate(input.endDate)},
        ${tagsSql(tags)}, ${input.isPublic}, ${input.isFeatured}
      )
      RETURNING *
    `);
    return presentItem(prisma, rows[0]!);
  },

  async updateOwnItem(
    lecturerId: string,
    itemId: string,
    input: UpdateLecturerPortfolioItemInput,
  ): Promise<LecturerPortfolioItem> {
    const existing = await findItem(prisma, itemId, lecturerId);
    if (!existing) throw new PortfolioNotFoundError("Portfolio item not found");

    const next = {
      kind: input.kind ?? DB_TO_KIND[existing.kind],
      title: input.title ?? existing.title,
      organization: input.organization ?? existing.organization,
      description: input.description ?? existing.description,
      role: input.role ?? existing.role,
      identifier: input.identifier ?? existing.identifier,
      url: input.url ?? existing.url,
      startDate: input.startDate === undefined ? dateOnly(existing.startDate) : input.startDate,
      endDate: input.endDate === undefined ? dateOnly(existing.endDate) : input.endDate,
      tags: input.tags ?? existing.tags,
      isPublic: input.isPublic ?? existing.isPublic,
      isFeatured: input.isFeatured ?? existing.isFeatured,
    };
    ensureDateOrder(next.startDate, next.endDate);
    const dbKind = KIND_TO_DB[next.kind];
    const tags = [...new Set(next.tags)];
    const shouldReset = existing.verificationStatus !== "SelfDeclared";

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE lecturer_portfolio."LecturerPortfolioItem"
        SET "kind" = ${dbKind}::lecturer_portfolio."LecturerPortfolioItemKind",
            "title" = ${next.title},
            "organization" = ${next.organization},
            "description" = ${next.description},
            "role" = ${next.role},
            "identifier" = ${next.identifier},
            "url" = ${next.url},
            "startDate" = ${toDate(next.startDate)},
            "endDate" = ${toDate(next.endDate)},
            "tags" = ${tagsSql(tags)},
            "isPublic" = ${next.isPublic},
            "isFeatured" = ${next.isFeatured},
            "verificationStatus" = ${shouldReset ? "SelfDeclared" : existing.verificationStatus}::lecturer_portfolio."LecturerPortfolioVerificationStatus",
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${itemId} AND "lecturerId" = ${lecturerId}
      `);
      if (shouldReset) {
        await tx.$executeRaw`
          INSERT INTO lecturer_portfolio."LecturerPortfolioVerification"
            ("id", "itemId", "action", "actorId", "note")
          VALUES (
            ${randomUUID()}, ${itemId},
            'Reset'::lecturer_portfolio."LecturerPortfolioVerificationAction",
            ${lecturerId},
            'Verification reset automatically because the lecturer edited this record.'
          )
        `;
      }
    });

    const row = await findItem(prisma, itemId, lecturerId);
    if (!row) throw new PortfolioNotFoundError("Portfolio item not found");
    return presentItem(prisma, row);
  },

  async deleteOwnItem(lecturerId: string, itemId: string): Promise<void> {
    const existing = await findItem(prisma, itemId, lecturerId);
    if (!existing) throw new PortfolioNotFoundError("Portfolio item not found");
    if (existing.verificationStatus === "Verified") {
      throw new PortfolioConflictError(
        "Verified evidence cannot be deleted by the lecturer; edit it to reset verification first.",
      );
    }
    await prisma.$executeRaw`
      DELETE FROM lecturer_portfolio."LecturerPortfolioItem"
      WHERE "id" = ${itemId} AND "lecturerId" = ${lecturerId}
    `;
  },

  async reviewItem(
    actorId: string,
    lecturerId: string,
    itemId: string,
    input: ReviewLecturerPortfolioItemInput,
  ): Promise<LecturerPortfolioItem> {
    const existing = await findItem(prisma, itemId, lecturerId);
    if (!existing) throw new PortfolioNotFoundError("Portfolio item not found");

    const status: DbStatus = input.action === "verified" ? "Verified" : "Rejected";
    const action: DbAction = input.action === "verified" ? "Verified" : "Rejected";
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE lecturer_portfolio."LecturerPortfolioItem"
        SET "verificationStatus" = ${status}::lecturer_portfolio."LecturerPortfolioVerificationStatus",
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${itemId} AND "lecturerId" = ${lecturerId}
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO lecturer_portfolio."LecturerPortfolioVerification"
          ("id", "itemId", "action", "note", "actorId")
        VALUES (
          ${randomUUID()}, ${itemId},
          ${action}::lecturer_portfolio."LecturerPortfolioVerificationAction",
          ${input.note}, ${actorId}
        )
      `);
    });

    const row = await findItem(prisma, itemId, lecturerId);
    if (!row) throw new PortfolioNotFoundError("Portfolio item not found");
    return presentItem(prisma, row);
  },

  async aunQaEvidenceExport(lecturerId: string): Promise<LecturerAunQaEvidenceExport> {
    const offerings = registry.get<OfferingsServiceContract>("offerings").service;
    const [profile, items, teaching] = await Promise.all([
      lecturerService.getOwnProfile(lecturerId),
      listItems(lecturerId),
      offerings.portfolioTeachingForLecturer(lecturerId),
    ]);
    if (!profile) throw new PortfolioNotFoundError("Lecturer profile not found");

    return {
      schemaVersion: "lecturer-aun-qa-evidence-v1",
      generatedAt: new Date().toISOString(),
      lecturer: {
        id: profile.id,
        name: profile.name,
        academicPosition: profile.title ?? null,
        qualification: profile.qualification ?? null,
        employmentType: profile.professionalProfile?.employmentType ?? null,
        fieldOfSpecialization: profile.professionalProfile?.fieldOfSpecialization ?? null,
        yearsOfExperience: profile.professionalProfile?.yearsOfExperience ?? null,
      },
      evidence: [
        ...teaching.map((row) => ({
          id: `offering:${row.offeringId}`,
          category: "teaching",
          title: `${row.courseCode} · ${row.courseTitle}`,
          detail: `${row.term} · Section ${row.sectionCode} · ${row.role}`,
          source: "PMS Offering",
          sourceEntityId: row.offeringId,
          verification: "authoritative_pms" as const,
        })),
        ...items
          .filter((item) => item.verificationStatus !== "rejected")
          .map((item) => ({
            id: `portfolio:${item.id}`,
            category: item.kind,
            title: item.title,
            detail: [item.organization, item.role, item.identifier].filter(Boolean).join(" · "),
            source: "Lecturer Portfolio",
            sourceEntityId: item.id,
            verification: item.verificationStatus === "verified"
              ? "verified_professional" as const
              : "self_declared" as const,
          })),
      ],
      note: "Read-only evidence projection. It does not create QA evidence, ratings, approvals, or alter academic records. Self-declared records remain clearly distinct from PMS-authoritative and verified professional evidence.",
    };
  },
};

export class PortfolioNotFoundError extends Error {}
export class PortfolioValidationError extends Error {}
export class PortfolioConflictError extends Error {}
