-- Opportunity posters are stored in a separately provisioned Supabase Storage bucket.
-- The DB only keeps generated object paths; no direct Data API access is granted.
ALTER TABLE "Opportunity" ADD COLUMN "posterPath" TEXT;
