-- Issue #613: governance-controlled Course Specification document styling.
-- Presentation settings are normalized and version-scoped; academic content is untouched.

CREATE TABLE "ProgrammeCourseSpecDocumentTheme" (
  "programmeId" TEXT NOT NULL,
  "bodyFontFamily" TEXT NOT NULL DEFAULT 'Times New Roman',
  "bodyFontSizePt" DOUBLE PRECISION NOT NULL DEFAULT 11,
  "documentTitleSizePt" DOUBLE PRECISION NOT NULL DEFAULT 14,
  "heading1SizePt" DOUBLE PRECISION NOT NULL DEFAULT 12,
  "heading2SizePt" DOUBLE PRECISION NOT NULL DEFAULT 11,
  "heading3SizePt" DOUBLE PRECISION NOT NULL DEFAULT 11,
  "lineHeight" DOUBLE PRECISION NOT NULL DEFAULT 1.1,
  "paragraphSpacingPt" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "letterSpacingPx" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "defaultAlignment" TEXT NOT NULL DEFAULT 'left',
  "marginTopMm" DOUBLE PRECISION NOT NULL DEFAULT 15,
  "marginBottomMm" DOUBLE PRECISION NOT NULL DEFAULT 15,
  "marginLeftMm" DOUBLE PRECISION NOT NULL DEFAULT 15,
  "marginRightMm" DOUBLE PRECISION NOT NULL DEFAULT 15,
  "tableFontSizePt" DOUBLE PRECISION NOT NULL DEFAULT 9.5,
  "tableCellPaddingPt" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "headerFontSizePt" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "footerFontSizePt" DOUBLE PRECISION NOT NULL DEFAULT 8,
  "showHeader" BOOLEAN NOT NULL DEFAULT TRUE,
  "showFooter" BOOLEAN NOT NULL DEFAULT TRUE,
  "showPageNumbers" BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeCourseSpecDocumentTheme_pkey" PRIMARY KEY ("programmeId"),
  CONSTRAINT "ProgrammeCourseSpecDocumentTheme_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CourseSpecDocumentTheme" (
  "courseSpecId" TEXT NOT NULL,
  "bodyFontFamily" TEXT NOT NULL DEFAULT 'Times New Roman',
  "bodyFontSizePt" DOUBLE PRECISION NOT NULL DEFAULT 11,
  "documentTitleSizePt" DOUBLE PRECISION NOT NULL DEFAULT 14,
  "heading1SizePt" DOUBLE PRECISION NOT NULL DEFAULT 12,
  "heading2SizePt" DOUBLE PRECISION NOT NULL DEFAULT 11,
  "heading3SizePt" DOUBLE PRECISION NOT NULL DEFAULT 11,
  "lineHeight" DOUBLE PRECISION NOT NULL DEFAULT 1.1,
  "paragraphSpacingPt" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "letterSpacingPx" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "defaultAlignment" TEXT NOT NULL DEFAULT 'left',
  "marginTopMm" DOUBLE PRECISION NOT NULL DEFAULT 15,
  "marginBottomMm" DOUBLE PRECISION NOT NULL DEFAULT 15,
  "marginLeftMm" DOUBLE PRECISION NOT NULL DEFAULT 15,
  "marginRightMm" DOUBLE PRECISION NOT NULL DEFAULT 15,
  "tableFontSizePt" DOUBLE PRECISION NOT NULL DEFAULT 9.5,
  "tableCellPaddingPt" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "headerFontSizePt" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "footerFontSizePt" DOUBLE PRECISION NOT NULL DEFAULT 8,
  "showHeader" BOOLEAN NOT NULL DEFAULT TRUE,
  "showFooter" BOOLEAN NOT NULL DEFAULT TRUE,
  "showPageNumbers" BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSpecDocumentTheme_pkey" PRIMARY KEY ("courseSpecId"),
  CONSTRAINT "CourseSpecDocumentTheme_courseSpecId_fkey"
    FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "ProgrammeCourseSpecDocumentTheme"
  ADD CONSTRAINT "ProgrammeCourseSpecDocumentTheme_font_check" CHECK ("bodyFontFamily" IN ('Arial', 'Calibri', 'Times New Roman')),
  ADD CONSTRAINT "ProgrammeCourseSpecDocumentTheme_alignment_check" CHECK ("defaultAlignment" IN ('left', 'center', 'right', 'justify')),
  ADD CONSTRAINT "ProgrammeCourseSpecDocumentTheme_bounds_check" CHECK (
    "bodyFontSizePt" BETWEEN 8 AND 13 AND
    "documentTitleSizePt" BETWEEN 13 AND 22 AND
    "heading1SizePt" BETWEEN 11 AND 18 AND
    "heading2SizePt" BETWEEN 10 AND 16 AND
    "heading3SizePt" BETWEEN 9 AND 14 AND
    "lineHeight" BETWEEN 1 AND 1.8 AND
    "paragraphSpacingPt" BETWEEN 0 AND 18 AND
    "letterSpacingPx" BETWEEN -0.2 AND 1 AND
    "marginTopMm" BETWEEN 8 AND 35 AND
    "marginBottomMm" BETWEEN 8 AND 35 AND
    "marginLeftMm" BETWEEN 8 AND 35 AND
    "marginRightMm" BETWEEN 8 AND 35 AND
    "tableFontSizePt" BETWEEN 7 AND 11 AND
    "tableCellPaddingPt" BETWEEN 1 AND 8 AND
    "headerFontSizePt" BETWEEN 7 AND 12 AND
    "footerFontSizePt" BETWEEN 6 AND 10
  );

ALTER TABLE "CourseSpecDocumentTheme"
  ADD CONSTRAINT "CourseSpecDocumentTheme_font_check" CHECK ("bodyFontFamily" IN ('Arial', 'Calibri', 'Times New Roman')),
  ADD CONSTRAINT "CourseSpecDocumentTheme_alignment_check" CHECK ("defaultAlignment" IN ('left', 'center', 'right', 'justify')),
  ADD CONSTRAINT "CourseSpecDocumentTheme_bounds_check" CHECK (
    "bodyFontSizePt" BETWEEN 8 AND 13 AND
    "documentTitleSizePt" BETWEEN 13 AND 22 AND
    "heading1SizePt" BETWEEN 11 AND 18 AND
    "heading2SizePt" BETWEEN 10 AND 16 AND
    "heading3SizePt" BETWEEN 9 AND 14 AND
    "lineHeight" BETWEEN 1 AND 1.8 AND
    "paragraphSpacingPt" BETWEEN 0 AND 18 AND
    "letterSpacingPx" BETWEEN -0.2 AND 1 AND
    "marginTopMm" BETWEEN 8 AND 35 AND
    "marginBottomMm" BETWEEN 8 AND 35 AND
    "marginLeftMm" BETWEEN 8 AND 35 AND
    "marginRightMm" BETWEEN 8 AND 35 AND
    "tableFontSizePt" BETWEEN 7 AND 11 AND
    "tableCellPaddingPt" BETWEEN 1 AND 8 AND
    "headerFontSizePt" BETWEEN 7 AND 12 AND
    "footerFontSizePt" BETWEEN 6 AND 10
  );

-- One default row per programme.
INSERT INTO "ProgrammeCourseSpecDocumentTheme" ("programmeId")
SELECT "id" FROM "Programme"
ON CONFLICT ("programmeId") DO NOTHING;

-- Existing Course Spec versions receive a stable snapshot now; later default edits cannot restyle them.
INSERT INTO "CourseSpecDocumentTheme" (
  "courseSpecId", "bodyFontFamily", "bodyFontSizePt", "documentTitleSizePt",
  "heading1SizePt", "heading2SizePt", "heading3SizePt", "lineHeight",
  "paragraphSpacingPt", "letterSpacingPx", "defaultAlignment",
  "marginTopMm", "marginBottomMm", "marginLeftMm", "marginRightMm",
  "tableFontSizePt", "tableCellPaddingPt", "headerFontSizePt", "footerFontSizePt",
  "showHeader", "showFooter", "showPageNumbers"
)
SELECT
  cs."id", d."bodyFontFamily", d."bodyFontSizePt", d."documentTitleSizePt",
  d."heading1SizePt", d."heading2SizePt", d."heading3SizePt", d."lineHeight",
  d."paragraphSpacingPt", d."letterSpacingPx", d."defaultAlignment",
  d."marginTopMm", d."marginBottomMm", d."marginLeftMm", d."marginRightMm",
  d."tableFontSizePt", d."tableCellPaddingPt", d."headerFontSizePt", d."footerFontSizePt",
  d."showHeader", d."showFooter", d."showPageNumbers"
FROM "CourseSpec" cs
JOIN "Course" c ON c."id" = cs."courseId"
JOIN "ProgrammeCourseSpecDocumentTheme" d ON d."programmeId" = c."programmeId"
ON CONFLICT ("courseSpecId") DO NOTHING;

CREATE OR REPLACE FUNCTION "guard_course_spec_document_theme_mutation"()
RETURNS trigger AS $$
DECLARE
  target_id TEXT;
  parent_status "CourseSpecReviewStatus";
BEGIN
  target_id := COALESCE(NEW."courseSpecId", OLD."courseSpecId");
  SELECT "reviewStatus" INTO parent_status FROM "CourseSpec" WHERE "id" = target_id;
  IF parent_status IS NULL THEN
    RAISE EXCEPTION 'Course specification not found for document theme';
  END IF;
  IF parent_status NOT IN ('Draft', 'ChangesRequested') THEN
    RAISE EXCEPTION 'Course specification document theme is immutable while review status is %', parent_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CourseSpecDocumentTheme_guard_mutation"
BEFORE INSERT OR UPDATE OR DELETE ON "CourseSpecDocumentTheme"
FOR EACH ROW EXECUTE FUNCTION "guard_course_spec_document_theme_mutation"();

CREATE TABLE "CourseSpecDocumentThemeAuditEvent" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "programmeId" TEXT NOT NULL,
  "courseSpecId" TEXT,
  "actorId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSpecDocumentThemeAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourseSpecDocumentThemeAuditEvent_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CourseSpecDocumentThemeAuditEvent_courseSpecId_fkey"
    FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CourseSpecDocumentThemeAuditEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CourseSpecDocumentThemeAuditEvent_scope_check" CHECK ("scope" IN ('VERSION', 'PROGRAMME_DEFAULT'))
);

CREATE INDEX "CourseSpecDocumentThemeAuditEvent_programmeId_createdAt_idx"
  ON "CourseSpecDocumentThemeAuditEvent"("programmeId", "createdAt");
CREATE INDEX "CourseSpecDocumentThemeAuditEvent_courseSpecId_createdAt_idx"
  ON "CourseSpecDocumentThemeAuditEvent"("courseSpecId", "createdAt");

CREATE OR REPLACE FUNCTION "guard_course_spec_document_theme_audit_immutable"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Course specification document theme audit events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CourseSpecDocumentThemeAuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "CourseSpecDocumentThemeAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "guard_course_spec_document_theme_audit_immutable"();
