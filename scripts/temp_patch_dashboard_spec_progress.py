from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected patch anchor not found in {path}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


# Shared API contract: expose only the active curriculum placement used for dashboard organization.
replace_once(
    "packages/shared-types/src/course-spec.ts",
    'import { DateOnlySchema, SemesterSchema } from "./offerings.ts";',
    'import { DateOnlySchema, SemesterSchema, type Semester } from "./offerings.ts";',
)
replace_once(
    "packages/shared-types/src/course-spec.ts",
    """  completed: number;\n  total: number;\n  /**\n   * Completable sections not yet marked Complete (in wizard order) — the\n""",
    """  completed: number;\n  total: number;\n  /**\n   * Active curriculum placement used only to organize the programme dashboard.\n   * Null means the course is not placed in the active curriculum; callers must\n   * never infer programme year or semester from the course code. Optional keeps\n   * older typed consumers source-compatible while the API now always returns it.\n   */\n  curriculumPlacement?: {\n    programmeYear: number;\n    semester: Semester;\n    sortOrder: number;\n  } | null;\n  /**\n   * Completable sections not yet marked Complete (in wizard order) — the\n""",
)

# Backend: enrich the existing read-only progress query from the canonical Active curriculum placement.
replace_once(
    "apps/backend/src/plugins/courses/service.ts",
    """  title: true,\n  specs: {\n    orderBy: CURRENT_SPEC_ORDER,\n    take: 1,\n    select: { sections: { select: { sectionKey: true, status: true } } },\n  },\n} satisfies Prisma.CourseSelect;\n""",
    """  title: true,\n  specs: {\n    orderBy: CURRENT_SPEC_ORDER,\n    take: 1,\n    select: { sections: { select: { sectionKey: true, status: true } } },\n  },\n  curriculumPlacements: {\n    where: { curriculumVersion: { is: { status: \"Active\" } } },\n    orderBy: [\n      { yearLevel: \"asc\" },\n      { semester: \"asc\" },\n      { sortOrder: \"asc\" },\n    ],\n    take: 1,\n    select: { yearLevel: true, semester: true, sortOrder: true },\n  },\n} satisfies Prisma.CourseSelect;\n""",
)
replace_once(
    "apps/backend/src/plugins/courses/service.ts",
    """function toCourseSpecProgress(course: SpecProgressCourse): CourseSpecProgress {\n  const sections = course.specs[0]?.sections ?? [];\n\n  const completedSectionIds = new Set(\n""",
    """function toCourseSpecProgress(course: SpecProgressCourse): CourseSpecProgress {\n  const sections = course.specs[0]?.sections ?? [];\n  const curriculumPlacement = course.curriculumPlacements[0] ?? null;\n\n  const completedSectionIds = new Set(\n""",
)
replace_once(
    "apps/backend/src/plugins/courses/service.ts",
    """    completed: completedSectionIds.size,\n    total: COMPLETABLE_SECTION_IDS.length,\n    incompleteSections,\n""",
    """    completed: completedSectionIds.size,\n    total: COMPLETABLE_SECTION_IDS.length,\n    curriculumPlacement: curriculumPlacement\n      ? {\n          programmeYear: curriculumPlacement.yearLevel,\n          semester: curriculumPlacement.semester,\n          sortOrder: curriculumPlacement.sortOrder,\n        }\n      : null,\n    incompleteSections,\n""",
)

# Pure grouping helper keeps the dashboard component small and testable.
helper = r'''import type { CourseSpecProgress, Semester } from "@dse-pms/shared-types";

export interface CourseSpecSemesterGroup {
  semester: Semester;
  courses: CourseSpecProgress[];
  courseCount: number;
  percent: number;
}

export interface CourseSpecYearGroup {
  programmeYear: number;
  semesters: CourseSpecSemesterGroup[];
  courseCount: number;
  percent: number;
}

export interface CourseSpecUnassignedGroup {
  courses: CourseSpecProgress[];
  courseCount: number;
  percent: number;
}

export interface CourseSpecProgressGroups {
  years: CourseSpecYearGroup[];
  unassigned: CourseSpecUnassignedGroup;
}

const SEMESTER_ORDER: Record<Semester, number> = {
  First: 1,
  Second: 2,
};

export function courseSpecRowsPercent(rows: readonly CourseSpecProgress[]): number {
  const completed = rows.reduce((sum, row) => sum + row.completed, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return total ? Math.round((completed / total) * 100) : 0;
}

function sortCourses(rows: CourseSpecProgress[]): CourseSpecProgress[] {
  return [...rows].sort((a, b) => {
    const aOrder = a.curriculumPlacement?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.curriculumPlacement?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder || a.code.localeCompare(b.code);
  });
}

export function buildCourseSpecProgressGroups(
  rows: readonly CourseSpecProgress[],
): CourseSpecProgressGroups {
  const byYear = new Map<number, Map<Semester, CourseSpecProgress[]>>();
  const unassigned: CourseSpecProgress[] = [];

  for (const row of rows) {
    const placement = row.curriculumPlacement;
    if (!placement || !Number.isInteger(placement.programmeYear) || placement.programmeYear < 1) {
      unassigned.push(row);
      continue;
    }

    const semesters = byYear.get(placement.programmeYear) ?? new Map<Semester, CourseSpecProgress[]>();
    const courses = semesters.get(placement.semester) ?? [];
    courses.push(row);
    semesters.set(placement.semester, courses);
    byYear.set(placement.programmeYear, semesters);
  }

  const years = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([programmeYear, semesters]) => {
      const semesterGroups = [...semesters.entries()]
        .sort(([a], [b]) => SEMESTER_ORDER[a] - SEMESTER_ORDER[b])
        .map(([semester, courses]) => {
          const sortedCourses = sortCourses(courses);
          return {
            semester,
            courses: sortedCourses,
            courseCount: sortedCourses.length,
            percent: courseSpecRowsPercent(sortedCourses),
          };
        });
      const allCourses = semesterGroups.flatMap((group) => group.courses);
      return {
        programmeYear,
        semesters: semesterGroups,
        courseCount: allCourses.length,
        percent: courseSpecRowsPercent(allCourses),
      };
    });

  const sortedUnassigned = [...unassigned].sort((a, b) => a.code.localeCompare(b.code));
  return {
    years,
    unassigned: {
      courses: sortedUnassigned,
      courseCount: sortedUnassigned.length,
      percent: courseSpecRowsPercent(sortedUnassigned),
    },
  };
}
'''
(ROOT / "apps/frontend/app/(shell)/dashboard/course-spec-progress-groups.ts").write_text(helper, encoding="utf-8")

test = r'''import { describe, expect, test } from "bun:test";
import type { CourseSpecProgress } from "@dse-pms/shared-types";
import { buildCourseSpecProgressGroups, courseSpecRowsPercent } from "./course-spec-progress-groups";

function row(
  code: string,
  completed: number,
  placement?: CourseSpecProgress["curriculumPlacement"],
): CourseSpecProgress {
  return {
    courseId: `00000000-0000-4000-8000-${code.padEnd(12, "0").slice(0, 12)}`,
    code,
    title: code,
    completed,
    total: 10,
    curriculumPlacement: placement ?? null,
    incompleteSections: [],
  };
}

describe("Course Specification dashboard grouping", () => {
  test("groups by authoritative curriculum placement, not the course code", () => {
    const grouped = buildCourseSpecProgressGroups([
      row("MAT101", 4, { programmeYear: 2, semester: "First", sortOrder: 0 }),
      row("DSE401", 8, { programmeYear: 4, semester: "Second", sortOrder: 0 }),
      row("BPR101", 7, { programmeYear: 1, semester: "First", sortOrder: 0 }),
    ]);

    expect(grouped.years.map((group) => group.programmeYear)).toEqual([1, 2, 4]);
    expect(grouped.years[1]?.semesters[0]?.courses.map((course) => course.code)).toEqual(["MAT101"]);
  });

  test("orders semester courses by curriculum sort order with code fallback", () => {
    const grouped = buildCourseSpecProgressGroups([
      row("CCC101", 0, { programmeYear: 1, semester: "First", sortOrder: 2 }),
      row("BBB101", 0, { programmeYear: 1, semester: "First", sortOrder: 1 }),
      row("AAA101", 0, { programmeYear: 1, semester: "First", sortOrder: 1 }),
    ]);

    expect(grouped.years[0]?.semesters[0]?.courses.map((course) => course.code)).toEqual([
      "AAA101",
      "BBB101",
      "CCC101",
    ]);
  });

  test("keeps courses without an active curriculum placement visible but separate", () => {
    const grouped = buildCourseSpecProgressGroups([
      row("OLD402", 6),
      row("CUR201", 4, { programmeYear: 2, semester: "Second", sortOrder: 0 }),
    ]);

    expect(grouped.unassigned.courses.map((course) => course.code)).toEqual(["OLD402"]);
    expect(grouped.years[0]?.courseCount).toBe(1);
  });

  test("uses section-weighted completion percentages", () => {
    expect(courseSpecRowsPercent([row("AAA101", 5), row("BBB101", 10)])).toBe(75);
  });
});
'''
(ROOT / "apps/frontend/app/(shell)/dashboard/course-spec-progress-groups.test.ts").write_text(test, encoding="utf-8")

# Dashboard UI: compact Year → Semester accordions with an incomplete-only view.
replace_once(
    "apps/frontend/app/(shell)/dashboard/dashboard-client.tsx",
    'import { lecturersApi } from "@/lib/lecturers";\n',
    'import { lecturersApi } from "@/lib/lecturers";\nimport { buildCourseSpecProgressGroups } from "./course-spec-progress-groups";\n',
)
replace_once(
    "apps/frontend/app/(shell)/dashboard/dashboard-client.tsx",
    """  const [loading, setLoading] = useState(true);\n  const [failedSources, setFailedSources] = useState<string[]>([]);\n  const [state, setState] = useState<LoadState>(EMPTY_STATE);\n""",
    """  const [loading, setLoading] = useState(true);\n  const [failedSources, setFailedSources] = useState<string[]>([]);\n  const [incompleteOnly, setIncompleteOnly] = useState(false);\n  const [state, setState] = useState<LoadState>(EMPTY_STATE);\n""",
)
replace_once(
    "apps/frontend/app/(shell)/dashboard/dashboard-client.tsx",
    """  const overallSpecPercent = totalReady ? Math.round((totalCompleted / totalReady) * 100) : 0;\n\n  const totalEnrolled = offerings.reduce((s, o) => s + o.enrolledCount, 0);\n""",
    """  const overallSpecPercent = totalReady ? Math.round((totalCompleted / totalReady) * 100) : 0;\n  const groupedSpecProgress = buildCourseSpecProgressGroups(specProgress);\n\n  const totalEnrolled = offerings.reduce((s, o) => s + o.enrolledCount, 0);\n""",
)
old_block = '''        {/* Course Specification Progress */}
        <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Course Specification Progress</h3>
          {specProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">No courses yet.</p>
          ) : (
            <div className="flex flex-col gap-5 sm:flex-row">
              <div className="flex shrink-0 justify-center sm:justify-start">
                <CompletionRing value={overallSpecPercent} size={120} label="Overall" />
              </div>
              <ul className="flex-1 space-y-3">
                {specProgress.map((c) => {
                  const percent = c.total ? Math.round((c.completed / c.total) * 100) : 0;
                  return (
                    <li key={c.courseId}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          {c.code} – {c.title}
                        </span>
                        <span className="text-muted-foreground">
                          {c.completed}/{c.total} sections
                        </span>
                      </div>
                      <Progress value={percent} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
'''
new_block = '''        {/* Course Specification Progress */}
        <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Course Specification Progress</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Grouped by the active curriculum year and semester.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={incompleteOnly}
                onChange={(event) => setIncompleteOnly(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Incomplete only
            </label>
          </div>
          {specProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">No courses yet.</p>
          ) : (
            <div className="flex flex-col gap-5 xl:flex-row">
              <div className="flex shrink-0 justify-center xl:justify-start">
                <CompletionRing value={overallSpecPercent} size={120} label="Overall" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {groupedSpecProgress.years.map((year, yearIndex) => {
                  const visibleSemesters = year.semesters
                    .map((semester) => ({
                      ...semester,
                      visibleCourses: incompleteOnly
                        ? semester.courses.filter((course) => course.completed < course.total)
                        : semester.courses,
                    }))
                    .filter((semester) => semester.visibleCourses.length > 0);
                  if (visibleSemesters.length === 0) return null;
                  return (
                    <details
                      key={year.programmeYear}
                      open={yearIndex === 0}
                      className="rounded-lg border border-border bg-background"
                    >
                      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-foreground">
                        <span className="flex items-center justify-between gap-3">
                          <span>Year {year.programmeYear}</span>
                          <span className="shrink-0 text-xs font-normal text-muted-foreground">
                            {year.courseCount} {year.courseCount === 1 ? "course" : "courses"} · {year.percent}%
                          </span>
                        </span>
                      </summary>
                      <div className="space-y-2 border-t border-border p-2">
                        {visibleSemesters.map((semester, semesterIndex) => (
                          <details
                            key={semester.semester}
                            open={semesterIndex === 0}
                            className="rounded-md bg-muted/40"
                          >
                            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-foreground">
                              <span className="flex items-center justify-between gap-3">
                                <span>Semester {semester.semester === "First" ? "1" : "2"}</span>
                                <span className="shrink-0 font-normal text-muted-foreground">
                                  {semester.courseCount} {semester.courseCount === 1 ? "course" : "courses"} · {semester.percent}%
                                </span>
                              </span>
                            </summary>
                            <CourseProgressList courses={semester.visibleCourses} />
                          </details>
                        ))}
                      </div>
                    </details>
                  );
                })}

                {(() => {
                  const visibleUnassigned = incompleteOnly
                    ? groupedSpecProgress.unassigned.courses.filter((course) => course.completed < course.total)
                    : groupedSpecProgress.unassigned.courses;
                  if (visibleUnassigned.length === 0) return null;
                  return (
                    <details className="rounded-lg border border-border bg-background">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-foreground">
                        <span className="flex items-center justify-between gap-3">
                          <span>Unassigned / other courses</span>
                          <span className="shrink-0 text-xs font-normal text-muted-foreground">
                            {groupedSpecProgress.unassigned.courseCount} courses · {groupedSpecProgress.unassigned.percent}%
                          </span>
                        </span>
                      </summary>
                      <div className="border-t border-border">
                        <p className="px-3 pt-2 text-xs text-muted-foreground">
                          No active curriculum placement. Programme year is not guessed from the course code.
                        </p>
                        <CourseProgressList courses={visibleUnassigned} />
                      </div>
                    </details>
                  );
                })()}

                {incompleteOnly &&
                groupedSpecProgress.years.every((year) =>
                  year.semesters.every((semester) =>
                    semester.courses.every((course) => course.completed >= course.total),
                  ),
                ) &&
                groupedSpecProgress.unassigned.courses.every((course) => course.completed >= course.total) ? (
                  <p className="rounded-lg border border-border bg-background px-3 py-4 text-center text-sm text-muted-foreground">
                    All course specifications are complete.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </section>
'''
replace_once(
    "apps/frontend/app/(shell)/dashboard/dashboard-client.tsx",
    old_block,
    new_block,
)
replace_once(
    "apps/frontend/app/(shell)/dashboard/dashboard-client.tsx",
    """function StatTile({\n""",
    """function CourseProgressList({ courses }: { courses: CourseSpecProgress[] }) {\n  return (\n    <ul className=\"space-y-3 px-3 pb-3\">\n      {courses.map((course) => {\n        const percent = course.total\n          ? Math.round((course.completed / course.total) * 100)\n          : 0;\n        return (\n          <li key={course.courseId}>\n            <div className=\"mb-1 flex items-start justify-between gap-3 text-xs\">\n              <span className=\"min-w-0 font-medium text-foreground\">\n                {course.code} – {course.title}\n              </span>\n              <span className=\"shrink-0 text-muted-foreground\">\n                {course.completed}/{course.total} sections\n              </span>\n            </div>\n            <Progress value={percent} />\n          </li>\n        );\n      })}\n    </ul>\n  );\n}\n\nfunction StatTile({\n""",
)

# Remove the unrelated sidebar change from this PR by restoring main and deleting its branch-only helper/tests.
sidebar = subprocess.check_output(
    ["git", "show", "origin/main:apps/frontend/app/(shell)/sidebar.tsx"],
    cwd=ROOT,
    text=True,
)
(ROOT / "apps/frontend/app/(shell)/sidebar.tsx").write_text(sidebar, encoding="utf-8")
for relative in [
    "apps/frontend/app/(shell)/sidebar-active-route.ts",
    "apps/frontend/app/(shell)/sidebar-active-route.test.ts",
]:
    path = ROOT / relative
    if path.exists():
        path.unlink()

print("Dashboard Course Specification progress grouping patch applied.")
