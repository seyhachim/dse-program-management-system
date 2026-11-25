-- #1334 and #1335: participation evidence and programme news.
-- Additive only: no changes to existing roll-call attendance.
CREATE TABLE "OfferingActivityParticipant" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "studentId" TEXT,
  "externalName" VARCHAR(160),
  "externalRole" VARCHAR(32),
  "goStatus" TEXT NOT NULL DEFAULT 'Unknown',
  "returnStatus" TEXT NOT NULL DEFAULT 'Unknown',
  "farmStatus" TEXT NOT NULL DEFAULT 'Unverified',
  "source" TEXT NOT NULL DEFAULT 'Manual',
  "note" VARCHAR(500) NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfferingActivityParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfferingActivityParticipant_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "OfferingActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingActivityParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingActivityParticipant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingActivityParticipant_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "visit_participant_identity_check" CHECK ((("studentId" IS NOT NULL) AND ("externalName" IS NULL)) OR (("studentId" IS NULL) AND (nullif(trim("externalName"), '') IS NOT NULL))),
  CONSTRAINT "visit_participant_go_check" CHECK ("goStatus" IN ('Unknown','Marked','NotMarked')),
  CONSTRAINT "visit_participant_return_check" CHECK ("returnStatus" IN ('Unknown','Marked','NotMarked')),
  CONSTRAINT "visit_participant_farm_check" CHECK ("farmStatus" IN ('Unverified','Confirmed','NotAttended')),
  CONSTRAINT "visit_participant_source_check" CHECK ("source" IN ('Manual','PaperTripSheet','HostVerified')),
  CONSTRAINT "visit_participant_role_check" CHECK ("externalRole" IS NULL OR "externalRole" IN ('Staff','Assistant','Guest','Other')),
  CONSTRAINT "visit_participant_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "OfferingActivityParticipant_activityId_studentId_key" ON "OfferingActivityParticipant"("activityId", "studentId");
CREATE INDEX "OfferingActivityParticipant_activityId_idx" ON "OfferingActivityParticipant"("activityId");

CREATE TABLE "OfferingActivityParticipantAudit" (
  "id" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfferingActivityParticipantAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfferingActivityParticipantAudit_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "OfferingActivityParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingActivityParticipantAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "visit_participant_audit_action_check" CHECK ("action" IN ('created','updated'))
);
CREATE INDEX "OfferingActivityParticipantAudit_participantId_createdAt_idx" ON "OfferingActivityParticipantAudit"("participantId","createdAt");

CREATE TABLE "DseNewsArticle" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "activityId" TEXT,
  "authorId" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "summary" VARCHAR(350) NOT NULL DEFAULT '',
  "body" TEXT NOT NULL DEFAULT '',
  "coverImageUrl" TEXT,
  "coverAlt" VARCHAR(250) NOT NULL DEFAULT '',
  "gallery" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "tags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "mediaApproved" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'Draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DseNewsArticle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DseNewsArticle_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DseNewsArticle_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "OfferingActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DseNewsArticle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DseNewsArticle_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dse_news_status_check" CHECK ("status" IN ('Draft','Published','Archived')),
  CONSTRAINT "dse_news_version_check" CHECK ("version" > 0),
  CONSTRAINT "dse_news_gallery_check" CHECK (jsonb_typeof("gallery") = 'array'),
  CONSTRAINT "dse_news_tags_check" CHECK (jsonb_typeof("tags") = 'array')
);
CREATE INDEX "DseNewsArticle_programmeId_status_publishedAt_idx" ON "DseNewsArticle"("programmeId","status","publishedAt");
CREATE INDEX "DseNewsArticle_activityId_idx" ON "DseNewsArticle"("activityId");

CREATE TABLE "DseNewsAuditEvent" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DseNewsAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DseNewsAuditEvent_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "DseNewsArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DseNewsAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dse_news_audit_action_check" CHECK ("action" IN ('created','updated','published','unpublished','archived'))
);
CREATE INDEX "DseNewsAuditEvent_articleId_createdAt_idx" ON "DseNewsAuditEvent"("articleId","createdAt");

-- No direct Supabase API access to participant identities or unpublished articles.
ALTER TABLE "OfferingActivityParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OfferingActivityParticipantAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DseNewsArticle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DseNewsAuditEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "OfferingActivityParticipant", "OfferingActivityParticipantAudit", "DseNewsArticle", "DseNewsAuditEvent" FROM PUBLIC;
DO $$
DECLARE api_role text;
DECLARE table_name text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY(ARRAY['anon','authenticated','service_role']) LOOP
    FOREACH table_name IN ARRAY ARRAY['OfferingActivityParticipant','OfferingActivityParticipantAudit','DseNewsArticle','DseNewsAuditEvent'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I',table_name,api_role);
    END LOOP;
  END LOOP;
END $$;
