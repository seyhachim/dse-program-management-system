CREATE TABLE "CopCommunity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "programmeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "leadership" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CopCommunity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CopCommunity_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CopCommunity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CopCommunity_programmeId_name_key" ON "CopCommunity"("programmeId", "name");
CREATE INDEX "CopCommunity_programmeId_active_idx" ON "CopCommunity"("programmeId", "active");

CREATE TABLE "CopMembership" (
  "communityId" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CopMembership_pkey" PRIMARY KEY ("communityId", "userId"),
  CONSTRAINT "CopMembership_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "CopCommunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CopMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CopMembership_userId_idx" ON "CopMembership"("userId");

CREATE TABLE "CopDiscussion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "communityId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Discussing',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CopDiscussion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CopDiscussion_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "CopCommunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CopDiscussion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CopDiscussion_communityId_createdAt_idx" ON "CopDiscussion"("communityId", "createdAt" DESC);

CREATE TABLE "CopComment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "discussionId" UUID NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CopComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CopComment_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "CopDiscussion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CopComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CopComment_discussionId_createdAt_idx" ON "CopComment"("discussionId", "createdAt");

CREATE TABLE "CopAction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "discussionId" UUID NOT NULL,
  "summary" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Proposed',
  "ownerId" TEXT,
  "relatedCourseId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CopAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CopAction_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "CopDiscussion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CopAction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CopAction_relatedCourseId_fkey" FOREIGN KEY ("relatedCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CopAction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CopAction_discussionId_status_idx" ON "CopAction"("discussionId", "status");
