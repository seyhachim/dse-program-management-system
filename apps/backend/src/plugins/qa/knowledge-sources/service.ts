import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ArchiveKnowledgeSourceInput,
  CreateKnowledgeSourceInput,
  CreateKnowledgeSourceVersionInput,
  KnowledgeSourceAuditAction,
  KnowledgeSourceAuditEventView,
  KnowledgeSourceDetailView,
  KnowledgeSourceListQuery,
  KnowledgeSourceSummaryView,
  KnowledgeSourceVersionView,
  VerifyKnowledgeSourceVersionInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

type DbClient = PrismaClient | Prisma.TransactionClient;

type SourceRow = {
  id: string;
  programme_id: string;
  domain: KnowledgeSourceSummaryView["domain"];
  title: string;
  short_title: string | null;
  issuing_organisation: string;
  source_type: KnowledgeSourceSummaryView["sourceType"];
  trust_category: KnowledgeSourceSummaryView["trustCategory"];
  access_classification: KnowledgeSourceSummaryView["accessClassification"];
  jurisdiction_scope: string | null;
  active: boolean;
  created_by_id: string;
  created_at: Date;
};

type VersionRow = {
  id: string;
  source_id: string;
  version_label: string;
  publication_date: Date | null;
  effective_date: Date | null;
  review_date: Date | null;
  official_url: string | null;
  stored_file_ref: string | null;
  language: string;
  checksum: string | null;
  status: KnowledgeSourceVersionView["status"];
  supersedes_version_id: string | null;
  created_by_id: string;
  created_at: Date;
  verified_by_id: string | null;
  verified_at: Date | null;
  verification_note: string;
};

type AuditRow = {
  id: string;
  source_id: string;
  version_id: string | null;
  action: KnowledgeSourceAuditAction;
  actor_id: string;
  reason: string;
  context: Prisma.JsonValue;
  created_at: Date;
};

export class KnowledgeSourceNotFoundError extends Error {}
export class KnowledgeSourceConflictError extends Error {}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function versionView(row: VersionRow): KnowledgeSourceVersionView {
  return {
    id: row.id,
    sourceId: row.source_id,
    versionLabel: row.version_label,
    publicationDate: dateOnly(row.publication_date),
    effectiveDate: dateOnly(row.effective_date),
    reviewDate: dateOnly(row.review_date),
    officialUrl: row.official_url,
    storedFileRef: row.stored_file_ref,
    language: row.language,
    checksum: row.checksum,
    status: row.status,
    supersedesVersionId: row.supersedes_version_id,
    createdById: row.created_by_id,
    createdAt: row.created_at.toISOString(),
    verifiedById: row.verified_by_id,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    verificationNote: row.verification_note,
  };
}

function sourceView(row: SourceRow, versions: VersionRow[]): KnowledgeSourceSummaryView {
  const currentVersion = versions.find((version) => version.status === "CURRENT") ?? versions[0] ?? null;
  return {
    id: row.id,
    programmeId: row.programme_id,
    domain: row.domain,
    title: row.title,
    shortTitle: row.short_title,
    issuingOrganisation: row.issuing_organisation,
    sourceType: row.source_type,
    trustCategory: row.trust_category,
    accessClassification: row.access_classification,
    jurisdictionScope: row.jurisdiction_scope,
    active: row.active,
    createdById: row.created_by_id,
    createdAt: row.created_at.toISOString(),
    currentVersion: currentVersion ? versionView(currentVersion) : null,
    versionCount: versions.length,
  };
}

async function sourceForProgramme(client: DbClient, sourceId: string, programmeId: string): Promise<SourceRow> {
  const rows = await client.$queryRaw<SourceRow[]>(Prisma.sql`
    SELECT * FROM "knowledge_sources"
    WHERE "id" = ${sourceId} AND "programme_id" = ${programmeId}
    LIMIT 1
  `);
  const source = rows[0];
  if (!source) throw new KnowledgeSourceNotFoundError("Knowledge source not found in this programme");
  return source;
}

async function versionsForSource(client: DbClient, sourceId: string): Promise<VersionRow[]> {
  return client.$queryRaw<VersionRow[]>(Prisma.sql`
    SELECT * FROM "knowledge_source_versions"
    WHERE "source_id" = ${sourceId}
    ORDER BY
      CASE "status" WHEN 'CURRENT' THEN 0 WHEN 'CANDIDATE' THEN 1 WHEN 'SUPERSEDED' THEN 2 ELSE 3 END,
      "created_at" DESC
  `);
}

async function auditForSource(client: DbClient, sourceId: string): Promise<AuditRow[]> {
  return client.$queryRaw<AuditRow[]>(Prisma.sql`
    SELECT * FROM "knowledge_source_audit_events"
    WHERE "source_id" = ${sourceId}
    ORDER BY "created_at" DESC
  `);
}

async function recordAudit(
  client: DbClient,
  sourceId: string,
  versionId: string | null,
  action: KnowledgeSourceAuditAction,
  actorId: string,
  reason: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  const contextJson = JSON.stringify(context);
  await client.$executeRaw(Prisma.sql`
    INSERT INTO "knowledge_source_audit_events"
      ("id", "source_id", "version_id", "action", "actor_id", "reason", "context")
    VALUES
      (${randomUUID()}, ${sourceId}, ${versionId}, ${action}, ${actorId}, ${reason}, CAST(${contextJson} AS JSONB))
  `);
}

export async function listKnowledgeSources(query: KnowledgeSourceListQuery): Promise<KnowledgeSourceSummaryView[]> {
  const sources = await prisma.$queryRaw<SourceRow[]>(Prisma.sql`
    SELECT * FROM "knowledge_sources"
    WHERE "programme_id" = ${query.programmeId} AND "active" = TRUE
    ORDER BY "created_at" DESC
  `);

  const views = await Promise.all(
    sources.map(async (source) => sourceView(source, await versionsForSource(prisma, source.id))),
  );

  const needle = query.query?.toLowerCase();
  return views.filter((source) => {
    if (query.domain && source.domain !== query.domain) return false;
    if (query.trustCategory && source.trustCategory !== query.trustCategory) return false;
    if (query.accessClassification && source.accessClassification !== query.accessClassification) return false;
    if (query.status && source.currentVersion?.status !== query.status) return false;
    if (
      needle &&
      ![source.title, source.shortTitle ?? "", source.issuingOrganisation, source.currentVersion?.versionLabel ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    ) return false;
    return true;
  });
}

export async function getKnowledgeSource(programmeId: string, sourceId: string): Promise<KnowledgeSourceDetailView> {
  const source = await sourceForProgramme(prisma, sourceId, programmeId);
  const versions = await versionsForSource(prisma, sourceId);
  const audit = await auditForSource(prisma, sourceId);
  return {
    ...sourceView(source, versions),
    versions: versions.map(versionView),
    audit: audit.map((event) => ({
      id: event.id,
      sourceId: event.source_id,
      versionId: event.version_id,
      action: event.action,
      actorId: event.actor_id,
      reason: event.reason,
      context: event.context && typeof event.context === "object" && !Array.isArray(event.context)
        ? event.context as Record<string, unknown>
        : {},
      createdAt: event.created_at.toISOString(),
    } satisfies KnowledgeSourceAuditEventView)),
  };
}

export async function createKnowledgeSource(input: CreateKnowledgeSourceInput, actorId: string): Promise<KnowledgeSourceDetailView> {
  const sourceId = randomUUID();
  const versionId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "knowledge_sources"
        ("id", "programme_id", "domain", "title", "short_title", "issuing_organisation", "source_type",
         "trust_category", "access_classification", "jurisdiction_scope", "created_by_id")
      VALUES
        (${sourceId}, ${input.programmeId}, ${input.domain}, ${input.title}, ${input.shortTitle ?? null},
         ${input.issuingOrganisation}, ${input.sourceType}, 'UNVERIFIED', ${input.accessClassification},
         ${input.jurisdictionScope ?? null}, ${actorId})
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "knowledge_source_versions"
        ("id", "source_id", "version_label", "publication_date", "effective_date", "review_date", "official_url",
         "stored_file_ref", "language", "checksum", "status", "created_by_id")
      VALUES
        (${versionId}, ${sourceId}, ${input.initialVersion.versionLabel}, CAST(${input.initialVersion.publicationDate ?? null} AS DATE),
         CAST(${input.initialVersion.effectiveDate ?? null} AS DATE), CAST(${input.initialVersion.reviewDate ?? null} AS DATE),
         ${input.initialVersion.officialUrl ?? null}, ${input.initialVersion.storedFileRef ?? null},
         ${input.initialVersion.language}, ${input.initialVersion.checksum ?? null}, 'CANDIDATE', ${actorId})
    `);
    await recordAudit(tx, sourceId, null, "SOURCE_CREATED", actorId, "Trusted source registered");
    await recordAudit(tx, sourceId, versionId, "VERSION_CREATED", actorId, "Initial candidate version registered");
  });
  return getKnowledgeSource(input.programmeId, sourceId);
}

export async function createKnowledgeSourceVersion(
  sourceId: string,
  input: CreateKnowledgeSourceVersionInput,
  actorId: string,
): Promise<KnowledgeSourceDetailView> {
  const versionId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await sourceForProgramme(tx, sourceId, input.programmeId);
    const versions = await versionsForSource(tx, sourceId);
    if (versions.some((version) => version.status === "CANDIDATE")) {
      throw new KnowledgeSourceConflictError("Resolve the existing candidate version before creating another one");
    }
    const current = versions.find((version) => version.status === "CURRENT") ?? null;
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "knowledge_source_versions"
        ("id", "source_id", "version_label", "publication_date", "effective_date", "review_date", "official_url",
         "stored_file_ref", "language", "checksum", "status", "supersedes_version_id", "created_by_id")
      VALUES
        (${versionId}, ${sourceId}, ${input.versionLabel}, CAST(${input.publicationDate ?? null} AS DATE),
         CAST(${input.effectiveDate ?? null} AS DATE), CAST(${input.reviewDate ?? null} AS DATE), ${input.officialUrl ?? null},
         ${input.storedFileRef ?? null}, ${input.language}, ${input.checksum ?? null}, 'CANDIDATE', ${current?.id ?? null}, ${actorId})
    `);
    await recordAudit(tx, sourceId, versionId, "VERSION_CREATED", actorId, "Successor candidate version registered", {
      supersedesVersionId: current?.id ?? null,
    });
  });
  return getKnowledgeSource(input.programmeId, sourceId);
}

export async function verifyKnowledgeSourceVersion(
  sourceId: string,
  versionId: string,
  input: VerifyKnowledgeSourceVersionInput,
  actorId: string,
): Promise<KnowledgeSourceDetailView> {
  await prisma.$transaction(async (tx) => {
    await sourceForProgramme(tx, sourceId, input.programmeId);
    const versions = await versionsForSource(tx, sourceId);
    const candidate = versions.find((version) => version.id === versionId);
    if (!candidate) throw new KnowledgeSourceNotFoundError("Knowledge source version not found");
    if (candidate.status !== "CANDIDATE") {
      throw new KnowledgeSourceConflictError("Only a candidate source version can be verified");
    }

    const current = versions.find((version) => version.status === "CURRENT");
    if (current && current.id !== candidate.id) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "knowledge_source_versions" SET "status" = 'SUPERSEDED' WHERE "id" = ${current.id}
      `);
      await recordAudit(tx, sourceId, current.id, "VERSION_SUPERSEDED", actorId, `Superseded by ${candidate.version_label}`, {
        successorVersionId: candidate.id,
      });
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "knowledge_source_versions"
      SET "status" = 'CURRENT', "verified_by_id" = ${actorId}, "verified_at" = CURRENT_TIMESTAMP,
          "verification_note" = ${input.verificationNote}
      WHERE "id" = ${versionId} AND "source_id" = ${sourceId}
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "knowledge_sources" SET "trust_category" = ${input.trustCategory}
      WHERE "id" = ${sourceId} AND "programme_id" = ${input.programmeId}
    `);
    await recordAudit(tx, sourceId, versionId, "VERSION_VERIFIED", actorId, input.verificationNote, {
      trustCategory: input.trustCategory,
    });
  });
  return getKnowledgeSource(input.programmeId, sourceId);
}

export async function archiveKnowledgeSource(
  sourceId: string,
  input: ArchiveKnowledgeSourceInput,
  actorId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await sourceForProgramme(tx, sourceId, input.programmeId);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "knowledge_sources" SET "active" = FALSE
      WHERE "id" = ${sourceId} AND "programme_id" = ${input.programmeId}
    `);
    await recordAudit(tx, sourceId, null, "SOURCE_ARCHIVED", actorId, input.reason);
  });
}
