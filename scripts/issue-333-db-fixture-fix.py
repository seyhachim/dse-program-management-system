from pathlib import Path

path = Path("apps/backend/src/plugins/student-portal/results-lifecycle-db.test.ts")
text = path.read_text()
old = '''    const course = await prisma.course.findFirstOrThrow({
      where: { specs: { some: { reviewStatus: "Approved" } } },
      select: { id: true },
    });
    const spec = await prisma.courseSpec.findFirstOrThrow({
      where: { courseId: course.id, reviewStatus: "Approved" },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
      include: { assessmentItems: { where: { status: "Active" }, orderBy: { order: "asc" } } },
    });
'''
new = '''    const spec = await prisma.courseSpec.findFirstOrThrow({
      where: {
        reviewStatus: "Approved",
        assessmentItems: { some: { status: "Active" } },
      },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
      include: { assessmentItems: { where: { status: "Active" }, orderBy: { order: "asc" } } },
    });
'''
if text.count(old) != 1:
    raise SystemExit(f"fixture marker count={text.count(old)}")
text = text.replace(old, new, 1)
text = text.replace('        courseId: course.id,\n', '        courseId: spec.courseId,\n', 1)
path.write_text(text)
