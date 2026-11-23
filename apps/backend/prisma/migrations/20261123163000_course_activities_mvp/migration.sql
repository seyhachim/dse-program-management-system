-- #1328: additive, offering-owned experiential course activity records.
-- No prior attendance, calendar, course specification, or portfolio data is changed.
CREATE TABLE "OfferingActivity" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "type" VARCHAR(32) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "date" DATE NOT NULL,
  "startTime" VARCHAR(5),
  "endTime" VARCHAR(5),
  "host" VARCHAR(160) NOT NULL,
  "location" VARCHAR(240) NOT NULL DEFAULT '',
  "description" VARCHAR(2000) NOT NULL DEFAULT '',
  "objectives" VARCHAR(2000) NOT NULL DEFAULT '',
  "reflectionPrompt" VARCHAR(1200) NOT NULL DEFAULT '',
  "evidenceLinks" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'Draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfferingActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfferingActivity_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingActivity_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingActivity_type_check" CHECK ("type" IN ('field_visit','industry_visit','workshop','guest_lecture','other')),
  CONSTRAINT "OfferingActivity_status_check" CHECK ("status" IN ('Draft','Published','Archived')),
  CONSTRAINT "OfferingActivity_times_check" CHECK (
    ("startTime" IS NULL OR "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND
    ("endTime" IS NULL OR "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND
    ("startTime" IS NULL OR "endTime" IS NULL OR "endTime" > "startTime")
  ),
  CONSTRAINT "OfferingActivity_version_check" CHECK ("version" > 0),
  CONSTRAINT "OfferingActivity_evidence_array_check" CHECK (jsonb_typeof("evidenceLinks") = 'array')
);
CREATE INDEX "OfferingActivity_offeringId_date_idx" ON "OfferingActivity"("offeringId", "date");
CREATE INDEX "OfferingActivity_status_idx" ON "OfferingActivity"("status");

CREATE TABLE "OfferingActivityAuditEvent" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfferingActivityAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfferingActivityAuditEvent_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "OfferingActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingActivityAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingActivityAuditEvent_action_check" CHECK ("action" IN ('created','updated','archived'))
);
CREATE INDEX "OfferingActivityAuditEvent_activityId_createdAt_idx" ON "OfferingActivityAuditEvent"("activityId","createdAt");

-- Backend-only records, including evidence links and reviewer provenance.
-- Deny direct PostgREST/Data API access even to Supabase service_role.
ALTER TABLE "OfferingActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OfferingActivityAuditEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "OfferingActivity" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "OfferingActivityAuditEvent" FROM PUBLIC;
DO $$
DECLARE api_role text;
DECLARE tbl text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY(ARRAY['anon','authenticated','service_role']) LOOP
    FOREACH tbl IN ARRAY ARRAY['OfferingActivity','OfferingActivityAuditEvent'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', tbl, api_role);
    END LOOP;
  END LOOP;
END
$$;
