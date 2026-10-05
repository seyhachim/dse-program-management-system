-- Keep exactly one active Class Monitor per Offering, while allowing
-- multiple active Deputy Class Monitors (SubClassMonitor).
-- The active offering/student uniqueness remains unchanged, so one student
-- cannot hold multiple active responsibilities for the same Offering.

DROP INDEX IF EXISTS "ClassResponsibilityAssignment_active_offering_role_key";

CREATE UNIQUE INDEX "ClassResponsibilityAssignment_active_class_monitor_key"
ON "ClassResponsibilityAssignment"("offeringId")
WHERE "revokedAt" IS NULL
  AND "role" = 'ClassMonitor'::"ClassResponsibilityRole";
