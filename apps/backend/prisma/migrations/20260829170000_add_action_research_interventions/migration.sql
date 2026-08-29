-- Action Research Phase 4 (#724)
-- Planned interventions are versioned; delivery/fidelity observations are append-only.
-- Approved protocols and locked baselines remain immutable and are not rewritten here.

CREATE TABLE "ActionResearchIntervention" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "target" TEXT NOT NULL,
  "plannedStart" TIMESTAMP(3) NOT NULL,
  "plannedEnd" TIMESTAMP(3) NOT NULL,
  "expectedEffect" TEXT NOT NULL DEFAULT '',
  "expectedDelay" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionResearchIntervention_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionResearchIntervention_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ActionResearchCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchIntervention_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchIntervention_status_check" CHECK ("status" IN ('PLANNED','ACTIVE','COMPLETED','CANCELLED')),
  CONSTRAINT "ActionResearchIntervention_dates_check" CHECK ("plannedEnd" >= "plannedStart"),
  CONSTRAINT "ActionResearchIntervention_version_check" CHECK ("version" >= 1)
);

CREATE INDEX "ActionResearchIntervention_cycleId_status_idx"
  ON "ActionResearchIntervention"("cycleId", "status");
CREATE INDEX "ActionResearchIntervention_cycleId_plannedStart_idx"
  ON "ActionResearchIntervention"("cycleId", "plannedStart");

CREATE TABLE "ActionResearchInterventionResearcher" (
  "interventionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "addedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionResearchInterventionResearcher_pkey" PRIMARY KEY ("interventionId", "userId"),
  CONSTRAINT "ActionResearchInterventionResearcher_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "ActionResearchIntervention"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchInterventionResearcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchInterventionResearcher_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ActionResearchInterventionResearcher_userId_idx"
  ON "ActionResearchInterventionResearcher"("userId");

CREATE TABLE "ActionResearchInterventionLog" (
  "id" TEXT NOT NULL,
  "interventionId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "plannedDosage" TEXT NOT NULL DEFAULT '',
  "deliveredDosage" TEXT NOT NULL DEFAULT '',
  "reachCount" INTEGER,
  "reachDenominator" INTEGER,
  "reachNote" TEXT NOT NULL DEFAULT '',
  "deviation" TEXT NOT NULL DEFAULT '',
  "deviationReason" TEXT NOT NULL DEFAULT '',
  "contextualEvents" TEXT NOT NULL DEFAULT '',
  "lecturerObservation" TEXT NOT NULL DEFAULT '',
  "evidenceRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "authorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionResearchInterventionLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionResearchInterventionLog_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "ActionResearchIntervention"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchInterventionLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchInterventionLog_reach_count_check" CHECK ("reachCount" IS NULL OR "reachCount" >= 0),
  CONSTRAINT "ActionResearchInterventionLog_reach_denominator_check" CHECK ("reachDenominator" IS NULL OR "reachDenominator" > 0),
  CONSTRAINT "ActionResearchInterventionLog_reach_range_check" CHECK (
    "reachCount" IS NULL OR "reachDenominator" IS NULL OR "reachCount" <= "reachDenominator"
  )
);

CREATE INDEX "ActionResearchInterventionLog_interventionId_occurredAt_idx"
  ON "ActionResearchInterventionLog"("interventionId", "occurredAt");
CREATE INDEX "ActionResearchInterventionLog_authorId_idx"
  ON "ActionResearchInterventionLog"("authorId");

ALTER TABLE "ActionResearchIntervention" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActionResearchInterventionResearcher" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActionResearchInterventionLog" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "ActionResearchIntervention" FROM PUBLIC;
REVOKE ALL ON TABLE "ActionResearchInterventionResearcher" FROM PUBLIC;
REVOKE ALL ON TABLE "ActionResearchInterventionLog" FROM PUBLIC;

DO $$
DECLARE
  role_name TEXT;
  table_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH table_name IN ARRAY ARRAY[
        'ActionResearchIntervention',
        'ActionResearchInterventionResearcher',
        'ActionResearchInterventionLog'
      ]
      LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', table_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
