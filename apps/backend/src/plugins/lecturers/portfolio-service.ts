import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { classifyLecturerEvidencePeriod } from "@dse-pms/shared-types";
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

const KIND_FROM_DB = Object.fromEntries(
  Object.entries(KIND_TO_DB).map(([key, value]) => [value, key]),
) as Record<string, LecturerPortfolioItemKind>;

const STATUS_TO_DB = {
  self_declared: "SelfDeclared",
  verified: "Verified",
  rejected: "Rejected",
} as const;

const STATUS_FROM_DB: Record<string, LecturerPortfolioVerificationStatus> = {
  SelfDeclared: "self_declared",
  Verified: "verified",
  Rejected: "rejected",
};

const ACTION_TO_DB = {
  verified: "Verified",
  rejected: "Rejected",
  reset: "Reset",
} as const;

const ACTION_FROM_DB: Record<string, LecturerPortfolioVerificationAction> = {
  Verified: "verified",
  Rejected: "rejected",
  Reset: "reset",
};

type DbExecutor = PrismaClient | Prisma.TransactionClient;

type PortfolioItemRow = {
  id: string;
  lecturerId: string;
  kind: string;
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
  verificationStatus: string;
  createdAt: Date;
  updatedAt: Date;
};

type VerificationRow = {
  id: string;
  action: string;
  note: string;
  actorId: string;
  createdAt: Date;
  actorName: string;
};

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toDbDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function presentItem(row: PortfolioItemRow, events: VerificationRow[]): LecturerPortfolioItem {
  return {
    id: row.id,
    lecturerId: row.lecturerId,
    kind: KIND_FROM_DB[row.kind] ?? "other",
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
    verificationStatus: STATUS_FROM_DB[row.verificationStatus] ?? "self_declared",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    verificationEvents: events.map((event) => ({
      id: event.id,
      action: ACTION_FROM_DB[event.action] ?? "reset",
      note: event.note,
      actor: { id: event.actorId, name: event.actorName },
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

async function listRows(db: DbExecutor, lecturerId: string): Promise<PortfolioItemRow[]> {
  return db.$queryRaw<PortfolioItemRow[]>`
    SELECT * FROM lecturer_portfolio."LecturerPortfolioItem"
    WHERE "lecturerId" = ${lecturerId}
    ORDER BY "isFeatured" DESC, "startDate" DESC NULLS LAST, "createdAt" DESC
  `;
}

async function findRow(db: DbExecutor, lecturerId: string, itemId: string): Promise<PortfolioItemRow | null> {
  const rows = await db.$queryRaw<PortfolioItemRow[]>`
    SELECT * FROM lecturer_portfolio."LecturerPortfolioItem"
    WHERE "id" = ${itemId} AND "lecturerId" = ${lecturerId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function listVerificationEvents(
  db: DbExecutor,
  itemIds: string[],
): Promise<Map<string, VerificationRow[]>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db.$queryRaw<Array<VerificationRow & { portfolioItemId: string }>>(Prisma.sql`
    SELECT v."id", v."portfolioItemId", v."action", v."note", v."actorId", v."createdAt", u."name" AS "actorName"
    FROM lecturer_portfolio."LecturerPortfolioVerification" v
    JOIN public."User" u ON u."id" = v."actorId"
    WHERE v."portfolioItemId" IN (${Prisma.join(itemIds)})
    ORDER BY v."createdAt" DESC, v."id" DESC
  `);
  const events = new Map<string, VerificationRow[]>();
  for (const row of rows) {
    const current = events.get(row.portfolioItemId) ?? [];
    current.push(row);
    events.set(row.portfolioItemId, current);
  }
  return events;
}

async function listPresentedItems(db: DbExecutor, lecturerId: string): Promise<LecturerPortfolioItem[]> {
  const rows = await listRows(db, lecturerId);
  const eventsByItem = await listVerificationEvents(db, rows.map((row) => row.id));
  return rows.map((row) => presentItem(row, eventsByItem.get(row.id) ?? []));
}

async function insertVerificationEvent(
  db: DbExecutor,
  portfolioItemId: string,
  actorId: string,
  action: LecturerPortfolioVerificationAction,
  note: string,
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO lecturer_portfolio."LecturerPortfolioVerification" (
      "id", "portfolioItemId", "actorId", "action", "note"
    ) VALUES (
      ${randomUUID()}, ${portfolioItemId}, ${actorId},
      ${ACTION_TO_DB[action]}::lecturer_portfolio."LecturerPortfolioVerificationAction",
      ${note}
    )
  `;
}

export const lecturerPortfolioService = {
  async listOwnItems(lecturerId: string) {
    return listPresentedItems(prisma, lecturerId);
  },

  async listItemsForReview(lecturerId: string) {
    const lecturer = await lecturerService.getById(lecturerId);
    if (!lecturer) throw new Error("Lecturer not found");
    return listPresentedItems(prisma, lecturerId);
  },

  async createOwnItem(lecturerId: string, input: CreateLecturerPortfolioItemInput) {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO lecturer_portfolio."LecturerPortfolioItem" (
        "id", "lecturerId", "kind", "title", "organization", "description", "role",
        "identifier", "url", "startDate", "endDate", "tags", "isPublic", "isFeatured"
      ) VALUES (
        ${id}, ${lecturerId}, ${KIND_TO_DB[input.kind]}::lecturer_portfolio."LecturerPortfolioItemKind",
        ${input.title}, ${input.organization}, ${input.description}, ${input.role}, ${input.identifier},
        ${input.url}, ${toDbDate(input.startDate)}, ${toDbDate(input.endDate)}, ${input.tags},
        ${input.isPublic}, ${input.isFeatured}
      )
    `;
    const row = await findRow(prisma, lecturerId, id);
    if (!row) throw new Error("Portfolio item was not created");
    return presentItem(row, []);
  },

  async updateOwnItem(
    lecturerId: string,
    itemId: string,
    input: UpdateLecturerPortfolioItemInput,
  ) {
    const existing = await findRow(prisma, lecturerId, itemId);
    if (!existing) throw new Error("Portfolio item not found");

    const next = {
      kind: input.kind ?? (KIND_FROM_DB[existing.kind] ?? "other"),
      title: input.title ?? existing.title,
      organization: input.organization ?? existing.organization,
      description: input.description ?? existing.description,
      role: input.role ?? existing.role,
      identifier: input.identifier ?? existing.identifier,
      url: input.url ?? existing.url,
      startDate: input.startDate === undefined ? existing.startDate : toDbDate(input.startDate),
      endDate: input.endDate === undefined ? existing.endDate : toDbDate(input.endDate),
      tags: input.tags ?? existing.tags,
      isPublic: input.isPublic ?? existing.isPublic,
      isFeatured: input.isFeatured ?? existing.isFeatured,
    };

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE lecturer_portfolio."LecturerPortfolioItem"
        SET
          "kind" = ${KIND_TO_DB[next.kind]}::lecturer_portfolio."LecturerPortfolioItemKind",
          "title" = ${next.title},
          "organization" = ${next.organization},
          "description" = ${next.description},
          "role" = ${next.role},
          "identifier" = ${next.identifier},
          "url" = ${next.url},
          "startDate" = ${next.startDate},
          "endDate" = ${next.endDate},
          "tags" = ${next.tags},
          "isPublic" = ${next.isPublic},
          "isFeatured" = ${next.isFeatured},
          "verificationStatus" = 'SelfDeclared'::lecturer_portfolio."LecturerPortfolioVerificationStatus",
          "updatedAt" = NOW()
        WHERE "id" = ${itemId} AND "lecturerId" = ${lecturerId}
      `;
      if (existing.verificationStatus !== "SelfDeclared") {
        await insertVerificationEvent(
          tx,
          itemId,
          lecturerId,
          "reset",
          "Lecturer edited the evidence after review; verification reset to self-declared.",
        );
      }
    });

    const updated = await findRow(prisma, lecturerId, itemId);
    if (!updated) throw new Error("Portfolio item not found after update");
    const events = await listVerificationEvents(prisma, [itemId]);
    return presentItem(updated, events.get(itemId) ?? []);
  },

  async deleteOwnItem(lecturerId: string, itemId: string) {
    const existing = await findRow(prisma, lecturerId, itemId);
    if (!existing) throw new Error("Portfolio item not found");
    if (existing.verificationStatus !== "SelfDeclared") {
      throw new Error("Reviewed evidence cannot be deleted; edit it to reset verification and retain audit history.");
    }
    await prisma.$executeRaw`
      DELETE FROM lecturer_portfolio."LecturerPortfolioItem"
      WHERE "id" = ${itemId} AND "lecturerId" = ${lecturerId}
    `;
  },

  async reviewItem(
    lecturerId: string,
    itemId: string,
    actorId: string,
    action: "verified" | "rejected",
    note: string,
  ) {
    const existing = await findRow(prisma, lecturerId, itemId);
    if (!existing) throw new Error("Portfolio item not found");
    const status = action === "verified" ? "Verified" : "Rejected";
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE lecturer_portfolio."LecturerPortfolioItem"
        SET "verificationStatus" = ${status}::lecturer_portfolio."LecturerPortfolioVerificationStatus",
            "updatedAt" = NOW()
        WHERE "id" = ${itemId} AND "lecturerId" = ${lecturerId}
      `;
      await insertVerificationEvent(tx, itemId, actorId, action, note);
    });
    const updated = await findRow(prisma, lecturerId, itemId);
    if (!updated) throw new Error("Portfolio item not found after review");
    const events = await listVerificationEvents(prisma, [itemId]);
    return presentItem(updated, events.get(itemId) ?? []);
  },

  async exportAunQaEvidence(lecturerId: string): Promise<LecturerAunQaEvidenceExport> {
    const [profile, portfolioItems, offeringsService] = await Promise.all([
      lecturerService.getOwnProfile(lecturerId),
      listPresentedItems(prisma, lecturerId),
      Promise.resolve(registry.get<OfferingsServiceContract>("offerings").service),
    ]);
    if (!profile) throw new Error("Lecturer profile not found");
    const teaching = await offeringsService.listLecturerPortfolioEvidence(lecturerId);
    const evidence = [
      ...teaching.map((row) => ({
        id: `offering:${row.offeringId}`,
        category: "teaching",
        title: `${row.courseCode} ${row.courseName}`,
        detail: `${row.assignmentRole}; ${row.sectionName}; ${row.status}`,
        source: "Offering",
        sourceEntityId: row.offeringId,
        verification: "authoritative_pms" as const,
        periodContext: "during_dse" as const,
      })),
      ...portfolioItems
        .filter((item) => item.verificationStatus !== "rejected")
        .map((item) => ({
          id: `lecturer-portfolio:${item.id}`,
          category: item.kind,
          title: item.title,
          detail: [item.organization, item.role, item.description].filter(Boolean).join(" · "),
          source: "LecturerPortfolioItem",
          sourceEntityId: item.id,
          verification: item.verificationStatus === "verified"
            ? "verified_professional" as const
            : "self_declared" as const,
          periodContext: classifyLecturerEvidencePeriod(
            item.startDate,
            profile.professionalProfile?.programmeStartDate,
          ),
        })),
    ];
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
        programmeStartDate: profile.professionalProfile?.programmeStartDate ?? null,
      },
      evidence,
      note: "Read-only AUN-QA staff evidence projection. Canonical teaching is PMS-authoritative; professional evidence retains verification provenance and derived DSE service-period context. This export does not create QA evidence, ratings, or approvals and does not alter academic records.",
    };
  },
};
