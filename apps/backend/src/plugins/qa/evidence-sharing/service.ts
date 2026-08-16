import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  QA_EVIDENCE_REDACTION_POLICY_VERSION,
  QA_EVIDENCE_SNAPSHOT_SCHEMA_VERSION,
  type CreatedQaEvidenceExternalReferenceView,
  type CreateQaEvidenceExternalReferenceInput,
  type QaEvidenceExternalReferenceView,
  type QaEvidenceReportingPeriod,
  type QaEvidenceSnapshotProvenance,
  type QaEvidenceSnapshotScope,
  type QaEvidenceSnapshotSourceKind,
  type QaEvidenceSnapshotView,
  type QaExternalEvidenceView,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

export class QaEvidenceSharingResourceNotFoundError extends Error {}
export class QaEvidenceSharingScopeMismatchError extends Error {}
export class QaEvidenceSharingUnsupportedError extends Error {}
export class QaEvidenceExternalReferenceGoneError extends Error {}

type JsonObject = Record<string, unknown>;

type SnapshotRow = {
  id: string;
  programmeId: string;
  cycleId: string;
  evidenceId: string;
  referenceCode: string;
  title: string;
  sourceKind: string;
  sourceDomain: string;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceVersion: string;
  snapshot: unknown;
  scope: unknown;
  reportingPeriod: unknown;
  provenance: unknown;
  contentHash: string;
  redactionPolicyVersion: string;
  capturedById: string;
  capturedByName: string;
  capturedAt: Date;
};

type ExternalReferenceRow = {
  id: string;
  snapshotId: string;
  referenceCode: string;
  active: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  lastViewedAt: Date | null;
};

type PublicReferenceRow = SnapshotRow & {
  programmeCode: string;
  programmeName: string;
  cycleTitle: string;
  referenceId: string;
  active: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

const BLOCKED_KEYS = new Set([
  "authid",
  "email",
  "individualgrade",
  "individualgrades",
  "mark",
  "marks",
  "name",
  "phone",
  "rawgrade",
  "rawgrades",
  "score",
  "studentemail",
  "studentid",
  "studentname",
  "studentuserid",
  "userid",
]);

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function sourceKind(kind: "SystemLink" | "ExternalLink" | "Document"): QaEvidenceSnapshotSourceKind {
  return kind === "SystemLink" ? "systemLink" : kind === "ExternalLink" ? "externalLink" : "document";
}

function sourceDomain(kind: QaEvidenceSnapshotSourceKind): string {
  if (kind === "document") return "document";
  if (kind === "externalLink") return "external";
  return "pms";
}

function sourceAuthority(
  kind: QaEvidenceSnapshotSourceKind,
  status: "Draft" | "Ready" | "Reviewed",
): QaEvidenceSnapshotProvenance["sourceAuthority"] {
  if (kind === "externalLink") return "externalDocument";
  if (kind === "document") return status === "Reviewed" ? "approvedDocument" : "controlledInternalRecord";
  return status === "Reviewed" ? "officialInstitutionalRecord" : "controlledInternalRecord";
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  const result: JsonObject = {};
  for (const key of Object.keys(value as JsonObject).sort()) {
    const item = (value as JsonObject)[key];
    if (item !== undefined) result[key] = canonicalize(item);
  }
  return result;
}

export function hashQaEvidenceSnapshotEnvelope(input: {
  snapshot: unknown;
  scope: QaEvidenceSnapshotScope;
  reportingPeriod: QaEvidenceReportingPeriod;
  provenance: QaEvidenceSnapshotProvenance;
}): string {
  const envelope = canonicalize({
    schemaVersion: QA_EVIDENCE_SNAPSHOT_SCHEMA_VERSION,
    snapshot: input.snapshot,
    scope: input.scope,
    reportingPeriod: input.reportingPeriod,
    provenance: input.provenance,
  });
  return createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
}

export function redactQaEvidenceForExternalView(value: unknown): {
  payload: unknown;
  removedFields: string[];
} {
  const removed = new Set<string>();

  function visit(current: unknown, path: string): unknown {
    if (typeof current === "string") return current.replace(emailPattern, "[redacted email]");
    if (current === null || typeof current !== "object") return current;
    if (Array.isArray(current)) return current.map((item, index) => visit(item, `${path}[${index}]`));

    const result: JsonObject = {};
    for (const [key, item] of Object.entries(current as JsonObject)) {
      const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (BLOCKED_KEYS.has(normalized)) {
        removed.add(path ? `${path}.${key}` : key);
        continue;
      }
      result[key] = visit(item, path ? `${path}.${key}` : key);
    }
    return result;
  }

  return { payload: visit(value, ""), removedFields: [...removed].sort() };
}

async function resolveContext(programmeId: string, cycleId: string, evidenceId: string) {
  const [programme, cycle, evidence] = await Promise.all([
    prisma.programme.findUnique({ where: { id: programmeId }, select: { id: true, code: true, name: true } }),
    prisma.qaAssessmentCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, programmeId: true, title: true, reportingStart: true, reportingEnd: true },
    }),
    prisma.qaEvidence.findUnique({
      where: { id: evidenceId },
      include: {
        mappings: {
          where: { cycleId },
          include: {
            requirement: { select: { code: true, title: true } },
            expectation: { select: { id: true, statement: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        analysisSources: {
          where: { analysis: { cycleId } },
          orderBy: { createdAt: "asc" },
          select: {
            sourceKind: true,
            sourceDomain: true,
            entityType: true,
            entityId: true,
            title: true,
            summary: true,
            excerpt: true,
            reportingDate: true,
            relevance: true,
          },
        },
      },
    }),
  ]);

  if (!programme || !cycle || !evidence) {
    throw new QaEvidenceSharingResourceNotFoundError("Programme, QA cycle, or evidence item not found");
  }
  if (cycle.programmeId !== programmeId || evidence.programmeId !== programmeId) {
    throw new QaEvidenceSharingScopeMismatchError("Evidence snapshot does not belong to this programme and cycle");
  }
  if (evidence.mappings.length === 0) {
    throw new QaEvidenceSharingScopeMismatchError("Evidence must be mapped into the requested QA cycle before it can be snapshotted");
  }
  return { programme, cycle, evidence };
}

async function findLinkedDocument(evidence: {
  programmeId: string;
  sourceRef: string;
  sourceUrl: string | null;
}) {
  if (!evidence.sourceRef && !evidence.sourceUrl) return null;
  return prisma.qaDocument.findFirst({
    where: {
      programmeId: evidence.programmeId,
      OR: [
        ...(evidence.sourceRef ? [{ id: evidence.sourceRef }, { sourceRef: evidence.sourceRef }] : []),
        ...(evidence.sourceUrl ? [{ sourceUrl: evidence.sourceUrl }] : []),
      ],
    },
    include: {
      chunks: {
        orderBy: { chunkIndex: "asc" },
        select: {
          chunkIndex: true,
          pageNumber: true,
          sectionLabel: true,
          startOffset: true,
          endOffset: true,
          text: true,
        },
      },
    },
  });
}

function referenceCode(input: {
  programmeCode: string;
  cycleEnd: Date;
  requirementCode: string;
  evidenceId: string;
  contentHash: string;
}): string {
  const yy = String(input.cycleEnd.getUTCFullYear()).slice(-2);
  const requirement = input.requirementCode.replace(/[^A-Za-z0-9]+/g, "-");
  const suffix = createHash("sha256")
    .update(`${input.evidenceId}:${input.contentHash}`)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
  return `${input.programmeCode.toUpperCase()}-AUN${yy}-R${requirement}-${suffix}`;
}

function snapshotToView(row: SnapshotRow): QaEvidenceSnapshotView {
  return {
    id: row.id,
    programmeId: row.programmeId,
    cycleId: row.cycleId,
    evidenceId: row.evidenceId,
    referenceCode: row.referenceCode,
    title: row.title,
    sourceKind: row.sourceKind as QaEvidenceSnapshotSourceKind,
    sourceDomain: row.sourceDomain,
    sourceEntityType: row.sourceEntityType,
    sourceEntityId: row.sourceEntityId,
    sourceVersion: row.sourceVersion,
    snapshot: row.snapshot,
    scope: row.scope as QaEvidenceSnapshotScope,
    reportingPeriod: row.reportingPeriod as QaEvidenceReportingPeriod,
    provenance: row.provenance as QaEvidenceSnapshotProvenance,
    contentHash: row.contentHash,
    redactionPolicyVersion: QA_EVIDENCE_REDACTION_POLICY_VERSION,
    capturedBy: { id: row.capturedById, name: row.capturedByName },
    capturedAt: row.capturedAt.toISOString(),
  };
}

async function readSnapshot(snapshotId: string): Promise<SnapshotRow | null> {
  const rows = await prisma.$queryRaw<SnapshotRow[]>`
    SELECT s.*, u.name AS "capturedByName"
    FROM "QaEvidenceSnapshot" s
    JOIN "User" u ON u.id = s."capturedById"
    WHERE s.id = ${snapshotId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createQaEvidenceSnapshot(
  programmeId: string,
  cycleId: string,
  evidenceId: string,
  capturedById: string,
): Promise<QaEvidenceSnapshotView> {
  const { programme, cycle, evidence } = await resolveContext(programmeId, cycleId, evidenceId);
  const kind = sourceKind(evidence.kind);
  const document = kind === "document" ? await findLinkedDocument(evidence) : null;

  const mappings = evidence.mappings.map((mapping) => ({
    requirementCode: mapping.requirement.code,
    requirementTitle: mapping.requirement.title,
    expectationId: mapping.expectationId,
    expectationStatement: mapping.expectation?.statement ?? null,
    relevanceNote: mapping.relevanceNote,
  }));

  const rawPayload = {
    schemaVersion: QA_EVIDENCE_SNAPSHOT_SCHEMA_VERSION,
    evidence: {
      id: evidence.id,
      title: evidence.title,
      description: evidence.description,
      kind,
      sourceRef: evidence.sourceRef,
      reportingPeriod: evidence.reportingPeriod,
      status: evidence.status,
    },
    mappings,
    analysisSources: evidence.analysisSources.map((source) => ({
      sourceKind: source.sourceKind,
      sourceDomain: source.sourceDomain,
      entityType: source.entityType,
      entityId: source.entityId,
      title: source.title,
      summary: source.summary,
      excerpt: source.excerpt,
      reportingDate: source.reportingDate?.toISOString() ?? null,
      relevance: source.relevance,
    })),
    document: document
      ? {
          title: document.title,
          documentType: document.documentType,
          sourceRef: document.sourceRef,
          version: document.version,
          reportingStart: document.reportingStart?.toISOString() ?? null,
          reportingEnd: document.reportingEnd?.toISOString() ?? null,
          contentHash: document.contentHash,
          chunks: document.chunks,
        }
      : null,
  };

  const redacted = redactQaEvidenceForExternalView(rawPayload);
  const requirementCodes = [...new Set(evidence.mappings.map((mapping) => mapping.requirement.code))].sort();
  const expectationIds = [
    ...new Set(
      evidence.mappings
        .map((mapping) => mapping.expectationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ].sort();

  const scope: QaEvidenceSnapshotScope = {
    programmeId,
    requirementCodes,
    expectationIds,
  };
  const reportingPeriod: QaEvidenceReportingPeriod = {
    label: evidence.reportingPeriod,
    start: document?.reportingStart?.toISOString() ?? null,
    end: document?.reportingEnd?.toISOString() ?? null,
  };
  const entityType = document ? "QaDocument" : "QaEvidence";
  const entityId = document?.id ?? evidence.id;
  const version = document?.version ?? evidence.updatedAt.toISOString();
  const provenance: QaEvidenceSnapshotProvenance = {
    sourceDomain: sourceDomain(kind),
    sourceAuthority: sourceAuthority(kind, evidence.status),
    sourceEntityType: entityType,
    sourceEntityId: entityId,
    sourceVersion: version,
    approvalStatus: evidence.status,
    approvedAt: null,
    verifiedAt: evidence.status === "Reviewed" ? evidence.updatedAt.toISOString() : null,
    sourceContentHash: document?.contentHash ?? null,
    redactionPolicyVersion: QA_EVIDENCE_REDACTION_POLICY_VERSION,
  };

  const snapshot = canonicalize({
    ...((redacted.payload as JsonObject) ?? {}),
    redaction: {
      policyVersion: QA_EVIDENCE_REDACTION_POLICY_VERSION,
      removedFields: redacted.removedFields,
    },
  });
  const contentHash = hashQaEvidenceSnapshotEnvelope({ snapshot, scope, reportingPeriod, provenance });

  const existing = await prisma.$queryRaw<SnapshotRow[]>`
    SELECT s.*, u.name AS "capturedByName"
    FROM "QaEvidenceSnapshot" s
    JOIN "User" u ON u.id = s."capturedById"
    WHERE s."cycleId" = ${cycleId}
      AND s."evidenceId" = ${evidenceId}
      AND s."contentHash" = ${contentHash}
    LIMIT 1
  `;
  if (existing[0]) return snapshotToView(existing[0]);

  const id = randomUUID();
  const code = referenceCode({
    programmeCode: programme.code,
    cycleEnd: cycle.reportingEnd,
    requirementCode: requirementCodes[0] ?? "QA",
    evidenceId,
    contentHash,
  });
  const snapshotJson = JSON.stringify(snapshot);
  const scopeJson = JSON.stringify(scope);
  const reportingJson = JSON.stringify(reportingPeriod);
  const provenanceJson = JSON.stringify(provenance);

  await prisma.$executeRaw`
    INSERT INTO "QaEvidenceSnapshot" (
      id, "programmeId", "cycleId", "evidenceId", "referenceCode", title,
      "sourceKind", "sourceDomain", "sourceEntityType", "sourceEntityId", "sourceVersion",
      snapshot, scope, "reportingPeriod", provenance, "contentHash", "redactionPolicyVersion",
      "capturedById"
    ) VALUES (
      ${id}, ${programmeId}, ${cycleId}, ${evidenceId}, ${code}, ${evidence.title},
      ${kind}, ${provenance.sourceDomain}, ${entityType}, ${entityId}, ${version},
      CAST(${snapshotJson} AS jsonb), CAST(${scopeJson} AS jsonb), CAST(${reportingJson} AS jsonb),
      CAST(${provenanceJson} AS jsonb), ${contentHash}, ${QA_EVIDENCE_REDACTION_POLICY_VERSION},
      ${capturedById}
    )
  `;

  const created = await readSnapshot(id);
  if (!created) throw new Error("Created QA evidence snapshot could not be reloaded");
  return snapshotToView(created);
}

export async function getQaEvidenceSnapshot(
  programmeId: string,
  snapshotId: string,
): Promise<QaEvidenceSnapshotView> {
  const row = await readSnapshot(snapshotId);
  if (!row) throw new QaEvidenceSharingResourceNotFoundError("QA evidence snapshot not found");
  if (row.programmeId !== programmeId) {
    throw new QaEvidenceSharingScopeMismatchError("QA evidence snapshot belongs to a different programme");
  }
  return snapshotToView(row);
}

export async function listQaEvidenceSnapshots(
  programmeId: string,
  evidenceId: string,
  cycleId?: string,
): Promise<QaEvidenceSnapshotView[]> {
  const evidence = await prisma.qaEvidence.findUnique({ where: { id: evidenceId }, select: { programmeId: true } });
  if (!evidence) throw new QaEvidenceSharingResourceNotFoundError("QA evidence item not found");
  if (evidence.programmeId !== programmeId) {
    throw new QaEvidenceSharingScopeMismatchError("QA evidence item belongs to a different programme");
  }
  const rows = cycleId
    ? await prisma.$queryRaw<SnapshotRow[]>`
        SELECT s.*, u.name AS "capturedByName"
        FROM "QaEvidenceSnapshot" s JOIN "User" u ON u.id = s."capturedById"
        WHERE s."programmeId" = ${programmeId} AND s."evidenceId" = ${evidenceId} AND s."cycleId" = ${cycleId}
        ORDER BY s."capturedAt" DESC
      `
    : await prisma.$queryRaw<SnapshotRow[]>`
        SELECT s.*, u.name AS "capturedByName"
        FROM "QaEvidenceSnapshot" s JOIN "User" u ON u.id = s."capturedById"
        WHERE s."programmeId" = ${programmeId} AND s."evidenceId" = ${evidenceId}
        ORDER BY s."capturedAt" DESC
      `;
  return rows.map(snapshotToView);
}

function externalReferenceToView(row: ExternalReferenceRow): QaEvidenceExternalReferenceView {
  return {
    id: row.id,
    snapshotId: row.snapshotId,
    referenceCode: row.referenceCode,
    active: row.active,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    lastViewedAt: row.lastViewedAt?.toISOString() ?? null,
  };
}

export async function createQaEvidenceExternalReference(
  snapshotId: string,
  input: CreateQaEvidenceExternalReferenceInput,
  createdById: string,
): Promise<CreatedQaEvidenceExternalReferenceView> {
  const snapshot = await getQaEvidenceSnapshot(input.programmeId, snapshotId);
  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
    throw new QaEvidenceSharingUnsupportedError("External evidence reference expiry must be in the future");
  }

  const accessToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(accessToken).digest("hex");
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "QaEvidenceExternalReference" (
      id, "snapshotId", "tokenHash", active, "expiresAt", "createdById"
    ) VALUES (
      ${id}, ${snapshotId}, ${tokenHash}, true, ${input.expiresAt ?? null}, ${createdById}
    )
  `;

  const rows = await prisma.$queryRaw<ExternalReferenceRow[]>`
    SELECT r.*, s."referenceCode"
    FROM "QaEvidenceExternalReference" r
    JOIN "QaEvidenceSnapshot" s ON s.id = r."snapshotId"
    WHERE r.id = ${id}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Created external evidence reference could not be reloaded");
  return {
    ...externalReferenceToView(row),
    accessToken,
    externalPath: `/evidence/ref/${accessToken}`,
  };
}

export async function listQaEvidenceExternalReferences(
  programmeId: string,
  snapshotId: string,
): Promise<QaEvidenceExternalReferenceView[]> {
  await getQaEvidenceSnapshot(programmeId, snapshotId);
  const rows = await prisma.$queryRaw<ExternalReferenceRow[]>`
    SELECT r.*, s."referenceCode"
    FROM "QaEvidenceExternalReference" r
    JOIN "QaEvidenceSnapshot" s ON s.id = r."snapshotId"
    WHERE r."snapshotId" = ${snapshotId}
    ORDER BY r."createdAt" DESC
  `;
  return rows.map(externalReferenceToView);
}

export async function revokeQaEvidenceExternalReference(
  programmeId: string,
  referenceId: string,
): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ id: string; programmeId: string }>>`
    SELECT r.id, s."programmeId"
    FROM "QaEvidenceExternalReference" r
    JOIN "QaEvidenceSnapshot" s ON s.id = r."snapshotId"
    WHERE r.id = ${referenceId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new QaEvidenceSharingResourceNotFoundError("External evidence reference not found");
  if (row.programmeId !== programmeId) {
    throw new QaEvidenceSharingScopeMismatchError("External evidence reference belongs to a different programme");
  }
  await prisma.$executeRaw`
    UPDATE "QaEvidenceExternalReference"
    SET active = false, "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP)
    WHERE id = ${referenceId}
  `;
}

export async function resolveExternalQaEvidence(accessToken: string): Promise<QaExternalEvidenceView> {
  if (!accessToken || accessToken.length < 32) {
    throw new QaEvidenceSharingResourceNotFoundError("External evidence reference not found");
  }
  const tokenHash = createHash("sha256").update(accessToken).digest("hex");
  const rows = await prisma.$queryRaw<PublicReferenceRow[]>`
    SELECT
      s.*, u.name AS "capturedByName",
      p.code AS "programmeCode", p.name AS "programmeName",
      c.title AS "cycleTitle",
      r.id AS "referenceId", r.active, r."expiresAt", r."revokedAt"
    FROM "QaEvidenceExternalReference" r
    JOIN "QaEvidenceSnapshot" s ON s.id = r."snapshotId"
    JOIN "Programme" p ON p.id = s."programmeId"
    JOIN "QaAssessmentCycle" c ON c.id = s."cycleId"
    JOIN "User" u ON u.id = s."capturedById"
    WHERE r."tokenHash" = ${tokenHash}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new QaEvidenceSharingResourceNotFoundError("External evidence reference not found");
  if (!row.active || row.revokedAt || (row.expiresAt && row.expiresAt.getTime() <= Date.now())) {
    throw new QaEvidenceExternalReferenceGoneError("External evidence reference is no longer available");
  }

  await prisma.$executeRaw`
    UPDATE "QaEvidenceExternalReference" SET "lastViewedAt" = CURRENT_TIMESTAMP WHERE id = ${row.referenceId}
  `;

  const scope = row.scope as QaEvidenceSnapshotScope;
  return {
    referenceCode: row.referenceCode,
    title: row.title,
    programme: { id: row.programmeId, code: row.programmeCode, name: row.programmeName },
    qaContext: {
      cycleId: row.cycleId,
      cycleTitle: row.cycleTitle,
      requirementCodes: scope.requirementCodes ?? [],
      expectationIds: scope.expectationIds ?? [],
    },
    sourceKind: row.sourceKind as QaEvidenceSnapshotSourceKind,
    scope,
    reportingPeriod: row.reportingPeriod as QaEvidenceReportingPeriod,
    provenance: row.provenance as QaEvidenceSnapshotProvenance,
    evidence: row.snapshot,
    contentHash: row.contentHash,
    capturedAt: row.capturedAt.toISOString(),
  };
}
