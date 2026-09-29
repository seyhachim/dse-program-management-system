CREATE TABLE "pms_attendance"."TeachingSessionDeliveryLecturer" (
  "deliveryId" TEXT NOT NULL,
  "lecturerId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeachingSessionDeliveryLecturer_pkey"
    PRIMARY KEY ("deliveryId", "lecturerId"),
  CONSTRAINT "TeachingSessionDeliveryLecturer_deliveryId_fkey"
    FOREIGN KEY ("deliveryId")
    REFERENCES "pms_attendance"."TeachingSessionDelivery"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionDeliveryLecturer_lecturerId_fkey"
    FOREIGN KEY ("lecturerId")
    REFERENCES "public"."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "TeachingSessionDeliveryLecturer_lecturer_idx"
  ON "pms_attendance"."TeachingSessionDeliveryLecturer"("lecturerId", "deliveryId");

-- Preserve every existing single-lecturer delivery without rewriting the
-- authoritative delivery row or its append-only audit history.
INSERT INTO "pms_attendance"."TeachingSessionDeliveryLecturer" (
  "deliveryId", "lecturerId", "createdAt"
)
SELECT
  d."id", d."actualLecturerId", d."recordedAt"
FROM "pms_attendance"."TeachingSessionDelivery" d
WHERE d."actualLecturerId" IS NOT NULL
ON CONFLICT ("deliveryId", "lecturerId") DO NOTHING;

ALTER TABLE "pms_attendance"."TeachingSessionDeliveryLecturer" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionDeliveryLecturer" FROM PUBLIC;

DO $delivery_lecturer_roles$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionDeliveryLecturer" FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$delivery_lecturer_roles$;
