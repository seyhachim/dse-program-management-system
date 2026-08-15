from pathlib import Path

path = Path("apps/backend/prisma/schema.prisma")
text = path.read_text()
if "model QaSarSection {" in text:
    raise SystemExit(0)

replacements = [
    (
        '''enum QaAnalysisReviewDecision {
  Confirmed
  Rejected
  NeedsMoreEvidence
}
''',
        '''enum QaAnalysisReviewDecision {
  Confirmed
  Rejected
  NeedsMoreEvidence
}

enum QaSarSectionStatus {
  NotStarted
  Drafting
  ReadyForReview
  UnderReview
  ChangesRequested
  Approved
}
''',
    ),
    (
        '  qaAssignmentsCreated     QaRequirementAssignment[] @relation("QaRequirementAssignedBy")\n',
        '  qaAssignmentsCreated     QaRequirementAssignment[] @relation("QaRequirementAssignedBy")\n'
        '  qaSarSectionsUpdated      QaSarSection[]             @relation("QaSarSectionUpdatedBy")\n',
    ),
    (
        '  qaRequirementAssignments QaRequirementAssignment[]\n',
        '  qaRequirementAssignments QaRequirementAssignment[]\n'
        '  qaSarSections             QaSarSection[]\n',
    ),
    (
        '  assignments  QaRequirementAssignment[]\n\n  @@unique([criterionId, code])',
        '  assignments  QaRequirementAssignment[]\n'
        '  sarSections  QaSarSection[]\n\n'
        '  @@unique([criterionId, code])',
    ),
    (
        '  assignments      QaRequirementAssignment[]\n\n  @@index([programmeId, status])',
        '  assignments      QaRequirementAssignment[]\n'
        '  sarSections      QaSarSection[]\n\n'
        '  @@index([programmeId, status])',
    ),
]
for old, new in replacements:
    if text.count(old) != 1:
        raise SystemExit(f"Expected schema anchor once, found {text.count(old)}: {old[:80]!r}")
    text = text.replace(old, new, 1)

anchor = '''  @@index([assignedById])
}

/// Canonical programme evidence item.'''
model = '''  @@index([assignedById])
}

/// Mutable working SAR section for one AUN-QA requirement in one cycle.
/// Approved/submitted history is introduced separately; this model is the
/// contributor's current structured draft, not the official SAR snapshot.
model QaSarSection {
  id                    String             @id @default(uuid())
  programmeId           String
  programme             Programme          @relation(fields: [programmeId], references: [id], onDelete: Restrict)
  cycleId               String
  cycle                 QaAssessmentCycle  @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  requirementId         String
  requirement           QaRequirement      @relation(fields: [requirementId], references: [id], onDelete: Restrict)
  content               Json
  plainText             String             @default("")
  status                QaSarSectionStatus @default(NotStarted)
  practiceDescribed     Boolean            @default(false)
  resultsAnalysed       Boolean            @default(false)
  improvementExplained  Boolean            @default(false)
  updatedById           String?
  updatedBy             User?              @relation("QaSarSectionUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  @@unique([cycleId, requirementId])
  @@index([programmeId, cycleId])
  @@index([status])
  @@index([updatedById])
}

/// Canonical programme evidence item.'''
if text.count(anchor) != 1:
    raise SystemExit(f"Expected SAR insertion anchor once, found {text.count(anchor)}")
text = text.replace(anchor, model, 1)
path.write_text(text)
