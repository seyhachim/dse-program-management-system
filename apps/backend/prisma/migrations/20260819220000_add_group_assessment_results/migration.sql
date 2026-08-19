-- Issue #449: first-class Individual / Group / Group+Individual result provenance.
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
