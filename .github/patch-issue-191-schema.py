from pathlib import Path
p=Path('apps/backend/prisma/schema.prisma')
s=p.read_text()
if 'model QaEvidenceAnalysisReview {' in s:
    raise SystemExit(0)
s=s.replace('''enum QaEvidenceAnalysisState {\n  EvidenceIdentified\n  PotentialEvidenceGap\n  ExpertReviewRequired\n}\n''','''enum QaEvidenceAnalysisState {\n  EvidenceIdentified\n  PotentialEvidenceGap\n  ExpertReviewRequired\n}\n\nenum QaAnalysisReviewDecision {\n  Confirmed\n  Rejected\n  NeedsMoreEvidence\n}\n''',1)
s=s.replace('''  qaAssessmentsReviewed   QaRequirementAssessment[] @relation("QaAssessmentReviewer")\n''','''  qaAssessmentsReviewed   QaRequirementAssessment[] @relation("QaAssessmentReviewer")\n  qaAnalysisReviews       QaEvidenceAnalysisReview[] @relation("QaAnalysisReviewer")\n''',1)
s=s.replace('''  qaDocuments     QaDocument[]\n''','''  qaDocuments     QaDocument[]\n  qaAnalysisReviews QaEvidenceAnalysisReview[]\n''',1)
s=s.replace('''  sources         QaEvidenceAnalysisSource[]\n\n  @@index([programmeId, cycleId, createdAt])\n''','''  sources         QaEvidenceAnalysisSource[]\n  reviews         QaEvidenceAnalysisReview[]\n\n  @@index([programmeId, cycleId, createdAt])\n''',1)
anchor='''model QaEvidenceAnalysisSource {\n'''
model='''/// Append-only human validation of one exact evidence-analysis version.\nmodel QaEvidenceAnalysisReview {\n  id          String                   @id @default(uuid())\n  programmeId String\n  programme   Programme                @relation(fields: [programmeId], references: [id], onDelete: Restrict)\n  analysisId  String\n  analysis    QaEvidenceAnalysis       @relation(fields: [analysisId], references: [id], onDelete: Cascade)\n  reviewerId  String\n  reviewer    User                     @relation("QaAnalysisReviewer", fields: [reviewerId], references: [id], onDelete: Restrict)\n  decision    QaAnalysisReviewDecision\n  comment     String                   @default(\"\")\n  createdAt   DateTime                 @default(now())\n\n  @@index([programmeId, createdAt])\n  @@index([analysisId, createdAt])\n  @@index([reviewerId])\n}\n\n'''
if anchor not in s: raise SystemExit('source model anchor not found')
s=s.replace(anchor,model+anchor,1)
p.write_text(s)
