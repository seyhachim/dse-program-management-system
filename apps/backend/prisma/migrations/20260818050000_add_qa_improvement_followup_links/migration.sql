-- Issue #306: explicit improvement-action -> follow-up evidence relationships.
CREATE TABLE "QaImprovementActionFollowUp" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "linkedById" TEXT NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaImprovementActionFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QaImprovementActionFollowUp_actionId_evidenceId_key"
  ON "QaImprovementActionFollowUp"("actionId", "evidenceId");
CREATE INDEX "QaImprovementActionFollowUp_programmeId_actionId_idx"
  ON "QaImprovementActionFollowUp"("programmeId", "actionId");
CREATE INDEX "QaImprovementActionFollowUp_evidenceId_idx"
  ON "QaImprovementActionFollowUp"("evidenceId");

ALTER TABLE "QaImprovementActionFollowUp" ADD CONSTRAINT "QaImprovementActionFollowUp_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaImprovementActionFollowUp" ADD CONSTRAINT "QaImprovementActionFollowUp_actionId_fkey"
  FOREIGN KEY ("actionId") REFERENCES "QaImprovementAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaImprovementActionFollowUp" ADD CONSTRAINT "QaImprovementActionFollowUp_evidenceId_fkey"
  FOREIGN KEY ("evidenceId") REFERENCES "QaEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaImprovementActionFollowUp" ADD CONSTRAINT "QaImprovementActionFollowUp_linkedById_fkey"
  FOREIGN KEY ("linkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_qa_improvement_followup_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'QA improvement follow-up relationships are append-only';
END;
$$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prevent_qa_improvement_followup_rewrite() FROM PUBLIC;
CREATE TRIGGER "QaImprovementActionFollowUp_no_update" BEFORE UPDATE ON "QaImprovementActionFollowUp"
  FOR EACH ROW EXECUTE FUNCTION prevent_qa_improvement_followup_rewrite();
CREATE TRIGGER "QaImprovementActionFollowUp_no_delete" BEFORE DELETE ON "QaImprovementActionFollowUp"
  FOR EACH ROW EXECUTE FUNCTION prevent_qa_improvement_followup_rewrite();

ALTER TABLE "QaImprovementActionFollowUp" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "QaImprovementActionFollowUp" FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'QaImprovementActionFollowUp', api_role);
    EXECUTE format('REVOKE ALL ON FUNCTION public.prevent_qa_improvement_followup_rewrite() FROM %I', api_role);
  END LOOP;
END $$;
