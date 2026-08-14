from pathlib import Path

path = Path('apps/backend/prisma/schema.prisma')
text = path.read_text()

if 'model QaDocument {' in text:
    print('QaDocument already present; nothing to patch.')
    raise SystemExit(0)

programme_anchor = '''  qaAnalyses      QaEvidenceAnalysis[]\n'''
if programme_anchor not in text:
    raise SystemExit('Programme QA relation anchor not found')
text = text.replace(
    programme_anchor,
    programme_anchor + '''  qaDocuments     QaDocument[]\n''',
    1,
)

permission_anchor = '''model Permission {\n'''
models = '''/// Programme-scoped QA document metadata. Text content is normalized into\n/// chunks below so retrieval can preserve page/section provenance independently.\nmodel QaDocument {\n  id             String            @id @default(uuid())\n  programmeId    String\n  programme      Programme         @relation(fields: [programmeId], references: [id], onDelete: Restrict)\n  title          String\n  documentType   String\n  sourceUrl      String?\n  sourceRef      String            @default(\"\")\n  version        String            @default(\"1\")\n  reportingStart DateTime?\n  reportingEnd   DateTime?\n  contentHash    String\n  createdAt      DateTime          @default(now())\n  updatedAt      DateTime          @updatedAt\n  chunks         QaDocumentChunk[]\n\n  @@index([programmeId, documentType])\n  @@index([programmeId, reportingEnd])\n}\n\n/// Stable chunk provenance for QA document retrieval. Embeddings are stored as\n/// PostgreSQL float arrays so the pilot does not require pgvector; ranking is\n/// performed application-side at the current programme-scale volume.\nmodel QaDocumentChunk {\n  id             String     @id\n  documentId     String\n  document       QaDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)\n  chunkIndex     Int\n  pageNumber     Int?\n  sectionLabel   String     @default(\"\")\n  startOffset    Int\n  endOffset      Int\n  text           String\n  embedding      Float[]    @default([])\n  embeddingModel String     @default(\"\")\n  createdAt      DateTime   @default(now())\n\n  @@unique([documentId, chunkIndex])\n  @@index([documentId])\n  @@index([embeddingModel])\n}\n\n'''
if permission_anchor not in text:
    raise SystemExit('Permission model anchor not found')
text = text.replace(permission_anchor, models + permission_anchor, 1)
path.write_text(text)
