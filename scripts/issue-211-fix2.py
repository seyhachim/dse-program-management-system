from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count}, found {actual}: {old[:120]!r}")
    p.write_text(text.replace(old, new, count))

service = "apps/backend/src/plugins/student-portal/service.ts"
replace(
    service,
    '  const deadlines = new Map(\n    offering.assessmentDeadlines.map((deadline) => [deadline.assessmentItemId, deadline.dueAt]),\n  );\n',
    '  const deadlines = new Map(\n'
    '    offering.assessmentDeadlines\n'
    '      .filter((deadline) => deadline.courseSpecId === spec?.id)\n'
    '      .map((deadline) => [deadline.assessmentItemId, deadline.dueAt]),\n'
    '  );\n',
)
replace(
    service,
    '  const spec = approvedSpec(row);\n  const deadlines = new Map(\n    row.offering.assessmentDeadlines.map((deadline) => [deadline.assessmentItemId, deadline.dueAt]),\n  );\n  const resultByAssessment = new Map(\n    row.results\n      .filter((result) => result.courseSpecId === spec?.id)\n      .map((result) => [result.assessmentItemId, result]),\n  );\n',
    '  const spec = approvedSpec(row);\n'
    '  const exactResults = row.results.filter((result) => result.courseSpecId === spec?.id);\n'
    '  const deadlines = new Map(\n'
    '    row.offering.assessmentDeadlines\n'
    '      .filter((deadline) => deadline.courseSpecId === spec?.id)\n'
    '      .map((deadline) => [deadline.assessmentItemId, deadline.dueAt]),\n'
    '  );\n'
    '  const resultByAssessment = new Map(\n'
    '    exactResults.map((result) => [result.assessmentItemId, result]),\n'
    '  );\n',
)
replace(
    service,
    '    ? calculateCloAchievements(spec.clos, spec.assessmentItems, row.results, criterionMappings)\n',
    '    ? calculateCloAchievements(spec.clos, spec.assessmentItems, exactResults, criterionMappings)\n',
)
replace(
    service,
    '    ? calculateCourseGrade(spec.assessmentItems, row.results)\n',
    '    ? calculateCourseGrade(spec.assessmentItems, exactResults)\n',
)

seed = "apps/backend/prisma/seed.ts"
replace(
    seed,
    '    const spec = await prisma.courseSpec.upsert({\n      where: {\n        courseId_versionMajor_versionMinor: {\n          courseId: cs101.id,\n          versionMajor: 1,\n          versionMinor: 0,\n        },\n      },\n      update: {},\n      create: {\n        courseId: cs101.id,\n        versionMajor: 1,\n        versionMinor: 0,\n        reviewStatus: "Approved",\n        submissionVersion: 1,\n      },\n    });\n',
    '    const spec = await prisma.courseSpec.upsert({\n      where: {\n        courseId_versionMajor_versionMinor: {\n          courseId: cs101.id,\n          versionMajor: 1,\n          versionMinor: 0,\n        },\n      },\n      update: {},\n      create: {\n        courseId: cs101.id,\n        versionMajor: 1,\n        versionMinor: 0,\n        reviewStatus: "Approved",\n        submissionVersion: 1,\n      },\n    });\n'
    '    // Direct seed writes bypass the Offering API, so explicitly establish the\n'
    '    // same exact Approved CourseSpec binding required for real new offerings.\n'
    '    await prisma.offering.update({\n'
    '      where: { id: offering.id },\n'
    '      data: { courseSpecId: spec.id },\n'
    '    });\n',
)

migration = "apps/backend/prisma/migrations/20260817070000_bind_offerings_course_spec_versions/migration.sql"
replace(
    migration,
    'BEFORE INSERT OR UPDATE OF "courseSpecId" ON "Offering"\n',
    'BEFORE INSERT OR UPDATE OF "courseSpecId", "courseId" ON "Offering"\n',
)

Path(__file__).unlink(missing_ok=True)
