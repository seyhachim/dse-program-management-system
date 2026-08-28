-- Issue #678: additive staff-profile fields required by the Staff Information import.
-- These columns are professional/profile metadata only; they do not alter teaching,
-- CourseSpec, curriculum, results, or QA approval records.

ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "profileImageUrl" TEXT;

ALTER TABLE public."LecturerProfile"
  ADD COLUMN IF NOT EXISTS "shortBio" TEXT,
  ADD COLUMN IF NOT EXISTS "programmeStartDate" DATE;

ALTER TABLE public."User"
  ADD CONSTRAINT "User_profileImageUrl_https_check"
  CHECK (
    "profileImageUrl" IS NULL
    OR "profileImageUrl" = ''
    OR "profileImageUrl" ~* '^https://'
  );
