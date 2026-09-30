import type { CourseSpecCompetencyContext } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { formatProgrammeCurriculumVersion } from "./curriculum-domain.ts";

const AUTHORITATIVE_STATUSES = ["Active", "Approved"] as const;

const placementSelect = {
  id: true,
  courseId: true,
  courseSpecVersionId: true,
  curriculumVersion: {
    select: {
      id: true,
      curriculumId: true,
      status: true,
      versionMajor: true,
      versionMinor: true,
      competencyFrameworkVersion: {
        select: {
          id: true,
          version: true,
          name: true,
        },
      },
    },
  },
  competencyMappings: {
    orderBy: { competency: { order: "asc" } },
    select: {
      id: true,
      teachLevel: true,
      useLevel: true,
      assessLevel: true,
      updatedAt: true,
      competency: {
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          ploCodes: true,
          order: true,
        },
      },
    },
  },
} as const;

type Placement = Awaited<
  ReturnType<typeof loadPlacements>
>[number];

async function loadPlacements(courseId: string) {
  return prisma.programmeCurriculumCourse.findMany({
    where: {
      courseId,
      curriculumVersion: {
        is: { status: { in: [...AUTHORITATIVE_STATUSES] } },
      },
    },
    orderBy: [
      { curriculumVersion: { status: "asc" } },
      { curriculumVersion: { versionMajor: "desc" } },
      { curriculumVersion: { versionMinor: "desc" } },
    ],
    select: placementSelect,
  });
}

function ambiguous(message: string): CourseSpecCompetencyContext {
  return { state: "ambiguous", message, source: null, expectations: [] };
}

function missing(message: string): CourseSpecCompetencyContext {
  return { state: "missing", message, source: null, expectations: [] };
}

function choosePlacement(
  placements: Placement[],
  courseSpecId: string | null,
): Placement | CourseSpecCompetencyContext {
  const bound = courseSpecId
    ? placements.filter((row) => row.courseSpecVersionId === courseSpecId)
    : [];

  const boundActive = bound.filter(
    (row) => row.curriculumVersion.status === "Active",
  );
  if (boundActive.length === 1) return boundActive[0]!;
  if (boundActive.length > 1) {
    return ambiguous(
      "This Course Specification is bound to more than one Active curriculum placement. Programme review is required before competency expectations can be shown.",
    );
  }
  if (bound.length === 1) return bound[0]!;
  if (bound.length > 1) {
    return ambiguous(
      "This Course Specification is bound to multiple approved curriculum versions. Select a single authoritative curriculum context before linking competency evidence.",
    );
  }

  const active = placements.filter(
    (row) => row.curriculumVersion.status === "Active",
  );
  if (active.length === 1) return active[0]!;
  if (active.length > 1) {
    return ambiguous(
      "This course appears in more than one Active curriculum version. Competency expectations cannot be chosen safely.",
    );
  }

  return missing(
    "No unique Active or exact approved curriculum placement is available for this Course Specification.",
  );
}

export const courseCompetencyContextService = {
  async getCourseSpecCompetencyContext(
    courseId: string,
    courseSpecId: string | null,
  ): Promise<CourseSpecCompetencyContext> {
    const placements = await loadPlacements(courseId);
    const selected = choosePlacement(placements, courseSpecId);
    if ("state" in selected) return selected;

    const framework = selected.curriculumVersion.competencyFrameworkVersion;
    if (!framework) {
      return missing(
        "The selected curriculum version has no competency framework assigned.",
      );
    }

    return {
      state: "ready",
      message:
        selected.competencyMappings.length > 0
          ? "Programme competency expectations resolved from the authoritative curriculum mapping."
          : "The curriculum context is available, but no course competency mappings are recorded.",
      source: {
        curriculumId: selected.curriculumVersion.curriculumId,
        curriculumVersionId: selected.curriculumVersion.id,
        curriculumVersion: formatProgrammeCurriculumVersion(
          selected.curriculumVersion.versionMajor,
          selected.curriculumVersion.versionMinor,
        ),
        curriculumStatus: selected.curriculumVersion.status,
        placementId: selected.id,
        frameworkVersionId: framework.id,
        frameworkVersion: framework.version,
        frameworkName: framework.name,
      },
      expectations: selected.competencyMappings.map((mapping) => ({
        mappingId: mapping.id,
        competencyId: mapping.competency.id,
        code: mapping.competency.code,
        name: mapping.competency.name,
        description: mapping.competency.description,
        ploCodes: mapping.competency.ploCodes,
        teachLevel: mapping.teachLevel,
        useLevel: mapping.useLevel,
        assessLevel: mapping.assessLevel,
        mappingUpdatedAt: mapping.updatedAt.toISOString(),
      })),
    };
  },
};

export type CourseCompetencyContextService =
  typeof courseCompetencyContextService;
