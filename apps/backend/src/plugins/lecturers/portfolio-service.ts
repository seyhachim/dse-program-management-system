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

const DB_TO_KIND = Object.fromEntries(
  Object.entries(KIND_TO_DB).map(([key, value]) => [value, key]),
) as Record<(typeof KIND_TO_DB)[LecturerPortfolioItemKind], LecturerPortfolioItemKind>;

const STATUS_FROM_DB = {
  SelfDeclared: "self_declared",
  Verified: "verified",
  Rejected: "rejected",
} as const;

const ACTION_FROM_DB = {
  Verified: "verified",
  Rejected: "rejected",
  Reset: "reset",
} as const;

const itemInclude = {
  verificationEvents: {
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

type ItemRow = Awaited<ReturnType<typeof findItem>>;

function findItem(id: string) {
  return prisma.lecturerPortfolioItem.findUnique({ where: { id }, include: itemInclude });
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function presentItem(row: NonNullable<ItemRow>): LecturerPortfolioItem {
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
    verificationStatus: STATUS_FROM_DB[row.verificationStatus] as LecturerPortfolioVerificationStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    verificationEvents: row.verificationEvents.map((event) => ({
      id: event.id,
      action: ACTION_FROM_DB[event.action] as LecturerPortfolioVerificationAction,
      note: event.note,
      actor: event.actor,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

function itemData(input: CreateLecturerPortfolioItemInput | UpdateLecturerPortfolioItemInput) {
  return {
    ...(input.kind !== undefined ? { kind: KIND_TO_DB[input.kind] } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.organization !== undefined ? { organization: input.organization } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.identifier !== undefined ? { identifier: input.identifier } : {}),
    ...(input.url !== undefined ? { url: input.url } : {}),
    ...(input.startDate !== undefined ? { startDate: toDate(input.startDate) } : {}),
    ...(input.endDate !== undefined ? { endDate: toDate(input.endDate) } : {}),
    ...(input.tags !== undefined ? { tags: [...new Set(input.tags)] } : {}),
    ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
    ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
  };
}

function ensureDateOrder(startDate: Date | null, endDate: Date | null): void {
  if (startDate && endDate && endDate < startDate) {
    throw new PortfolioValidationError("End date must be on or after start date");
  }
}

async function listItems(lecturerId: string): Promise<LecturerPortfolioItem[]> {
  const rows = await prisma.lecturerPortfolioItem.findMany({
    where: { lecturerId },
    include: itemInclude,
    orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map(presentItem);
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
    ensureDateOrder(toDate(input.startDate) ?? null, toDate(input.endDate) ?? null);
    const row = await prisma.lecturerPortfolioItem.create({
      data: { lecturerId, ...itemData(input) },
      include: itemInclude,
    });
    return presentItem(row);
  },

  async updateOwnItem(
    lecturerId: string,
    itemId: string,
    input: UpdateLecturerPortfolioItemInput,
  ): Promise<LecturerPortfolioItem> {
    const existing = await prisma.lecturerPortfolioItem.findFirst({
      where: { id: itemId, lecturerId },
    });
    if (!existing) throw new PortfolioNotFoundError("Portfolio item not found");

    const parsedStart = toDate(input.startDate);
    const parsedEnd = toDate(input.endDate);
    const nextStart = parsedStart === undefined ? existing.startDate : parsedStart;
    const nextEnd = parsedEnd === undefined ? existing.endDate : parsedEnd;
    ensureDateOrder(nextStart, nextEnd);

    const shouldReset = existing.verificationStatus !== "SelfDeclared";
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.lecturerPortfolioItem.update({
        where: { id: itemId },
        data: {
          ...itemData(input),
          ...(shouldReset ? { verificationStatus: "SelfDeclared" } : {}),
        },
        include: itemInclude,
      });
      if (!shouldReset) return updated;

      await tx.lecturerPortfolioVerification.create({
        data: {
          itemId,
          action: "Reset",
          actorId: lecturerId,
          note: "Verification reset automatically because the lecturer edited this record.",
        },
      });
      return tx.lecturerPortfolioItem.findUniqueOrThrow({
        where: { id: itemId },
        include: itemInclude,
      });
    });
    return presentItem(row);
  },

  async deleteOwnItem(lecturerId: string, itemId: string): Promise<void> {
    const existing = await prisma.lecturerPortfolioItem.findFirst({
      where: { id: itemId, lecturerId },
      select: { id: true, verificationStatus: true },
    });
    if (!existing) throw new PortfolioNotFoundError("Portfolio item not found");
    if (existing.verificationStatus === "Verified") {
      throw new PortfolioConflictError(
        "Verified evidence cannot be deleted by the lecturer; edit it to reset verification first.",
      );
    }
    await prisma.lecturerPortfolioItem.delete({ where: { id: itemId } });
  },

  async reviewItem(
    actorId: string,
    lecturerId: string,
    itemId: string,
    input: ReviewLecturerPortfolioItemInput,
  ): Promise<LecturerPortfolioItem> {
    const existing = await prisma.lecturerPortfolioItem.findFirst({
      where: { id: itemId, lecturerId },
      select: { id: true },
    });
    if (!existing) throw new PortfolioNotFoundError("Portfolio item not found");

    const status = input.action === "verified" ? "Verified" : "Rejected";
    const action = input.action === "verified" ? "Verified" : "Rejected";
    await prisma.$transaction([
      prisma.lecturerPortfolioItem.update({
        where: { id: itemId },
        data: { verificationStatus: status },
      }),
      prisma.lecturerPortfolioVerification.create({
        data: { itemId, action, actorId, note: input.note },
      }),
    ]);
    const row = await findItem(itemId);
    if (!row) throw new PortfolioNotFoundError("Portfolio item not found");
    return presentItem(row);
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
