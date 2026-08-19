from pathlib import Path
import re

ROOT = Path('.')


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one occurrence, found {count}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, repl: str, flags: int = 0) -> None:
    text = read(path)
    new, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{path}: regex expected one occurrence, found {count}: {pattern[:120]!r}')
    write(path, new)


# ---------------------------------------------------------------------------
# Prisma schema: additive group-assessment provenance and correction sources.
# ---------------------------------------------------------------------------
schema = 'apps/backend/prisma/schema.prisma'
replace_once(
    schema,
    '''enum AssessmentItemMode {\n  Individual\n  Group\n}\n''',
    '''enum AssessmentItemMode {\n  Individual\n  Group\n  GroupIndividual\n}\n\nenum AssessmentGroupAuditAction {\n  GroupsConfigured\n  MembershipLocked\n  GroupScoreSaved\n  GroupCriterionScoresSaved\n  IndividualComponentSaved\n  IndividualCriterionScoresSaved\n  ResultsMaterialized\n  Published\n  Finalized\n  GroupScoreCorrected\n  IndividualComponentCorrected\n}\n''',
)
replace_once(
    schema,
    '  assessmentResultCorrections      AssessmentResultCorrection[]     @relation("AssessmentResultCorrectionActor")\n',
    '  assessmentResultCorrections      AssessmentResultCorrection[]     @relation("AssessmentResultCorrectionActor")\n'
    '  assessmentGroupsCreated          AssessmentGroup[]                @relation("AssessmentGroupCreatedBy")\n'
    '  assessmentGroupScoresRecorded    AssessmentGroupScore[]           @relation("AssessmentGroupScoreActor")\n'
    '  assessmentIndividualScoresRecorded AssessmentIndividualComponent[] @relation("AssessmentIndividualComponentActor")\n'
    '  assessmentGroupAuditEvents       AssessmentGroupAuditEvent[]      @relation("AssessmentGroupAuditActor")\n'
    '  assessmentGroupScoreCorrections  AssessmentGroupScoreCorrection[] @relation("AssessmentGroupScoreCorrectionActor")\n'
    '  assessmentIndividualCorrections  AssessmentIndividualComponentCorrection[] @relation("AssessmentIndividualComponentCorrectionActor")\n',
)
replace_once(
    schema,
    '  mode                AssessmentItemMode   @default(Individual)\n  status              AssessmentItemStatus @default(Active)\n',
    '  mode                AssessmentItemMode   @default(Individual)\n'
    '  groupWeight         Float?\n'
    '  individualWeight    Float?\n'
    '  individualCriterionIds String[]          @default([])\n'
    '  status              AssessmentItemStatus @default(Active)\n',
)
replace_once(
    schema,
    '  criterionCloMappings CourseSpecCriterionCloMapping[]\n  mappedPlos          String[]             @default([])\n',
    '  criterionCloMappings CourseSpecCriterionCloMapping[]\n'
    '  assessmentGroups     AssessmentGroup[]\n'
    '  mappedPlos          String[]             @default([])\n',
)
replace_once(
    schema,
    '  resultAccessPolicy             OfferingResultAccessPolicy?\n',
    '  resultAccessPolicy             OfferingResultAccessPolicy?\n  assessmentGroups               AssessmentGroup[]\n',
)
replace_once(
    schema,
    '  results    AssessmentResult[]\n\n  @@unique([offeringId, studentId])\n',
    '  results                       AssessmentResult[]\n'
    '  assessmentGroupMemberships    AssessmentGroupMember[]\n'
    '  assessmentIndividualComponents AssessmentIndividualComponent[]\n\n'
    '  @@unique([offeringId, studentId])\n',
)

new_models = r'''
/// Offering + assessment scoped group snapshot. Membership becomes immutable as
/// soon as scoring starts and publication/finalization provenance is retained.
model AssessmentGroup {
  id                 String                   @id @default(uuid())
  offeringId         String
  offering           Offering                 @relation(fields: [offeringId], references: [id], onDelete: Restrict)
  courseSpecId       String
  assessmentItemId   String
  assessmentItem     CourseSpecAssessmentItem @relation(fields: [courseSpecId, assessmentItemId], references: [courseSpecId, id], onDelete: Restrict)
  name               String
  sortOrder          Int                      @default(0)
  membershipLockedAt DateTime?
  publishedAt        DateTime?
  finalizedAt        DateTime?
  createdById        String
  createdBy          User                     @relation("AssessmentGroupCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  createdAt          DateTime                 @default(now())
  updatedAt          DateTime                 @updatedAt

  members              AssessmentGroupMember[]
  score                AssessmentGroupScore?
  individualComponents AssessmentIndividualComponent[]

  @@unique([id, offeringId, courseSpecId, assessmentItemId])
  @@unique([offeringId, courseSpecId, assessmentItemId, name])
  @@index([offeringId, assessmentItemId, sortOrder])
  @@index([createdById])
}

/// Immutable-at-publication membership snapshot. Student identity fields are
/// copied so later profile edits cannot reinterpret historical group evidence.
model AssessmentGroupMember {
  id                    String          @id @default(uuid())
  groupId               String
  offeringId            String
  courseSpecId          String
  assessmentItemId      String
  group                  AssessmentGroup @relation(fields: [groupId, offeringId, courseSpecId, assessmentItemId], references: [id, offeringId, courseSpecId, assessmentItemId], onDelete: Cascade)
  enrollmentId          String
  enrollment            Enrollment      @relation(fields: [enrollmentId], references: [id], onDelete: Restrict)
  studentIdSnapshot     String
  studentCodeSnapshot   String
  studentNameSnapshot   String
  createdAt             DateTime        @default(now())

  @@unique([offeringId, courseSpecId, assessmentItemId, enrollmentId])
  @@index([groupId])
  @@index([enrollmentId])
}

/// One shared draft score for a group. It is provenance only; final student
/// grades are materialized into AssessmentResult rows.
model AssessmentGroupScore {
  id                String          @id @default(uuid())
  groupId           String          @unique
  group             AssessmentGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  score             Float
  maxScore          Float
  feedback          String          @default("")
  rubricId          String?
  rubricContentHash String?
  scoredById        String
  scoredBy          User            @relation("AssessmentGroupScoreActor", fields: [scoredById], references: [id], onDelete: Restrict)
  criterionScores   AssessmentGroupCriterionScore[]
  corrections       AssessmentGroupScoreCorrection[]
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  @@index([scoredById])
}

model AssessmentGroupCriterionScore {
  id                String               @id @default(uuid())
  groupScoreId      String
  groupScore        AssessmentGroupScore @relation(fields: [groupScoreId], references: [id], onDelete: Cascade)
  rubricId          String
  criterionId       String
  criterionName     String
  rubricContentHash String
  score             Float
  maxScore          Float
  rubricLevelId     String?
  rubricLevelLabel  String?
  createdAt         DateTime             @default(now())
  updatedAt         DateTime             @updatedAt

  @@unique([groupScoreId, rubricId, criterionId])
  @@index([rubricId, criterionId])
}

/// Per-student component used only by GroupIndividual assessments. The optional
/// adjustment is explicit and reasoned; it is included in deterministic materialization.
model AssessmentIndividualComponent {
  id                 String          @id @default(uuid())
  groupId            String
  offeringId         String
  courseSpecId       String
  assessmentItemId   String
  group              AssessmentGroup @relation(fields: [groupId, offeringId, courseSpecId, assessmentItemId], references: [id, offeringId, courseSpecId, assessmentItemId], onDelete: Cascade)
  enrollmentId       String
  enrollment         Enrollment      @relation(fields: [enrollmentId], references: [id], onDelete: Restrict)
  score              Float
  maxScore           Float
  feedback           String          @default("")
  adjustmentPoints   Float           @default(0)
  adjustmentReason   String          @default("")
  scoredById         String
  scoredBy           User            @relation("AssessmentIndividualComponentActor", fields: [scoredById], references: [id], onDelete: Restrict)
  criterionScores    AssessmentIndividualCriterionScore[]
  corrections        AssessmentIndividualComponentCorrection[]
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  @@unique([enrollmentId, courseSpecId, assessmentItemId])
  @@index([groupId])
  @@index([scoredById])
}

model AssessmentIndividualCriterionScore {
  id                String                        @id @default(uuid())
  componentId       String
  component         AssessmentIndividualComponent @relation(fields: [componentId], references: [id], onDelete: Cascade)
  rubricId          String
  criterionId       String
  criterionName     String
  rubricContentHash String
  score             Float
  maxScore          Float
  rubricLevelId     String?
  rubricLevelLabel  String?
  createdAt         DateTime                      @default(now())
  updatedAt         DateTime                      @updatedAt

  @@unique([componentId, rubricId, criterionId])
  @@index([rubricId, criterionId])
}

/// Structured source correction for a finalized shared group score. Student-level
/// official history is additionally recorded in AssessmentResultCorrection.
model AssessmentGroupScoreCorrection {
  id             String               @id @default(uuid())
  groupScoreId   String
  groupScore     AssessmentGroupScore @relation(fields: [groupScoreId], references: [id], onDelete: Restrict)
  beforeScore    Float
  beforeMaxScore Float
  beforeFeedback String
  afterScore     Float
  afterMaxScore  Float
  afterFeedback  String
  reason         String
  correctedById  String
  correctedBy    User                 @relation("AssessmentGroupScoreCorrectionActor", fields: [correctedById], references: [id], onDelete: Restrict)
  createdAt      DateTime             @default(now())

  @@index([groupScoreId, createdAt])
  @@index([correctedById])
}

model AssessmentIndividualComponentCorrection {
  id                       String                        @id @default(uuid())
  componentId              String
  component                AssessmentIndividualComponent @relation(fields: [componentId], references: [id], onDelete: Restrict)
  beforeScore              Float
  beforeMaxScore           Float
  beforeFeedback           String
  beforeAdjustmentPoints   Float
  beforeAdjustmentReason   String
  afterScore               Float
  afterMaxScore            Float
  afterFeedback            String
  afterAdjustmentPoints    Float
  afterAdjustmentReason    String
  reason                   String
  correctedById            String
  correctedBy              User                          @relation("AssessmentIndividualComponentCorrectionActor", fields: [correctedById], references: [id], onDelete: Restrict)
  createdAt                DateTime                      @default(now())

  @@index([componentId, createdAt])
  @@index([correctedById])
}

/// Append-only operational + academic provenance for group configuration and
/// scoring lifecycle actions. IDs in details are snapshots, not mutable links.
model AssessmentGroupAuditEvent {
  id               String                     @id @default(uuid())
  offeringId       String
  courseSpecId     String
  assessmentItemId String
  groupId          String?
  enrollmentId     String?
  action           AssessmentGroupAuditAction
  actorId          String
  actor            User                       @relation("AssessmentGroupAuditActor", fields: [actorId], references: [id], onDelete: Restrict)
  reason           String                     @default("")
  details          Json?
  createdAt        DateTime                   @default(now())

  @@index([offeringId, assessmentItemId, createdAt])
  @@index([groupId, createdAt])
  @@index([enrollmentId, createdAt])
  @@index([actorId])
}

'''
replace_once(schema, '/// Section-level notices. Draft notices have a null `publishedAt` and never\n', new_models + '/// Section-level notices. Draft notices have a null `publishedAt` and never\n')

# ---------------------------------------------------------------------------
# Migration. No historical result/group backfill is attempted.
# ---------------------------------------------------------------------------
migration = r'''-- Issue #449: first-class Individual / Group / Group+Individual result provenance.
-- Existing per-student AssessmentResult rows remain authoritative and untouched.

ALTER TYPE "AssessmentItemMode" ADD VALUE IF NOT EXISTS 'GroupIndividual';

CREATE TYPE "AssessmentGroupAuditAction" AS ENUM (
  'GroupsConfigured',
  'MembershipLocked',
  'GroupScoreSaved',
  'GroupCriterionScoresSaved',
  'IndividualComponentSaved',
  'IndividualCriterionScoresSaved',
  'ResultsMaterialized',
  'Published',
  'Finalized',
  'GroupScoreCorrected',
  'IndividualComponentCorrected'
);

ALTER TABLE "CourseSpecAssessmentItem"
  ADD COLUMN "groupWeight" DOUBLE PRECISION,
  ADD COLUMN "individualWeight" DOUBLE PRECISION,
  ADD COLUMN "individualCriterionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "CourseSpecAssessmentItem"
  ADD CONSTRAINT "CourseSpecAssessmentItem_groupWeight_range" CHECK ("groupWeight" IS NULL OR ("groupWeight" > 0 AND "groupWeight" <= 100)),
  ADD CONSTRAINT "CourseSpecAssessmentItem_individualWeight_range" CHECK ("individualWeight" IS NULL OR ("individualWeight" > 0 AND "individualWeight" <= 100)),
  ADD CONSTRAINT "CourseSpecAssessmentItem_group_individual_weights" CHECK (
    "mode" <> 'GroupIndividual'
    OR ("groupWeight" IS NOT NULL AND "individualWeight" IS NOT NULL AND abs(("groupWeight" + "individualWeight") - 100) < 0.000001)
  );

CREATE TABLE "AssessmentGroup" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "assessmentItemId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "membershipLockedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "finalizedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentGroup_identity_key" UNIQUE ("id", "offeringId", "courseSpecId", "assessmentItemId"),
  CONSTRAINT "AssessmentGroup_name_key" UNIQUE ("offeringId", "courseSpecId", "assessmentItemId", "name")
);

CREATE TABLE "AssessmentGroupMember" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "assessmentItemId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "studentIdSnapshot" TEXT NOT NULL,
  "studentCodeSnapshot" TEXT NOT NULL,
  "studentNameSnapshot" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentGroupMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentGroupMember_one_group_per_assessment_key" UNIQUE ("offeringId", "courseSpecId", "assessmentItemId", "enrollmentId")
);

CREATE TABLE "AssessmentGroupScore" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "maxScore" DOUBLE PRECISION NOT NULL,
  "feedback" TEXT NOT NULL DEFAULT '',
  "rubricId" TEXT,
  "rubricContentHash" TEXT,
  "scoredById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentGroupScore_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentGroupScore_groupId_key" UNIQUE ("groupId"),
  CONSTRAINT "AssessmentGroupScore_score_nonnegative" CHECK ("score" >= 0),
  CONSTRAINT "AssessmentGroupScore_max_positive" CHECK ("maxScore" > 0),
  CONSTRAINT "AssessmentGroupScore_score_lte_max" CHECK ("score" <= "maxScore")
);

CREATE TABLE "AssessmentGroupCriterionScore" (
  "id" TEXT NOT NULL,
  "groupScoreId" TEXT NOT NULL,
  "rubricId" TEXT NOT NULL,
  "criterionId" TEXT NOT NULL,
  "criterionName" TEXT NOT NULL,
  "rubricContentHash" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "maxScore" DOUBLE PRECISION NOT NULL,
  "rubricLevelId" TEXT,
  "rubricLevelLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentGroupCriterionScore_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentGroupCriterionScore_key" UNIQUE ("groupScoreId", "rubricId", "criterionId"),
  CONSTRAINT "AssessmentGroupCriterionScore_score_nonnegative" CHECK ("score" >= 0),
  CONSTRAINT "AssessmentGroupCriterionScore_max_positive" CHECK ("maxScore" > 0),
  CONSTRAINT "AssessmentGroupCriterionScore_score_lte_max" CHECK ("score" <= "maxScore")
);

CREATE TABLE "AssessmentIndividualComponent" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "assessmentItemId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "maxScore" DOUBLE PRECISION NOT NULL,
  "feedback" TEXT NOT NULL DEFAULT '',
  "adjustmentPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "adjustmentReason" TEXT NOT NULL DEFAULT '',
  "scoredById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentIndividualComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentIndividualComponent_key" UNIQUE ("enrollmentId", "courseSpecId", "assessmentItemId"),
  CONSTRAINT "AssessmentIndividualComponent_score_nonnegative" CHECK ("score" >= 0),
  CONSTRAINT "AssessmentIndividualComponent_max_positive" CHECK ("maxScore" > 0),
  CONSTRAINT "AssessmentIndividualComponent_adjusted_range" CHECK (("score" + "adjustmentPoints") >= 0 AND ("score" + "adjustmentPoints") <= "maxScore"),
  CONSTRAINT "AssessmentIndividualComponent_adjustment_reason" CHECK ("adjustmentPoints" = 0 OR length(btrim("adjustmentReason")) > 0)
);

CREATE TABLE "AssessmentIndividualCriterionScore" (
  "id" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "rubricId" TEXT NOT NULL,
  "criterionId" TEXT NOT NULL,
  "criterionName" TEXT NOT NULL,
  "rubricContentHash" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "maxScore" DOUBLE PRECISION NOT NULL,
  "rubricLevelId" TEXT,
  "rubricLevelLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentIndividualCriterionScore_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentIndividualCriterionScore_key" UNIQUE ("componentId", "rubricId", "criterionId"),
  CONSTRAINT "AssessmentIndividualCriterionScore_score_nonnegative" CHECK ("score" >= 0),
  CONSTRAINT "AssessmentIndividualCriterionScore_max_positive" CHECK ("maxScore" > 0),
  CONSTRAINT "AssessmentIndividualCriterionScore_score_lte_max" CHECK ("score" <= "maxScore")
);

CREATE TABLE "AssessmentGroupScoreCorrection" (
  "id" TEXT NOT NULL,
  "groupScoreId" TEXT NOT NULL,
  "beforeScore" DOUBLE PRECISION NOT NULL,
  "beforeMaxScore" DOUBLE PRECISION NOT NULL,
  "beforeFeedback" TEXT NOT NULL,
  "afterScore" DOUBLE PRECISION NOT NULL,
  "afterMaxScore" DOUBLE PRECISION NOT NULL,
  "afterFeedback" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "correctedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentGroupScoreCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentGroupScoreCorrection_reason" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "AssessmentGroupScoreCorrection_after_range" CHECK ("afterScore" >= 0 AND "afterMaxScore" > 0 AND "afterScore" <= "afterMaxScore")
);

CREATE TABLE "AssessmentIndividualComponentCorrection" (
  "id" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "beforeScore" DOUBLE PRECISION NOT NULL,
  "beforeMaxScore" DOUBLE PRECISION NOT NULL,
  "beforeFeedback" TEXT NOT NULL,
  "beforeAdjustmentPoints" DOUBLE PRECISION NOT NULL,
  "beforeAdjustmentReason" TEXT NOT NULL,
  "afterScore" DOUBLE PRECISION NOT NULL,
  "afterMaxScore" DOUBLE PRECISION NOT NULL,
  "afterFeedback" TEXT NOT NULL,
  "afterAdjustmentPoints" DOUBLE PRECISION NOT NULL,
  "afterAdjustmentReason" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "correctedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentIndividualComponentCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentIndividualComponentCorrection_reason" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "AssessmentIndividualComponentCorrection_after_range" CHECK (("afterScore" + "afterAdjustmentPoints") >= 0 AND "afterMaxScore" > 0 AND ("afterScore" + "afterAdjustmentPoints") <= "afterMaxScore"),
  CONSTRAINT "AssessmentIndividualComponentCorrection_adjustment_reason" CHECK ("afterAdjustmentPoints" = 0 OR length(btrim("afterAdjustmentReason")) > 0)
);

CREATE TABLE "AssessmentGroupAuditEvent" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "assessmentItemId" TEXT NOT NULL,
  "groupId" TEXT,
  "enrollmentId" TEXT,
  "action" "AssessmentGroupAuditAction" NOT NULL,
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentGroupAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssessmentGroup_offering_assessment_idx" ON "AssessmentGroup"("offeringId", "assessmentItemId", "sortOrder");
CREATE INDEX "AssessmentGroup_createdById_idx" ON "AssessmentGroup"("createdById");
CREATE INDEX "AssessmentGroupMember_groupId_idx" ON "AssessmentGroupMember"("groupId");
CREATE INDEX "AssessmentGroupMember_enrollmentId_idx" ON "AssessmentGroupMember"("enrollmentId");
CREATE INDEX "AssessmentGroupScore_scoredById_idx" ON "AssessmentGroupScore"("scoredById");
CREATE INDEX "AssessmentGroupCriterionScore_rubric_idx" ON "AssessmentGroupCriterionScore"("rubricId", "criterionId");
CREATE INDEX "AssessmentIndividualComponent_groupId_idx" ON "AssessmentIndividualComponent"("groupId");
CREATE INDEX "AssessmentIndividualComponent_scoredById_idx" ON "AssessmentIndividualComponent"("scoredById");
CREATE INDEX "AssessmentIndividualCriterionScore_rubric_idx" ON "AssessmentIndividualCriterionScore"("rubricId", "criterionId");
CREATE INDEX "AssessmentGroupScoreCorrection_score_created_idx" ON "AssessmentGroupScoreCorrection"("groupScoreId", "createdAt");
CREATE INDEX "AssessmentGroupScoreCorrection_actor_idx" ON "AssessmentGroupScoreCorrection"("correctedById");
CREATE INDEX "AssessmentIndividualComponentCorrection_component_created_idx" ON "AssessmentIndividualComponentCorrection"("componentId", "createdAt");
CREATE INDEX "AssessmentIndividualComponentCorrection_actor_idx" ON "AssessmentIndividualComponentCorrection"("correctedById");
CREATE INDEX "AssessmentGroupAuditEvent_assessment_created_idx" ON "AssessmentGroupAuditEvent"("offeringId", "assessmentItemId", "createdAt");
CREATE INDEX "AssessmentGroupAuditEvent_group_created_idx" ON "AssessmentGroupAuditEvent"("groupId", "createdAt");
CREATE INDEX "AssessmentGroupAuditEvent_enrollment_created_idx" ON "AssessmentGroupAuditEvent"("enrollmentId", "createdAt");
CREATE INDEX "AssessmentGroupAuditEvent_actor_idx" ON "AssessmentGroupAuditEvent"("actorId");

ALTER TABLE "AssessmentGroup" ADD CONSTRAINT "AssessmentGroup_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentGroup" ADD CONSTRAINT "AssessmentGroup_assessment_fkey" FOREIGN KEY ("courseSpecId", "assessmentItemId") REFERENCES "CourseSpecAssessmentItem"("courseSpecId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentGroup" ADD CONSTRAINT "AssessmentGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentGroupMember" ADD CONSTRAINT "AssessmentGroupMember_group_fkey" FOREIGN KEY ("groupId", "offeringId", "courseSpecId", "assessmentItemId") REFERENCES "AssessmentGroup"("id", "offeringId", "courseSpecId", "assessmentItemId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentGroupMember" ADD CONSTRAINT "AssessmentGroupMember_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentGroupScore" ADD CONSTRAINT "AssessmentGroupScore_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AssessmentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentGroupScore" ADD CONSTRAINT "AssessmentGroupScore_scoredById_fkey" FOREIGN KEY ("scoredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentGroupCriterionScore" ADD CONSTRAINT "AssessmentGroupCriterionScore_groupScoreId_fkey" FOREIGN KEY ("groupScoreId") REFERENCES "AssessmentGroupScore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentIndividualComponent" ADD CONSTRAINT "AssessmentIndividualComponent_group_fkey" FOREIGN KEY ("groupId", "offeringId", "courseSpecId", "assessmentItemId") REFERENCES "AssessmentGroup"("id", "offeringId", "courseSpecId", "assessmentItemId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentIndividualComponent" ADD CONSTRAINT "AssessmentIndividualComponent_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentIndividualComponent" ADD CONSTRAINT "AssessmentIndividualComponent_scoredById_fkey" FOREIGN KEY ("scoredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentIndividualCriterionScore" ADD CONSTRAINT "AssessmentIndividualCriterionScore_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "AssessmentIndividualComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentGroupScoreCorrection" ADD CONSTRAINT "AssessmentGroupScoreCorrection_groupScoreId_fkey" FOREIGN KEY ("groupScoreId") REFERENCES "AssessmentGroupScore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentGroupScoreCorrection" ADD CONSTRAINT "AssessmentGroupScoreCorrection_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentIndividualComponentCorrection" ADD CONSTRAINT "AssessmentIndividualComponentCorrection_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "AssessmentIndividualComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentIndividualComponentCorrection" ADD CONSTRAINT "AssessmentIndividualComponentCorrection_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentGroupAuditEvent" ADD CONSTRAINT "AssessmentGroupAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Membership is editable only before scoring starts. Updating publication/finalization
-- timestamps is allowed after membership lock; identity/name/membership are not.
CREATE OR REPLACE FUNCTION "protect_assessment_group_membership"()
RETURNS TRIGGER AS $$
DECLARE locked_at TIMESTAMP(3);
BEGIN
  IF TG_TABLE_NAME = 'AssessmentGroup' THEN
    IF TG_OP = 'DELETE' AND OLD."membershipLockedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Assessment group membership is locked because scoring has started';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."membershipLockedAt" IS NOT NULL AND (
      NEW."offeringId" IS DISTINCT FROM OLD."offeringId" OR
      NEW."courseSpecId" IS DISTINCT FROM OLD."courseSpecId" OR
      NEW."assessmentItemId" IS DISTINCT FROM OLD."assessmentItemId" OR
      NEW."name" IS DISTINCT FROM OLD."name" OR
      NEW."sortOrder" IS DISTINCT FROM OLD."sortOrder" OR
      NEW."membershipLockedAt" IS DISTINCT FROM OLD."membershipLockedAt" OR
      NEW."createdById" IS DISTINCT FROM OLD."createdById"
    ) THEN
      RAISE EXCEPTION 'Assessment group identity and membership lock are immutable after scoring starts';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT "membershipLockedAt" INTO locked_at FROM "AssessmentGroup"
  WHERE "id" = COALESCE(NEW."groupId", OLD."groupId");
  IF locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Assessment group membership is locked because scoring has started';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AssessmentGroup_protect_membership"
BEFORE UPDATE OR DELETE ON "AssessmentGroup"
FOR EACH ROW EXECUTE FUNCTION "protect_assessment_group_membership"();
CREATE TRIGGER "AssessmentGroupMember_protect_membership"
BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentGroupMember"
FOR EACH ROW EXECUTE FUNCTION "protect_assessment_group_membership"();

CREATE OR REPLACE FUNCTION "protect_assessment_group_score_source"()
RETURNS TRIGGER AS $$
DECLARE published_at TIMESTAMP(3); finalized_at TIMESTAMP(3);
BEGIN
  SELECT "publishedAt", "finalizedAt" INTO published_at, finalized_at
  FROM "AssessmentGroup" WHERE "id" = COALESCE(NEW."groupId", OLD."groupId");
  IF TG_OP = 'DELETE' AND published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Published group score source cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND published_at IS NOT NULL THEN
    IF finalized_at IS NULL THEN
      RAISE EXCEPTION 'Published group score source is locked';
    END IF;
    IF NEW."score" IS DISTINCT FROM OLD."score" OR NEW."maxScore" IS DISTINCT FROM OLD."maxScore" OR NEW."feedback" IS DISTINCT FROM OLD."feedback" THEN
      IF NOT EXISTS (
        SELECT 1 FROM "AssessmentGroupScoreCorrection" c
        WHERE c."id" = NULLIF(current_setting('dse.group_score_correction_id', true), '')
          AND c."groupScoreId" = OLD."id"
          AND c."beforeScore" IS NOT DISTINCT FROM OLD."score"
          AND c."beforeMaxScore" IS NOT DISTINCT FROM OLD."maxScore"
          AND c."beforeFeedback" IS NOT DISTINCT FROM OLD."feedback"
          AND c."afterScore" IS NOT DISTINCT FROM NEW."score"
          AND c."afterMaxScore" IS NOT DISTINCT FROM NEW."maxScore"
          AND c."afterFeedback" IS NOT DISTINCT FROM NEW."feedback"
      ) THEN
        RAISE EXCEPTION 'Finalized group score requires a matching append-only source correction';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AssessmentGroupScore_protect_source"
BEFORE UPDATE OR DELETE ON "AssessmentGroupScore"
FOR EACH ROW EXECUTE FUNCTION "protect_assessment_group_score_source"();

CREATE OR REPLACE FUNCTION "protect_assessment_individual_source"()
RETURNS TRIGGER AS $$
DECLARE published_at TIMESTAMP(3); finalized_at TIMESTAMP(3);
BEGIN
  SELECT g."publishedAt", g."finalizedAt" INTO published_at, finalized_at
  FROM "AssessmentGroup" g WHERE g."id" = COALESCE(NEW."groupId", OLD."groupId");
  IF TG_OP = 'DELETE' AND published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Published individual assessment source cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND published_at IS NOT NULL THEN
    IF finalized_at IS NULL THEN
      RAISE EXCEPTION 'Published individual assessment source is locked';
    END IF;
    IF NEW."score" IS DISTINCT FROM OLD."score" OR NEW."maxScore" IS DISTINCT FROM OLD."maxScore" OR NEW."feedback" IS DISTINCT FROM OLD."feedback" OR NEW."adjustmentPoints" IS DISTINCT FROM OLD."adjustmentPoints" OR NEW."adjustmentReason" IS DISTINCT FROM OLD."adjustmentReason" THEN
      IF NOT EXISTS (
        SELECT 1 FROM "AssessmentIndividualComponentCorrection" c
        WHERE c."id" = NULLIF(current_setting('dse.individual_component_correction_id', true), '')
          AND c."componentId" = OLD."id"
          AND c."beforeScore" IS NOT DISTINCT FROM OLD."score"
          AND c."beforeMaxScore" IS NOT DISTINCT FROM OLD."maxScore"
          AND c."beforeFeedback" IS NOT DISTINCT FROM OLD."feedback"
          AND c."beforeAdjustmentPoints" IS NOT DISTINCT FROM OLD."adjustmentPoints"
          AND c."beforeAdjustmentReason" IS NOT DISTINCT FROM OLD."adjustmentReason"
          AND c."afterScore" IS NOT DISTINCT FROM NEW."score"
          AND c."afterMaxScore" IS NOT DISTINCT FROM NEW."maxScore"
          AND c."afterFeedback" IS NOT DISTINCT FROM NEW."feedback"
          AND c."afterAdjustmentPoints" IS NOT DISTINCT FROM NEW."adjustmentPoints"
          AND c."afterAdjustmentReason" IS NOT DISTINCT FROM NEW."adjustmentReason"
      ) THEN
        RAISE EXCEPTION 'Finalized individual component requires a matching append-only source correction';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AssessmentIndividualComponent_protect_source"
BEFORE UPDATE OR DELETE ON "AssessmentIndividualComponent"
FOR EACH ROW EXECUTE FUNCTION "protect_assessment_individual_source"();

CREATE OR REPLACE FUNCTION "protect_assessment_group_criterion_source"()
RETURNS TRIGGER AS $$
DECLARE published_at TIMESTAMP(3);
BEGIN
  SELECT g."publishedAt" INTO published_at
  FROM "AssessmentGroup" g
  LEFT JOIN "AssessmentGroupScore" s ON s."groupId" = g."id"
  LEFT JOIN "AssessmentIndividualComponent" i ON i."groupId" = g."id"
  WHERE (TG_TABLE_NAME = 'AssessmentGroupCriterionScore' AND s."id" = COALESCE(NEW."groupScoreId", OLD."groupScoreId"))
     OR (TG_TABLE_NAME = 'AssessmentIndividualCriterionScore' AND i."id" = COALESCE(NEW."componentId", OLD."componentId"))
  LIMIT 1;
  IF published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Published rubric criterion source evidence is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AssessmentGroupCriterionScore_protect_source"
BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentGroupCriterionScore"
FOR EACH ROW EXECUTE FUNCTION "protect_assessment_group_criterion_source"();
CREATE TRIGGER "AssessmentIndividualCriterionScore_protect_source"
BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentIndividualCriterionScore"
FOR EACH ROW EXECUTE FUNCTION "protect_assessment_group_criterion_source"();

CREATE OR REPLACE FUNCTION "protect_assessment_group_append_only"()
RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'Assessment group audit/correction history is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "AssessmentGroupAuditEvent_append_only" BEFORE UPDATE OR DELETE ON "AssessmentGroupAuditEvent" FOR EACH ROW EXECUTE FUNCTION "protect_assessment_group_append_only"();
CREATE TRIGGER "AssessmentGroupScoreCorrection_append_only" BEFORE UPDATE OR DELETE ON "AssessmentGroupScoreCorrection" FOR EACH ROW EXECUTE FUNCTION "protect_assessment_group_append_only"();
CREATE TRIGGER "AssessmentIndividualComponentCorrection_append_only" BEFORE UPDATE OR DELETE ON "AssessmentIndividualComponentCorrection" FOR EACH ROW EXECUTE FUNCTION "protect_assessment_group_append_only"();

-- Once any group is locked, freeze the offering roster just as finalized results do.
CREATE OR REPLACE FUNCTION "protect_roster_after_result_finalization"()
RETURNS TRIGGER AS $$
DECLARE old_offering_id TEXT; new_offering_id TEXT;
BEGIN
  old_offering_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD."offeringId" END;
  new_offering_id := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW."offeringId" END;
  PERFORM 1 FROM "Offering" WHERE "id" IN (old_offering_id, new_offering_id) ORDER BY "id" FOR UPDATE;
  IF old_offering_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM "AssessmentResult" ar JOIN "Enrollment" e ON e."id" = ar."enrollmentId" WHERE e."offeringId" = old_offering_id AND ar."finalizedAt" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "AssessmentGroup" g WHERE g."offeringId" = old_offering_id AND g."membershipLockedAt" IS NOT NULL)
  ) THEN RAISE EXCEPTION 'Offering roster is locked because finalized results or group scoring evidence exists'; END IF;
  IF new_offering_id IS NOT NULL AND new_offering_id IS DISTINCT FROM old_offering_id AND (
    EXISTS (SELECT 1 FROM "AssessmentResult" ar JOIN "Enrollment" e ON e."id" = ar."enrollmentId" WHERE e."offeringId" = new_offering_id AND ar."finalizedAt" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "AssessmentGroup" g WHERE g."offeringId" = new_offering_id AND g."membershipLockedAt" IS NOT NULL)
  ) THEN RAISE EXCEPTION 'Offering roster is locked because finalized results or group scoring evidence exists'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE "AssessmentGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentGroupMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentGroupScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentGroupCriterionScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentIndividualComponent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentIndividualCriterionScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentGroupScoreCorrection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentIndividualComponentCorrection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentGroupAuditEvent" ENABLE ROW LEVEL SECURITY;
'''
write('apps/backend/prisma/migrations/20260819220000_add_group_assessment_results/migration.sql', migration)

# ---------------------------------------------------------------------------
# Shared CourseSpec contract.
# ---------------------------------------------------------------------------
course_spec = 'packages/shared-types/src/course-spec.ts'
replace_once(
    course_spec,
    '''export const GROUP_INDIVIDUAL: readonly { code: string; name: string }[] = [\n  { code: "I", name: "Individual" },\n  { code: "G", name: "Group" },\n] as const;''',
    '''export const GROUP_INDIVIDUAL: readonly { code: string; name: string }[] = [\n  { code: "I", name: "Individual" },\n  { code: "G", name: "Group" },\n  { code: "GI", name: "Group + Individual" },\n] as const;''',
)
replace_once(course_spec, 'export const AssessmentMode = z.enum(["individual", "group"]);', 'export const AssessmentMode = z.enum(["individual", "group", "group_individual"]);')
replace_once(
    course_spec,
    '  mode: AssessmentMode.default("individual"),\n  status: AssessmentStatus.default("active"),\n',
    '  mode: AssessmentMode.default("individual"),\n'
    '  groupWeight: z.coerce.number().gt(0).max(100).nullable().default(null),\n'
    '  individualWeight: z.coerce.number().gt(0).max(100).nullable().default(null),\n'
    '  individualCriterionIds: z.array(z.string().min(1)).default([]),\n'
    '  status: AssessmentStatus.default("active"),\n',
)
regex_once(
    course_spec,
    r'(export const AssessmentItem = z\.object\(\{.*?\n  notes: z\.string\(\)\.default\(""\),\n\}\));',
    r'''\1.superRefine((value, ctx) => {
  if (value.mode !== "group_individual") return;
  if (value.groupWeight === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["groupWeight"], message: "Group weight is required" });
  }
  if (value.individualWeight === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["individualWeight"], message: "Individual weight is required" });
  }
  if (value.groupWeight !== null && value.individualWeight !== null && Math.abs(value.groupWeight + value.individualWeight - 100) > 0.000001) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["individualWeight"], message: "Group and individual weights must total 100%" });
  }
});''',
    flags=re.S,
)

# ---------------------------------------------------------------------------
# Shared student-portal contracts + group workspace APIs.
# ---------------------------------------------------------------------------
portal = 'packages/shared-types/src/student-portal.ts'
replace_once(portal, 'mode: "individual" | "group";', 'mode: "individual" | "group" | "group_individual";')
# The same declaration appears twice (detail and overview). Replace the second too.
text = read(portal)
text = text.replace('mode: "individual" | "group";', 'mode: "individual" | "group" | "group_individual";')
write(portal, text)
replace_once(
    portal,
    '''export interface PortalRubricCriterion {\n  id: string;\n  name: string;\n  cloCodes: string[];\n  levels: Array<{ id: string; label: string; points: number }>;\n}''',
    '''export interface PortalRubricCriterion {\n  id: string;\n  name: string;\n  cloCodes: string[];\n  scoringScope?: "group" | "individual";\n  levels: Array<{ id: string; label: string; points: number }>;\n}''',
)
replace_once(
    portal,
    '''export interface CourseDeliveryRubricCriterion {\n  id: string;\n  name: string;\n  cloCodes: string[];\n  levels: Array<{ id: string; label: string; points: number }>;\n}''',
    '''export interface CourseDeliveryRubricCriterion {\n  id: string;\n  name: string;\n  cloCodes: string[];\n  scoringScope: "group" | "individual";\n  levels: Array<{ id: string; label: string; points: number }>;\n}''',
)
replace_once(
    portal,
    '''export interface CourseDeliveryAssessment {\n  id: string;\n  name: string;\n  type: string;\n  weight: number | null;''',
    '''export interface CourseDeliveryAssessment {\n  id: string;\n  name: string;\n  type: string;\n  mode: "individual" | "group" | "group_individual";\n  groupWeight: number | null;\n  individualWeight: number | null;\n  weight: number | null;''',
)

workspace_contracts = r'''

export const SaveAssessmentGroupsInput = z.object({
  groups: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    enrollmentIds: z.array(z.string().uuid()),
  })).min(1),
}).superRefine((value, ctx) => {
  const names = new Set<string>();
  const members = new Set<string>();
  value.groups.forEach((group, groupIndex) => {
    const name = group.name.toLocaleLowerCase();
    if (names.has(name)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["groups", groupIndex, "name"], message: "Group names must be unique" });
    names.add(name);
    group.enrollmentIds.forEach((id, memberIndex) => {
      if (members.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["groups", groupIndex, "enrollmentIds", memberIndex], message: "A student can belong to only one group" });
      members.add(id);
    });
  });
});
export type SaveAssessmentGroupsInput = z.infer<typeof SaveAssessmentGroupsInput>;

export const SaveAssessmentGroupScoreInput = z.object({
  score: z.coerce.number().min(0),
  maxScore: z.coerce.number().positive(),
  feedback: z.string().trim().max(5000).default(""),
}).refine((value) => value.score <= value.maxScore, { message: "Score cannot exceed maximum score", path: ["score"] });
export type SaveAssessmentGroupScoreInput = z.infer<typeof SaveAssessmentGroupScoreInput>;

export const SaveAssessmentSourceCriterionScoresInput = z.object({
  scores: z.array(z.object({
    criterionId: z.string().min(1),
    score: z.coerce.number().min(0),
    rubricLevelId: z.string().nullable().optional(),
  })),
});
export type SaveAssessmentSourceCriterionScoresInput = z.infer<typeof SaveAssessmentSourceCriterionScoresInput>;

export const SaveAssessmentIndividualComponentInput = z.object({
  score: z.coerce.number().min(0),
  maxScore: z.coerce.number().positive(),
  feedback: z.string().trim().max(5000).default(""),
  adjustmentPoints: z.coerce.number().default(0),
  adjustmentReason: z.string().trim().max(2000).default(""),
}).superRefine((value, ctx) => {
  const adjusted = value.score + value.adjustmentPoints;
  if (adjusted < 0 || adjusted > value.maxScore) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["adjustmentPoints"], message: "Adjusted score must remain between 0 and the maximum score" });
  if (value.adjustmentPoints !== 0 && !value.adjustmentReason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["adjustmentReason"], message: "An adjustment reason is required" });
});
export type SaveAssessmentIndividualComponentInput = z.infer<typeof SaveAssessmentIndividualComponentInput>;

export const CorrectAssessmentGroupScoreInput = SaveAssessmentGroupScoreInput.extend({
  reason: z.string().trim().min(1).max(2000),
  expectedUpdatedAt: z.string().datetime(),
});
export type CorrectAssessmentGroupScoreInput = z.infer<typeof CorrectAssessmentGroupScoreInput>;

export const CorrectAssessmentIndividualComponentInput = SaveAssessmentIndividualComponentInput.extend({
  reason: z.string().trim().min(1).max(2000),
  expectedUpdatedAt: z.string().datetime(),
});
export type CorrectAssessmentIndividualComponentInput = z.infer<typeof CorrectAssessmentIndividualComponentInput>;

export interface GroupAssessmentWorkspace {
  offeringId: string;
  courseSpecId: string;
  assessmentItemId: string;
  assessmentName: string;
  mode: "group" | "group_individual";
  groupWeight: number | null;
  individualWeight: number | null;
  enrollments: Array<{ enrollmentId: string; studentId: string; studentCode: string; studentName: string }>;
  rubricId: string | null;
  rubricName: string;
  rubricContentHash: string | null;
  rubricCriteria: CourseDeliveryRubricCriterion[];
  groups: Array<{
    id: string;
    name: string;
    sortOrder: number;
    membershipLockedAt: string | null;
    publishedAt: string | null;
    finalizedAt: string | null;
    members: Array<{ enrollmentId: string; studentId: string; studentCode: string; studentName: string }>;
    score: null | {
      id: string;
      score: number;
      maxScore: number;
      feedback: string;
      updatedAt: string;
      criterionScores: CourseDeliveryCriterionScore[];
    };
    individualComponents: Array<{
      id: string;
      enrollmentId: string;
      score: number;
      maxScore: number;
      feedback: string;
      adjustmentPoints: number;
      adjustmentReason: string;
      updatedAt: string;
      criterionScores: CourseDeliveryCriterionScore[];
    }>;
  }>;
  readiness: {
    readyToPublish: boolean;
    unassignedEnrollmentIds: string[];
    emptyGroupIds: string[];
    missingGroupScoreIds: string[];
    missingGroupCriterionGroupIds: string[];
    missingIndividualEnrollmentIds: string[];
    missingIndividualCriterionEnrollmentIds: string[];
    invalidWeightConfiguration: boolean;
  };
  audit: Array<{ id: string; action: string; groupId: string | null; enrollmentId: string | null; actorName: string; reason: string; createdAt: string }>;
}
'''
replace_once(portal, '\n/** Lecturer-only calculation preview. Draft marks are included and must never be sent to student endpoints. */\n', workspace_contracts + '\n/** Lecturer-only calculation preview. Draft marks are included and must never be sent to student endpoints. */\n')

# ---------------------------------------------------------------------------
# CourseSpec persistence / reassembly.
# ---------------------------------------------------------------------------
courses_service = 'apps/backend/src/plugins/courses/service.ts'
replace_once(
    courses_service,
    '        mode: item.mode === "Group" ? "group" : "individual",\n',
    '        mode: item.mode === "Group" ? "group" : item.mode === "GroupIndividual" ? "group_individual" : "individual",\n'
    '        groupWeight: item.groupWeight,\n'
    '        individualWeight: item.individualWeight,\n'
    '        individualCriterionIds: item.individualCriterionIds,\n',
)
replace_once(
    courses_service,
    '        mode: item.mode === "group" ? ("Group" as const) : ("Individual" as const),\n',
    '        mode: item.mode === "group" ? ("Group" as const) : item.mode === "group_individual" ? ("GroupIndividual" as const) : ("Individual" as const),\n'
    '        groupWeight: item.mode === "group_individual" ? item.groupWeight : null,\n'
    '        individualWeight: item.mode === "group_individual" ? item.individualWeight : null,\n'
    '        individualCriterionIds: item.mode === "group_individual" ? item.individualCriterionIds : [],\n',
)

# ---------------------------------------------------------------------------
# Security verifier inventory.
# ---------------------------------------------------------------------------
security = 'apps/backend/scripts/verify-db-security.ts'
replace_once(
    security,
    '  "AssessmentCriterionScore",\n',
    '  "AssessmentCriterionScore",\n'
    '  "AssessmentGroup",\n'
    '  "AssessmentGroupMember",\n'
    '  "AssessmentGroupScore",\n'
    '  "AssessmentGroupCriterionScore",\n'
    '  "AssessmentIndividualComponent",\n'
    '  "AssessmentIndividualCriterionScore",\n'
    '  "AssessmentGroupScoreCorrection",\n'
    '  "AssessmentIndividualComponentCorrection",\n'
    '  "AssessmentGroupAuditEvent",\n',
)

# ---------------------------------------------------------------------------
# Shared result-management authorization helper.
# ---------------------------------------------------------------------------
write('apps/backend/src/plugins/student-portal/result-management-access.ts', r'''export function canManageOfferingResults(
  authorId: string,
  programmeWide: boolean,
  lecturerId: string | null,
  coLecturerIds: string[],
): boolean {
  return programmeWide || lecturerId === authorId || coLecturerIds.includes(authorId);
}
''')

# ---------------------------------------------------------------------------
# Group assessment service. Final per-student rows stay in AssessmentResult.
# ---------------------------------------------------------------------------
group_service = r'''import type {
  CorrectAssessmentGroupScoreInput,
  CorrectAssessmentIndividualComponentInput,
  FinalizeAssessmentResultsInput,
  FinalizeAssessmentResultsResponse,
  GroupAssessmentWorkspace,
  PublishAssessmentResultsInput,
  PublishAssessmentResultsResponse,
  SaveAssessmentGroupScoreInput,
  SaveAssessmentGroupsInput,
  SaveAssessmentIndividualComponentInput,
  SaveAssessmentSourceCriterionScoresInput,
} from "@dse-pms/shared-types";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import { rubricContentHash } from "../../core/academic/rubric-context.ts";
import { canManageOfferingResults } from "./result-management-access.ts";
import { PortalAccessError, PortalConflictError, PortalNotFoundError } from "./service.ts";

type Db = Prisma.TransactionClient | PrismaClient;

type DerivedInput = {
  mode: "Group" | "GroupIndividual";
  groupScore: number;
  groupMaxScore: number;
  groupFeedback?: string;
  groupWeight?: number | null;
  individualScore?: number | null;
  individualMaxScore?: number | null;
  individualFeedback?: string;
  individualWeight?: number | null;
  adjustmentPoints?: number;
  adjustmentReason?: string;
};

export function calculateDerivedGroupResult(input: DerivedInput): { score: number; maxScore: number; feedback: string } {
  if (input.groupMaxScore <= 0 || input.groupScore < 0 || input.groupScore > input.groupMaxScore) {
    throw new PortalConflictError("Group score is outside its valid range");
  }
  if (input.mode === "Group") {
    return { score: input.groupScore, maxScore: input.groupMaxScore, feedback: input.groupFeedback ?? "" };
  }
  if (input.groupWeight === null || input.groupWeight === undefined || input.individualWeight === null || input.individualWeight === undefined || Math.abs(input.groupWeight + input.individualWeight - 100) > 0.000001) {
    throw new PortalConflictError("Group + Individual weights must total 100%");
  }
  if (input.individualScore === null || input.individualScore === undefined || input.individualMaxScore === null || input.individualMaxScore === undefined || input.individualMaxScore <= 0) {
    throw new PortalConflictError("Individual component is incomplete");
  }
  const adjusted = input.individualScore + (input.adjustmentPoints ?? 0);
  if (adjusted < 0 || adjusted > input.individualMaxScore) throw new PortalConflictError("Adjusted individual score is outside its valid range");
  const percentage = (input.groupScore / input.groupMaxScore) * input.groupWeight + (adjusted / input.individualMaxScore) * input.individualWeight;
  const feedback = [
    input.groupFeedback ? `Group: ${input.groupFeedback}` : "",
    input.individualFeedback ? `Individual: ${input.individualFeedback}` : "",
    (input.adjustmentPoints ?? 0) !== 0 ? `Adjustment ${(input.adjustmentPoints ?? 0) > 0 ? "+" : ""}${input.adjustmentPoints}: ${input.adjustmentReason ?? ""}` : "",
  ].filter(Boolean).join("\n");
  return { score: Math.round(percentage * 10000) / 10000, maxScore: 100, feedback };
}

async function contextFor(db: Db, offeringId: string, assessmentItemId: string, actorId: string, programmeWide: boolean) {
  const offering = await db.offering.findUnique({
    where: { id: offeringId },
    include: {
      coLecturers: true,
      enrollments: { include: { student: { select: { id: true, studentId: true, name: true } } }, orderBy: { student: { name: "asc" } } },
      courseSpec: {
        include: {
          assessmentItems: {
            include: {
              criterionCloMappings: true,
              rubric: { include: { levelRows: { orderBy: { order: "asc" } }, criterionRows: { orderBy: { order: "asc" } } } },
            },
          },
        },
      },
    },
  });
  if (!offering) throw new PortalNotFoundError("Offering not found");
  if (!canManageOfferingResults(actorId, programmeWide, offering.lecturerId, offering.coLecturers.map((item) => item.lecturerId))) {
    throw new PortalAccessError("You are not assigned to this offering");
  }
  const spec = offering.courseSpec;
  if (!spec) throw new PortalConflictError("Offering is not bound to an Approved CourseSpec version");
  const assessment = spec.assessmentItems.find((item) => item.id === assessmentItemId && item.status === "Active");
  if (!assessment) throw new PortalNotFoundError("Active assessment not found");
  return { offering, spec, assessment };
}

type Context = Awaited<ReturnType<typeof contextFor>>;

function assertGroupMode(context: Context) {
  if (context.assessment.mode === "Individual") throw new PortalConflictError("This is an Individual assessment; use the individual markbook");
}

function criterionScope(context: Context, criterionId: string): "group" | "individual" {
  if (context.assessment.mode === "Group") return "group";
  if (context.assessment.mode === "Individual") return "individual";
  return context.assessment.individualCriterionIds.includes(criterionId) ? "individual" : "group";
}

function mappedRubricHash(context: Context): string | null {
  if (!context.assessment.rubric) return null;
  const hash = rubricContentHash(context.assessment.rubric);
  const mapped = new Set(context.assessment.criterionCloMappings.map((mapping) => mapping.rubricContentHash));
  if (mapped.size > 1 || (mapped.size === 1 && !mapped.has(hash))) {
    throw new PortalConflictError("The linked rubric changed after this course specification was configured. Revise the specification before criterion grading.");
  }
  return hash;
}

function rubricCriteria(context: Context) {
  return (context.assessment.rubric?.criterionRows ?? []).map((criterion) => ({
    id: criterion.id,
    name: criterion.name,
    cloCodes: context.assessment.criterionCloMappings.filter((mapping) => mapping.rubricId === context.assessment.rubricId && mapping.criterionId === criterion.id).map((mapping) => mapping.cloCode),
    scoringScope: criterionScope(context, criterion.id),
    levels: (context.assessment.rubric?.levelRows ?? []).map((level) => ({ id: level.id, label: level.label, points: level.points })),
  }));
}

async function groupsFor(db: Db, context: Context) {
  return db.assessmentGroup.findMany({
    where: { offeringId: context.offering.id, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id },
    include: {
      members: { orderBy: { studentNameSnapshot: "asc" } },
      score: { include: { criterionScores: true } },
      individualComponents: { include: { criterionScores: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

type Groups = Awaited<ReturnType<typeof groupsFor>>;

export function groupAssessmentReadiness(input: {
  mode: "Group" | "GroupIndividual";
  enrollmentIds: string[];
  rubricCriterionIds: Array<{ id: string; scope: "group" | "individual" }>;
  groupWeight: number | null;
  individualWeight: number | null;
  groups: Array<{
    id: string;
    memberEnrollmentIds: string[];
    hasScore: boolean;
    groupCriterionIds: string[];
    individualComponents: Array<{ enrollmentId: string; criterionIds: string[] }>;
  }>;
}) {
  const assigned = new Set(input.groups.flatMap((group) => group.memberEnrollmentIds));
  const unassignedEnrollmentIds = input.enrollmentIds.filter((id) => !assigned.has(id));
  const emptyGroupIds = input.groups.filter((group) => group.memberEnrollmentIds.length === 0).map((group) => group.id);
  const missingGroupScoreIds = input.groups.filter((group) => group.memberEnrollmentIds.length > 0 && !group.hasScore).map((group) => group.id);
  const requiredGroupCriteria = input.rubricCriterionIds.filter((item) => item.scope === "group").map((item) => item.id);
  const requiredIndividualCriteria = input.rubricCriterionIds.filter((item) => item.scope === "individual").map((item) => item.id);
  const missingGroupCriterionGroupIds = requiredGroupCriteria.length ? input.groups.filter((group) => requiredGroupCriteria.some((id) => !group.groupCriterionIds.includes(id))).map((group) => group.id) : [];
  const componentByEnrollment = new Map(input.groups.flatMap((group) => group.individualComponents.map((component) => [component.enrollmentId, component] as const)));
  const missingIndividualEnrollmentIds = input.mode === "GroupIndividual" ? input.enrollmentIds.filter((id) => !componentByEnrollment.has(id)) : [];
  const missingIndividualCriterionEnrollmentIds = input.mode === "GroupIndividual" && requiredIndividualCriteria.length ? input.enrollmentIds.filter((id) => {
    const component = componentByEnrollment.get(id);
    return !component || requiredIndividualCriteria.some((criterionId) => !component.criterionIds.includes(criterionId));
  }) : [];
  const invalidWeightConfiguration = input.mode === "GroupIndividual" && (input.groupWeight === null || input.individualWeight === null || Math.abs(input.groupWeight + input.individualWeight - 100) > 0.000001);
  return {
    readyToPublish: input.groups.length > 0 && !unassignedEnrollmentIds.length && !emptyGroupIds.length && !missingGroupScoreIds.length && !missingGroupCriterionGroupIds.length && !missingIndividualEnrollmentIds.length && !missingIndividualCriterionEnrollmentIds.length && !invalidWeightConfiguration,
    unassignedEnrollmentIds,
    emptyGroupIds,
    missingGroupScoreIds,
    missingGroupCriterionGroupIds,
    missingIndividualEnrollmentIds,
    missingIndividualCriterionEnrollmentIds,
    invalidWeightConfiguration,
  };
}

function readinessFor(context: Context, groups: Groups) {
  return groupAssessmentReadiness({
    mode: context.assessment.mode as "Group" | "GroupIndividual",
    enrollmentIds: context.offering.enrollments.map((item) => item.id),
    rubricCriterionIds: rubricCriteria(context).map((criterion) => ({ id: criterion.id, scope: criterion.scoringScope })),
    groupWeight: context.assessment.groupWeight,
    individualWeight: context.assessment.individualWeight,
    groups: groups.map((group) => ({
      id: group.id,
      memberEnrollmentIds: group.members.map((member) => member.enrollmentId),
      hasScore: Boolean(group.score),
      groupCriterionIds: group.score?.criterionScores.map((score) => score.criterionId) ?? [],
      individualComponents: group.individualComponents.map((component) => ({ enrollmentId: component.enrollmentId, criterionIds: component.criterionScores.map((score) => score.criterionId) })),
    })),
  });
}

async function audit(tx: Prisma.TransactionClient, context: Context, actorId: string, action: Parameters<typeof tx.assessmentGroupAuditEvent.create>[0]["data"]["action"], details: Prisma.InputJsonValue, options: { groupId?: string; enrollmentId?: string; reason?: string } = {}) {
  await tx.assessmentGroupAuditEvent.create({ data: { offeringId: context.offering.id, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id, groupId: options.groupId, enrollmentId: options.enrollmentId, action, actorId, reason: options.reason ?? "", details } });
}

async function ensureCompleteMembership(context: Context, groups: Groups) {
  const assigned = new Set(groups.flatMap((group) => group.members.map((member) => member.enrollmentId)));
  const missing = context.offering.enrollments.filter((enrollment) => !assigned.has(enrollment.id));
  if (missing.length) throw new PortalConflictError(`Assign every enrolled student to a group before scoring (${missing.length} unassigned)`);
}

async function lockMembership(tx: Prisma.TransactionClient, context: Context, groups: Groups, actorId: string) {
  if (groups.every((group) => group.membershipLockedAt)) return;
  await ensureCompleteMembership(context, groups);
  const now = new Date();
  await tx.assessmentGroup.updateMany({ where: { offeringId: context.offering.id, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id, membershipLockedAt: null }, data: { membershipLockedAt: now } });
  await audit(tx, context, actorId, "MembershipLocked", { lockedAt: now.toISOString(), groupIds: groups.map((group) => group.id) });
}

function validateSourceCriterionScores(context: Context, input: SaveAssessmentSourceCriterionScoresInput, scope: "group" | "individual") {
  if (!context.assessment.rubricId || !context.assessment.rubric) throw new PortalConflictError("This assessment has no linked rubric");
  const hash = mappedRubricHash(context)!;
  const criterionById = new Map(context.assessment.rubric.criterionRows.map((criterion) => [criterion.id, criterion]));
  const levelById = new Map(context.assessment.rubric.levelRows.map((level) => [level.id, level]));
  const maxScore = Math.max(0, ...context.assessment.rubric.levelRows.map((level) => level.points));
  if (maxScore <= 0) throw new PortalConflictError("The linked rubric has no positive scoring scale");
  const seen = new Set<string>();
  return input.scores.map((entry) => {
    if (seen.has(entry.criterionId)) throw new PortalConflictError("A rubric criterion was supplied more than once");
    seen.add(entry.criterionId);
    const criterion = criterionById.get(entry.criterionId);
    if (!criterion) throw new PortalConflictError("Unknown rubric criterion");
    if (criterionScope(context, criterion.id) !== scope) throw new PortalConflictError(`Criterion ${criterion.name} is scoped to ${criterionScope(context, criterion.id)} scoring`);
    if (entry.score > maxScore) throw new PortalConflictError(`Criterion ${criterion.name} score exceeds the rubric maximum`);
    const level = entry.rubricLevelId ? levelById.get(entry.rubricLevelId) : undefined;
    if (entry.rubricLevelId && !level) throw new PortalConflictError("Unknown rubric level");
    return { rubricId: context.assessment.rubricId!, criterionId: criterion.id, criterionName: criterion.name, rubricContentHash: hash, score: entry.score, maxScore, rubricLevelId: level?.id ?? null, rubricLevelLabel: level?.label ?? null };
  });
}

async function syncStudentCriterionEvidence(tx: Prisma.TransactionClient, context: Context, resultId: string, group: Groups[number], enrollmentId: string) {
  await tx.assessmentCriterionScore.deleteMany({ where: { assessmentResultId: resultId } });
  const groupScores = group.score?.criterionScores ?? [];
  const individualScores = group.individualComponents.find((component) => component.enrollmentId === enrollmentId)?.criterionScores ?? [];
  const rows = [...groupScores, ...individualScores];
  if (!rows.length) return;
  await tx.assessmentCriterionScore.createMany({ data: rows.map((score) => ({ assessmentResultId: resultId, rubricId: score.rubricId, criterionId: score.criterionId, criterionName: score.criterionName, rubricContentHash: score.rubricContentHash, score: score.score, maxScore: score.maxScore, rubricLevelId: score.rubricLevelId, rubricLevelLabel: score.rubricLevelLabel })) });
}

async function materialize(tx: Prisma.TransactionClient, context: Context, groups: Groups, actorId: string) {
  for (const group of groups) {
    if (!group.score) continue;
    for (const member of group.members) {
      const component = group.individualComponents.find((item) => item.enrollmentId === member.enrollmentId);
      if (context.assessment.mode === "GroupIndividual" && !component) continue;
      const derived = calculateDerivedGroupResult({
        mode: context.assessment.mode as "Group" | "GroupIndividual",
        groupScore: group.score.score,
        groupMaxScore: group.score.maxScore,
        groupFeedback: group.score.feedback,
        groupWeight: context.assessment.groupWeight,
        individualScore: component?.score,
        individualMaxScore: component?.maxScore,
        individualFeedback: component?.feedback,
        individualWeight: context.assessment.individualWeight,
        adjustmentPoints: component?.adjustmentPoints,
        adjustmentReason: component?.adjustmentReason,
      });
      const key = { enrollmentId: member.enrollmentId, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id };
      const existing = await tx.assessmentResult.findUnique({ where: { enrollmentId_courseSpecId_assessmentItemId: key } });
      if (existing?.publishedAt || existing?.finalizedAt) throw new PortalConflictError("Published group-derived results cannot be rematerialized through draft scoring");
      const result = existing
        ? await tx.assessmentResult.update({ where: { id: existing.id }, data: derived })
        : await tx.assessmentResult.create({ data: { ...key, ...derived } });
      await syncStudentCriterionEvidence(tx, context, result.id, group, member.enrollmentId);
    }
  }
  await audit(tx, context, actorId, "ResultsMaterialized", { groupIds: groups.map((group) => group.id) });
}

async function fullWorkspace(context: Context): Promise<GroupAssessmentWorkspace> {
  const groups = await groupsFor(prisma, context);
  const auditRows = await prisma.assessmentGroupAuditEvent.findMany({ where: { offeringId: context.offering.id, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  const currentHash = context.assessment.rubric ? rubricContentHash(context.assessment.rubric) : null;
  return {
    offeringId: context.offering.id,
    courseSpecId: context.spec.id,
    assessmentItemId: context.assessment.id,
    assessmentName: context.assessment.name,
    mode: context.assessment.mode === "Group" ? "group" : "group_individual",
    groupWeight: context.assessment.groupWeight,
    individualWeight: context.assessment.individualWeight,
    enrollments: context.offering.enrollments.map((enrollment) => ({ enrollmentId: enrollment.id, studentId: enrollment.student.id, studentCode: enrollment.student.studentId, studentName: enrollment.student.name })),
    rubricId: context.assessment.rubricId,
    rubricName: context.assessment.rubric?.name ?? "",
    rubricContentHash: currentHash,
    rubricCriteria: rubricCriteria(context),
    groups: groups.map((group) => ({
      id: group.id, name: group.name, sortOrder: group.sortOrder,
      membershipLockedAt: group.membershipLockedAt?.toISOString() ?? null,
      publishedAt: group.publishedAt?.toISOString() ?? null,
      finalizedAt: group.finalizedAt?.toISOString() ?? null,
      members: group.members.map((member) => ({ enrollmentId: member.enrollmentId, studentId: member.studentIdSnapshot, studentCode: member.studentCodeSnapshot, studentName: member.studentNameSnapshot })),
      score: group.score ? { id: group.score.id, score: group.score.score, maxScore: group.score.maxScore, feedback: group.score.feedback, updatedAt: group.score.updatedAt.toISOString(), criterionScores: group.score.criterionScores.map((score) => ({ criterionId: score.criterionId, score: score.score, maxScore: score.maxScore, rubricLevelId: score.rubricLevelId, rubricLevelLabel: score.rubricLevelLabel })) } : null,
      individualComponents: group.individualComponents.map((component) => ({ id: component.id, enrollmentId: component.enrollmentId, score: component.score, maxScore: component.maxScore, feedback: component.feedback, adjustmentPoints: component.adjustmentPoints, adjustmentReason: component.adjustmentReason, updatedAt: component.updatedAt.toISOString(), criterionScores: component.criterionScores.map((score) => ({ criterionId: score.criterionId, score: score.score, maxScore: score.maxScore, rubricLevelId: score.rubricLevelId, rubricLevelLabel: score.rubricLevelLabel })) })),
    })),
    readiness: readinessFor(context, groups),
    audit: auditRows.map((row) => ({ id: row.id, action: row.action, groupId: row.groupId, enrollmentId: row.enrollmentId, actorName: row.actor.name, reason: row.reason, createdAt: row.createdAt.toISOString() })),
  };
}

async function groupById(db: Db, context: Context, groupId: string) {
  const group = await db.assessmentGroup.findFirst({ where: { id: groupId, offeringId: context.offering.id, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id }, include: { members: true, score: { include: { criterionScores: true } }, individualComponents: { include: { criterionScores: true } } } });
  if (!group) throw new PortalNotFoundError("Assessment group not found");
  return group;
}

async function correctStudentResult(tx: Prisma.TransactionClient, resultId: string, derived: { score: number; maxScore: number; feedback: string }, actorId: string, reason: string) {
  const result = await tx.assessmentResult.findUnique({ where: { id: resultId } });
  if (!result?.finalizedAt) throw new PortalConflictError("Affected student result is not finalized");
  if (result.score === derived.score && result.maxScore === derived.maxScore && result.feedback === derived.feedback) return;
  const correction = await tx.assessmentResultCorrection.create({ data: { assessmentResultId: result.id, beforeScore: result.score, beforeMaxScore: result.maxScore, beforeFeedback: result.feedback, afterScore: derived.score, afterMaxScore: derived.maxScore, afterFeedback: derived.feedback, reason, correctedById: actorId } });
  await tx.$queryRaw`SELECT set_config('dse.result_correction_id', ${correction.id}, true)`;
  await tx.assessmentResult.update({ where: { id: result.id }, data: derived });
}

export const groupAssessmentService = {
  async modeFor(authorId: string, programmeWide: boolean, input: PublishAssessmentResultsInput | FinalizeAssessmentResultsInput) {
    const context = await contextFor(prisma, input.offeringId, input.assessmentItemId, authorId, programmeWide);
    return context.assessment.mode;
  },

  async workspace(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string) {
    const context = await contextFor(prisma, offeringId, assessmentItemId, authorId, programmeWide);
    assertGroupMode(context);
    return fullWorkspace(context);
  },

  async replaceGroups(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, input: SaveAssessmentGroupsInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`;
      const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide);
      assertGroupMode(context);
      const existing = await groupsFor(tx, context);
      if (existing.some((group) => group.membershipLockedAt || group.publishedAt || group.finalizedAt || group.score || group.individualComponents.length)) throw new PortalConflictError("Group membership is locked because scoring has started");
      const legacyResults = await tx.assessmentResult.count({ where: { enrollmentId: { in: context.offering.enrollments.map((item) => item.id) }, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id } });
      if (legacyResults > 0) throw new PortalConflictError("Legacy individual draft marks exist for this Group assessment. Preserve or clear them explicitly before configuring groups; PMS will not guess historical membership.");
      const enrollmentById = new Map(context.offering.enrollments.map((item) => [item.id, item]));
      for (const group of input.groups) for (const enrollmentId of group.enrollmentIds) if (!enrollmentById.has(enrollmentId)) throw new PortalConflictError("Every group member must be enrolled in this offering");
      await tx.assessmentGroup.deleteMany({ where: { offeringId, courseSpecId: context.spec.id, assessmentItemId } });
      const created = [] as Array<{ id: string; name: string; enrollmentIds: string[] }>;
      for (const [index, group] of input.groups.entries()) {
        const row = await tx.assessmentGroup.create({ data: { id: group.id, offeringId, courseSpecId: context.spec.id, assessmentItemId, name: group.name, sortOrder: index, createdById: authorId } });
        const members = group.enrollmentIds.map((id) => enrollmentById.get(id)!);
        if (members.length) await tx.assessmentGroupMember.createMany({ data: members.map((enrollment) => ({ groupId: row.id, offeringId, courseSpecId: context.spec.id, assessmentItemId, enrollmentId: enrollment.id, studentIdSnapshot: enrollment.student.id, studentCodeSnapshot: enrollment.student.studentId, studentNameSnapshot: enrollment.student.name })) });
        created.push({ id: row.id, name: row.name, enrollmentIds: group.enrollmentIds });
      }
      await audit(tx, context, authorId, "GroupsConfigured", { groups: created });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },

  async saveGroupScore(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, groupId: string, input: SaveAssessmentGroupScoreInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`;
      const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide); assertGroupMode(context);
      let groups = await groupsFor(tx, context); await ensureCompleteMembership(context, groups); await lockMembership(tx, context, groups, authorId); groups = await groupsFor(tx, context);
      const group = groups.find((item) => item.id === groupId); if (!group) throw new PortalNotFoundError("Assessment group not found"); if (group.publishedAt) throw new PortalConflictError("Published group scores are locked; use the correction workflow after finalization");
      const hash = context.assessment.rubric ? mappedRubricHash(context) : null;
      await tx.assessmentGroupScore.upsert({ where: { groupId }, update: { ...input, rubricId: context.assessment.rubricId, rubricContentHash: hash, scoredById: authorId }, create: { groupId, ...input, rubricId: context.assessment.rubricId, rubricContentHash: hash, scoredById: authorId } });
      groups = await groupsFor(tx, context); await materialize(tx, context, groups, authorId); await audit(tx, context, authorId, "GroupScoreSaved", { score: input.score, maxScore: input.maxScore }, { groupId });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },

  async saveGroupCriteria(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, groupId: string, input: SaveAssessmentSourceCriterionScoresInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`;
      const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide); assertGroupMode(context);
      let groups = await groupsFor(tx, context); await ensureCompleteMembership(context, groups); await lockMembership(tx, context, groups, authorId); groups = await groupsFor(tx, context);
      const group = groups.find((item) => item.id === groupId); if (!group?.score) throw new PortalConflictError("Save the group total score before rubric criteria"); if (group.publishedAt) throw new PortalConflictError("Published rubric evidence is immutable");
      const rows = validateSourceCriterionScores(context, input, "group");
      await tx.assessmentGroupCriterionScore.deleteMany({ where: { groupScoreId: group.score.id } });
      if (rows.length) await tx.assessmentGroupCriterionScore.createMany({ data: rows.map((row) => ({ groupScoreId: group.score!.id, ...row })) });
      groups = await groupsFor(tx, context); await materialize(tx, context, groups, authorId); await audit(tx, context, authorId, "GroupCriterionScoresSaved", { criterionIds: rows.map((row) => row.criterionId) }, { groupId });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },

  async saveIndividualComponent(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, enrollmentId: string, input: SaveAssessmentIndividualComponentInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`;
      const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide); if (context.assessment.mode !== "GroupIndividual") throw new PortalConflictError("Individual components are only valid for Group + Individual assessments");
      let groups = await groupsFor(tx, context); await ensureCompleteMembership(context, groups); await lockMembership(tx, context, groups, authorId); groups = await groupsFor(tx, context);
      const group = groups.find((item) => item.members.some((member) => member.enrollmentId === enrollmentId)); if (!group) throw new PortalNotFoundError("Student group membership not found"); if (group.publishedAt) throw new PortalConflictError("Published individual components are locked; use the correction workflow after finalization");
      await tx.assessmentIndividualComponent.upsert({ where: { enrollmentId_courseSpecId_assessmentItemId: { enrollmentId, courseSpecId: context.spec.id, assessmentItemId } }, update: { groupId: group.id, offeringId, ...input, scoredById: authorId }, create: { groupId: group.id, offeringId, courseSpecId: context.spec.id, assessmentItemId, enrollmentId, ...input, scoredById: authorId } });
      groups = await groupsFor(tx, context); await materialize(tx, context, groups, authorId); await audit(tx, context, authorId, "IndividualComponentSaved", { score: input.score, maxScore: input.maxScore, adjustmentPoints: input.adjustmentPoints }, { groupId: group.id, enrollmentId });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },

  async saveIndividualCriteria(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, enrollmentId: string, input: SaveAssessmentSourceCriterionScoresInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`;
      const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide); if (context.assessment.mode !== "GroupIndividual") throw new PortalConflictError("Individual criteria are only valid for Group + Individual assessments");
      let groups = await groupsFor(tx, context); const group = groups.find((item) => item.members.some((member) => member.enrollmentId === enrollmentId)); const component = group?.individualComponents.find((item) => item.enrollmentId === enrollmentId); if (!group || !component) throw new PortalConflictError("Save the individual component before rubric criteria"); if (group.publishedAt) throw new PortalConflictError("Published rubric evidence is immutable");
      const rows = validateSourceCriterionScores(context, input, "individual");
      await tx.assessmentIndividualCriterionScore.deleteMany({ where: { componentId: component.id } }); if (rows.length) await tx.assessmentIndividualCriterionScore.createMany({ data: rows.map((row) => ({ componentId: component.id, ...row })) });
      groups = await groupsFor(tx, context); await materialize(tx, context, groups, authorId); await audit(tx, context, authorId, "IndividualCriterionScoresSaved", { criterionIds: rows.map((row) => row.criterionId) }, { groupId: group.id, enrollmentId });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },

  async publishAssessment(authorId: string, programmeWide: boolean, input: PublishAssessmentResultsInput): Promise<PublishAssessmentResultsResponse> {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${input.offeringId} FOR UPDATE`;
      const context = await contextFor(tx, input.offeringId, input.assessmentItemId, authorId, programmeWide); assertGroupMode(context);
      let groups = await groupsFor(tx, context); await ensureCompleteMembership(context, groups); await lockMembership(tx, context, groups, authorId); groups = await groupsFor(tx, context); await materialize(tx, context, groups, authorId); groups = await groupsFor(tx, context);
      const readiness = readinessFor(context, groups); if (!readiness.readyToPublish) throw new PortalConflictError(`Group assessment is incomplete: ${readiness.unassignedEnrollmentIds.length} unassigned, ${readiness.missingGroupScoreIds.length} missing group scores, ${readiness.missingIndividualEnrollmentIds.length} missing individual components, ${readiness.missingGroupCriterionGroupIds.length + readiness.missingIndividualCriterionEnrollmentIds.length} missing rubric evidence`);
      const enrollmentIds = context.offering.enrollments.map((item) => item.id);
      const results = await tx.assessmentResult.findMany({ where: { enrollmentId: { in: enrollmentIds }, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id } });
      if (results.length !== enrollmentIds.length) throw new PortalConflictError("Not every enrolled student has a materialized result");
      const now = new Date(); const previouslyPublishedCount = results.filter((result) => result.publishedAt).length;
      await tx.assessmentResult.updateMany({ where: { id: { in: results.filter((result) => !result.publishedAt).map((result) => result.id) }, publishedAt: null }, data: { publishedAt: now, publishedById: authorId } });
      await tx.assessmentGroup.updateMany({ where: { id: { in: groups.map((group) => group.id) } }, data: { publishedAt: now } });
      await audit(tx, context, authorId, "Published", { publishedAt: now.toISOString(), groupIds: groups.map((group) => group.id), enrollmentIds });
      return { offeringId: context.offering.id, assessmentItemId: context.assessment.id, publishedCount: results.length - previouslyPublishedCount, previouslyPublishedCount, publishedAt: now.toISOString(), publishedById: authorId };
    });
  },

  async finalizeAssessment(authorId: string, programmeWide: boolean, input: FinalizeAssessmentResultsInput): Promise<FinalizeAssessmentResultsResponse> {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${input.offeringId} FOR UPDATE`;
      const context = await contextFor(tx, input.offeringId, input.assessmentItemId, authorId, programmeWide); assertGroupMode(context);
      const groups = await groupsFor(tx, context); const enrollmentIds = context.offering.enrollments.map((item) => item.id);
      const results = await tx.assessmentResult.findMany({ where: { enrollmentId: { in: enrollmentIds }, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id } });
      if (results.length !== enrollmentIds.length || results.some((result) => !result.publishedAt || result.finalizedAt)) throw new PortalConflictError("Every student result must be published and not already finalized");
      const now = new Date(); await tx.assessmentResult.updateMany({ where: { id: { in: results.map((result) => result.id) }, finalizedAt: null }, data: { finalizedAt: now, finalizedById: authorId } });
      await tx.assessmentGroup.updateMany({ where: { id: { in: groups.map((group) => group.id) } }, data: { finalizedAt: now } });
      await audit(tx, context, authorId, "Finalized", { finalizedAt: now.toISOString(), groupIds: groups.map((group) => group.id) });
      return { offeringId: context.offering.id, assessmentItemId: context.assessment.id, finalizedCount: results.length, finalizedAt: now.toISOString(), finalizedById: authorId };
    });
  },

  async correctGroupScore(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, groupId: string, input: CorrectAssessmentGroupScoreInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`; const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide); assertGroupMode(context);
      const group = await groupById(tx, context, groupId); if (!group.finalizedAt || !group.score) throw new PortalConflictError("Group source corrections are available only after finalization"); if (group.score.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new PortalConflictError("Group score changed since you opened it. Reload before correcting.");
      const correction = await tx.assessmentGroupScoreCorrection.create({ data: { groupScoreId: group.score.id, beforeScore: group.score.score, beforeMaxScore: group.score.maxScore, beforeFeedback: group.score.feedback, afterScore: input.score, afterMaxScore: input.maxScore, afterFeedback: input.feedback, reason: input.reason, correctedById: authorId } });
      await tx.$queryRaw`SELECT set_config('dse.group_score_correction_id', ${correction.id}, true)`; await tx.assessmentGroupScore.update({ where: { id: group.score.id }, data: { score: input.score, maxScore: input.maxScore, feedback: input.feedback, scoredById: authorId } });
      const refreshed = await groupById(tx, context, groupId);
      for (const member of refreshed.members) {
        const component = refreshed.individualComponents.find((item) => item.enrollmentId === member.enrollmentId);
        const derived = calculateDerivedGroupResult({ mode: context.assessment.mode as "Group" | "GroupIndividual", groupScore: input.score, groupMaxScore: input.maxScore, groupFeedback: input.feedback, groupWeight: context.assessment.groupWeight, individualScore: component?.score, individualMaxScore: component?.maxScore, individualFeedback: component?.feedback, individualWeight: context.assessment.individualWeight, adjustmentPoints: component?.adjustmentPoints, adjustmentReason: component?.adjustmentReason });
        const result = await tx.assessmentResult.findUnique({ where: { enrollmentId_courseSpecId_assessmentItemId: { enrollmentId: member.enrollmentId, courseSpecId: context.spec.id, assessmentItemId } } }); if (!result) throw new PortalConflictError("Materialized student result is missing");
        await correctStudentResult(tx, result.id, derived, authorId, `Group source correction: ${input.reason}`);
      }
      await audit(tx, context, authorId, "GroupScoreCorrected", { correctionId: correction.id, beforeScore: group.score.score, afterScore: input.score }, { groupId, reason: input.reason });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },

  async correctIndividualComponent(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, enrollmentId: string, input: CorrectAssessmentIndividualComponentInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`; const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide); if (context.assessment.mode !== "GroupIndividual") throw new PortalConflictError("Individual source correction is only valid for Group + Individual assessments");
      const groups = await groupsFor(tx, context); const group = groups.find((item) => item.members.some((member) => member.enrollmentId === enrollmentId)); const component = group?.individualComponents.find((item) => item.enrollmentId === enrollmentId); if (!group?.finalizedAt || !component || !group.score) throw new PortalConflictError("Individual source corrections are available only after finalization"); if (component.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new PortalConflictError("Individual component changed since you opened it. Reload before correcting.");
      const correction = await tx.assessmentIndividualComponentCorrection.create({ data: { componentId: component.id, beforeScore: component.score, beforeMaxScore: component.maxScore, beforeFeedback: component.feedback, beforeAdjustmentPoints: component.adjustmentPoints, beforeAdjustmentReason: component.adjustmentReason, afterScore: input.score, afterMaxScore: input.maxScore, afterFeedback: input.feedback, afterAdjustmentPoints: input.adjustmentPoints, afterAdjustmentReason: input.adjustmentReason, reason: input.reason, correctedById: authorId } });
      await tx.$queryRaw`SELECT set_config('dse.individual_component_correction_id', ${correction.id}, true)`; await tx.assessmentIndividualComponent.update({ where: { id: component.id }, data: { score: input.score, maxScore: input.maxScore, feedback: input.feedback, adjustmentPoints: input.adjustmentPoints, adjustmentReason: input.adjustmentReason, scoredById: authorId } });
      const derived = calculateDerivedGroupResult({ mode: "GroupIndividual", groupScore: group.score.score, groupMaxScore: group.score.maxScore, groupFeedback: group.score.feedback, groupWeight: context.assessment.groupWeight, individualScore: input.score, individualMaxScore: input.maxScore, individualFeedback: input.feedback, individualWeight: context.assessment.individualWeight, adjustmentPoints: input.adjustmentPoints, adjustmentReason: input.adjustmentReason });
      const result = await tx.assessmentResult.findUnique({ where: { enrollmentId_courseSpecId_assessmentItemId: { enrollmentId, courseSpecId: context.spec.id, assessmentItemId } } }); if (!result) throw new PortalConflictError("Materialized student result is missing"); await correctStudentResult(tx, result.id, derived, authorId, `Individual source correction: ${input.reason}`);
      await audit(tx, context, authorId, "IndividualComponentCorrected", { correctionId: correction.id, beforeScore: component.score, afterScore: input.score }, { groupId: group.id, enrollmentId, reason: input.reason });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },
};
'''
write('apps/backend/src/plugins/student-portal/group-assessment-results.ts', group_service)

# ---------------------------------------------------------------------------
# Results lifecycle dispatches group modes to the group service. Individual path
# remains unchanged and group assessments can no longer bypass group provenance.
# ---------------------------------------------------------------------------
lifecycle = 'apps/backend/src/plugins/student-portal/results-lifecycle.ts'
replace_once(
    lifecycle,
    'import { prisma } from "../../core/db/prisma.ts";\n',
    'import { prisma } from "../../core/db/prisma.ts";\n'
    'import { groupAssessmentService } from "./group-assessment-results.ts";\n'
    'import { canManageOfferingResults } from "./result-management-access.ts";\n'
    'export { canManageOfferingResults } from "./result-management-access.ts";\n',
)
regex_once(
    lifecycle,
    r'export function canManageOfferingResults\(\n  authorId: string,\n  programmeWide: boolean,\n  lecturerId: string \| null,\n  coLecturerIds: string\[],\n\): boolean \{\n  return programmeWide \|\| lecturerId === authorId \|\| coLecturerIds\.includes\(authorId\);\n\}\n\n',
    '',
)
replace_once(
    lifecycle,
    '    assessmentFrom(context, input.assessmentItemId);\n\n    const key = {\n',
    '    const assessment = assessmentFrom(context, input.assessmentItemId);\n'
    '    if (assessment.mode !== "Individual") throw new PortalConflictError("Use the group assessment workspace for Group and Group + Individual scoring");\n\n'
    '    const key = {\n',
)
replace_once(
    lifecycle,
    '    const assessment = assessmentFrom(context, input.assessmentItemId);\n    if (!assessment.rubricId || !assessment.rubric) {\n',
    '    const assessment = assessmentFrom(context, input.assessmentItemId);\n'
    '    if (assessment.mode !== "Individual") throw new PortalConflictError("Use the group assessment workspace for Group and Group + Individual criterion scoring");\n'
    '    if (!assessment.rubricId || !assessment.rubric) {\n',
)
replace_once(
    lifecycle,
    '  async publishAssessment(\n    authorId: string,\n    programmeWide: boolean,\n    input: PublishAssessmentResultsInput,\n  ): Promise<PublishAssessmentResultsResponse> {\n    return prisma.$transaction(async (tx) => {\n',
    '  async publishAssessment(\n    authorId: string,\n    programmeWide: boolean,\n    input: PublishAssessmentResultsInput,\n  ): Promise<PublishAssessmentResultsResponse> {\n'
    '    if (await groupAssessmentService.modeFor(authorId, programmeWide, input) !== "Individual") {\n'
    '      return groupAssessmentService.publishAssessment(authorId, programmeWide, input);\n'
    '    }\n'
    '    return prisma.$transaction(async (tx) => {\n',
)
replace_once(
    lifecycle,
    '  async finalizeAssessment(\n    authorId: string,\n    programmeWide: boolean,\n    input: FinalizeAssessmentResultsInput,\n  ): Promise<FinalizeAssessmentResultsResponse> {\n    return prisma.$transaction(async (tx) => {\n',
    '  async finalizeAssessment(\n    authorId: string,\n    programmeWide: boolean,\n    input: FinalizeAssessmentResultsInput,\n  ): Promise<FinalizeAssessmentResultsResponse> {\n'
    '    if (await groupAssessmentService.modeFor(authorId, programmeWide, input) !== "Individual") {\n'
    '      return groupAssessmentService.finalizeAssessment(authorId, programmeWide, input);\n'
    '    }\n'
    '    return prisma.$transaction(async (tx) => {\n',
)

# ---------------------------------------------------------------------------
# Router: reuse courses:write + current primary/co-lecturer/programme-wide checks.
# ---------------------------------------------------------------------------
router = 'apps/backend/src/plugins/student-portal/router.ts'
replace_once(
    router,
    '  SaveAssessmentCriterionScoresInput,\n  SaveAssessmentResultInput,\n',
    '  SaveAssessmentCriterionScoresInput,\n'
    '  SaveAssessmentResultInput,\n'
    '  SaveAssessmentGroupsInput,\n'
    '  SaveAssessmentGroupScoreInput,\n'
    '  SaveAssessmentSourceCriterionScoresInput,\n'
    '  SaveAssessmentIndividualComponentInput,\n'
    '  CorrectAssessmentGroupScoreInput,\n'
    '  CorrectAssessmentIndividualComponentInput,\n',
)
replace_once(router, 'import { resultCorrectionsService } from "./result-corrections.ts";\n', 'import { resultCorrectionsService } from "./result-corrections.ts";\nimport { groupAssessmentService } from "./group-assessment-results.ts";\n')
route_block = r'''
  router.get("/manage/offerings/:offeringId/assessments/:assessmentItemId/groups", requirePermission("courses:write"), async (req, res) => {
    try { res.json(await groupAssessmentService.workspace(req.user!.id, programmeWide(req.user!.roles), req.params.offeringId!, req.params.assessmentItemId!)); } catch (error) { handleError(error, res); }
  });
  router.put("/manage/offerings/:offeringId/assessments/:assessmentItemId/groups", requirePermission("courses:write"), async (req, res) => {
    const parsed = SaveAssessmentGroupsInput.safeParse(req.body); if (!parsed.success) return void res.status(400).json({ error: "Invalid group configuration", details: parsed.error.flatten() });
    try { res.json(await groupAssessmentService.replaceGroups(req.user!.id, programmeWide(req.user!.roles), req.params.offeringId!, req.params.assessmentItemId!, parsed.data)); } catch (error) { handleError(error, res); }
  });
  router.put("/manage/offerings/:offeringId/assessments/:assessmentItemId/groups/:groupId/score", requirePermission("courses:write"), async (req, res) => {
    const parsed = SaveAssessmentGroupScoreInput.safeParse(req.body); if (!parsed.success) return void res.status(400).json({ error: "Invalid group score", details: parsed.error.flatten() });
    try { res.json(await groupAssessmentService.saveGroupScore(req.user!.id, programmeWide(req.user!.roles), req.params.offeringId!, req.params.assessmentItemId!, req.params.groupId!, parsed.data)); } catch (error) { handleError(error, res); }
  });
  router.put("/manage/offerings/:offeringId/assessments/:assessmentItemId/groups/:groupId/criteria", requirePermission("courses:write"), async (req, res) => {
    const parsed = SaveAssessmentSourceCriterionScoresInput.safeParse(req.body); if (!parsed.success) return void res.status(400).json({ error: "Invalid group criterion scores", details: parsed.error.flatten() });
    try { res.json(await groupAssessmentService.saveGroupCriteria(req.user!.id, programmeWide(req.user!.roles), req.params.offeringId!, req.params.assessmentItemId!, req.params.groupId!, parsed.data)); } catch (error) { handleError(error, res); }
  });
  router.put("/manage/offerings/:offeringId/assessments/:assessmentItemId/students/:enrollmentId/individual", requirePermission("courses:write"), async (req, res) => {
    const parsed = SaveAssessmentIndividualComponentInput.safeParse(req.body); if (!parsed.success) return void res.status(400).json({ error: "Invalid individual component", details: parsed.error.flatten() });
    try { res.json(await groupAssessmentService.saveIndividualComponent(req.user!.id, programmeWide(req.user!.roles), req.params.offeringId!, req.params.assessmentItemId!, req.params.enrollmentId!, parsed.data)); } catch (error) { handleError(error, res); }
  });
  router.put("/manage/offerings/:offeringId/assessments/:assessmentItemId/students/:enrollmentId/individual/criteria", requirePermission("courses:write"), async (req, res) => {
    const parsed = SaveAssessmentSourceCriterionScoresInput.safeParse(req.body); if (!parsed.success) return void res.status(400).json({ error: "Invalid individual criterion scores", details: parsed.error.flatten() });
    try { res.json(await groupAssessmentService.saveIndividualCriteria(req.user!.id, programmeWide(req.user!.roles), req.params.offeringId!, req.params.assessmentItemId!, req.params.enrollmentId!, parsed.data)); } catch (error) { handleError(error, res); }
  });
  router.post("/manage/offerings/:offeringId/assessments/:assessmentItemId/groups/:groupId/correct", requirePermission("courses:write"), async (req, res) => {
    const parsed = CorrectAssessmentGroupScoreInput.safeParse(req.body); if (!parsed.success) return void res.status(400).json({ error: "Invalid group correction", details: parsed.error.flatten() });
    try { res.json(await groupAssessmentService.correctGroupScore(req.user!.id, programmeWide(req.user!.roles), req.params.offeringId!, req.params.assessmentItemId!, req.params.groupId!, parsed.data)); } catch (error) { handleError(error, res); }
  });
  router.post("/manage/offerings/:offeringId/assessments/:assessmentItemId/students/:enrollmentId/individual/correct", requirePermission("courses:write"), async (req, res) => {
    const parsed = CorrectAssessmentIndividualComponentInput.safeParse(req.body); if (!parsed.success) return void res.status(400).json({ error: "Invalid individual correction", details: parsed.error.flatten() });
    try { res.json(await groupAssessmentService.correctIndividualComponent(req.user!.id, programmeWide(req.user!.roles), req.params.offeringId!, req.params.assessmentItemId!, req.params.enrollmentId!, parsed.data)); } catch (error) { handleError(error, res); }
  });
'''
replace_once(router, '  router.get("/manage/results/review/:offeringId", requirePermission("courses:write"), async (req, res) => {\n', route_block + '  router.get("/manage/results/review/:offeringId", requirePermission("courses:write"), async (req, res) => {\n')

# ---------------------------------------------------------------------------
# Delivery/student DTO mapping recognizes all three modes and criterion scopes.
# ---------------------------------------------------------------------------
service = 'apps/backend/src/plugins/student-portal/service.ts'
# Student-facing mode conversion can occur in more than one mapper.
text = read(service)
text = text.replace('mode: item.mode === "Group" ? "group" : "individual",', 'mode: item.mode === "Group" ? "group" : item.mode === "GroupIndividual" ? "group_individual" : "individual",')
text = text.replace('mode: assessment.mode === "Group" ? "group" : "individual",', 'mode: assessment.mode === "Group" ? "group" : assessment.mode === "GroupIndividual" ? "group_individual" : "individual",')
write(service, text)
replace_once(
    service,
    '            type: assessment.type,\n            weight: assessment.weight,\n',
    '            type: assessment.type,\n'
    '            mode: assessment.mode === "Group" ? "group" : assessment.mode === "GroupIndividual" ? "group_individual" : "individual",\n'
    '            groupWeight: assessment.groupWeight,\n'
    '            individualWeight: assessment.individualWeight,\n'
    '            weight: assessment.weight,\n',
)
replace_once(
    service,
    '              name: criterion.name,\n              cloCodes: assessment.criterionCloMappings\n',
    '              name: criterion.name,\n'
    '              scoringScope: assessment.mode === "Group" ? "group" : assessment.mode === "Individual" ? "individual" : assessment.individualCriterionIds.includes(criterion.id) ? "individual" : "group",\n'
    '              cloCodes: assessment.criterionCloMappings\n',
)

# ---------------------------------------------------------------------------
# Focused pure tests and DB security/invariant smoke test.
# ---------------------------------------------------------------------------
write('packages/shared-types/src/group-assessment.test.ts', r'''import { describe, expect, test } from "bun:test";
import { AssessmentItem } from "./course-spec.ts";

const base = {
  id: "assessment-1",
  name: "Project",
  type: "Project",
  description: "",
  status: "active" as const,
  cloCodes: [],
  weight: 30,
  dueWeek: null,
  durationWeeks: null,
  format: "",
  submissionMethod: "",
  instructions: "",
  rubricId: null,
  criterionCloMappings: [],
  feedbackMethod: "",
  feedbackTimeline: "",
  mappedPlos: [],
  notes: "",
};

describe("assessment group mode contract", () => {
  test("preserves Individual and Group modes", () => {
    expect(AssessmentItem.parse({ ...base, mode: "individual" }).mode).toBe("individual");
    expect(AssessmentItem.parse({ ...base, mode: "group" }).mode).toBe("group");
  });

  test("requires Group + Individual weights to total 100", () => {
    expect(AssessmentItem.safeParse({ ...base, mode: "group_individual", groupWeight: 70, individualWeight: 30 }).success).toBe(true);
    expect(AssessmentItem.safeParse({ ...base, mode: "group_individual", groupWeight: 70, individualWeight: 20 }).success).toBe(false);
    expect(AssessmentItem.safeParse({ ...base, mode: "group_individual" }).success).toBe(false);
  });

  test("stores explicit individual rubric criterion ids", () => {
    const parsed = AssessmentItem.parse({ ...base, mode: "group_individual", groupWeight: 60, individualWeight: 40, individualCriterionIds: ["oral-defense"] });
    expect(parsed.individualCriterionIds).toEqual(["oral-defense"]);
  });
});
''')
write('apps/backend/src/plugins/student-portal/group-assessment-results.test.ts', r'''import { describe, expect, test } from "bun:test";
import { calculateDerivedGroupResult, groupAssessmentReadiness } from "./group-assessment-results.ts";

describe("group assessment result calculation", () => {
  test("Group mode copies the shared score without changing its scale", () => {
    expect(calculateDerivedGroupResult({ mode: "Group", groupScore: 16, groupMaxScore: 20, groupFeedback: "Good work" })).toEqual({ score: 16, maxScore: 20, feedback: "Good work" });
  });

  test("Group + Individual combines normalized weighted components and an explicit adjustment", () => {
    const result = calculateDerivedGroupResult({ mode: "GroupIndividual", groupScore: 16, groupMaxScore: 20, groupWeight: 70, individualScore: 7, individualMaxScore: 10, individualWeight: 30, adjustmentPoints: 1, adjustmentReason: "Oral defense evidence" });
    expect(result.score).toBe(80);
    expect(result.maxScore).toBe(100);
    expect(result.feedback).toContain("Adjustment +1");
  });
});

describe("group assessment publication readiness", () => {
  test("requires complete membership, source scores, individual components, and scoped rubric evidence", () => {
    const ready = groupAssessmentReadiness({
      mode: "GroupIndividual",
      enrollmentIds: ["e1", "e2"],
      groupWeight: 70,
      individualWeight: 30,
      rubricCriterionIds: [{ id: "team", scope: "group" }, { id: "oral", scope: "individual" }],
      groups: [{ id: "g1", memberEnrollmentIds: ["e1", "e2"], hasScore: true, groupCriterionIds: ["team"], individualComponents: [{ enrollmentId: "e1", criterionIds: ["oral"] }, { enrollmentId: "e2", criterionIds: ["oral"] }] }],
    });
    expect(ready.readyToPublish).toBe(true);

    const missing = groupAssessmentReadiness({
      mode: "GroupIndividual",
      enrollmentIds: ["e1", "e2"],
      groupWeight: 70,
      individualWeight: 30,
      rubricCriterionIds: [{ id: "team", scope: "group" }, { id: "oral", scope: "individual" }],
      groups: [{ id: "g1", memberEnrollmentIds: ["e1"], hasScore: true, groupCriterionIds: [], individualComponents: [] }],
    });
    expect(missing.readyToPublish).toBe(false);
    expect(missing.unassignedEnrollmentIds).toEqual(["e2"]);
    expect(missing.missingGroupCriterionGroupIds).toEqual(["g1"]);
  });
});
''')
write('apps/backend/src/plugins/student-portal/group-assessment-db.test.ts', r'''import { afterAll, describe, expect, test } from "bun:test";
import { prisma } from "../../core/db/prisma.ts";

const run = process.env.GROUP_ASSESSMENT_DB_TESTS === "1";
const dbDescribe = run ? describe : describe.skip;

dbDescribe("group assessment database integrity", () => {
  afterAll(async () => { await prisma.$disconnect(); });

  test("migration exposes GroupIndividual and RLS-protects every new provenance table", async () => {
    const enumRows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AssessmentItemMode'
    `;
    expect(enumRows.map((row) => row.enumlabel)).toContain("GroupIndividual");

    const rows = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
      SELECT c.relname::text, c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (
        'AssessmentGroup','AssessmentGroupMember','AssessmentGroupScore','AssessmentGroupCriterionScore',
        'AssessmentIndividualComponent','AssessmentIndividualCriterionScore','AssessmentGroupScoreCorrection',
        'AssessmentIndividualComponentCorrection','AssessmentGroupAuditEvent'
      ) ORDER BY c.relname
    `;
    expect(rows).toHaveLength(9);
    expect(rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  test("group audit history is append-only", async () => {
    const actor = await prisma.user.findFirst({ select: { id: true } });
    if (!actor) throw new Error("Seed user required");
    const event = await prisma.assessmentGroupAuditEvent.create({ data: { offeringId: crypto.randomUUID(), courseSpecId: crypto.randomUUID(), assessmentItemId: crypto.randomUUID(), action: "GroupsConfigured", actorId: actor.id, details: { test: true } } });
    await expect(prisma.assessmentGroupAuditEvent.update({ where: { id: event.id }, data: { reason: "rewrite" } })).rejects.toThrow(/append-only/i);
    await expect(prisma.assessmentGroupAuditEvent.delete({ where: { id: event.id } })).rejects.toThrow(/append-only/i);
  });
});
''')

ci = '.github/workflows/ci.yml'
replace_once(
    ci,
    '      - name: Verify finalized result correction integrity\n        run: bun test apps/backend/src/plugins/student-portal/results-lifecycle-db.test.ts\n        env:\n          RESULT_CORRECTION_DB_TESTS: "1"\n\n',
    '      - name: Verify finalized result correction integrity\n'
    '        run: bun test apps/backend/src/plugins/student-portal/results-lifecycle-db.test.ts\n'
    '        env:\n'
    '          RESULT_CORRECTION_DB_TESTS: "1"\n\n'
    '      - name: Verify group assessment provenance and audit integrity\n'
    '        run: bun test apps/backend/src/plugins/student-portal/group-assessment-db.test.ts\n'
    '        env:\n'
    '          GROUP_ASSESSMENT_DB_TESTS: "1"\n\n',
)

# Self-clean patch staging files; the workflow commits only the implementation.
for temp in [
    '.github/scripts/apply_issue_449_stage1.py',
    '.github/workflows/apply-issue-449-stage1.yml',
]:
    p = ROOT / temp
    if p.exists():
        p.unlink()
