from pathlib import Path


def must_replace(text: str, old: str, new: str, label: str, count: int = 1) -> str:
    found = text.count(old)
    if found != count:
        raise SystemExit(f"{label}: expected {count} matches, found {found}")
    return text.replace(old, new, count)

# Student portal: until Offering.courseSpecId lands in PR 8, historical/student
# reads use the newest APPROVED academic version only. A newer draft must never
# leak into the student portal.
p = Path("apps/backend/src/plugins/student-portal/service.ts")
text = p.read_text()
text = must_replace(
    text,
'''          spec: {
            include: {
              clos: { orderBy: { order: "asc" as const } },
              weeks: { orderBy: { order: "asc" as const } },
              assessmentItems: { orderBy: { order: "asc" as const } },
              resources: { orderBy: { order: "asc" as const } },
            },
          },''',
'''          specs: {
            where: { reviewStatus: "Approved" as const },
            orderBy: [
              { versionMajor: "desc" as const },
              { versionMinor: "desc" as const },
            ],
            take: 1,
            include: {
              clos: { orderBy: { order: "asc" as const } },
              weeks: { orderBy: { order: "asc" as const } },
              assessmentItems: { orderBy: { order: "asc" as const } },
              resources: { orderBy: { order: "asc" as const } },
            },
          },''',
    "student enrollment include",
)
text = must_replace(
    text,
'  const spec = row.offering.course.spec;\n  return spec?.reviewStatus === "Approved" ? spec : null;',
'  return row.offering.course.specs[0] ?? null;',
    "approvedSpec helper",
)
text = must_replace(
    text,
'include: { coLecturers: true, course: { select: { spec: { select: { id: true } } } } },',
'''include: {
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
    },''',
    "offering editor approved spec",
)
text = must_replace(
    text,
'include: { offering: { include: { course: { include: { spec: { include: { assessmentItems: true } } } } } } },',
'''include: {
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
      },''',
    "publish result approved spec",
)
text = must_replace(
    text,
'    const spec = enrollment.offering.course.spec;',
'    const spec = enrollment.offering.course.specs[0];',
    "publish result spec access",
)
text = text.replace('offering.course.spec?.id', 'offering.course.specs[0]?.id')
text = text.replace('offering.course.spec.id', 'offering.course.specs[0]!.id')
p.write_text(text)

# Importer: preserving existing academic history is safer than deleting every
# version. --replace-existing replaces only the newest version selected here.
p = Path("apps/backend/scripts/course-spec-import.ts")
text = p.read_text()
text = must_replace(
    text,
'include: { spec: { select: { id: true } } },',
'''include: {
      specs: {
        orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
        take: 1,
        select: { id: true },
      },
    },''',
    "import existing course include",
)
text = must_replace(text, 'existingCourse?.spec && !options.replaceExisting', 'existingCourse?.specs[0] && !options.replaceExisting', "import skip existing")
text = must_replace(
    text,
'''    const oldSpec = await tx.courseSpec.findUnique({
      where: { courseId: course.id },
      select: { id: true },
    });''',
'''    const oldSpec = await tx.courseSpec.findFirst({
      where: { courseId: course.id },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
      select: { id: true },
    });''',
    "import newest spec query",
)
text = must_replace(
    text,
'await tx.courseSpec.delete({ where: { courseId: course.id } });',
'await tx.courseSpec.delete({ where: { id: oldSpec.id } });',
    "import replace spec delete",
)
text = must_replace(text, 'action: existingCourse?.spec ? "replaced" : "created",', 'action: existingCourse?.specs[0] ? "replaced" : "created",', "import result action")
p.write_text(text)

# Template backfill: operate on the newest academic version deterministically.
p = Path("apps/backend/scripts/course-spec-template-backfill.ts")
text = p.read_text()
text = must_replace(text, '      spec: {\n        include:', '''      specs: {
        orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
        take: 1,
        include:''', "template include")
text = text.replace('stored?.spec', 'stored?.specs[0]')
text = text.replace('stored.spec!', 'stored.specs[0]!')
text = text.replace('stored.spec.', 'stored.specs[0].')
p.write_text(text)
