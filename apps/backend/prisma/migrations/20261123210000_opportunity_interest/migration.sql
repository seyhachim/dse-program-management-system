-- Optional, local-time-aware registration interest cutoff (existing date column stays unchanged).
ALTER TABLE "Opportunity" ADD COLUMN "deadlineTime" TEXT;
ALTER TABLE "Opportunity"
  ADD CONSTRAINT "Opportunity_deadlineTime_check"
  CHECK ("deadlineTime" IS NULL OR ("deadline" IS NOT NULL AND "deadlineTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'));

-- Intention to join is not a verified competition result or external registration.
CREATE TABLE "OpportunityInterest" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Joined',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpportunityInterest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpportunityInterest_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpportunityInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpportunityInterest_status_check" CHECK ("status" IN ('Joined', 'Withdrawn')),
  CONSTRAINT "OpportunityInterest_withdrawnAt_check" CHECK ("status" <> 'Withdrawn' OR "withdrawnAt" IS NOT NULL)
);
CREATE UNIQUE INDEX "OpportunityInterest_opportunityId_userId_key" ON "OpportunityInterest"("opportunityId", "userId");
CREATE INDEX "OpportunityInterest_opportunityId_status_idx" ON "OpportunityInterest"("opportunityId", "status");
CREATE INDEX "OpportunityInterest_userId_idx" ON "OpportunityInterest"("userId");

-- Backend-only: students can only get anonymous counts; staff roster requires programme role.
ALTER TABLE "OpportunityInterest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "OpportunityInterest" FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY(ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE "OpportunityInterest" FROM %I', api_role);
  END LOOP;
END
$$;
