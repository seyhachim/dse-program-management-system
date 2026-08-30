-- Keep current/future Lab Custodian responsibility attached to an active location.
-- Historical assignments that ended before today do not block archiving.
CREATE OR REPLACE FUNCTION reject_resource_location_archive_with_responsibility()
RETURNS trigger AS $$
BEGIN
  IF OLD."active" = true AND NEW."active" = false AND EXISTS (
    SELECT 1
    FROM "ResourceResponsibilityAssignment" a
    WHERE a."locationId" = OLD."id"
      AND (a."effectiveTo" IS NULL OR a."effectiveTo" >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'End or hand over current/future resource responsibilities before archiving this location';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ResourceLocation_guard_archive"
BEFORE UPDATE OF "active" ON "ResourceLocation"
FOR EACH ROW EXECUTE FUNCTION reject_resource_location_archive_with_responsibility();
