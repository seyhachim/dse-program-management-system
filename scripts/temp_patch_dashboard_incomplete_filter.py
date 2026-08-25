from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected patch anchor not found in {path}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")

replace_once(
    "apps/frontend/app/(shell)/dashboard/course-spec-progress-groups.ts",
    """function sortCourses(rows: CourseSpecProgress[]): CourseSpecProgress[] {\n  return [...rows].sort((a, b) => {\n    const aOrder = a.curriculumPlacement?.sortOrder ?? Number.MAX_SAFE_INTEGER;\n    const bOrder = b.curriculumPlacement?.sortOrder ?? Number.MAX_SAFE_INTEGER;\n    return aOrder - bOrder || a.code.localeCompare(b.code);\n  });\n}\n\nexport function buildCourseSpecProgressGroups(\n""",
    """function sortCourses(rows: CourseSpecProgress[]): CourseSpecProgress[] {\n  return [...rows].sort((a, b) => {\n    const aOrder = a.curriculumPlacement?.sortOrder ?? Number.MAX_SAFE_INTEGER;\n    const bOrder = b.curriculumPlacement?.sortOrder ?? Number.MAX_SAFE_INTEGER;\n    return aOrder - bOrder || a.code.localeCompare(b.code);\n  });\n}\n\nexport function visibleCourseSpecRows(\n  rows: readonly CourseSpecProgress[],\n  incompleteOnly: boolean,\n): CourseSpecProgress[] {\n  return incompleteOnly\n    ? rows.filter((row) => row.completed < row.total)\n    : [...rows];\n}\n\nexport function buildCourseSpecProgressGroups(\n""",
)

replace_once(
    "apps/frontend/app/(shell)/dashboard/course-spec-progress-groups.test.ts",
    'import { buildCourseSpecProgressGroups, courseSpecRowsPercent } from "./course-spec-progress-groups";',
    'import { buildCourseSpecProgressGroups, courseSpecRowsPercent, visibleCourseSpecRows } from "./course-spec-progress-groups";',
)
replace_once(
    "apps/frontend/app/(shell)/dashboard/course-spec-progress-groups.test.ts",
    """  test(\"uses section-weighted completion percentages\", () => {\n    expect(courseSpecRowsPercent([row(\"AAA101\", 5), row(\"BBB101\", 10)])).toBe(75);\n  });\n});\n""",
    """  test(\"filters only fully complete rows when incomplete-only mode is enabled\", () => {\n    const rows = [row(\"AAA101\", 10), row(\"BBB101\", 4), row(\"CCC101\", 0)];\n\n    expect(visibleCourseSpecRows(rows, true).map((course) => course.code)).toEqual([\n      \"BBB101\",\n      \"CCC101\",\n    ]);\n    expect(visibleCourseSpecRows(rows, false).map((course) => course.code)).toEqual([\n      \"AAA101\",\n      \"BBB101\",\n      \"CCC101\",\n    ]);\n  });\n\n  test(\"uses section-weighted completion percentages\", () => {\n    expect(courseSpecRowsPercent([row(\"AAA101\", 5), row(\"BBB101\", 10)])).toBe(75);\n  });\n});\n""",
)

replace_once(
    "apps/frontend/app/(shell)/dashboard/dashboard-client.tsx",
    'import { buildCourseSpecProgressGroups } from "./course-spec-progress-groups";',
    'import { buildCourseSpecProgressGroups, visibleCourseSpecRows } from "./course-spec-progress-groups";',
)
replace_once(
    "apps/frontend/app/(shell)/dashboard/dashboard-client.tsx",
    """                      visibleCourses: incompleteOnly\n                        ? semester.courses.filter((course) => course.completed < course.total)\n                        : semester.courses,\n""",
    """                      visibleCourses: visibleCourseSpecRows(semester.courses, incompleteOnly),\n""",
)
replace_once(
    "apps/frontend/app/(shell)/dashboard/dashboard-client.tsx",
    """                  const visibleUnassigned = incompleteOnly\n                    ? groupedSpecProgress.unassigned.courses.filter((course) => course.completed < course.total)\n                    : groupedSpecProgress.unassigned.courses;\n""",
    """                  const visibleUnassigned = visibleCourseSpecRows(\n                    groupedSpecProgress.unassigned.courses,\n                    incompleteOnly,\n                  );\n""",
)

print("Incomplete-only helper patch applied.")
