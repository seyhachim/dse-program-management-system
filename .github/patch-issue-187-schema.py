from pathlib import Path

path = Path('apps/backend/prisma/schema.prisma')
text = path.read_text()

replacements = [
    (
        '''enum QaEvidenceStatus {\n  Draft\n  Ready\n  Reviewed\n}\n''',
        '''enum QaEvidenceStatus {\n  Draft\n  Ready\n  Reviewed\n}\n\nenum QaEvidenceAnalysisState {\n  EvidenceIdentified\n  PotentialEvidenceGap\n  ExpertReviewRequired\n}\n'''
    ),
    (
        '''  qaCycles        QaAssessmentCycle[]\n  qaEvidence      QaEvidence[]\n  qaAssessments   QaRequirementAssessment[]\n''',
        '''  qaCycles        QaAssessmentCycle[]\n  qaEvidence      QaEvidence[]\n  qaAssessments   QaRequirementAssessment[]\n  qaAnalyses      QaEvidenceAnalysis[]\n'''
    ),
    (
        '''  evidence     QaEvidence[]\n  assessments  QaRequirementAssessment[]\n  expectations QaQualityExpectation[]\n''',
        '''  evidence     QaEvidence[]\n  assessments  QaRequirementAssessment[]\n  expectations QaQualityExpectation[]\n  analyses     QaEvidenceAnalysis[]\n'''
    ),
    (
        '''  expectedEvidence QaExpectedEvidence[]\n\n  @@unique([requirementId, order])\n''',
        '''  expectedEvidence QaExpectedEvidence[]\n  analyses         QaEvidenceAnalysis[]\n\n  @@unique([requirementId, order])\n'''
    ),
    (
        '''  evidence    QaEvidence[]\n  assessments QaRequirementAssessment[]\n\n  @@index([programmeId, status])\n''',
        '''  evidence    QaEvidence[]\n  assessments QaRequirementAssessment[]\n  analyses    QaEvidenceAnalysis[]\n\n  @@index([programmeId, status])\n'''
    ),
    (
        '''  @@index([programmeId, cycleId])\n  @@index([requirementId])\n  @@index([status])\n}\n\n/// Human-entered, justified self-rating.''',
        '''  analysisSources QaEvidenceAnalysisSource[]\n\n  @@index([programmeId, cycleId])\n  @@index([requirementId])\n  @@index([status])\n}\n\n/// Human-entered, justified self-rating.'''
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Expected schema anchor not found: {old[:80]!r}')
    text = text.replace(old, new, 1)

anchor = '''model Permission {\n'''
models = '''/// Append-only evidence-analysis run. Re-analysis creates a new row rather than\n/// overwriting history; official AUN-QA ratings remain in QaRequirementAssessment.\nmodel QaEvidenceAnalysis {\n  id              String                     @id @default(uuid())\n  programmeId     String\n  programme       Programme                  @relation(fields: [programmeId], references: [id], onDelete: Restrict)\n  cycleId         String\n  cycle           QaAssessmentCycle          @relation(fields: [cycleId], references: [id], onDelete: Cascade)\n  requirementId   String\n  requirement     QaRequirement              @relation(fields: [requirementId], references: [id], onDelete: Restrict)\n  expectationId   String\n  expectation     QaQualityExpectation       @relation(fields: [expectationId], references: [id], onDelete: Restrict)\n  state           QaEvidenceAnalysisState\n  explanation     String                     @default(\"\")\n  confidence      Float?\n  uncertaintyNote String                     @default(\"\")\n  engine          String\n  engineVersion   String\n  createdAt       DateTime                   @default(now())\n  sources         QaEvidenceAnalysisSource[]\n\n  @@index([programmeId, cycleId, createdAt])\n  @@index([requirementId, createdAt])\n  @@index([expectationId, createdAt])\n}\n\n/// Immutable snapshot of a source used by one analysis run. Structured entity\n/// identity is retained even if source content changes later; qaEvidenceId is an\n/// optional convenience FK for manually attached QA evidence.\nmodel QaEvidenceAnalysisSource {\n  id            String             @id @default(uuid())\n  analysisId    String\n  analysis      QaEvidenceAnalysis @relation(fields: [analysisId], references: [id], onDelete: Cascade)\n  sourceKind    String\n  candidateKey  String\n  sourceDomain  String\n  entityType    String\n  entityId      String\n  qaEvidenceId  String?\n  qaEvidence    QaEvidence?        @relation(fields: [qaEvidenceId], references: [id], onDelete: SetNull)\n  title         String\n  summary       String             @default(\"\")\n  excerpt       String             @default(\"\")\n  route         String?\n  reportingDate DateTime?\n  relevance     Float?\n  createdAt     DateTime           @default(now())\n\n  @@unique([analysisId, candidateKey])\n  @@index([qaEvidenceId])\n  @@index([entityType, entityId])\n}\n\n'''

if 'model QaEvidenceAnalysis {' in text:
    raise SystemExit('QaEvidenceAnalysis already present')
if anchor not in text:
    raise SystemExit('Permission model anchor not found')
text = text.replace(anchor, models + anchor, 1)
path.write_text(text)
