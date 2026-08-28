-- Lecturer Portfolio verification decisions are append-only audit evidence.
-- Corrections are represented by a later Verified/Rejected/Reset event.

CREATE OR REPLACE FUNCTION lecturer_portfolio."reject_lecturer_portfolio_verification_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, lecturer_portfolio, public
AS $$
BEGIN
  RAISE EXCEPTION 'LecturerPortfolioVerification is append-only';
END;
$$;

REVOKE ALL ON FUNCTION lecturer_portfolio."reject_lecturer_portfolio_verification_mutation"() FROM PUBLIC;

CREATE TRIGGER "LecturerPortfolioVerification_append_only_update"
BEFORE UPDATE ON lecturer_portfolio."LecturerPortfolioVerification"
FOR EACH ROW EXECUTE FUNCTION lecturer_portfolio."reject_lecturer_portfolio_verification_mutation"();

CREATE TRIGGER "LecturerPortfolioVerification_append_only_delete"
BEFORE DELETE ON lecturer_portfolio."LecturerPortfolioVerification"
FOR EACH ROW EXECUTE FUNCTION lecturer_portfolio."reject_lecturer_portfolio_verification_mutation"();
