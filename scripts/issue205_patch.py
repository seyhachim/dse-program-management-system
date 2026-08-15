from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:80]!r}")
    p.write_text(text.replace(old, new, 1))


schema = Path("apps/backend/prisma/schema.prisma")
text = schema.read_text()
text = text.replace(
'''enum CourseSpecReviewActionType {
  Submitted
  Resubmitted
  ChangesRequested
  Approved
}
''',
'''enum CourseSpecReviewActionType {
  Submitted
  Resubmitted
  ChangesRequested
  Approved
}

enum CourseSpecRevisionType {
  Initial
  Minor
  Major
}

enum CourseSpecRevisionTrigger {
  ScheduledReview
  StudentFeedback
  AlumniFeedback
  EmployerFeedback
  LecturerReflection
  ProgrammeCoordinator
  ExternalExaminer
  QaFinding
  RegulatoryChange
  Other
}
''',
1,
)
text = text.replace('  spec      CourseSpec?\n', '  specs     CourseSpec[]\n', 1)
old_model = '''model CourseSpec {
  id                      String                            @id @default(uuid())
  courseId                String                            @unique
  course                  Course                            @relation(fields: [courseId], references: [id], onDelete: Cascade)
  sections                CourseSpecSection[]
  clos                    CourseSpecClo[]
  weeks                   CourseSpecWeek[]
  assessmentItems         CourseSpecAssessmentItem[]
  mappingCells            CourseSpecMappingCell[]
  resources               CourseSpecResource[]
  studentResponsibilities CourseSpecStudentResponsibility[]
  policy                  CourseSpecPolicy?
  teachingLearning        CourseSpecTeachingLearning?
  weekProjectProgress     CourseSpecWeekProjectProgress[]
  updatedAt               DateTime                          @updatedAt
  createdAt               DateTime                          @default(now())
  reviewStatus            CourseSpecReviewStatus            @default(Draft)
  submissionVersion       Int                               @default(0)
  submittedAt             DateTime?
  submittedById           String?
  submissionNote          String                            @default("")
  submittedBy             User?                             @relation("CourseSpecSubmittedBy", fields: [submittedById], references: [id], onDelete: SetNull)
  reviewActions           CourseSpecReviewAction[]

  @@index([reviewStatus])
  @@index([submittedById])
}
'''
new_model = '''model CourseSpec {
  id                      String                            @id @default(uuid())
  courseId                String
  course                  Course                            @relation(fields: [courseId], references: [id], onDelete: Cascade)
  versionMajor            Int                               @default(1)
  versionMinor            Int                               @default(0)
  revisionType            CourseSpecRevisionType            @default(Initial)
  revisionTriggers        CourseSpecRevisionTrigger[]
  revisionReason          String                            @default("")
  changeSummary           String                            @default("")
  basedOnVersionId        String?
  basedOnVersion          CourseSpec?                       @relation("CourseSpecVersionHistory", fields: [basedOnVersionId], references: [id], onDelete: SetNull)
  derivedVersions         CourseSpec[]                      @relation("CourseSpecVersionHistory")
  sections                CourseSpecSection[]
  clos                    CourseSpecClo[]
  weeks                   CourseSpecWeek[]
  assessmentItems         CourseSpecAssessmentItem[]
  mappingCells            CourseSpecMappingCell[]
  resources               CourseSpecResource[]
  studentResponsibilities CourseSpecStudentResponsibility[]
  policy                  CourseSpecPolicy?
  teachingLearning        CourseSpecTeachingLearning?
  weekProjectProgress     CourseSpecWeekProjectProgress[]
  reviewStatus            CourseSpecReviewStatus            @default(Draft)
  submissionVersion       Int                               @default(0)
  submittedAt             DateTime?
  submittedById           String?
  submissionNote          String                            @default("")
  submittedBy             User?                             @relation("CourseSpecSubmittedBy", fields: [submittedById], references: [id], onDelete: SetNull)
  reviewActions           CourseSpecReviewAction[]
  approvedAt              DateTime?
  effectiveFrom           DateTime?
  nextReviewDueAt         DateTime?
  contentHash             String?
  updatedAt               DateTime                          @updatedAt
  createdAt               DateTime                          @default(now())

  @@unique([courseId, versionMajor, versionMinor])
  @@index([courseId, reviewStatus])
  @@index([reviewStatus])
  @@index([submittedById])
  @@index([nextReviewDueAt])
  @@index([basedOnVersionId])
}
'''
if old_model not in text:
    raise SystemExit("CourseSpec model shape did not match expected source")
text = text.replace(old_model, new_model, 1)
schema.write_text(text)

migration = Path("apps/backend/prisma/migrations/20260815050000_add_course_spec_academic_versions")
migration.mkdir(parents=True, exist_ok=True)
(migration / "migration.sql").write_text('''-- Academic course-specification versioning.
-- submissionVersion intentionally remains the submission-attempt counter.

CREATE TYPE "CourseSpecRevisionType" AS ENUM ('Initial', 'Minor', 'Major');
CREATE TYPE "CourseSpecRevisionTrigger" AS ENUM (
  'ScheduledReview',
  'StudentFeedback',
  'AlumniFeedback',
  'EmployerFeedback',
  'LecturerReflection',
  'ProgrammeCoordinator',
  'ExternalExaminer',
  'QaFinding',
  'RegulatoryChange',
  'Other'
);

ALTER TABLE "CourseSpec"
  ADD COLUMN "versionMajor" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "versionMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "revisionType" "CourseSpecRevisionType" NOT NULL DEFAULT 'Initial',
  ADD COLUMN "revisionTriggers" "CourseSpecRevisionTrigger"[] NOT NULL DEFAULT ARRAY[]::"CourseSpecRevisionTrigger"[],
  ADD COLUMN "revisionReason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "changeSummary" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "basedOnVersionId" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "nextReviewDueAt" TIMESTAMP(3),
  ADD COLUMN "contentHash" TEXT;

-- Existing rows are academic version 1.0 regardless of submissionVersion.
UPDATE "CourseSpec"
SET "versionMajor" = 1,
    "versionMinor" = 0,
    "revisionType" = 'Initial';

-- Recover approval time from the immutable review history where possible.
WITH latest_approval AS (
  SELECT DISTINCT ON ("courseSpecId")
    "courseSpecId",
    "createdAt"
  FROM "CourseSpecReviewAction"
  WHERE "action" = 'Approved'
  ORDER BY "courseSpecId", "createdAt" DESC
)
UPDATE "CourseSpec" AS cs
SET "approvedAt" = latest_approval."createdAt",
    "nextReviewDueAt" = latest_approval."createdAt" + INTERVAL '3 years'
FROM latest_approval
WHERE latest_approval."courseSpecId" = cs."id"
  AND cs."reviewStatus" = 'Approved';

DROP INDEX IF EXISTS "CourseSpec_courseId_key";

CREATE UNIQUE INDEX "CourseSpec_courseId_versionMajor_versionMinor_key"
ON "CourseSpec" ("courseId", "versionMajor", "versionMinor");

CREATE INDEX "CourseSpec_courseId_reviewStatus_idx"
ON "CourseSpec" ("courseId", "reviewStatus");

CREATE INDEX "CourseSpec_nextReviewDueAt_idx"
ON "CourseSpec" ("nextReviewDueAt");

CREATE INDEX "CourseSpec_basedOnVersionId_idx"
ON "CourseSpec" ("basedOnVersionId");

CREATE UNIQUE INDEX "CourseSpec_one_open_revision_per_course"
ON "CourseSpec" ("courseId")
WHERE "reviewStatus" IN (
  'Draft',
  'Submitted',
  'UnderReview',
  'ChangesRequested',
  'Resubmitted'
);

ALTER TABLE "CourseSpec"
ADD CONSTRAINT "CourseSpec_basedOnVersionId_fkey"
FOREIGN KEY ("basedOnVersionId") REFERENCES "CourseSpec"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
''')

# The authoring workspace uses the newest academic version until explicit version
# selection lands in the history UI PR.
p = Path("apps/backend/src/plugins/courses/service.ts")
text = p.read_text()
text = text.replace(
'const COMPLETABLE_SECTION_IDS = COMPLETABLE_SPEC_SECTIONS.map((s) => s.id);',
'''const COMPLETABLE_SECTION_IDS = COMPLETABLE_SPEC_SECTIONS.map((s) => s.id);
const CURRENT_SPEC_ORDER = [
  { versionMajor: "desc" as const },
  { versionMinor: "desc" as const },
];''',
1,
)
text = text.replace(
'''        spec: {
          select: { sections: { select: { sectionKey: true, status: true } } },
        },''',
'''        specs: {
          orderBy: CURRENT_SPEC_ORDER,
          take: 1,
          select: { sections: { select: { sectionKey: true, status: true } } },
        },''',
1,
)
text = text.replace('const sections = course.spec?.sections ?? [];', 'const sections = course.specs[0]?.sections ?? [];', 1)
text = text.replace('prisma.courseSpec.findUnique({', 'prisma.courseSpec.findFirst({')
text = text.replace('tx.courseSpec.findUnique({', 'tx.courseSpec.findFirst({')
# Add deterministic current-version ordering to every courseId-based CourseSpec read.
text = text.replace('where: { courseId },\n      select:', 'where: { courseId },\n      orderBy: CURRENT_SPEC_ORDER,\n      select:')
text = text.replace('where: { courseId },\n      include:', 'where: { courseId },\n      orderBy: CURRENT_SPEC_ORDER,\n      include:')
text = text.replace('courseSpec.findFirst({ where: { courseId } });', 'courseSpec.findFirst({ where: { courseId }, orderBy: CURRENT_SPEC_ORDER });')
text = text.replace('where: { courseId },\n      data:', 'where: { id: spec.id },\n      data:', 3)
p.write_text(text)

for path in [
    "apps/backend/src/plugins/teaching-learning/service.ts",
    "apps/backend/src/plugins/teaching-learning/project-progress-service.ts",
]:
    p = Path(path)
    text = p.read_text()
    text = text.replace('prisma.courseSpec.findUnique({', 'prisma.courseSpec.findFirst({')
    text = text.replace(
        'where: { courseId },\n      select: { id: true, reviewStatus: true },',
        'where: { courseId },\n      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],\n      select: { id: true, reviewStatus: true },',
    )
    text = text.replace(
        'WHERE cs."courseId" = ${courseId}\n      LIMIT 1',
        'WHERE cs."courseId" = ${courseId}\n      ORDER BY cs."versionMajor" DESC, cs."versionMinor" DESC\n      LIMIT 1',
    )
    p.write_text(text)

p = Path("apps/backend/src/plugins/assessment-template/service.ts")
text = p.read_text()
text = text.replace(
'WHERE cs."courseId" = ${courseId}\n    ORDER BY ai."order" ASC',
'''WHERE cs."id" = (
      SELECT current_spec."id"
      FROM "CourseSpec" current_spec
      WHERE current_spec."courseId" = ${courseId}
      ORDER BY current_spec."versionMajor" DESC, current_spec."versionMinor" DESC
      LIMIT 1
    )
    ORDER BY ai."order" ASC''',
1,
)
text = text.replace('tx.courseSpec.findUnique({', 'tx.courseSpec.findFirst({', 1)
text = text.replace(
'where: { courseId },\n        select: { id: true },',
'where: { courseId },\n        orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],\n        select: { id: true },',
1,
)
p.write_text(text)

p = Path("apps/backend/prisma/seed.ts")
text = p.read_text()
text = text.replace(
'''      where: { courseId: cs101.id },
      update: {},
      create: { courseId: cs101.id, reviewStatus: "Approved", submissionVersion: 1 },''',
'''      where: {
        courseId_versionMajor_versionMinor: {
          courseId: cs101.id,
          versionMajor: 1,
          versionMinor: 0,
        },
      },
      update: {},
      create: {
        courseId: cs101.id,
        versionMajor: 1,
        versionMinor: 0,
        reviewStatus: "Approved",
        submissionVersion: 1,
      },''',
1,
)
p.write_text(text)

# Importer/backfill compatibility: target the newest academic version rather than
# relying on courseId uniqueness. Replacement semantics still remove only the
# chosen spec row; historical-version-aware import behavior can evolve separately.
for path in [
    "apps/backend/scripts/course-spec-import.ts",
    "apps/backend/scripts/course-spec-template-backfill.ts",
]:
    p = Path(path)
    text = p.read_text()
    text = text.replace('spec: {', 'specs: {', 1)
    text = text.replace('course.spec?', 'course.specs[0]?')
    text = text.replace('course.spec.', 'course.specs[0].')
    text = text.replace('tx.courseSpec.findUnique({', 'tx.courseSpec.findFirst({')
    text = text.replace('where: { courseId: course.id },\n', 'where: { courseId: course.id },\n      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],\n')
    text = text.replace('await tx.courseSpec.delete({ where: { courseId: course.id } });', 'await tx.courseSpec.delete({ where: { id: oldSpec.id } });')
    p.write_text(text)
