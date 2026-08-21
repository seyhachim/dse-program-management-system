-- Issue #491: privacy-minimizing Ask DSE information-gap analytics.
-- Keep this operational/public-channel dataset outside the Prisma-managed public
-- academic schema. The PMS backend owns all access; Supabase Data API roles get
-- no direct access.

CREATE SCHEMA IF NOT EXISTS public_analytics;

CREATE TABLE public_analytics."PublicQuestionEvent" (
  "id" TEXT PRIMARY KEY,
  "programmeId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceEventKey" TEXT,
  "analyticsActorHash" TEXT,
  "questionTextSanitized" TEXT NOT NULL,
  "normalizedQuestion" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "topMatchFaqSlug" TEXT,
  "topMatchScore" INTEGER,
  "answerDelivered" BOOLEAN NOT NULL DEFAULT FALSE,
  "reviewState" TEXT NOT NULL DEFAULT 'Unreviewed',
  "reviewedAt" TIMESTAMPTZ,
  "resolvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicQuestionEvent_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES public."Programme"("id") ON DELETE CASCADE,
  CONSTRAINT "PublicQuestionEvent_source_check"
    CHECK ("source" IN ('Telegram', 'PublicHttp')),
  CONSTRAINT "PublicQuestionEvent_outcome_check"
    CHECK ("outcome" IN ('Suggestions', 'None')),
  CONSTRAINT "PublicQuestionEvent_reviewState_check"
    CHECK ("reviewState" IN ('Unreviewed', 'Reviewed', 'Resolved')),
  CONSTRAINT "PublicQuestionEvent_score_check"
    CHECK ("topMatchScore" IS NULL OR ("topMatchScore" >= 0 AND "topMatchScore" <= 100))
);

CREATE UNIQUE INDEX "PublicQuestionEvent_sourceEventKey_key"
  ON public_analytics."PublicQuestionEvent"("sourceEventKey")
  WHERE "sourceEventKey" IS NOT NULL;
CREATE INDEX "PublicQuestionEvent_programme_review_created_idx"
  ON public_analytics."PublicQuestionEvent"("programmeId", "reviewState", "createdAt" DESC);
CREATE INDEX "PublicQuestionEvent_programme_normalized_idx"
  ON public_analytics."PublicQuestionEvent"("programmeId", "normalizedQuestion");

CREATE TABLE public_analytics."PublicQuestionSuggestion" (
  "eventId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "faqSlug" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  CONSTRAINT "PublicQuestionSuggestion_pkey" PRIMARY KEY ("eventId", "rank"),
  CONSTRAINT "PublicQuestionSuggestion_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES public_analytics."PublicQuestionEvent"("id") ON DELETE CASCADE,
  CONSTRAINT "PublicQuestionSuggestion_rank_check" CHECK ("rank" BETWEEN 1 AND 3),
  CONSTRAINT "PublicQuestionSuggestion_score_check" CHECK ("score" BETWEEN 0 AND 100)
);

CREATE INDEX "PublicQuestionSuggestion_faqSlug_idx"
  ON public_analytics."PublicQuestionSuggestion"("faqSlug");

ALTER TABLE public_analytics."PublicQuestionEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_analytics."PublicQuestionSuggestion" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON SCHEMA public_analytics FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public_analytics FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public_analytics FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public_analytics FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA public_analytics FROM %I', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public_analytics FROM %I', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public_analytics FROM %I', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public_analytics FROM %I', api_role);
  END LOOP;
END
$$;
