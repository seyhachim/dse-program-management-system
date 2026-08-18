-- Recurring room/time schedule for each class offering. Existing offerings are
-- intentionally left with no meetings; their planned workload continues to use
-- course-spec contact hours until an administrator adds a timetable.
CREATE TABLE "OfferingMeeting" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "dayOfWeek" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "room" TEXT,
  "activityType" TEXT NOT NULL DEFAULT 'Lecture',

  CONSTRAINT "OfferingMeeting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OfferingMeeting_offeringId_dayOfWeek_startTime_idx"
  ON "OfferingMeeting"("offeringId", "dayOfWeek", "startTime");

ALTER TABLE "OfferingMeeting"
  ADD CONSTRAINT "OfferingMeeting_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "Offering"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
