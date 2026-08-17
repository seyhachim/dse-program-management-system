import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  DseCurriculumImportSchema,
  type CurriculumArtifactView,
  type CurriculumImportCourse,
  type CurriculumImportPreview,
  type CurriculumImportPathway,
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

type ArtifactPathwayRow = {
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
) {
  const common = courses.filter((course) => course.pathwayCode === null);
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
  return {
    commonCredits: common.reduce((total, course) => total + course.credits.total, 0),
    commonCourseCount: common.length,
    pathways: pathwayTotals,
    selectedRouteCredits:
      common.reduce((total, course) => total + course.credits.total, 0) +
      (selected?.credits ?? 0),
    selectedRouteCourseCount: common.length + (selected?.courseCount ?? 0),
  };
}

function creditBreakdownWarning(course: CurriculumImportCourse): string | null {
  const sum = course.credits.lecture + course.credits.lab + course.credits.fieldVisit;
  return sum === course.credits.total
    ? null
    : `${course.code}: credit breakdown (${sum}) differs from total credits (${course.credits.total}); source values will be preserved`;
}

async function buildPreview(
  target: TargetVersion,
  upload: CurriculumJsonUpload,
): Promise<CurriculumImportPreview> {
  const { data, sha256 } = parseUpload(upload);
  const workflow = await getCurriculumWorkflowState(target.id);
  const blockers: string[] = [];
  const warnings: string[] = [];

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

  const codes = [...new Set(data.courses.map((course) => course.code))];
  const existing = await prisma.course.findMany({
    where: { programmeId: target.programmeId, code: { in: codes } },
    select: { id: true, code: true, title: true, courseType: true, credits: true },
  });
  const byCode = new Map(existing.map((course) => [course.code, course]));

  const courses = data.courses.map((course) => {
    const current = byCode.get(course.code) ?? null;
    const isPublicPlacement =
      course.pathwayCode === null || course.pathwayCode === defaultPathway?.code;
    let matchStatus: "matched" | "conflict" | "missing" | "blocked" = "matched";
    let message = "Exact canonical course match";

    if (!current) {
      matchStatus = "missing";
      message = "No canonical Course exists with this code";
      blockers.push(`${course.code}: canonical course is missing`);
    } else if (normalizeTitle(current.title) !== normalizeTitle(course.title)) {
      matchStatus = "conflict";
      message = `PMS title is “${current.title}”`;
      blockers.push(`${course.code}: JSON title conflicts with the canonical Course title`);
    } else if (isPublicPlacement && !current.courseType) {
      matchStatus = "blocked";
      message = "Canonical Course has no course type; curriculum placement cannot snapshot a null type";
      blockers.push(`${course.code}: canonical Course needs a course type before import`);
    }

    if (current?.credits !== null && current?.credits !== undefined && current.credits !== course.credits.total) {
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
      message,
    };
  });

  const defaultCode = defaultPathway?.code ?? null;
  const totals = calculateTotals(data.pathways, data.courses, defaultCode);
  if (data.programmeCode.toUpperCase() === "DSE" && data.curriculum.academicYear === "2026") {
    if (totals.selectedRouteCredits !== 143) {
      warnings.push(
        `DSE 2026 selected/default route totals ${totals.selectedRouteCredits} credits; the supplied reference states 143`,
      );
    }
  }

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
  const [pathways, courses, sources] = await Promise.all([
    prisma.$queryRaw<ArtifactPathwayRow[]>`
      SELECT "curriculumVersionId", "code", "name", "yearLevel", "semester"::text AS semester,
             "isDefault", "creditTarget", "sortOrder"
      FROM curriculum_artifact."Pathway"
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
      SELECT "fileName", "sha256", "formatVersion", "importedAt", "importedById"
      FROM curriculum_artifact."ImportSource"
      WHERE "curriculumVersionId" = ${versionId}
      LIMIT 1
    `,
  ]);
  return { pathways, courses, source: sources[0] ?? null };
}

export const curriculumImportService = {
  loadTarget,

  async preview(versionId: string, upload: CurriculumJsonUpload) {
    const target = await loadTarget(versionId);
    return buildPreview(target, upload);
  },

  async apply(versionId: string, actorId: string, upload: CurriculumJsonUpload) {
    const target = await loadTarget(versionId);
    const preview = await buildPreview(target, upload);
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
    const matchedByCode = new Map(
      preview.courses.map((course) => [
        course.code,
        {
          courseId: course.existingCourseId!,
          courseType: course.existingCourseType as CourseType | null,
        },
      ]),
    );

    await prisma.$transaction(
      async (tx) => {
        await assertTransactionDraft(tx, versionId);

        // Replace the Draft snapshot atomically. Deleting canonical placements
        // cascades their artifact snapshots; alternatives are removed explicitly.
        await tx.programmeCurriculumCourse.deleteMany({
          where: { curriculumVersionId: versionId },
        });
        await tx.$executeRaw`
          DELETE FROM curriculum_artifact."CourseSnapshot"
          WHERE "curriculumVersionId" = ${versionId}
        `;
        await tx.$executeRaw`
          DELETE FROM curriculum_artifact."Pathway"
          WHERE "curriculumVersionId" = ${versionId}
        `;
        await tx.$executeRaw`
          DELETE FROM curriculum_artifact."ImportSource"
          WHERE "curriculumVersionId" = ${versionId}
        `;

        for (const pathway of data.pathways) {
          await tx.$executeRaw`
            INSERT INTO curriculum_artifact."Pathway"
              ("curriculumVersionId", "code", "name", "yearLevel", "semester", "isDefault", "creditTarget", "sortOrder")
            VALUES
              (${versionId}, ${pathway.code}, ${pathway.name}, ${pathway.yearLevel},
               ${sqlSemester(pathway.semester)}::"Semester", ${pathway.code === defaultPathway?.code},
               ${pathway.creditTarget ?? null}, ${pathway.sortOrder})
          `;
        }

        for (const course of data.courses) {
          const match = matchedByCode.get(course.code)!;
          const isPublicPlacement =
            course.pathwayCode === null || course.pathwayCode === defaultPathway?.code;
          const hours = importSnapshotValues(course);

          if (isPublicPlacement) {
            if (!match.courseType) {
              throw new CurriculumImportValidationError(
                `${course.code} has no canonical course type`,
              );
            }
            const placement = await tx.programmeCurriculumCourse.create({
              data: {
                curriculumVersionId: versionId,
                courseId: match.courseId,
                yearLevel: course.yearLevel,
                semester: course.semester,
                creditsSnapshot: course.credits.total,
                courseTypeSnapshot: match.courseType,
                sortOrder: course.sortOrder,
              },
              select: { id: true },
            });
            await tx.$executeRaw`
              UPDATE curriculum_artifact."CourseSnapshot"
              SET "scopeCode" = ${course.pathwayCode ?? COMMON_SCOPE},
                  "courseCodeSnapshot" = ${course.code},
                  "courseTitleSnapshot" = ${course.title},
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
              WHERE "placementId" = ${placement.id}
            `;
          } else {
            await tx.$executeRaw`
              INSERT INTO curriculum_artifact."CourseSnapshot" (
                "id", "curriculumVersionId", "scopeCode", "placementId", "courseId",
                "courseCodeSnapshot", "courseTitleSnapshot", "yearLevel", "semester", "sortOrder",
                "weeklyHoursTotal", "weeklyLectureHours", "weeklyLabHours", "weeklyFieldVisitHours",
                "creditsTotal", "creditLecture", "creditLab", "creditFieldVisit", "lecturerText"
              ) VALUES (
                ${randomUUID()}, ${versionId}, ${course.pathwayCode!}, NULL, ${match.courseId},
                ${course.code}, ${course.title}, ${course.yearLevel}, ${sqlSemester(course.semester)}::"Semester", ${course.sortOrder},
                ${hours.weeklyTotal}, ${hours.weeklyLecture}, ${hours.weeklyLab}, ${hours.weeklyField},
                ${course.credits.total}, ${course.credits.lecture}, ${course.credits.lab}, ${course.credits.fieldVisit}, ${course.lecturerText}
              )
            `;
          }
        }

        await tx.$executeRaw`
          INSERT INTO curriculum_artifact."ImportSource"
            ("curriculumVersionId", "fileName", "sha256", "formatVersion", "importedById")
          VALUES (${versionId}, ${upload.fileName}, ${sha256}, ${data.formatVersion}, ${actorId})
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
              selectedRouteCredits: preview.totals.selectedRouteCredits,
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
    const totals = calculateTotals(pathways, courses, defaultPathway?.code ?? null);
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
      totals,
      source: rows.source
        ? {
            fileName: rows.source.fileName,
            sha256: rows.source.sha256,
            formatVersion: rows.source.formatVersion,
            importedAt: rows.source.importedAt.toISOString(),
            importedById: rows.source.importedById,
          }
        : null,
    };
  },
};

export type CurriculumImportService = typeof curriculumImportService;
