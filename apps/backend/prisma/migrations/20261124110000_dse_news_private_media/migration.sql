-- Private, editor-controlled photos. Bucket itself is provisioned separately
-- in the correct Supabase Storage project, NOT in non-Supabase staging.
CREATE TABLE "DseNewsMedia" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "storagePath" VARCHAR(240) NOT NULL,
  "thumbnailPath" VARCHAR(240) NOT NULL,
  "alt" VARCHAR(250) NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "bytes" INTEGER NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DseNewsMedia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DseNewsMedia_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "DseNewsArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DseNewsMedia_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DseNewsMedia_kind_check" CHECK ("kind" IN ('cover','gallery')),
  CONSTRAINT "DseNewsMedia_size_check" CHECK ("width" BETWEEN 1 AND 2000 AND "height" BETWEEN 1 AND 2000 AND "bytes" BETWEEN 1 AND 2621440),
  CONSTRAINT "DseNewsMedia_alt_check" CHECK (length(trim("alt")) >= 3)
);
CREATE UNIQUE INDEX "DseNewsMedia_storagePath_key" ON "DseNewsMedia"("storagePath");
CREATE UNIQUE INDEX "DseNewsMedia_thumbnailPath_key" ON "DseNewsMedia"("thumbnailPath");
CREATE UNIQUE INDEX "DseNewsMedia_one_cover_idx" ON "DseNewsMedia"("articleId") WHERE "kind"='cover';
CREATE INDEX "DseNewsMedia_articleId_kind_idx" ON "DseNewsMedia"("articleId", "kind");
ALTER TABLE "DseNewsMedia" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "DseNewsMedia" FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY(ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE "DseNewsMedia" FROM %I', api_role);
  END LOOP;
END $$;
