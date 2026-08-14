-- Issue #189: programme-scoped QA document registry, chunk provenance, and embeddings.
-- Additive only; semantic retrieval remains evidence discovery, not accreditation scoring.

CREATE TABLE "QaDocument" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceRef" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL DEFAULT '1',
    "reportingStart" TIMESTAMP(3),
    "reportingEnd" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QaDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QaDocument_type_check"
      CHECK ("documentType" IN ('policy','minutes','survey','report','specification','staffDocument','other')),
    CONSTRAINT "QaDocument_reporting_dates_check"
      CHECK ("reportingStart" IS NULL OR "reportingEnd" IS NULL OR "reportingEnd" >= "reportingStart")
);

CREATE TABLE "QaDocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "pageNumber" INTEGER,
    "sectionLabel" TEXT NOT NULL DEFAULT '',
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "embeddingModel" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QaDocumentChunk_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QaDocumentChunk_index_check" CHECK ("chunkIndex" >= 0),
    CONSTRAINT "QaDocumentChunk_page_check" CHECK ("pageNumber" IS NULL OR "pageNumber" > 0),
    CONSTRAINT "QaDocumentChunk_offsets_check"
      CHECK ("startOffset" >= 0 AND "endOffset" >= "startOffset")
);

CREATE INDEX "QaDocument_programmeId_documentType_idx"
  ON "QaDocument"("programmeId", "documentType");
CREATE INDEX "QaDocument_programmeId_reportingEnd_idx"
  ON "QaDocument"("programmeId", "reportingEnd");
CREATE UNIQUE INDEX "QaDocumentChunk_documentId_chunkIndex_key"
  ON "QaDocumentChunk"("documentId", "chunkIndex");
CREATE INDEX "QaDocumentChunk_documentId_idx"
  ON "QaDocumentChunk"("documentId");
CREATE INDEX "QaDocumentChunk_embeddingModel_idx"
  ON "QaDocumentChunk"("embeddingModel");

ALTER TABLE "QaDocument" ADD CONSTRAINT "QaDocument_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaDocumentChunk" ADD CONSTRAINT "QaDocumentChunk_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "QaDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
