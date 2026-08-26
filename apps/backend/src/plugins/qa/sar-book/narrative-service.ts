import { randomUUID } from "node:crypto";
import {
  EMPTY_DSE_DOCUMENT,
  QaSarBookNarrativeSectionViewSchema,
  QaSarBookSectionAssignmentViewSchema,
  QaSarBookSectionRevisionViewSchema,
  documentContentToPlainText,
  findQaSarBookStaticSection,
  parseStoredDocumentContent,
  serializeDocumentContent,
  type QaSarBookNarrativeSectionView,
  type QaSarBookSectionAssignmentView,
  type QaSarBookSectionRevisionView,
  type SaveQaSarBookSectionInput,
  type UpsertQaSarBookSectionAssignmentInput,
} from "@dse-pms/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../core/db/prisma.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";

export class QaSarBookRevisionConflictError extends Error {}
export class QaSarBookSectionAssigneeError extends Error {}

type NarrativeRow = {
  cycleId: string;
  sectionKey: string;
  content: string;
  plainText: string;
  updatedAt: Date;
  updatedByName: string | null;
};

type RevisionRow = {
  id: string;
  programmeId: string;
  cycleId: string;
  sectionKey: string;
  revisionNumber: number;
  content: string;
  plainText: string;
  createdById: string | null;
  createdByName: string | null;
  createdAt: Date;
};

type AssignmentRow = {
  id: string;
  programmeId: string;
  cycleId: string;
  sectionKey: string;
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  assignedById: string;
  assignedByName: string;
  assignedAt: Date;
  endedAt: Date | null;
};

function resolveStaticSection(sectionKey: string) {
  const section = findQaSarBookStaticSection(sectionKey);
  if (!section || section.source === "generated") {
    throw new QaSarResourceNotFoundError("Editable SAR book section not found");
  }
  return section;
}

async function assertScope(programmeId: string, cycleId: string): Promise<void> {
  const cycle = await prisma.qaAssessmentCycle.findUnique({
    where: { id: cycleId },
    select: { programmeId: true },
  });
  if (!cycle) throw new QaSarResourceNotFoundError("QA assessment cycle not found");
  if (cycle.programmeId !== programmeId) {
    throw new QaSarScopeMismatchError("SAR book section belongs to a different programme");
  }
}

async function ensureQaContributor(userId: string, programmeId: string): Promise<void> {
  const assignment = await prisma.userRoleAssignment.findFirst({
    where: {
      userId,
      programmeId,
      role: { slug: "qa_contributor" },
    },
    select: { userId: true },
  });
  if (!assignment) {
    throw new QaSarBookSectionAssigneeError(
      "The selected user must hold the QA Contributor role in this programme",
    );
  }
}

async function findNarrativeRow(
  programmeId: string,
  cycleId: string,
  sectionKey: string,
): Promise<NarrativeRow | null> {
  const rows = await prisma.$queryRaw<NarrativeRow[]>(Prisma.sql`
    SELECT s."cycleId", s."sectionKey", s."content", s."plainText", s."updatedAt",
           u."name" AS "updatedByName"
    FROM "QaSarBookNarrativeSection" s
    LEFT JOIN "User" u ON u."id" = s."updatedById"
    WHERE s."programmeId" = ${programmeId}
      AND s."cycleId" = ${cycleId}
      AND s."sectionKey" = ${sectionKey}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function findLatestRevision(
  programmeId: string,
  cycleId: string,
  sectionKey: string,
): Promise<RevisionRow | null> {
  const rows = await prisma.$queryRaw<RevisionRow[]>(Prisma.sql`
    SELECT r."id", r."programmeId", r."cycleId", r."sectionKey", r."revisionNumber",
           r."content", r."plainText", r."createdById", u."name" AS "createdByName",
           r."createdAt"
    FROM "QaSarBookSectionRevision" r
    LEFT JOIN "User" u ON u."id" = r."createdById"
    WHERE r."programmeId" = ${programmeId}
      AND r."cycleId" = ${cycleId}
      AND r."sectionKey" = ${sectionKey}
    ORDER BY r."revisionNumber" DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function listRevisionRows(
  programmeId: string,
  cycleId: string,
  sectionKey: string,
  limit?: number,
): Promise<RevisionRow[]> {
  if (limit) {
    return prisma.$queryRaw<RevisionRow[]>(Prisma.sql`
      SELECT r."id", r."programmeId", r."cycleId", r."sectionKey", r."revisionNumber",
             r."content", r."plainText", r."createdById", u."name" AS "createdByName",
             r."createdAt"
      FROM "QaSarBookSectionRevision" r
      LEFT JOIN "User" u ON u."id" = r."createdById"
      WHERE r."programmeId" = ${programmeId}
        AND r."cycleId" = ${cycleId}
        AND r."sectionKey" = ${sectionKey}
      ORDER BY r."revisionNumber" DESC
      LIMIT ${limit}
    `);
  }
  return prisma.$queryRaw<RevisionRow[]>(Prisma.sql`
    SELECT r."id", r."programmeId", r."cycleId", r."sectionKey", r."revisionNumber",
           r."content", r."plainText", r."createdById", u."name" AS "createdByName",
           r."createdAt"
    FROM "QaSarBookSectionRevision" r
    LEFT JOIN "User" u ON u."id" = r."createdById"
    WHERE r."programmeId" = ${programmeId}
      AND r."cycleId" = ${cycleId}
      AND r."sectionKey" = ${sectionKey}
    ORDER BY r."revisionNumber" DESC
  `);
}

async function findActiveAssignment(
  programmeId: string,
  cycleId: string,
  sectionKey: string,
): Promise<AssignmentRow | null> {
  const rows = await prisma.$queryRaw<AssignmentRow[]>(Prisma.sql`
    SELECT a."id", a."programmeId", a."cycleId", a."sectionKey",
           assignee."id" AS "assigneeId", assignee."name" AS "assigneeName",
           assignee."email" AS "assigneeEmail", assigner."id" AS "assignedById",
           assigner."name" AS "assignedByName", a."assignedAt", a."endedAt"
    FROM "QaSarBookSectionAssignment" a
    JOIN "User" assignee ON assignee."id" = a."assigneeId"
    JOIN "User" assigner ON assigner."id" = a."assignedById"
    WHERE a."programmeId" = ${programmeId}
      AND a."cycleId" = ${cycleId}
      AND a."sectionKey" = ${sectionKey}
      AND a."endedAt" IS NULL
    LIMIT 1
  `);
  return rows[0] ?? null;
}

function assignmentToView(row: AssignmentRow, sectionTitle: string): QaSarBookSectionAssignmentView {
  return QaSarBookSectionAssignmentViewSchema.parse({
    id: row.id,
    programmeId: row.programmeId,
    cycleId: row.cycleId,
    sectionKey: row.sectionKey,
    sectionTitle,
    assignee: {
      id: row.assigneeId,
      name: row.assigneeName,
      email: row.assigneeEmail,
    },
    assignedBy: {
      id: row.assignedById,
      name: row.assignedByName,
    },
    assignedAt: row.assignedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  });
}

function revisionToView(row: RevisionRow, sectionTitle: string): QaSarBookSectionRevisionView {
  return QaSarBookSectionRevisionViewSchema.parse({
    id: row.id,
    programmeId: row.programmeId,
    cycleId: row.cycleId,
    sectionKey: row.sectionKey,
    sectionTitle,
    revisionNumber: row.revisionNumber,
    content: row.content,
    plainText: row.plainText,
    createdBy: row.createdById && row.createdByName
      ? { id: row.createdById, name: row.createdByName }
      : null,
    createdAt: row.createdAt.toISOString(),
  });
}

export async function getActiveQaSarBookSectionAssignment(
  programmeId: string,
  cycleId: string,
  sectionKey: string,
): Promise<QaSarBookSectionAssignmentView | null> {
  const section = resolveStaticSection(sectionKey);
  await assertScope(programmeId, cycleId);
  const row = await findActiveAssignment(programmeId, cycleId, sectionKey);
  return row ? assignmentToView(row, section.title) : null;
}

export async function getQaSarBookNarrativeSection(
  programmeId: string,
  cycleId: string,
  sectionKey: string,
): Promise<QaSarBookNarrativeSectionView> {
  const section = resolveStaticSection(sectionKey);
  await assertScope(programmeId, cycleId);
  const [narrative, latestRevision, assignment, recentRows] = await Promise.all([
    findNarrativeRow(programmeId, cycleId, sectionKey),
    findLatestRevision(programmeId, cycleId, sectionKey),
    findActiveAssignment(programmeId, cycleId, sectionKey),
    listRevisionRows(programmeId, cycleId, sectionKey, 5),
  ]);

  const content = latestRevision?.content ?? narrative?.content ?? serializeDocumentContent(EMPTY_DSE_DOCUMENT);
  const plainText = latestRevision?.plainText ?? narrative?.plainText ?? "";

  return QaSarBookNarrativeSectionViewSchema.parse({
    cycleId,
    sectionKey,
    title: section.title,
    source: section.source as "bookNarrative" | "structured",
    content,
    plainText,
    editable: false,
    updatedByName: latestRevision?.createdByName ?? narrative?.updatedByName ?? null,
    updatedAt: latestRevision?.createdAt.toISOString() ?? narrative?.updatedAt.toISOString() ?? null,
    revisionId: latestRevision?.id ?? null,
    revisionNumber: latestRevision?.revisionNumber ?? null,
    assignment: assignment ? assignmentToView(assignment, section.title) : null,
    recentRevisions: recentRows.map((row) => ({
      id: row.id,
      revisionNumber: row.revisionNumber,
      createdBy: row.createdById && row.createdByName
        ? { id: row.createdById, name: row.createdByName }
        : null,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}

export async function saveQaSarBookNarrativeSection(
  cycleId: string,
  sectionKey: string,
  input: SaveQaSarBookSectionInput,
  userId: string,
): Promise<QaSarBookNarrativeSectionView> {
  resolveStaticSection(sectionKey);
  await assertScope(input.programmeId, cycleId);
  const document = parseStoredDocumentContent(input.content);
  const plainText = documentContentToPlainText(document);
  const revisionId = randomUUID();

  await prisma.$transaction(async (tx) => {
    const lockKey = `qa-sar-book:${cycleId}:${sectionKey}`;
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);

    const latestRows = await tx.$queryRaw<RevisionRow[]>(Prisma.sql`
      SELECT r."id", r."programmeId", r."cycleId", r."sectionKey", r."revisionNumber",
             r."content", r."plainText", r."createdById", u."name" AS "createdByName",
             r."createdAt"
      FROM "QaSarBookSectionRevision" r
      LEFT JOIN "User" u ON u."id" = r."createdById"
      WHERE r."programmeId" = ${input.programmeId}
        AND r."cycleId" = ${cycleId}
        AND r."sectionKey" = ${sectionKey}
      ORDER BY r."revisionNumber" DESC
      LIMIT 1
    `);
    const latest = latestRows[0] ?? null;
    const currentRevisionId = latest?.id ?? null;
    if (input.baseRevisionId !== undefined && input.baseRevisionId !== currentRevisionId) {
      throw new QaSarBookRevisionConflictError(
        "This SAR section changed after you opened it. Reload the latest revision before saving.",
      );
    }

    const nextRevisionNumber = (latest?.revisionNumber ?? 0) + 1;
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "QaSarBookSectionRevision" (
        "id", "programmeId", "cycleId", "sectionKey", "revisionNumber",
        "content", "plainText", "createdById", "createdAt"
      ) VALUES (
        ${revisionId}, ${input.programmeId}, ${cycleId}, ${sectionKey}, ${nextRevisionNumber},
        ${input.content}, ${plainText}, ${userId}, CURRENT_TIMESTAMP
      )
    `);

    const currentId = randomUUID();
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "QaSarBookNarrativeSection"
        ("id", "programmeId", "cycleId", "sectionKey", "content", "plainText", "updatedById", "createdAt", "updatedAt")
      VALUES
        (${currentId}, ${input.programmeId}, ${cycleId}, ${sectionKey}, ${input.content}, ${plainText}, ${userId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("cycleId", "sectionKey") DO UPDATE SET
        "content" = EXCLUDED."content",
        "plainText" = EXCLUDED."plainText",
        "updatedById" = EXCLUDED."updatedById",
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "QaSarBookNarrativeSection"."programmeId" = EXCLUDED."programmeId"
    `);
  });

  return getQaSarBookNarrativeSection(input.programmeId, cycleId, sectionKey);
}

export async function listQaSarBookSectionRevisions(
  programmeId: string,
  cycleId: string,
  sectionKey: string,
): Promise<QaSarBookSectionRevisionView[]> {
  const section = resolveStaticSection(sectionKey);
  await assertScope(programmeId, cycleId);
  return (await listRevisionRows(programmeId, cycleId, sectionKey)).map((row) =>
    revisionToView(row, section.title),
  );
}

export async function listQaSarBookSectionAssignments(
  programmeId: string,
  cycleId: string,
): Promise<QaSarBookSectionAssignmentView[]> {
  await assertScope(programmeId, cycleId);
  const rows = await prisma.$queryRaw<AssignmentRow[]>(Prisma.sql`
    SELECT a."id", a."programmeId", a."cycleId", a."sectionKey",
           assignee."id" AS "assigneeId", assignee."name" AS "assigneeName",
           assignee."email" AS "assigneeEmail", assigner."id" AS "assignedById",
           assigner."name" AS "assignedByName", a."assignedAt", a."endedAt"
    FROM "QaSarBookSectionAssignment" a
    JOIN "User" assignee ON assignee."id" = a."assigneeId"
    JOIN "User" assigner ON assigner."id" = a."assignedById"
    WHERE a."programmeId" = ${programmeId}
      AND a."cycleId" = ${cycleId}
      AND a."endedAt" IS NULL
    ORDER BY a."sectionKey"
  `);
  return rows.flatMap((row) => {
    const section = findQaSarBookStaticSection(row.sectionKey);
    if (!section || section.source === "generated") return [];
    return [assignmentToView(row, section.title)];
  });
}

export async function upsertQaSarBookSectionAssignment(
  cycleId: string,
  sectionKey: string,
  input: UpsertQaSarBookSectionAssignmentInput,
  assignedById: string,
): Promise<QaSarBookSectionAssignmentView> {
  const section = resolveStaticSection(sectionKey);
  await assertScope(input.programmeId, cycleId);
  await ensureQaContributor(input.assigneeId, input.programmeId);

  await prisma.$transaction(async (tx) => {
    const lockKey = `qa-sar-book-assignment:${cycleId}:${sectionKey}`;
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);

    const currentRows = await tx.$queryRaw<Array<{ id: string; assigneeId: string }>>(Prisma.sql`
      SELECT "id", "assigneeId"
      FROM "QaSarBookSectionAssignment"
      WHERE "programmeId" = ${input.programmeId}
        AND "cycleId" = ${cycleId}
        AND "sectionKey" = ${sectionKey}
        AND "endedAt" IS NULL
      LIMIT 1
    `);
    const current = currentRows[0];
    if (current?.assigneeId === input.assigneeId) return;

    if (current) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "QaSarBookSectionAssignment"
        SET "endedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${current.id}
          AND "endedAt" IS NULL
      `);
    }

    const id = randomUUID();
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "QaSarBookSectionAssignment" (
        "id", "programmeId", "cycleId", "sectionKey", "assigneeId", "assignedById", "assignedAt"
      ) VALUES (
        ${id}, ${input.programmeId}, ${cycleId}, ${sectionKey}, ${input.assigneeId}, ${assignedById}, CURRENT_TIMESTAMP
      )
    `);
  });

  const saved = await findActiveAssignment(input.programmeId, cycleId, sectionKey);
  if (!saved) throw new QaSarResourceNotFoundError("SAR book section assignment was not saved");
  return assignmentToView(saved, section.title);
}

export async function deleteQaSarBookSectionAssignment(
  programmeId: string,
  cycleId: string,
  sectionKey: string,
): Promise<void> {
  resolveStaticSection(sectionKey);
  await assertScope(programmeId, cycleId);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "QaSarBookSectionAssignment"
    SET "endedAt" = CURRENT_TIMESTAMP
    WHERE "programmeId" = ${programmeId}
      AND "cycleId" = ${cycleId}
      AND "sectionKey" = ${sectionKey}
      AND "endedAt" IS NULL
  `);
}
