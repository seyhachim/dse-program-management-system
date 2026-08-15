from pathlib import Path


def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)

# Student portal temporarily resolves the newest APPROVED version until Offering
# gets an explicit courseSpecId in issue #211.
p = Path("apps/backend/src/plugins/student-portal/service.ts")
text = p.read_text()
text = one(text, 'import { prisma } from "../../core/db/prisma.ts";', 'import { Prisma } from "@prisma/client";\nimport { prisma } from "../../core/db/prisma.ts";', "portal Prisma import")
text = one(text, '''          spec: {
            include: {
              clos: { orderBy: { order: "asc" as const } },
              weeks: { orderBy: { order: "asc" as const } },
              assessmentItems: { orderBy: { order: "asc" as const } },
              resources: { orderBy: { order: "asc" as const } },
            },
          },''', '''          specs: {
            where: { reviewStatus: "Approved" },
            orderBy: [
              { versionMajor: "desc" },
              { versionMinor: "desc" },
            ],
            take: 1,
            include: {
              clos: { orderBy: { order: "asc" } },
              weeks: { orderBy: { order: "asc" } },
              assessmentItems: { orderBy: { order: "asc" } },
              resources: { orderBy: { order: "asc" } },
            },
          },''', "portal enrollment spec")
text = one(text, '} as const;\n\ntype EnrollmentRow', '} satisfies Prisma.EnrollmentInclude;\n\ntype EnrollmentRow', "portal include typing")
text = one(text, '  const spec = row.offering.course.spec;\n  return spec?.reviewStatus === "Approved" ? spec : null;', '  return row.offering.course.specs[0] ?? null;', "portal approved helper")
text = one(text, 'include: { coLecturers: true, course: { select: { spec: { select: { id: true } } } } },', '''include: {
      coLecturers: true,
      course: {
        select: {
          specs: {
            where: { reviewStatus: "Approved" },
            orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
            take: 1,
            select: { id: true },
          },
        },
      },
    },''', "portal offering editor spec")
text = one(text, 'include: { offering: { include: { course: { include: { spec: { include: { assessmentItems: true } } } } } } },', '''include: {
        offering: {
          include: {
            course: {
              include: {
                specs: {
                  where: { reviewStatus: "Approved" },
                  orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
                  take: 1,
                  include: { assessmentItems: true },
                },
              },
            },
          },
        },
      },''', "portal publish result spec")
text = one(text, '    const spec = enrollment.offering.course.spec;', '    const spec = enrollment.offering.course.specs[0];', "portal result spec access")
text = text.replace('offering.course.spec?.id', 'offering.course.specs[0]?.id')
text = text.replace('offering.course.spec.id', 'offering.course.specs[0]!.id')
p.write_text(text)

# The first patch already renamed the import relation key to specs and converted
# the direct CourseSpec read/delete to findFirst/by-id. Finish relation selection
# and property access here.
p = Path("apps/backend/scripts/course-spec-import.ts")
text = p.read_text()
text = one(text, 'include: { specs: { select: { id: true } } },', '''include: {
      specs: {
        orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
        take: 1,
        select: { id: true },
      },
    },''', "import relation")
text = text.replace('existingCourse?.spec &&', 'existingCourse?.specs[0] &&')
text = text.replace('existingCourse?.spec ?', 'existingCourse?.specs[0] ?')
p.write_text(text)

# Same for the one-off course-spec template backfill: operate on newest version.
p = Path("apps/backend/scripts/course-spec-template-backfill.ts")
text = p.read_text()
text = one(text, '      specs: {\n        include:', '''      specs: {
        orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
        take: 1,
        include:''', "template relation")
text = text.replace('stored?.spec', 'stored?.specs[0]')
text = text.replace('stored.spec!', 'stored.specs[0]!')
text = text.replace('stored.spec.', 'stored.specs[0].')
p.write_text(text)
