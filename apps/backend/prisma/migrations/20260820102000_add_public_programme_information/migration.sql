-- CreateEnum
CREATE TYPE "ProgrammePublicPublicationStatus" AS ENUM ('Draft', 'Published');

-- CreateEnum
CREATE TYPE "ProgrammeFaqCategory" AS ENUM (
    'About',
    'Admission',
    'Curriculum',
    'Careers',
    'FeesScholarships',
    'StudentLife',
    'Facilities',
    'Lecturers',
    'ImportantDates',
    'Contact'
);

-- CreateEnum
CREATE TYPE "ProgrammeImportantDateKind" AS ENUM (
    'ApplicationOpen',
    'ApplicationDeadline',
    'EntranceExam',
    'Interview',
    'ResultsAnnouncement',
    'Registration',
    'SemesterStart',
    'ScholarshipDeadline',
    'Other'
);

-- CreateTable
CREATE TABLE "ProgrammeFaq" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "category" "ProgrammeFaqCategory" NOT NULL,
    "slug" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "shortAnswer" TEXT,
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProgrammePublicPublicationStatus" NOT NULL DEFAULT 'Draft',
    "sourceLabel" TEXT,
    "sourceUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammeFaq_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProgrammeFaq_publication_state_check" CHECK (
        ("status" = 'Draft' AND "publishedAt" IS NULL)
        OR ("status" = 'Published' AND "publishedAt" IS NOT NULL)
    ),
    CONSTRAINT "ProgrammeFaq_sort_order_check" CHECK ("sortOrder" >= 0),
    CONSTRAINT "ProgrammeFaq_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT "ProgrammeFaq_question_check" CHECK (length(btrim("question")) > 0),
    CONSTRAINT "ProgrammeFaq_answer_check" CHECK (length(btrim("answer")) > 0)
);

-- CreateTable
CREATE TABLE "ProgrammeImportantDate" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "kind" "ProgrammeImportantDateKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL,
    "endDate" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ProgrammePublicPublicationStatus" NOT NULL DEFAULT 'Draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammeImportantDate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProgrammeImportantDate_publication_state_check" CHECK (
        ("status" = 'Draft' AND "publishedAt" IS NULL)
        OR ("status" = 'Published' AND "publishedAt" IS NOT NULL)
    ),
    CONSTRAINT "ProgrammeImportantDate_range_check" CHECK ("endDate" IS NULL OR "endDate" >= "date"),
    CONSTRAINT "ProgrammeImportantDate_sort_order_check" CHECK ("sortOrder" >= 0),
    CONSTRAINT "ProgrammeImportantDate_title_check" CHECK (length(btrim("title")) > 0)
);

-- CreateTable
CREATE TABLE "ProgrammePublicProfile" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "programmeName" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "overview" TEXT NOT NULL DEFAULT '',
    "admissionEmail" TEXT,
    "phone" TEXT,
    "websiteUrl" TEXT,
    "facebookUrl" TEXT,
    "campusAddress" TEXT,
    "mapUrl" TEXT,
    "applicationUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammePublicProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProgrammePublicProfile_programme_name_check" CHECK (length(btrim("programmeName")) > 0),
    CONSTRAINT "ProgrammePublicProfile_short_name_check" CHECK (length(btrim("shortName")) > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammeFaq_slug_key" ON "ProgrammeFaq"("slug");

-- CreateIndex
CREATE INDEX "ProgrammeFaq_programmeId_category_status_sortOrder_idx"
ON "ProgrammeFaq"("programmeId", "category", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "ProgrammeFaq_programmeId_status_isFeatured_idx"
ON "ProgrammeFaq"("programmeId", "status", "isFeatured");

-- CreateIndex
CREATE INDEX "ProgrammeImportantDate_programmeId_status_date_idx"
ON "ProgrammeImportantDate"("programmeId", "status", "date");

-- CreateIndex
CREATE INDEX "ProgrammeImportantDate_programmeId_kind_status_idx"
ON "ProgrammeImportantDate"("programmeId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammePublicProfile_programmeId_key"
ON "ProgrammePublicProfile"("programmeId");

-- AddForeignKey
ALTER TABLE "ProgrammeFaq"
ADD CONSTRAINT "ProgrammeFaq_programmeId_fkey"
FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeImportantDate"
ADD CONSTRAINT "ProgrammeImportantDate_programmeId_fkey"
FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammePublicProfile"
ADD CONSTRAINT "ProgrammePublicProfile_programmeId_fkey"
FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
