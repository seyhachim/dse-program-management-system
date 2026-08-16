import type {
  CurriculumComparison,
  CurriculumCourseDiff,
  CurriculumDiffKind,
  CurriculumPlacementSnapshot,
  CurriculumVersionHistory,
  ProgrammeCurriculumRead,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { CurriculumNotFoundError, curriculumService } from "./curriculum-service.ts";

function snapshot(course: ProgrammeCurriculumRead["years"][number]["semesters"][number]["courses"][number]): CurriculumPlacementSnapshot {
  return {
    courseId: course.courseId,
    yearLevel: course.yearLevel,
    semester: course.semester,
    credits: course.credits,
    courseType: course.courseType,
    sortOrder: course.sortOrder,
  };
}

function flatten(read: ProgrammeCurriculumRead) {
  return read.years.flatMap((year) =>
    year.semesters.flatMap((semester) =>
      semester.courses.map((course) => ({
        courseId: course.courseId,
        code: course.code,
        title: course.title,
        placement: snapshot(course),
      })),
    ),
  );
}

export function compareCurriculumReads(
  from: ProgrammeCurriculumRead,
  to: ProgrammeCurriculumRead,
): CurriculumComparison {
  if (from.curriculum.id !== to.curriculum.id) {
    throw new Error("Curriculum versions must belong to the same curriculum");
  }

  const before = new Map(flatten(from).map((item) => [item.courseId, item]));
  const after = new Map(flatten(to).map((item) => [item.courseId, item]));
  const courseIds = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes: CurriculumCourseDiff[] = [];

  for (const courseId of courseIds) {
    const oldItem = before.get(courseId);
    const newItem = after.get(courseId);
    const kinds: CurriculumDiffKind[] = [];

    if (!oldItem && newItem) {
      kinds.push("Added");
    } else if (oldItem && !newItem) {
      kinds.push("Removed");
    } else if (oldItem && newItem) {
      if (oldItem.placement.yearLevel !== newItem.placement.yearLevel) kinds.push("YearChanged");
      if (oldItem.placement.semester !== newItem.placement.semester) kinds.push("SemesterChanged");
      if (oldItem.placement.credits !== newItem.placement.credits) kinds.push("CreditsChanged");
      if (oldItem.placement.courseType !== newItem.placement.courseType) kinds.push("TypeChanged");
      if (
        oldItem.placement.yearLevel === newItem.placement.yearLevel &&
        oldItem.placement.semester === newItem.placement.semester &&
        oldItem.placement.sortOrder !== newItem.placement.sortOrder
      ) {
        kinds.push("OrderChanged");
      }
    }

    if (kinds.length > 0) {
      changes.push({
        courseId,
        // Display metadata only. All change classification above uses immutable
        // placement snapshots, never mutable Course credits/type/placement values.
        code: newItem?.code ?? oldItem?.code ?? null,
        title: newItem?.title ?? oldItem?.title ?? null,
        changes: kinds,
        before: oldItem?.placement ?? null,
        after: newItem?.placement ?? null,
      });
    }
  }

  return {
    curriculumId: from.curriculum.id,
    fromVersion: from.selectedVersion,
    toVersion: to.selectedVersion,
    changes,
    counts: {
      coursesChanged: changes.length,
      added: changes.filter((item) => item.changes.includes("Added")).length,
      removed: changes.filter((item) => item.changes.includes("Removed")).length,
      moved: changes.filter((item) => item.changes.includes("YearChanged") || item.changes.includes("SemesterChanged")).length,
      creditsChanged: changes.filter((item) => item.changes.includes("CreditsChanged")).length,
      typeChanged: changes.filter((item) => item.changes.includes("TypeChanged")).length,
      orderChanged: changes.filter((item) => item.changes.includes("OrderChanged")).length,
    },
  };
}

export const curriculumHistoryService = {
  async programmeId(curriculumId: string): Promise<string> {
    const curriculum = await prisma.programmeCurriculum.findUnique({
      where: { id: curriculumId },
      select: { programmeId: true },
    });
    if (!curriculum) throw new CurriculumNotFoundError("Curriculum not found");
    return curriculum.programmeId;
  },

  async compare(curriculumId: string, fromVersionId: string, toVersionId: string): Promise<CurriculumComparison> {
    const [from, to] = await Promise.all([
      curriculumService.getById(curriculumId, fromVersionId),
      curriculumService.getById(curriculumId, toVersionId),
    ]);
    return compareCurriculumReads(from, to);
  },

  async history(curriculumId: string): Promise<CurriculumVersionHistory> {
    const base = await curriculumService.getById(curriculumId);
    const versionIds = base.versions.map((version) => version.id);
    const actions = await prisma.programmeCurriculumAuditAction.findMany({
      where: { curriculumVersionId: { in: versionIds } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        curriculumVersionId: true,
        action: true,
        note: true,
        details: true,
        actorId: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    });

    return {
      curriculumId,
      versions: base.versions.map((version) => ({
        version,
        auditActions: actions
          .filter((action) => action.curriculumVersionId === version.id)
          .map((action) => ({
            id: action.id,
            versionId: action.curriculumVersionId,
            action: action.action,
            note: action.note,
            details: action.details,
            actorId: action.actorId,
            actorName: action.actor.name,
            createdAt: action.createdAt.toISOString(),
          })),
      })),
    };
  },
};
