-- Action Research Phase 4 (#724)
-- Intervention state remains inside the already-secured ActionResearchCycle row.
-- Every create/edit/status/log operation is also appended to ActionResearchAuditEvent,
-- preserving author/time/version history without modifying approved protocol or baseline records.

ALTER TABLE "ActionResearchCycle"
  ADD COLUMN "interventions" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "ActionResearchCycle"
  ADD CONSTRAINT "ActionResearchCycle_interventions_array_check"
  CHECK (jsonb_typeof("interventions") = 'array');
