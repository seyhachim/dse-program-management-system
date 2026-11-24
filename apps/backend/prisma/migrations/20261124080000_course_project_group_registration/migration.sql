
-- Additive proposal workflow; existing academic groups and results are untouched.
CREATE TABLE "CourseProjectGroupRegistration" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "offeringId" TEXT NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "assessmentItemId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "maxGroups" INTEGER NOT NULL CHECK ("maxGroups" BETWEEN 1 AND 100),
  "minMembers" INTEGER NOT NULL CHECK ("minMembers" BETWEEN 2 AND 30),
  "maxMembers" INTEGER NOT NULL CHECK ("maxMembers" BETWEEN "minMembers" AND 30),
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "proposals" JSONB NOT NULL CHECK (jsonb_typeof("proposals") = 'array'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseProjectGroupRegistration_context_key" UNIQUE ("offeringId","courseSpecId","assessmentItemId"),
  CONSTRAINT "CourseProjectGroupRegistration_offering_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CourseProjectGroupRegistration_assessment_fkey" FOREIGN KEY ("courseSpecId","assessmentItemId") REFERENCES "CourseSpecAssessmentItem"("courseSpecId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CourseProjectGroupRegistrationEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "registrationId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL CHECK (length(btrim("action")) > 0),
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseProjectGroupEvent_registration_fkey" FOREIGN KEY ("registrationId") REFERENCES "CourseProjectGroupRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CourseProjectGroupEvent_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CourseProjectGroupEvent_registration_created_idx" ON "CourseProjectGroupRegistrationEvent"("registrationId","createdAt");
CREATE INDEX "CourseProjectGroupEvent_actor_idx" ON "CourseProjectGroupRegistrationEvent"("actorId");
CREATE FUNCTION "protect_course_project_group_event"() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Course project group registration history is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CourseProjectGroupEvent_append_only" BEFORE UPDATE OR DELETE ON "CourseProjectGroupRegistrationEvent"
FOR EACH ROW EXECUTE FUNCTION "protect_course_project_group_event"();

ALTER TABLE "CourseProjectGroupRegistration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseProjectGroupRegistrationEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "CourseProjectGroupRegistration", "CourseProjectGroupRegistrationEvent" FROM PUBLIC;
DO $revoke_roles$
DECLARE api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role'])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I, public.%I FROM %I',
      'CourseProjectGroupRegistration', 'CourseProjectGroupRegistrationEvent', api_role);
  END LOOP;
END;
$revoke_roles$;
