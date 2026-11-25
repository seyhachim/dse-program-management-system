-- #1284: manual opportunity publication, student-consented portfolio experience,
-- and immutable action history. No existing academic/student data is mutated.
CREATE TABLE "Opportunity" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "organizer" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "eligibility" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "applicationUrl" TEXT,
  "deadline" DATE,
  "status" TEXT NOT NULL DEFAULT 'Draft',
  "createdById" TEXT NOT NULL,
  "publishedById" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Opportunity_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Opportunity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Opportunity_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Opportunity_status_check" CHECK ("status" IN ('Draft', 'Published', 'Archived')),
  CONSTRAINT "Opportunity_sourceUrl_check" CHECK ("sourceUrl" ~* '^https://[^[:space:]]+$'),
  CONSTRAINT "Opportunity_applicationUrl_check" CHECK ("applicationUrl" IS NULL OR "applicationUrl" ~* '^https://[^[:space:]]+$'),
  CONSTRAINT "Opportunity_publication_check" CHECK (("status" <> 'Published') OR ("publishedAt" IS NOT NULL AND "publishedById" IS NOT NULL))
);

CREATE TABLE "OpportunityExperience" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Pending',
  "consentedById" TEXT NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpportunityExperience_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpportunityExperience_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpportunityExperience_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "StudentPortfolioEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpportunityExperience_consentedById_fkey" FOREIGN KEY ("consentedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpportunityExperience_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpportunityExperience_outcome_check" CHECK ("outcome" IN ('Winner','Finalist','Participant')),
  CONSTRAINT "OpportunityExperience_status_check" CHECK ("status" IN ('Pending','Approved','Hidden')),
  CONSTRAINT "OpportunityExperience_review_check" CHECK (("status" = 'Pending') OR ("reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL))
);

CREATE TABLE "OpportunityAuditEvent" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpportunityAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpportunityAuditEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpportunityAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Opportunity_programmeId_status_deadline_idx" ON "Opportunity"("programmeId", "status", "deadline");
CREATE INDEX "Opportunity_createdAt_idx" ON "Opportunity"("createdAt");
CREATE UNIQUE INDEX "OpportunityExperience_opportunityId_evidenceId_key" ON "OpportunityExperience"("opportunityId", "evidenceId");
CREATE INDEX "OpportunityExperience_opportunityId_status_idx" ON "OpportunityExperience"("opportunityId", "status");
CREATE INDEX "OpportunityExperience_status_createdAt_idx" ON "OpportunityExperience"("status", "createdAt");
CREATE INDEX "OpportunityAuditEvent_opportunityId_createdAt_idx" ON "OpportunityAuditEvent"("opportunityId", "createdAt");

-- Supabase Data API is never a publication or approval boundary. Backend-only access.
ALTER TABLE "Opportunity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OpportunityExperience" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OpportunityAuditEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "Opportunity" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "OpportunityExperience" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "OpportunityAuditEvent" FROM PUBLIC;
DO $$
DECLARE api_role text;
DECLARE tbl text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY(ARRAY['anon','authenticated','service_role']) LOOP
    FOREACH tbl IN ARRAY ARRAY['Opportunity','OpportunityExperience','OpportunityAuditEvent'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', tbl, api_role);
    END LOOP;
  END LOOP;
END
$$;
