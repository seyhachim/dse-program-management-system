import { Prisma } from "@prisma/client";
import type {
  CreateStudentHandbookInput,
  SaveStudentHandbookSectionInput,
  StudentHandbookBlockView,
  StudentHandbookSectionView,
  StudentHandbookSourceKind,
  StudentHandbookSourcePreview,
  StudentHandbookStatus,
  StudentHandbookView,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";

const STARTER_SECTIONS = [
  ["welcome", "Welcome to DSE"],
  ["degree", "Your Degree"],
  ["study-plan", "Study Plan"],
  ["attendance-leave", "Attendance & Leave"],
  ["assessment-grades", "Assessment & Grades"],
  ["academic-integrity-ai", "Academic Integrity & AI Use"],
  ["internship", "Internship"],
  ["student-support", "Student Support"],
  ["facilities-digital-services", "Facilities & Digital Services"],
  ["important-contacts", "Important Contacts"],
] as const;

const SOURCE_LABELS: Record<StudentHandbookSourceKind, string> = {
  CURRICULUM_SUMMARY: "From Curriculum",
  PROGRAMME_PROFILE: "From Programme",
  PROGRAMME_CONTACT: "From Programme Contacts",
};

type ProgrammeReadContract = {
  publicCurriculumRead: {
    getTotals(programmeId: string): Promise<unknown>;
  };
  publicRead: {
    getProgramme(programmeId: string): Promise<unknown>;
    getContact(programmeId: string): Promise<unknown>;
  };
};

type HandbookHeaderRow = {
  id: string;
  programmeId: string;
  title: string;
  version: string;
  status: StudentHandbookStatus;
  assignedLecturerId: string;
  assignedLecturerName: string;
  assignedLecturerEmail: string;
  submittedAt: Date | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type SectionRow = {
  id: string;
  key: string;
  title: string;
  sortOrder: number;
};

type BlockRow = {
  id: string;
  sectionId: string;
  type: "NARRATIVE" | "SOURCE_DATA";
  sortOrder: number;
  content: string | null;
  sourceKind: StudentHandbookSourceKind | null;
  label: string | null;
  sourceSnapshot: unknown | null;
};

type LecturerRow = { id: string };

export class StudentHandbookNotFoundError extends Error {}
export class StudentHandbookConflictError extends Error {}
export class StudentHandbookValidationError extends Error {}

function programmeService(): ProgrammeReadContract {
  return registry.get<ProgrammeReadContract>("programme").service;
}

async function resolveSource(
  programmeId: string,
  kind: StudentHandbookSourceKind,
): Promise<StudentHandbookSourcePreview> {
  const service = programmeService();
  const data =
    kind === "CURRICULUM_SUMMARY"
      ? await service.publicCurriculumRead.getTotals(programmeId)
      : kind === "PROGRAMME_PROFILE"
        ? await service.publicRead.getProgramme(programmeId)
        : await service.publicRead.getContact(programmeId);

  return {
    kind,
    label: SOURCE_LABELS[kind],
    readOnly: true,
    data,
    snapshot: false,
  };
}

async function safeResolveSource(
  programmeId: string,
  kind: StudentHandbookSourceKind,
): Promise<StudentHandbookSourcePreview> {
  try {
    return await resolveSource(programmeId, kind);
  } catch (error) {
    return {
      kind,
      label: SOURCE_LABELS[kind],
      readOnly: true,
      data: {
        unavailable: true,
        message: error instanceof Error ? error.message : "Source data is unavailable",
      },
      snapshot: false,
    };
  }
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function audit(
  client: Pick<typeof prisma, "$executeRaw">,
  handbookId: string,
  actorId: string,
  action: string,
  note = "",
  details?: Record<string, unknown>,
) {
  const detailsJson = details ? JSON.stringify(details) : null;
  await client.$executeRaw(Prisma.sql`
    INSERT INTO student_handbook."StudentHandbookAuditEvent"
      ("handbookId", "actorId", "action", "note", "details")
    VALUES (
      ${handbookId},
      ${actorId},
      ${action},
      ${note},
      CASE WHEN ${detailsJson}::text IS NULL THEN NULL ELSE ${detailsJson}::jsonb END
    )
  `);
}

export async function assertLecturerInProgramme(
  programmeId: string,
  lecturerId: string,
): Promise<void> {
  const rows = await prisma.$queryRaw<LecturerRow[]>(Prisma.sql`
    SELECT u."id"
    FROM public."User" u
    JOIN public."UserRoleAssignment" ura ON ura."userId" = u."id"
    JOIN public."Role" r ON r."id" = ura."roleId"
    WHERE u."id" = ${lecturerId}
      AND r."slug" = 'lecturer'
      AND r."active" = TRUE
      AND (ura."programmeId" = ${programmeId} OR ura."programmeId" IS NULL)
    LIMIT 1
  `);
  if (!rows.length) {
    throw new StudentHandbookValidationError(
      "Assigned owner must be a lecturer in the selected programme",
    );
  }
}

export async function getHandbookHeader(handbookId: string): Promise<HandbookHeaderRow | null> {
  const rows = await prisma.$queryRaw<HandbookHeaderRow[]>(Prisma.sql`
    SELECT
      h."id",
      h."programmeId",
      h."title",
      h."version",
      h."status",
      h."assignedLecturerId",
      u."name" AS "assignedLecturerName",
      u."email" AS "assignedLecturerEmail",
      h."submittedAt",
      h."approvedAt",
      h."publishedAt",
      h."createdAt",
      h."updatedAt"
    FROM student_handbook."StudentHandbook" h
    JOIN public."User" u ON u."id" = h."assignedLecturerId"
    WHERE h."id" = ${handbookId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function blockView(
  programmeId: string,
  status: StudentHandbookStatus,
  row: BlockRow,
): Promise<StudentHandbookBlockView> {
  let sourcePreview: StudentHandbookSourcePreview | null = null;
  if (row.type === "SOURCE_DATA" && row.sourceKind) {
    if (status === "PUBLISHED" && row.sourceSnapshot !== null) {
      sourcePreview = {
        kind: row.sourceKind,
        label: row.label ?? SOURCE_LABELS[row.sourceKind],
        readOnly: true,
        data: row.sourceSnapshot,
        snapshot: true,
      };
    } else {
      sourcePreview = await safeResolveSource(programmeId, row.sourceKind);
      if (row.label) sourcePreview = { ...sourcePreview, label: row.label };
    }
  }
  return {
    id: row.id,
    type: row.type,
    sortOrder: row.sortOrder,
    content: row.content,
    sourceKind: row.sourceKind,
    label: row.label,
    sourcePreview,
  };
}

export async function getHandbook(handbookId: string): Promise<StudentHandbookView> {
  const header = await getHandbookHeader(handbookId);
  if (!header) throw new StudentHandbookNotFoundError("Student Handbook not found");

  const [sections, blocks] = await Promise.all([
    prisma.$queryRaw<SectionRow[]>(Prisma.sql`
      SELECT "id", "key", "title", "sortOrder"
      FROM student_handbook."StudentHandbookSection"
      WHERE "handbookId" = ${handbookId}
      ORDER BY "sortOrder" ASC
    `),
    prisma.$queryRaw<BlockRow[]>(Prisma.sql`
      SELECT
        b."id",
        b."sectionId",
        b."type",
        b."sortOrder",
        b."content",
        b."sourceKind",
        b."label",
        b."sourceSnapshot"
      FROM student_handbook."StudentHandbookBlock" b
      JOIN student_handbook."StudentHandbookSection" s ON s."id" = b."sectionId"
      WHERE s."handbookId" = ${handbookId}
      ORDER BY s."sortOrder" ASC, b."sortOrder" ASC
    `),
  ]);

  const sectionViews: StudentHandbookSectionView[] = [];
  for (const section of sections) {
    const sectionBlocks = blocks.filter((block) => block.sectionId === section.id);
    const renderedBlocks: StudentHandbookBlockView[] = [];
    for (const block of sectionBlocks) {
      renderedBlocks.push(await blockView(header.programmeId, header.status, block));
    }
    sectionViews.push({ ...section, blocks: renderedBlocks });
  }

  return {
    id: header.id,
    programmeId: header.programmeId,
    title: header.title,
    version: header.version,
    status: header.status,
    assignedLecturer: {
      id: header.assignedLecturerId,
      name: header.assignedLecturerName,
      email: header.assignedLecturerEmail,
    },
    submittedAt: iso(header.submittedAt),
    approvedAt: iso(header.approvedAt),
    publishedAt: iso(header.publishedAt),
    createdAt: header.createdAt.toISOString(),
    updatedAt: header.updatedAt.toISOString(),
    sections: sectionViews,
  };
}

export async function listHandbooks(programmeId: string): Promise<StudentHandbookView[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM student_handbook."StudentHandbook"
    WHERE "programmeId" = ${programmeId}
    ORDER BY "createdAt" DESC
  `);
  const results: StudentHandbookView[] = [];
  for (const row of rows) results.push(await getHandbook(row.id));
  return results;
}

export async function createHandbook(
  input: CreateStudentHandbookInput,
  actorId: string,
): Promise<StudentHandbookView> {
  await assertLecturerInProgramme(input.programmeId, input.assignedLecturerId);
  let createdId = "";
  try {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO student_handbook."StudentHandbook"
          ("programmeId", "title", "version", "assignedLecturerId", "createdById")
        VALUES (
          ${input.programmeId},
          ${input.title},
          ${input.version},
          ${input.assignedLecturerId},
          ${actorId}
        )
        RETURNING "id"
      `);
      createdId = rows[0]!.id;

      for (let index = 0; index < STARTER_SECTIONS.length; index += 1) {
        const [key, title] = STARTER_SECTIONS[index]!;
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO student_handbook."StudentHandbookSection"
            ("handbookId", "key", "title", "sortOrder")
          VALUES (${createdId}, ${key}, ${title}, ${index})
        `);
      }
      await audit(tx, createdId, actorId, "CREATED", "", {
        assignedLecturerId: input.assignedLecturerId,
        version: input.version,
      });
    });
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) {
      throw new StudentHandbookConflictError(
        "A Student Handbook with this programme/version already exists",
      );
    }
    throw error;
  }
  return getHandbook(createdId);
}

export async function assignLecturer(
  handbookId: string,
  lecturerId: string,
  actorId: string,
): Promise<StudentHandbookView> {
  const header = await getHandbookHeader(handbookId);
  if (!header) throw new StudentHandbookNotFoundError("Student Handbook not found");
  if (!['DRAFT', 'CHANGES_REQUESTED'].includes(header.status)) {
    throw new StudentHandbookConflictError(
      "The handbook owner can only be changed while the handbook is editable",
    );
  }
  await assertLecturerInProgramme(header.programmeId, lecturerId);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE student_handbook."StudentHandbook"
      SET "assignedLecturerId" = ${lecturerId}, "updatedAt" = now()
      WHERE "id" = ${handbookId}
    `);
    await audit(tx, handbookId, actorId, "ASSIGNED", "", {
      previousLecturerId: header.assignedLecturerId,
      assignedLecturerId: lecturerId,
    });
  });
  return getHandbook(handbookId);
}

export async function replaceSectionBlocks(
  handbookId: string,
  sectionKey: string,
  input: SaveStudentHandbookSectionInput,
  actorId: string,
): Promise<StudentHandbookView> {
  const header = await getHandbookHeader(handbookId);
  if (!header) throw new StudentHandbookNotFoundError("Student Handbook not found");
  if (!['DRAFT', 'CHANGES_REQUESTED'].includes(header.status)) {
    throw new StudentHandbookConflictError("This handbook is not editable");
  }
  const sectionRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM student_handbook."StudentHandbookSection"
    WHERE "handbookId" = ${handbookId} AND "key" = ${sectionKey}
    LIMIT 1
  `);
  const sectionId = sectionRows[0]?.id;
  if (!sectionId) throw new StudentHandbookNotFoundError("Handbook section not found");

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM student_handbook."StudentHandbookBlock"
      WHERE "sectionId" = ${sectionId}
    `);
    for (let index = 0; index < input.blocks.length; index += 1) {
      const block = input.blocks[index]!;
      if (block.type === "NARRATIVE") {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO student_handbook."StudentHandbookBlock"
            ("sectionId", "type", "sortOrder", "content")
          VALUES (${sectionId}, 'NARRATIVE', ${index}, ${block.content})
        `);
      } else {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO student_handbook."StudentHandbookBlock"
            ("sectionId", "type", "sortOrder", "sourceKind", "label")
          VALUES (
            ${sectionId},
            'SOURCE_DATA',
            ${index},
            ${block.sourceKind},
            ${block.label ?? SOURCE_LABELS[block.sourceKind]}
          )
        `);
      }
    }
    await tx.$executeRaw(Prisma.sql`
      UPDATE student_handbook."StudentHandbook"
      SET "status" = CASE WHEN "status" = 'CHANGES_REQUESTED' THEN 'DRAFT' ELSE "status" END,
          "updatedAt" = now()
      WHERE "id" = ${handbookId}
    `);
    await audit(tx, handbookId, actorId, "SECTION_SAVED", "", {
      sectionKey,
      blockCount: input.blocks.length,
    });
  });
  return getHandbook(handbookId);
}

export async function getSourcePreview(
  handbookId: string,
  kind: StudentHandbookSourceKind,
): Promise<StudentHandbookSourcePreview> {
  const header = await getHandbookHeader(handbookId);
  if (!header) throw new StudentHandbookNotFoundError("Student Handbook not found");
  return safeResolveSource(header.programmeId, kind);
}

async function changeStatus(
  handbookId: string,
  actorId: string,
  from: StudentHandbookStatus[],
  to: StudentHandbookStatus,
  action: string,
  note: string,
): Promise<StudentHandbookView> {
  const header = await getHandbookHeader(handbookId);
  if (!header) throw new StudentHandbookNotFoundError("Student Handbook not found");
  if (!from.includes(header.status)) {
    throw new StudentHandbookConflictError(
      `Cannot move Student Handbook from ${header.status} to ${to}`,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE student_handbook."StudentHandbook"
      SET
        "status" = ${to},
        "submittedAt" = CASE WHEN ${to} = 'SUBMITTED' THEN now() ELSE "submittedAt" END,
        "approvedAt" = CASE WHEN ${to} = 'APPROVED' THEN now() ELSE "approvedAt" END,
        "updatedAt" = now()
      WHERE "id" = ${handbookId}
    `);
    await audit(tx, handbookId, actorId, action, note);
  });
  return getHandbook(handbookId);
}

export function submitHandbook(handbookId: string, actorId: string) {
  return changeStatus(
    handbookId,
    actorId,
    ["DRAFT", "CHANGES_REQUESTED"],
    "SUBMITTED",
    "SUBMITTED",
    "",
  );
}

export function requestChanges(handbookId: string, actorId: string, note: string) {
  return changeStatus(
    handbookId,
    actorId,
    ["SUBMITTED"],
    "CHANGES_REQUESTED",
    "CHANGES_REQUESTED",
    note,
  );
}

export function approveHandbook(handbookId: string, actorId: string, note: string) {
  return changeStatus(
    handbookId,
    actorId,
    ["SUBMITTED"],
    "APPROVED",
    "APPROVED",
    note,
  );
}

export async function publishHandbook(
  handbookId: string,
  actorId: string,
  note: string,
): Promise<StudentHandbookView> {
  const header = await getHandbookHeader(handbookId);
  if (!header) throw new StudentHandbookNotFoundError("Student Handbook not found");
  if (header.status !== "APPROVED") {
    throw new StudentHandbookConflictError("Only an approved Student Handbook can be published");
  }

  const sourceRows = await prisma.$queryRaw<Array<{ id: string; sourceKind: StudentHandbookSourceKind }>>(Prisma.sql`
    SELECT b."id", b."sourceKind"
    FROM student_handbook."StudentHandbookBlock" b
    JOIN student_handbook."StudentHandbookSection" s ON s."id" = b."sectionId"
    WHERE s."handbookId" = ${handbookId}
      AND b."type" = 'SOURCE_DATA'
      AND b."sourceKind" IS NOT NULL
    ORDER BY s."sortOrder", b."sortOrder"
  `);

  const snapshots = new Map<string, unknown>();
  for (const row of sourceRows) {
    const preview = await resolveSource(header.programmeId, row.sourceKind);
    snapshots.set(row.id, preview.data);
  }

  await prisma.$transaction(async (tx) => {
    for (const [blockId, snapshot] of snapshots.entries()) {
      const json = JSON.stringify(snapshot);
      await tx.$executeRaw(Prisma.sql`
        UPDATE student_handbook."StudentHandbookBlock"
        SET "sourceSnapshot" = ${json}::jsonb, "updatedAt" = now()
        WHERE "id" = ${blockId}
      `);
    }
    await tx.$executeRaw(Prisma.sql`
      UPDATE student_handbook."StudentHandbook"
      SET "status" = 'PUBLISHED', "publishedAt" = now(), "updatedAt" = now()
      WHERE "id" = ${handbookId}
    `);
    await audit(tx, handbookId, actorId, "PUBLISHED", note, {
      sourceSnapshotCount: snapshots.size,
    });
  });

  return getHandbook(handbookId);
}
