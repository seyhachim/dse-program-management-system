from pathlib import Path


def one(path, old, new):
    p = Path(path)
    text = p.read_text()
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"{path}: expected 1 match, got {n}: {old[:70]!r}")
    p.write_text(text.replace(old, new, 1))

# Prisma relation + normalized model.
p = Path("apps/backend/prisma/schema.prisma")
text = p.read_text()
text = text.replace(
'  derivedVersions         CourseSpec[]                      @relation("CourseSpecVersionHistory")\n  sections',
'  derivedVersions         CourseSpec[]                      @relation("CourseSpecVersionHistory")\n  courseInfoSnapshot      CourseSpecCourseInfo?\n  sections',
1,
)
marker = '/// Immutable workflow events for Course Specification submission/review actions.\n'
model = '''/// Immutable/version-specific Course Information snapshot. Administrative course,
/// lecturer, programme and latest-offering values are captured once for the
/// academic version so later live edits cannot rewrite an approved document.
model CourseSpecCourseInfo {
  courseSpecId          String     @id
  courseSpec            CourseSpec @relation(fields: [courseSpecId], references: [id], onDelete: Cascade)
  courseCode            String
  courseTitle           String
  courseDescription     String     @default("")
  credits               Int?
  courseType            CourseType?
  prerequisites         String     @default("")
  totalSltHours         Int?
  lecturerName          String     @default("")
  lecturerTitle         String     @default("")
  lecturerQualification String     @default("")
  lecturerEmail         String     @default("")
  lecturerPhone         String     @default("")
  otherLecturers        String     @default("")
  semester              Semester?
  programmeYear         Int?
  programmeCode         String     @default("")
  programmeName         String     @default("")
  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt
}

'''
if marker not in text: raise SystemExit("schema marker missing")
text = text.replace(marker, model + marker, 1)
p.write_text(text)

# API read model includes total SLT so document renderers can prefer the snapshot.
one(
  "packages/shared-types/src/course-spec.ts",
  '  credits: z.coerce.number().int().min(1).max(30).nullable().optional(),\n  courseType:',
  '  credits: z.coerce.number().int().min(1).max(30).nullable().optional(),\n  totalSltHours: z.coerce.number().int().nonnegative().nullable().optional(),\n  courseType:',
)

# Course service: include snapshot, write it instead of mutating Course, and read it.
p = Path("apps/backend/src/plugins/courses/service.ts")
text = p.read_text()
text = text.replace(
'const SPEC_INCLUDE = {\n  sections: true,',
'const SPEC_INCLUDE = {\n  courseInfoSnapshot: true,\n  sections: true,',
1,
)
text = text.replace(
'    data.courseInfo = await buildCourseInfoPrefill(course);',
'    data.courseInfo = await courseInfoForSpec(spec, course);',
)
text = text.replace(
'    let course = await prisma.course.findUnique({ where: { id: courseId } });\n    if (!course) throw new ReferenceError("Course not found");\n\n    await prisma.$transaction(async (tx) => {',
'''    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new ReferenceError("Course not found");
    const courseInfoBaseline =
      sectionId === "courseInfo" ? await buildCourseInfoPrefill(course) : null;

    await prisma.$transaction(async (tx) => {''',
1,
)
old = '''      if (sectionId === "courseInfo") {
        const info = values as CourseInfoInput;
        course = await tx.course.update({
          where: { id: courseId },
          data: {
            prerequisites: info.prerequisites || null,
            description: info.description || null,
          },
        });
      }
'''
new = '''      if (sectionId === "courseInfo" && courseInfoBaseline) {
        const info = values as CourseInfoInput;
        await tx.courseSpecCourseInfo.upsert({
          where: { courseSpecId: spec.id },
          create: snapshotCreateData(
            spec.id,
            courseInfoBaseline,
            info.prerequisites ?? courseInfoBaseline.prerequisites ?? "",
            info.description ?? courseInfoBaseline.description ?? "",
          ),
          update: {
            prerequisites: info.prerequisites ?? "",
            courseDescription: info.description ?? "",
          },
        });
      }
'''
if old not in text: raise SystemExit("courseInfo save block missing")
text = text.replace(old,new,1)
# Add total SLT to live baseline.
text = text.replace(
'    credits: course.credits,\n    prerequisites:',
'    credits: course.credits,\n    totalSltHours: (course as typeof course & { totalSltHours?: number | null }).totalSltHours ?? null,\n    prerequisites:',
1,
)
# Existing build helper input type needs totalSltHours.
text = text.replace(
'  credits: number | null;\n  prerequisites:',
'  credits: number | null;\n  totalSltHours?: number | null;\n  prerequisites:',
1,
)
# Append conversion helpers before exported CourseService type.
insert = '''
async function courseInfoForSpec(
  spec: SpecRow | null,
  course: Parameters<typeof buildCourseInfoPrefill>[0],
): Promise<CourseInfoSection> {
  const row = spec?.courseInfoSnapshot;
  if (!row) return buildCourseInfoPrefill(course);
  return {
    courseTitle: row.courseTitle,
    courseCode: row.courseCode,
    credits: row.credits,
    totalSltHours: row.totalSltHours,
    prerequisites: row.prerequisites,
    courseType: row.courseType,
    description: row.courseDescription,
    instructorName: row.lecturerName,
    qualification: row.lecturerQualification,
    email: row.lecturerEmail,
    telephone: row.lecturerPhone,
    otherLecturers: row.otherLecturers,
    semester: row.semester,
    programmeYear: row.programmeYear,
  };
}

function snapshotCreateData(
  courseSpecId: string,
  baseline: CourseInfoSection,
  prerequisites: string,
  description: string,
) {
  return {
    courseSpecId,
    courseCode: baseline.courseCode,
    courseTitle: baseline.courseTitle,
    courseDescription: description,
    credits: baseline.credits ?? null,
    courseType: baseline.courseType ?? null,
    prerequisites,
    totalSltHours: baseline.totalSltHours ?? null,
    lecturerName: baseline.instructorName ?? "",
    lecturerTitle: "",
    lecturerQualification: baseline.qualification ?? "",
    lecturerEmail: baseline.email ?? "",
    lecturerPhone: baseline.telephone ?? "",
    otherLecturers: baseline.otherLecturers ?? "",
    semester: baseline.semester ?? null,
    programmeYear: baseline.programmeYear ?? null,
    programmeCode: "",
    programmeName: "",
  };
}

'''
marker2 = 'export type CourseService = typeof courseService;'
if marker2 not in text: raise SystemExit("CourseService marker missing")
text = text.replace(marker2, insert + marker2,1)
p.write_text(text)

# Revision clone must carry the exact source snapshot into the new version.
p = Path("apps/backend/src/plugins/courses/revision-service.ts")
text = p.read_text()
text = text.replace('const SOURCE_INCLUDE = {\n  sections: true,', 'const SOURCE_INCLUDE = {\n  courseInfoSnapshot: true,\n  sections: true,',1)
marker3 = '  if (source.sections.length > 0) {'
clone = '''  if (source.courseInfoSnapshot) {
    const row = source.courseInfoSnapshot;
    await tx.courseSpecCourseInfo.create({
      data: {
        courseSpecId: targetCourseSpecId,
        courseCode: row.courseCode,
        courseTitle: row.courseTitle,
        courseDescription: row.courseDescription,
        credits: row.credits,
        courseType: row.courseType,
        prerequisites: row.prerequisites,
        totalSltHours: row.totalSltHours,
        lecturerName: row.lecturerName,
        lecturerTitle: row.lecturerTitle,
        lecturerQualification: row.lecturerQualification,
        lecturerEmail: row.lecturerEmail,
        lecturerPhone: row.lecturerPhone,
        otherLecturers: row.otherLecturers,
        semester: row.semester,
        programmeYear: row.programmeYear,
        programmeCode: row.programmeCode,
        programmeName: row.programmeName,
      },
    });
  }

'''
if marker3 not in text: raise SystemExit("clone marker missing")
text = text.replace(marker3, clone+marker3,1)
p.write_text(text)

# Preview and Word share buildCourseDocument; prefer snapshot total SLT if present.
p = Path("apps/frontend/app/(shell)/courses/[id]/spec/course-document-model.ts")
text = p.read_text()
text = text.replace('      courseTotalSlt,\n    );', '      courseInfo.totalSltHours ?? courseTotalSlt,\n    );', 1)
p.write_text(text)
