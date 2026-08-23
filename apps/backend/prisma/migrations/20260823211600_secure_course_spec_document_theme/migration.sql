-- Issue #613: keep document-style governance tables behind the backend boundary.
-- The application server owns these tables; Supabase Data API roles receive no grants.

ALTER TABLE "ProgrammeCourseSpecDocumentTheme" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseSpecDocumentTheme" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseSpecDocumentThemeAuditEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "ProgrammeCourseSpecDocumentTheme" FROM PUBLIC;
REVOKE ALL ON TABLE "CourseSpecDocumentTheme" FROM PUBLIC;
REVOKE ALL ON TABLE "CourseSpecDocumentThemeAuditEvent" FROM PUBLIC;
REVOKE ALL ON FUNCTION "guard_course_spec_document_theme_mutation"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "guard_course_spec_document_theme_audit_immutable"() FROM PUBLIC;

DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE "ProgrammeCourseSpecDocumentTheme" FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON TABLE "CourseSpecDocumentTheme" FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON TABLE "CourseSpecDocumentThemeAuditEvent" FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION "guard_course_spec_document_theme_mutation"() FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION "guard_course_spec_document_theme_audit_immutable"() FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END;
$$;