from pathlib import Path

path = Path("apps/backend/prisma/schema.prisma")
text = path.read_text()
if "model QaSarSubmission {" in text:
    raise SystemExit(0)

pairs = [
    (
        '''enum QaSarSectionStatus {
  NotStarted
  Drafting
  ReadyForReview
  UnderReview
  ChangesRequested
  Approved
}
''',
        '''enum QaSarSectionStatus {
  NotStarted
  Drafting
  ReadyForReview
  UnderReview
  ChangesRequested
  Approved
}

enum QaSarReviewDecision {
  Approved
  ChangesRequested
  MoreEvidenceRequested
}
''',
    ),
    (
        '  qaSarSectionsUpdated      QaSarSection[]             @relation("QaSarSectionUpdatedBy")\n',
        '  qaSarSectionsUpdated      QaSarSection[]             @relation("QaSarSectionUpdatedBy")\n'
        '  qaSarSubmissions          QaSarSubmission[]          @relation("QaSarSubmittedBy")\n'
        '  qaSarReviews              QaSarReview[]              @relation("QaSarReviewer")\n',
    ),
    (
        '  qaSarSections             QaSarSection[]\n',
        '  qaSarSections             QaSarSection[]\n'
        '  qaSarSubmissions          QaSarSubmission[]\n',
    ),
    (
        '  sarSections  QaSarSection[]\n\n  @@unique([criterionId, code])',
        '  sarSections    QaSarSection[]\n'
        '  sarSubmissions QaSarSubmission[]\n\n'
        '  @@unique([criterionId, code])',
    ),
    (
        '  sarSections      QaSarSection[]\n\n  @@index([programmeId, status])',
        '  sarSections      QaSarSection[]\n'
        '  sarSubmissions   QaSarSubmission[]\n\n'
        '  @@index([programmeId, status])',
    ),
    (
        '  updatedAt             DateTime           @updatedAt\n\n  @@unique([cycleId, requirementId])',
        '  updatedAt             DateTime           @updatedAt\n\n'
        '  submissions           QaSarSubmission[]\n\n'
        '  @@unique([cycleId, requirementId])',
    ),
]
for old, new in pairs:
    if text.count(old) != 1:
        raise SystemExit(f"schema anchor count {text.count(old)} for {old[:70]!r}")
    text = text.replace(old, new, 1)

anchor = '''  @@index([updatedById])
}

/// Canonical programme evidence item.'''
models = '''  @@index([updatedById])
}

/// Immutable snapshot of one SAR draft at the moment it is submitted for
/// review. New submissions append versions rather than overwriting history.
model QaSarSubmission {
  id                    String            @id @default(uuid())
  programmeId           String
  programme             Programme         @relation(fields: [programmeId], references: [id], onDelete: Restrict)
  cycleId               String
  cycle                 QaAssessmentCycle @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  requirementId         String
  requirement           QaRequirement     @relation(fields: [requirementId], references: [id], onDelete: Restrict)
  sectionId             String
  section               QaSarSection      @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  version               Int
  content               Json
  plainText             String
  practiceDescribed     Boolean
  resultsAnalysed       Boolean
  improvementExplained  Boolean
  evidenceIds           String[]
  submittedById         String
  submittedBy           User              @relation("QaSarSubmittedBy", fields: [submittedById], references: [id], onDelete: Restrict)
  submittedAt           DateTime          @default(now())

  reviews               QaSarReview[]

  @@unique([sectionId, version])
  @@index([programmeId, cycleId])
  @@index([requirementId])
  @@index([submittedById])
}

/// Append-only human decision tied to one exact immutable SAR submission.
model QaSarReview {
  id            String              @id @default(uuid())
  submissionId  String
  submission    QaSarSubmission     @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  reviewerId    String
  reviewer      User                @relation("QaSarReviewer", fields: [reviewerId], references: [id], onDelete: Restrict)
  decision      QaSarReviewDecision
  comment       String              @default("")
  createdAt     DateTime            @default(now())

  @@index([submissionId, createdAt])
  @@index([reviewerId])
}

/// Canonical programme evidence item.'''
if text.count(anchor) != 1:
    raise SystemExit(f"model insertion anchor count {text.count(anchor)}")
text = text.replace(anchor, models, 1)
path.write_text(text)
