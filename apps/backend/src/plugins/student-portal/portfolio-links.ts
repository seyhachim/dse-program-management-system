import { randomUUID } from "node:crypto";
import type {
  StudentPortfolioProfessionalLink,
  StudentPortfolioProfessionalLinkInput,
  StudentPortfolioProfessionalProvider,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { PortalAccessError, PortalNotFoundError } from "./service.ts";

const PROVIDER_TO_DB: Record<StudentPortfolioProfessionalProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  linkedin: "LinkedIn",
  kaggle: "Kaggle",
  hugging_face: "HuggingFace",
  website: "Website",
  orcid: "ORCID",
  google_scholar: "GoogleScholar",
  research_gate: "ResearchGate",
  coding_practice: "CodingPractice",
  bi_profile: "BIProfile",
  cv: "CV",
  other: "Other",
};

const PROVIDER_FROM_DB = Object.fromEntries(
  Object.entries(PROVIDER_TO_DB).map(([key, value]) => [value, key]),
) as Record<string, StudentPortfolioProfessionalProvider>;

type LinkRow = {
  id: string;
  provider: string;
  label: string;
  url: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
};

async function studentIdForUser(userId: string): Promise<string> {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true, status: true, email: true } });
  if (!student || student.status !== "Active" || !student.email) {
    throw new PortalAccessError("No active student portal profile is linked to this account");
  }
  return student.id;
}

function serialize(row: LinkRow): StudentPortfolioProfessionalLink {
  return {
    id: row.id,
    provider: PROVIDER_FROM_DB[row.provider],
    label: row.label,
    url: row.url,
    visibility: row.isPublic ? "public" : "private",
    status: "added",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const studentPortfolioLinksService = {
  async list(userId: string): Promise<StudentPortfolioProfessionalLink[]> {
    const studentId = await studentIdForUser(userId);
    const rows = await prisma.$queryRaw<LinkRow[]>`
      SELECT "id", "provider"::text AS "provider", "label", "url", "isPublic", "createdAt", "updatedAt"
      FROM "StudentPortfolioProfessionalLink"
      WHERE "studentId" = ${studentId}
      ORDER BY "createdAt" ASC
    `;
    return rows.map(serialize);
  },

  async create(userId: string, input: StudentPortfolioProfessionalLinkInput): Promise<StudentPortfolioProfessionalLink> {
    const studentId = await studentIdForUser(userId);
    const id = randomUUID();
    const provider = PROVIDER_TO_DB[input.provider];
    const rows = await prisma.$queryRaw<LinkRow[]>`
      INSERT INTO "StudentPortfolioProfessionalLink" (
        "id", "studentId", "provider", "label", "url", "isPublic", "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${studentId}, ${provider}::"StudentPortfolioProfessionalProvider", ${input.label}, ${input.url},
        ${input.visibility === "public"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("studentId", "provider", "url") DO UPDATE SET
        "label" = EXCLUDED."label", "isPublic" = EXCLUDED."isPublic", "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "id", "provider"::text AS "provider", "label", "url", "isPublic", "createdAt", "updatedAt"
    `;
    return serialize(rows[0]!);
  },

  async update(userId: string, linkId: string, input: StudentPortfolioProfessionalLinkInput): Promise<StudentPortfolioProfessionalLink> {
    const studentId = await studentIdForUser(userId);
    const provider = PROVIDER_TO_DB[input.provider];
    const rows = await prisma.$queryRaw<LinkRow[]>`
      UPDATE "StudentPortfolioProfessionalLink"
      SET "provider" = ${provider}::"StudentPortfolioProfessionalProvider",
          "label" = ${input.label}, "url" = ${input.url},
          "isPublic" = ${input.visibility === "public"}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${linkId} AND "studentId" = ${studentId}
      RETURNING "id", "provider"::text AS "provider", "label", "url", "isPublic", "createdAt", "updatedAt"
    `;
    if (!rows[0]) throw new PortalNotFoundError("Portfolio link was not found");
    return serialize(rows[0]);
  },

  async remove(userId: string, linkId: string): Promise<void> {
    const studentId = await studentIdForUser(userId);
    const count = await prisma.$executeRaw`
      DELETE FROM "StudentPortfolioProfessionalLink" WHERE "id" = ${linkId} AND "studentId" = ${studentId}
    `;
    if (count === 0) throw new PortalNotFoundError("Portfolio link was not found");
  },
};
