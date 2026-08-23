-- Lecturer Portfolio verification decisions are append-only audit evidence.
-- Corrections are represented by a later Verification/Rejected/Reset event.

CREATE OR REPLACE FUNCTION "reject_lecturer_portfolio_verification_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'LecturerPortfolioVerification is append-only';
END;
$$;

REVOKE ALL ON FUNCTION "reject_lecturer_portfolio_verification_mutation"() FROM PUBLIC;

CREATE TRIGGER "LecturerPortfolioVerification_append_only_update"
BEFORE UPDATE ON "LecturerPortfolioVerification"
FOR EACH ROW EXECUTE FUNCTION "reject_lecturer_portfolio_verification_mutation"();

CREATE TRIGGER "LecturerPortfolioVerification_append_only_delete"
BEFORE DELETE ON "LecturerPortfolioVerification"
FOR EACH ROW EXECUTE FUNCTION "reject_lecturer_portfolio_verification_mutation"();
