import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  CurriculumImportDecisionSchema,
  DseCurriculumImportSchema,
  type CurriculumArtifactView,
  type CurriculumDeclaredTotals,
  type CurriculumImportApplyInput,
  type CurriculumImportCourse,
  type CurriculumImportDecision,
  type CurriculumImportPathway,
  type CurriculumImportPreview,
  type CurriculumJsonUpload,
  type CourseType,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { getCurriculumWorkflowState } from "./curriculum-workflow-service.ts";

const COMMON_SCOPE = "__COMMON__";

type TargetVersion = {
  id: string;
  curriculumId: string;
  programmeId: string;
  programmeCode: string;
  curriculumCode: string;
  curriculumName: string;
  versionMajor: number;
  versionMinor: number;
  status: "Draft" | "Approved" | "Active" | "Superseded";
  academicYear: string;
};

type CanonicalPathwayRow = {
  id: string;
  curriculumVersionId: string;
  code: string;
  name: string;
  yearLevel: number;
  semester: "First" | "Second";
  isDefault: boolean;
  creditTarget: number | null;
  sortOrder: number;
};

type ArtifactCourseRow = {
  id: string;
  curriculumVersionId: string;
  scopeCode: string;
  placementId: string | null;
  courseId: string | null;
  courseCodeSnapshot: string;
  courseTitleSnapshot: string;
  yearLevel: number;
  semester: "First" | "Second";
  sortOrder: number;
  weeklyHoursTotal: number | null;
  weeklyLectureHours: number | null;
  weeklyLabHours: number | null;
  weeklyFieldVisitHours: number | null;
  creditsTotal: number;
  creditLecture: number;
  creditLab: number;
  creditFieldVisit: number;
  lecturerText: string;
};

type ImportSourceRow = {
  fileName: string;
  sha256: string;
  formatVersion: string;
  importedAt: Date;
  importedById: string;
  decisions: Prisma.JsonValue;
  warnings: Prisma.JsonValue;
};

type DeclaredTotalsRow = {
  semesterCredits: Prisma.JsonValue;
  pathwayCredits: Prisma.JsonValue;
  programmeCourseCount: number | null;
  programmeCredits: number | null;
};

type CanonicalCourseResolution = {
  courseId: string;
  title: string;
  courseType: CourseType;
};

export class CurriculumImportNotFoundError extends Error {}
export class CurriculumImportValidationError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
  }
}
export class CurriculumImportConflictError extends Error {}

function sourceHash(jsonText: string): string {
  return createHash("sha256").update(jsonText, "utf8").digest("hex");
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function parseUpload(upload: CurriculumJsonUpload) {
  let json: unknown;
  try {
    json = JSON.parse(upload.jsonText);
  } catch {
    throw new CurriculumImportValidationError("Curriculum JSON is not valid JSON");
  }
  const parsed = DseCurriculumImportSchema.safeParse(json);
  if (!parsed.success) {
    throw new CurriculumImportValidationError(
      "Curriculum JSON does not match dse-curriculum-v1",
      parsed.error.flatten(),
    );
  }
  return {
    data: parsed.data,
    sha256: sourceHash(upload.jsonText),
  };
}

function parseStoredDecisions(value: Prisma.JsonValue): CurriculumImportDecision[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = CurriculumImportDecisionSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseStoredWarnings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function loadTarget(versionId: string): Promise<TargetVersion> {
  const version = await prisma.programmeCurriculumVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      curriculumId: true,
      versionMajor: true,
      versionMinor: true,
      status: true,
      academicYear: true,
      curriculum: {
        select: {
          code: true,
          name: true,
          programmeId: true,
          programme: { select: { code: true } },
        },
      },
    },
  });
  if (!version) throw new CurriculumImportNotFoundError("Curriculum version not found");
  return {
    id: version.id,
    curriculumId: version.curriculumId,
    programmeId: version.curriculum.programmeId,
    programmeCode: version.curriculum.programme.code,
    curriculumCode: version.curriculum.code,
    curriculumName: version.curriculum.name,
    versionMajor: version.versionMajor,
    versionMinor: version.versionMinor,
    status: version.status,
    academicYear: version.academicYear,
  };
}

function selectedDefaultPathway(
  pathways: CurriculumImportPathway[],
  requestedCode: string | null,
): CurriculumImportPathway | null {
  if (requestedCode) return pathways.find((pathway) => pathway.code === requestedCode) ?? null;
  return pathways.find((pathway) => pathway.isDefault) ?? null;
}

function calculateTotals(
  pathways: CurriculumImportPathway[],
  courses: Array<Pick<CurriculumImportCourse, "pathwayCode" | "credits">>,
  defaultPathwayCode: string | null,
  declaredTotals: CurriculumDeclaredTotals | null,
) {
  const common = courses.filter((course) => course.pathwayCode === null);
  const commonCredits = common.reduce((total, course) => total + course.credits.total, 0);
  const pathwayTotals = pathways
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((pathway) => {
      const scoped = courses.filter((course) => course.pathwayCode === pathway.code);
      return {
        code: pathway.code,
        name: pathway.name,
        isDefault: pathway.code === defaultPathwayCode || pathway.isDefault,
        credits: scoped.reduce((total, course) => total + course.credits.total, 0),
        courseCount: scoped.length,
      };
    });
  const selected = defaultPathwayCode
    ? pathwayTotals.find((pathway) => pathway.code === defaultPathwayCode) ?? null
    : pathwayTotals.find((pathway) => pathway.isDefault) ?? null;
  const computedSelectedRouteCredits = commonCredits + (selected?.credits ?? 0);
  const computedCourseCount = common.length + (selected?.courseCount ?? 0);
  return {
    commonCredits,
    commonCourseCount: common.length,
    pathways: pathwayTotals,
    computedSelectedRouteCredits,
    selectedRouteCredits: declaredTotals?.programmeCredits ?? computedSelectedRouteCredits,
    selectedRouteCourseCount: declaredTotals?.programmeCourseCount ?? computedCourseCount,
  };
}

function creditBreakdownWarning(course: CurriculumImportCourse): string | null {
  const sum = course.credits.lecture + course.credits.lab + course.credits.fieldVisit;
  return sum === course.credits.total
    ? null
    : `${course.code}: credit breakdown (${sum}) differs from total credits (${course.credits.total}); source values will be preserved`;
}

function appendDeclaredTotalWarnings(
  warnings: string[],
  pathways: CurriculumImportPathway[],
  courses: CurriculumImportCourse[],
  defaultPathwayCode: string | null,
  declared: CurriculumDeclaredTotals | null,
) {
  if (!declared) return;
  const isSelected = (course: CurriculumImportCourse) =>
    course.pathwayCode === null || course.pathwayCode === defaultPathwayCode;

  for (const total of declared.semesterCredits) {
    const computed = courses
      .filter(
        (course) =>
          isSelected(course) &&
          course.yearLevel === total.yearLevel &&
          course.semester === total.semester,
      )
      .reduce((sum, course) => sum + course.credits.total, 0);
    if (computed !== total.credits) {
      warnings.push(
        `Year ${total.yearLevel} ${total.semester} semester rows total ${computed} credits while the source declares ${total.credits}; both values are preserved`,
      );
    }
  }

  for (const total of declared.pathwayCredits) {
    const computed = courses
      .filter((course) => course.pathwayCode === total.pathwayCode)
      .reduce((sum, course) => sum + course.credits.total, 0);
    if (computed !== total.credits) {
      warnings.push(
        `${total.pathwayCode} pathway rows total ${computed} credits while the source declares ${total.credits}`,
      );
    }
  }

  const rowTotals = calculateTotals(pathways, courses, defaultPathwayCode, null);
  if (
    declared.programmeCredits !== null &&
    declared.programmeCredits !== undefined &&
    declared.programmeCredits !== rowTotals.computedSelectedRouteCredits
  ) {
    warnings.push(
      `Selected/default route rows total ${rowTotals.computedSelectedRouteCredits} credits while the official source declares ${declared.programmeCredits}; the official declared total is used for document totals without changing row credits`,
    );
  }
}

function decisionsByCode(decisions: CurriculumImportDecision[]) {
  return new Map(decisions.map((decision) => [decision.courseCode, decision]));
}

async function buildPreview(
  target: TargetVersion,
  upload: CurriculumJsonUpload,
  decisions: CurriculumImportDecision[] = [],
): Promise<CurriculumImportPreview> {
  const { data, sha256 } = parseUpload(upload);
  const workflow = await getCurriculumWorkflowState(target.id);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const decisionMap = decisionsByCode(decisions);

  if (data.programmeCode.toUpperCase() !== target.programmeCode.toUpperCase()) {
    blockers.push(
      `JSON programme ${data.programmeCode} does not match target programme ${target.programmeCode}`,
    );
  }
  if (workflow.status !== "Draft") {
    blockers.push(`Only an editable Draft curriculum can be imported; target is ${workflow.status}`);
  }
  const expectedVersion = `${target.versionMajor}.${target.versionMinor}`;
  if (data.curriculum.version !== expectedVersion) {
    warnings.push(
      `JSON version ${data.curriculum.version} differs from selected PMS version ${expectedVersion}; the selected PMS version remains authoritative`,
    );
  }
  if (data.curriculum.code !== target.curriculumCode) {
    warnings.push(
      `JSON curriculum code ${data.curriculum.code} differs from PMS curriculum code ${target.curriculumCode}; import will not rename the PMS curriculum`,
    );
  }
  if (data.curriculum.name !== target.curriculumName) {
    warnings.push("JSON curriculum title differs from the PMS curriculum title; import will preserve the PMS identity");
  }

  const defaultPathway = selectedDefaultPathway(
    data.pathways,
    data.curriculum.defaultPathwayCode,
  );
  if (data.pathways.length > 0 && !defaultPathway) {
    blockers.push("A default pathway must be selected when alternative pathways are present");
  }

  const distinctByCode = new Map<string, CurriculumImportCourse>();
  for (const course of data.courses) {
    const first = distinctByCode.get(course.code);
    if (
      first &&
      (normalizeTitle(first.title) !== normalizeTitle(course.title) ||
        first.credits.total !== course.credits.total)
    ) {
      blockers.push(`${course.code}: repeated pathway rows disagree on title or credits`);
    } else if (!first) {
      distinctByCode.set(course.code, course);
    }
  }

  const codes = [...distinctByCode.keys()];
  const existing = await prisma.course.findMany({
    where: { programmeId: target.programmeId, code: { in: codes } },
    select: { id: true, code: true, title: true, courseType: true, credits: true },
  });
  const byCode = new Map(existing.map((course) => [course.code, course]));

  const courses = data.courses.map((course) => {
    const current = byCode.get(course.code) ?? null;
    const decision = decisionMap.get(course.code) ?? null;
    let matchStatus: "matched" | "conflict" | "missing" | "blocked" = "matched";
    let requiredDecision: "create-course" | "keep-existing-course" | null = null;
    let message = "Exact canonical course match";

    if (!current) {
      matchStatus = "missing";
      requiredDecision = "create-course";
      if (decision?.action === "create-course" && decision.courseType) {
        message = `Will create canonical Course with explicit type ${decision.courseType}`;
      } else {
        message = "No canonical Course exists with this code";
        blockers.push(`${course.code}: choose Create Course and an explicit course type before apply`);
      }
    } else if (normalizeTitle(current.title) !== normalizeTitle(course.title)) {
      matchStatus = "conflict";
      requiredDecision = "keep-existing-course";
      if (decision?.action === "keep-existing-course") {
        message = `Will keep canonical PMS title “${current.title}”`;
      } else {
        message = `PMS title is “${current.title}”`;
        blockers.push(`${course.code}: title conflict requires an explicit keep-existing-course decision`);
      }
    } else if (decision) {
      blockers.push(`${course.code}: an import decision was supplied for a course that already matches exactly`);
    }

    const effectiveType =
      current?.courseType ??
      (decision?.action === "create-course" ? decision.courseType ?? null : null);
    if (!effectiveType) {
      matchStatus = "blocked";
      message = "A canonical course type is required for the immutable curriculum placement snapshot";
      blockers.push(`${course.code}: an explicit canonical course type is required`);
    }

    if (
      current?.credits !== null &&
      current?.credits !== undefined &&
      current.credits !== course.credits.total
    ) {
      warnings.push(
        `${course.code}: source curriculum credits ${course.credits.total} differ from current Course credits ${current.credits}; curriculum snapshot will preserve the source total`,
      );
    }
    const creditWarning = creditBreakdownWarning(course);
    if (creditWarning) warnings.push(creditWarning);

    return {
      ...course,
      matchStatus,
      existingCourseId: current?.id ?? null,
      existingTitle: current?.title ?? null,
      existingCourseType: current?.courseType ?? null,
      requiredDecision,
      message,
    };
  });

  const defaultCode = defaultPathway?.code ?? null;
  const declaredTotals = data.declaredTotals ?? null;
  appendDeclaredTotalWarnings(warnings, data.pathways, data.courses, defaultCode, declaredTotals);
  const totals = calculateTotals(data.pathways, data.courses, defaultCode, declaredTotals);

  return {
    source: {
      fileName: upload.fileName,
      sha256,
      formatVersion: data.formatVersion,
    },
    target: {
      curriculumId: target.curriculumId,
      curriculumVersionId: target.id,
      programmeId: target.programmeId,
      programmeCode: target.programmeCode,
      status: workflow.status,
    },
    curriculum: data.curriculum,
    pathways: data.pathways,
    courses,
    declaredTotals,
    totals,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    canApply: blockers.length === 0,
  };
}

function sqlSemester(semester: "First" | "Second") {
  return semester;
}

function importSnapshotValues(course: CurriculumImportCourse) {
  return {
    weeklyTotal: course.weeklyHours?.total ?? null,
    weeklyLecture: course.weeklyHours?.lecture ?? null,
    weeklyLab: course.weeklyHours?.lab ?? null,
    weeklyField: course.weeklyHours?.fieldVisit ?? null,
  };
}

async function assertTransactionDraft(tx: Prisma.TransactionClient, versionId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id", "status"::text AS status
    FROM public."ProgrammeCurriculumVersion"
    WHERE "id" = ${versionId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new CurriculumImportNotFoundError("Curriculum version not found");
  if (row.status !== "Draft") {
    throw new CurriculumImportConflictError(`Curriculum is no longer editable (${row.status})`);
  }

  const actions = await tx.programmeCurriculumAuditAction.findMany({
    where: { curriculumVersionId: versionId, action: "MetadataUpdated" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: { details: true },
  });
  for (const action of actions) {
    if (!action.details || typeof action.details !== "object" || Array.isArray(action.details)) continue;
    const marker = (action.details as Record<string, unknown>).workflowAction;
    if (marker === "SubmittedForReview") {
      throw new CurriculumImportConflictError("Curriculum is now Under Review and cannot be imported");
    }
    if (marker === "ChangesRequested") break;
  }
}

async function artifactRows(versionId: string) {
  const [pathways, courses, sources, declared] = await Promise.all([
    prisma.$queryRaw<CanonicalPathwayRow[]>`
      SELECT "id", "curriculumVersionId", "code", "name", "yearLevel", "semester"::text AS semester,
             "isDefault", "creditTarget", "sortOrder"
      FROM public."ProgrammeCurriculumPathway"
      WHERE "curriculumVersionId" = ${versionId}
      ORDER BY "sortOrder", "code"
    `,
    prisma.$queryRaw<ArtifactCourseRow[]>`
      SELECT "id", "curriculumVersionId", "scopeCode", "placementId", "courseId",
             "courseCodeSnapshot", "courseTitleSnapshot", "yearLevel", "semester"::text AS semester,
             "sortOrder", "weeklyHoursTotal", "weeklyLectureHours", "weeklyLabHours",
             "weeklyFieldVisitHours", "creditsTotal", "creditLecture", "creditLab",
             "creditFieldVisit", "lecturerText"
      FROM curriculum_artifact."CourseSnapshot"
      WHERE "curriculumVersionId" = ${versionId}
      ORDER BY "yearLevel", "semester", "scopeCode", "sortOrder", "courseCodeSnapshot"
    `,
    prisma.$queryRaw<ImportSourceRow[]>`
      SELECT "fileName", "sha256", "formatVersion", "importedAt", "importedById", "decisions", "warnings"
      FROM curriculum_artifact."ImportSource"
      WHERE "curriculumVersionId" = ${versionId}
      LIMIT 1
    `,
    prisma.$queryRaw<DeclaredTotalsRow[]>`
      SELECT "semesterCredits", "pathwayCredits", "programmeCourseCount", "programmeCredits"
      FROM curriculum_artifact."DeclaredTotals"
      WHERE "curriculumVersionId" = ${versionId}
      LIMIT 1
    `,
  ]);
  return {
    pathways,
    courses,
    source: sources[0] ?? null,
    declared: declared[0] ?? null,
  };
}

async function resolveCanonicalCourses(
  tx: Prisma.TransactionClient,
  programmeId: string,
  courses: CurriculumImportCourse[],
  decisions: CurriculumImportDecision[],
): Promise<Map<string, CanonicalCourseResolution>> {
  const sourceByCode = new Map<string, CurriculumImportCourse>();
  for (const course of courses) if (!sourceByCode.has(course.code)) sourceByCode.set(course.code, course);
  const codes = [...sourceByCode.keys()];
  const current = await tx.course.findMany({
    where: { programmeId, code: { in: codes } },
    select: { id: true, code: true, title: true, courseType: true },
  });
  const currentByCode = new Map(current.map((course) => [course.code, course]));
  const decisionMap = decisionsByCode(decisions);
  const resolved = new Map<string, CanonicalCourseResolution>();

  for (const [code, source] of sourceByCode) {
    const existing = currentByCode.get(code);
    const decision = decisionMap.get(code);
    if (!existing) {
      if (decision?.action !== "create-course" || !decision.courseType) {
        throw new CurriculumImportConflictError(`${code} no longer has a valid explicit create decision`);
      }
      const created = await tx.course.create({
        data: {
          programmeId,
          code,
          title: source.title,
          credits: source.credits.total,
          courseType: decision.courseType,
        },
        select: { id: true, title: true, courseType: true },
      });
      resolved.set(code, {
        courseId: created.id,
        title: created.title,
        courseType: created.courseType,
      });
      continue;
    }

    if (normalizeTitle(existing.title) !== normalizeTitle(source.title)) {
      if (decision?.action !== "keep-existing-course") {
        throw new CurriculumImportConflictError(`${code} canonical title changed; re-preview the import`);
      }
    } else if (decision) {
      throw new CurriculumImportConflictError(`${code} no longer requires an import decision`);
    }
    if (!existing.courseType) {
      throw new CurriculumImportConflictError(`${code} canonical Course has no course type`);
    }
    resolved.set(code, {
      courseId: existing.id,
      title: existing.title,
      courseType: existing.courseType,
    });
  }
  return resolved;
}

export const curriculumImportService = {
  loadTarget,

  async preview(versionId: string, upload: CurriculumJsonUpload) {
    const target = await loadTarget(versionId);
    return buildPreview(target, upload);
  },

  async apply(versionId: string, actorId: string, input: CurriculumImportApplyInput) {
    const target = await loadTarget(versionId);
    const upload = { fileName: input.fileName, jsonText: input.jsonText };
    const preview = await buildPreview(target, upload, input.decisions);
    if (!preview.canApply) {
      throw new CurriculumImportValidationError("Curriculum import has blocking issues", {
        blockers: preview.blockers,
      });
    }
    const { data, sha256 } = parseUpload(upload);
    const defaultPathway = selectedDefaultPathway(
      data.pathways,
      data.curriculum.defaultPathwayCode,
    );

    await prisma.$transaction(
      async (tx) => {
        await assertTransactionDraft(tx, versionId);
        const resolvedCourses = await resolveCanonicalCourses(
          tx,
          target.programmeId,
          data.courses,
          input.decisions,
        );

        await tx.programmeCurriculumCourse.deleteMany({
          where: { curriculumVersionId: versionId },
        });
        await tx.$executeRaw`
          DELETE FROM curriculum_artifact."CourseSnapshot"
          WHERE "curriculumVersionId" = ${versionId}
        `;
        await tx.$executeRaw`
          DELETE FROM curriculum_artifact."DeclaredTotals"
          WHERE "curriculumVersionId" = ${versionId}
        `;
        await tx.$executeRaw`
          DELETE FROM curriculum_artifact."ImportSource"
          WHERE "curriculumVersionId" = ${versionId}
        `;
        await tx.$executeRaw`
          DELETE FROM public."ProgrammeCurriculumPathway"
          WHERE "curriculumVersionId" = ${versionId}
        `;

        const pathwayIds = new Map<string, string>();
        for (const pathway of data.pathways) {
          const pathwayId = randomUUID();
          pathwayIds.set(pathway.code, pathwayId);
          await tx.$executeRaw`
            INSERT INTO public."ProgrammeCurriculumPathway"
              ("id", "curriculumVersionId", "code", "name", "yearLevel", "semester",
               "isDefault", "creditTarget", "sortOrder", "updatedAt")
            VALUES
              (${pathwayId}, ${versionId}, ${pathway.code}, ${pathway.name}, ${pathway.yearLevel},
               ${sqlSemester(pathway.semester)}::"Semester", ${pathway.code === defaultPathway?.code},
               ${pathway.creditTarget ?? null}, ${pathway.sortOrder}, CURRENT_TIMESTAMP)
          `;
        }

        for (const course of data.courses) {
          const canonical = resolvedCourses.get(course.code);
          if (!canonical) throw new CurriculumImportConflictError(`${course.code} could not be resolved`);
          const pathwayId = course.pathwayCode ? pathwayIds.get(course.pathwayCode) ?? null : null;
          if (course.pathwayCode && !pathwayId) {
            throw new CurriculumImportConflictError(`${course.code} references a pathway that no longer exists`);
          }
          const placementId = randomUUID();
          const hours = importSnapshotValues(course);

          await tx.$executeRaw`
            INSERT INTO public."ProgrammeCurriculumCourse" (
              "id", "curriculumVersionId", "courseId", "pathwayId", "yearLevel", "semester",
              "creditsSnapshot", "courseTypeSnapshot", "sortOrder", "createdAt", "updatedAt"
            ) VALUES (
              ${placementId}, ${versionId}, ${canonical.courseId}, ${pathwayId}, ${course.yearLevel},
              ${sqlSemester(course.semester)}::"Semester", ${course.credits.total},
              ${canonical.courseType}::"CourseType", ${course.sortOrder}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
          `;

          await tx.$executeRaw`
            UPDATE curriculum_artifact."CourseSnapshot"
            SET "scopeCode" = ${course.pathwayCode ?? COMMON_SCOPE},
                "courseCodeSnapshot" = ${course.code},
                "courseTitleSnapshot" = ${canonical.title},
                "yearLevel" = ${course.yearLevel},
                "semester" = ${sqlSemester(course.semester)}::"Semester",
                "sortOrder" = ${course.sortOrder},
                "weeklyHoursTotal" = ${hours.weeklyTotal},
                "weeklyLectureHours" = ${hours.weeklyLecture},
                "weeklyLabHours" = ${hours.weeklyLab},
                "weeklyFieldVisitHours" = ${hours.weeklyField},
                "creditsTotal" = ${course.credits.total},
                "creditLecture" = ${course.credits.lecture},
                "creditLab" = ${course.credits.lab},
                "creditFieldVisit" = ${course.credits.fieldVisit},
                "lecturerText" = ${course.lecturerText},
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "placementId" = ${placementId}
          `;
        }

        if (data.declaredTotals) {
          await tx.$executeRaw`
            INSERT INTO curriculum_artifact."DeclaredTotals"
              ("curriculumVersionId", "semesterCredits", "pathwayCredits", "programmeCourseCount", "programmeCredits")
            VALUES (
              ${versionId}, ${JSON.stringify(data.declaredTotals.semesterCredits)}::jsonb,
              ${JSON.stringify(data.declaredTotals.pathwayCredits)}::jsonb,
              ${data.declaredTotals.programmeCourseCount ?? null}, ${data.declaredTotals.programmeCredits ?? null}
            )
          `;
        }

        await tx.$executeRaw`
          INSERT INTO curriculum_artifact."ImportSource"
            ("curriculumVersionId", "fileName", "sha256", "formatVersion", "importedById", "decisions", "warnings")
          VALUES (
            ${versionId}, ${upload.fileName}, ${sha256}, ${data.formatVersion}, ${actorId},
            ${JSON.stringify(input.decisions)}::jsonb, ${JSON.stringify(preview.warnings)}::jsonb
          )
        `;

        await tx.programmeCurriculumAuditAction.create({
          data: {
            curriculumVersionId: versionId,
            actorId,
            action: "MetadataUpdated",
            note: `Imported curriculum JSON: ${upload.fileName}`,
            details: {
              importFormat: data.formatVersion,
              sourceFileName: upload.fileName,
              sourceSha256: sha256,
              courseRows: data.courses.length,
              pathways: data.pathways.map((pathway) => ({
                code: pathway.code,
                name: pathway.name,
                isDefault: pathway.code === defaultPathway?.code,
              })),
              computedSelectedRouteCredits: preview.totals.computedSelectedRouteCredits,
              selectedRouteCredits: preview.totals.selectedRouteCredits,
              declaredTotals: data.declaredTotals ?? null,
              decisions: input.decisions,
              warnings: preview.warnings,
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.artifact(versionId);
  },

  async artifact(versionId: string): Promise<CurriculumArtifactView> {
    const target = await loadTarget(versionId);
    const rows = await artifactRows(versionId);
    const pathways = rows.pathways.map((pathway) => ({
      code: pathway.code,
      name: pathway.name,
      yearLevel: pathway.yearLevel,
      semester: pathway.semester,
      isDefault: pathway.isDefault,
      creditTarget: pathway.creditTarget,
      sortOrder: pathway.sortOrder,
    }));
    const defaultPathway = pathways.find((pathway) => pathway.isDefault) ?? null;
    const courses = rows.courses.map((course) => ({
      code: course.courseCodeSnapshot,
      title: course.courseTitleSnapshot,
      yearLevel: course.yearLevel,
      semester: course.semester,
      pathwayCode: course.scopeCode === COMMON_SCOPE ? null : course.scopeCode,
      sortOrder: course.sortOrder,
      weeklyHours:
        course.weeklyHoursTotal === null
          ? null
          : {
              total: course.weeklyHoursTotal,
              lecture: course.weeklyLectureHours ?? 0,
              lab: course.weeklyLabHours ?? 0,
              fieldVisit: course.weeklyFieldVisitHours ?? 0,
            },
      credits: {
        total: course.creditsTotal,
        lecture: course.creditLecture,
        lab: course.creditLab,
        fieldVisit: course.creditFieldVisit,
      },
      lecturerText: course.lecturerText,
      courseId: course.courseId,
      placementId: course.placementId,
    }));
    const declaredTotals: CurriculumDeclaredTotals | null = rows.declared
      ? {
          semesterCredits: Array.isArray(rows.declared.semesterCredits)
            ? (rows.declared.semesterCredits as CurriculumDeclaredTotals["semesterCredits"])
            : [],
          pathwayCredits: Array.isArray(rows.declared.pathwayCredits)
            ? (rows.declared.pathwayCredits as CurriculumDeclaredTotals["pathwayCredits"])
            : [],
          programmeCourseCount: rows.declared.programmeCourseCount,
          programmeCredits: rows.declared.programmeCredits,
        }
      : null;
    const totals = calculateTotals(pathways, courses, defaultPathway?.code ?? null, declaredTotals);
    return {
      curriculum: {
        id: target.curriculumId,
        programmeId: target.programmeId,
        programmeCode: target.programmeCode,
        code: target.curriculumCode,
        name: target.curriculumName,
        academicYear: target.academicYear,
        version: `${target.versionMajor}.${target.versionMinor}`,
        status: target.status,
        defaultPathwayCode: defaultPathway?.code ?? null,
      },
      pathways,
      courses,
      declaredTotals,
      totals,
      source: rows.source
        ? {
            fileName: rows.source.fileName,
            sha256: rows.source.sha256,
            formatVersion: rows.source.formatVersion,
            importedAt: rows.source.importedAt.toISOString(),
            importedById: rows.source.importedById,
            decisions: parseStoredDecisions(rows.source.decisions),
            warnings: parseStoredWarnings(rows.source.warnings),
          }
        : null,
    };
  },

  async artifactForExport(versionId: string): Promise<CurriculumArtifactView> {
    const workflow = await getCurriculumWorkflowState(versionId);
    if (![
      "Approved",
      "Active",
      "Superseded",
    ].includes(workflow.status)) {
      throw new CurriculumImportConflictError(
        `Curriculum export is unavailable while version status is ${workflow.status}`,
      );
    }
    return this.artifact(versionId);
  },
};

export type CurriculumImportService = typeof curriculumImportService;
