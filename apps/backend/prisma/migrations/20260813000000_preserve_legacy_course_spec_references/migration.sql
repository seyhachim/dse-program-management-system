DO $$
DECLARE
  collision_count INTEGER;
BEGIN
  IF to_regclass('"CourseSpecReference"') IS NOT NULL THEN
    EXECUTE '
      SELECT COUNT(*)
      FROM "CourseSpecReference" legacy
      INNER JOIN "CourseSpecResource" resource
        ON resource."courseSpecId" = legacy."courseSpecId"
       AND resource."id" = legacy."id"
    '
    INTO collision_count;

    IF collision_count > 0 THEN
      RAISE EXCEPTION
        'Cannot migrate CourseSpecReference: % ID collision(s) found',
        collision_count;
    END IF;

    EXECUTE '
      INSERT INTO "CourseSpecResource" (
        "id",
        "courseSpecId",
        "order",
        "weekId",
        "resourceType",
        "title",
        "url",
        "notes",
        "evidenceWeekIds",
        "kind",
        "authors",
        "publisher",
        "year",
        "isbn",
        "basedOn"
      )
      SELECT
        "id",
        "courseSpecId",
        "order",
        NULL,
        "kind",
        "title",
        "url",
        "notes",
        ARRAY[]::TEXT[],
        "kind",
        "authors",
        "publisher",
        "year",
        "isbn",
        "basedOn"
      FROM "CourseSpecReference"
    ';

    EXECUTE 'DROP TABLE "CourseSpecReference"';
  END IF;
END
$$;

ALTER TABLE "CourseSpecResource"
ALTER COLUMN "kind" SET DEFAULT 'OTHER';