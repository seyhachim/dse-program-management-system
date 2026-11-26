-- Add group and individual-component source identities without rewriting prior evidence.
ALTER TABLE "AssessmentEvidenceRevision" ALTER COLUMN "resultId" DROP NOT NULL;
ALTER TABLE "AssessmentEvidenceRevision" ADD COLUMN "groupScoreId" TEXT REFERENCES "AssessmentGroupScore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentEvidenceRevision" ADD COLUMN "componentId" TEXT REFERENCES "AssessmentIndividualComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentEvidenceRevision" ADD CONSTRAINT "AssessmentEvidenceRevision_exactly_one_source" CHECK (num_nonnulls("resultId","groupScoreId","componentId") = 1);
CREATE UNIQUE INDEX "AssessmentEvidenceRevision_group_revision_key" ON "AssessmentEvidenceRevision"("groupScoreId","revision");
CREATE UNIQUE INDEX "AssessmentEvidenceRevision_component_revision_key" ON "AssessmentEvidenceRevision"("componentId","revision");

-- Use the exact source kind and locked canonical group membership.
CREATE OR REPLACE FUNCTION "validate_assessment_evidence_revision"() RETURNS trigger AS $$
DECLARE previous "AssessmentEvidenceRevision"%ROWTYPE;
BEGIN
  IF NEW."resultId" IS NOT NULL THEN
    PERFORM 1 FROM "AssessmentResult" r WHERE r.id = NEW."resultId" FOR UPDATE;
    IF NOT EXISTS (
      SELECT 1 FROM "AssessmentResult" r JOIN "Enrollment" e ON e.id = r."enrollmentId"
      JOIN "Offering" o ON o.id = e."offeringId"
      JOIN "CourseSpec" s ON s.id = o."courseSpecId" AND s."courseId" = o."courseId"
      JOIN "CourseSpecAssessmentItem" a ON a."courseSpecId" = s.id AND a.id = r."assessmentItemId"
      WHERE r.id = NEW."resultId" AND o.id = NEW."offeringId"
        AND r."courseSpecId" = NEW."courseSpecId" AND s.id = NEW."courseSpecId"
        AND a.id = NEW."assessmentItemId" AND a.mode = 'Individual' AND a.status = 'Active'
        AND s."reviewStatus" = 'Approved' AND r."publishedAt" IS NOT NULL AND r."finalizedAt" IS NOT NULL
        AND r.score = NEW.score AND r."maxScore" = NEW."maxScore"
    ) THEN RAISE EXCEPTION 'Invalid individual evidence source'; END IF;
  ELSIF NEW."groupScoreId" IS NOT NULL OR NEW."componentId" IS NOT NULL THEN
    IF NEW."groupScoreId" IS NOT NULL THEN
      PERFORM 1 FROM "AssessmentGroupScore" WHERE id = NEW."groupScoreId" FOR UPDATE;
    ELSE
      PERFORM 1 FROM "AssessmentIndividualComponent" WHERE id = NEW."componentId" FOR UPDATE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "AssessmentGroup" g
      JOIN "Offering" o ON o.id = g."offeringId" AND o."courseSpecId" = g."courseSpecId"
      JOIN "CourseSpec" s ON s.id = g."courseSpecId" AND s."courseId" = o."courseId"
      JOIN "CourseSpecAssessmentItem" a ON a."courseSpecId" = s.id AND a.id = g."assessmentItemId"
      LEFT JOIN "AssessmentGroupScore" gs ON gs."groupId" = g.id
      LEFT JOIN "AssessmentIndividualComponent" ic ON ic."groupId" = g.id AND ic.id = NEW."componentId"
        AND ic."offeringId" = g."offeringId" AND ic."courseSpecId" = g."courseSpecId" AND ic."assessmentItemId" = g."assessmentItemId"
      WHERE g."offeringId" = NEW."offeringId" AND g."courseSpecId" = NEW."courseSpecId" AND g."assessmentItemId" = NEW."assessmentItemId"
        AND s."reviewStatus" = 'Approved' AND a.status = 'Active' AND g."membershipLockedAt" IS NOT NULL
        AND g."publishedAt" IS NOT NULL AND g."finalizedAt" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "AssessmentGroupMember" m WHERE m."groupId" = g.id)
        AND NOT EXISTS (SELECT 1 FROM "AssessmentGroupMember" m LEFT JOIN "Enrollment" e ON e.id = m."enrollmentId"
          WHERE m."groupId" = g.id AND e."offeringId" IS DISTINCT FROM g."offeringId")
        AND ((NEW."groupScoreId" = gs.id AND a.mode IN ('Group','GroupIndividual') AND gs.score = NEW.score AND gs."maxScore" = NEW."maxScore")
          OR (NEW."componentId" = ic.id AND a.mode = 'GroupIndividual' AND ic.score + ic."adjustmentPoints" = NEW.score AND ic."maxScore" = NEW."maxScore"
            AND EXISTS (SELECT 1 FROM "AssessmentGroupMember" m WHERE m."groupId" = g.id AND m."enrollmentId" = ic."enrollmentId")))
    ) THEN RAISE EXCEPTION 'Invalid group evidence source'; END IF;
  ELSE RAISE EXCEPTION 'Missing evidence source'; END IF;

  SELECT * INTO previous FROM "AssessmentEvidenceRevision" x
    WHERE x."resultId" = NEW."resultId" OR x."groupScoreId" = NEW."groupScoreId" OR x."componentId" = NEW."componentId"
    ORDER BY revision DESC LIMIT 1;
  IF NOT FOUND THEN
    IF NEW.revision <> 1 OR NEW.action <> 'create' THEN RAISE EXCEPTION 'Invalid initial evidence revision'; END IF;
  ELSE
    IF NEW.revision <> previous.revision + 1 OR NEW.action = 'create'
      OR NEW."offeringId" <> previous."offeringId" OR NEW."courseSpecId" <> previous."courseSpecId"
      OR NEW."assessmentItemId" <> previous."assessmentItemId" THEN RAISE EXCEPTION 'Invalid evidence revision sequence'; END IF;
    IF NEW.action = 'submit' AND previous.status <> 'draft' THEN RAISE EXCEPTION 'Evidence must be draft'; END IF;
    IF NEW.action IN ('verify','request_changes') AND previous.status <> 'submitted' THEN RAISE EXCEPTION 'Evidence must be submitted'; END IF;
    IF NEW.action <> 'revise' AND (NEW."sourceHash" IS DISTINCT FROM previous."sourceHash"
      OR NEW."sourceSnapshot" IS DISTINCT FROM previous."sourceSnapshot"
      OR NEW."workReference" IS DISTINCT FROM previous."workReference"
      OR NEW."attachment" IS DISTINCT FROM previous."attachment"
      OR NEW."selectionReason" IS DISTINCT FROM previous."selectionReason")
    THEN RAISE EXCEPTION 'Only revisions may change evidence content'; END IF;
    IF NEW.action IN ('verify','request_changes') AND EXISTS (
      SELECT 1 FROM "AssessmentEvidenceRevision" x WHERE
      (x."resultId" = NEW."resultId" OR x."groupScoreId" = NEW."groupScoreId" OR x."componentId" = NEW."componentId")
      AND x."actorId" = NEW."actorId" AND x.action IN ('create','revise','submit')
    ) THEN RAISE EXCEPTION 'Evidence authors cannot review their own evidence'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
-- The unified validation function above now also protects attachment revisions.
DROP TRIGGER "AssessmentEvidenceRevision_attachment_validate" ON "AssessmentEvidenceRevision";
DROP FUNCTION "validate_assessment_evidence_attachment"();
