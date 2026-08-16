CREATE TABLE "OfferingResultAccessPolicy" (
  "offeringId" TEXT NOT NULL,
  "requireSurveyBeforeResults" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfferingResultAccessPolicy_pkey" PRIMARY KEY ("offeringId")
);

ALTER TABLE "OfferingResultAccessPolicy"
  ADD CONSTRAINT "OfferingResultAccessPolicy_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "Offering"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
