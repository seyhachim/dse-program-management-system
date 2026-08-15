from pathlib import Path

path = Path("apps/backend/prisma/schema.prisma")
text = path.read_text()

if "model QaRequirementAssignment {" in text:
    raise SystemExit(0)

replacements = [
    (
        '  qaAnalysisReviews       QaEvidenceAnalysisReview[] @relation("QaAnalysisReviewer")\n',
        '  qaAnalysisReviews       QaEvidenceAnalysisReview[] @relation("QaAnalysisReviewer")\n'
        '  qaRequirementAssignments QaRequirementAssignment[] @relation("QaRequirementAssignee")\n'
        '  qaAssignmentsCreated     QaRequirementAssignment[] @relation("QaRequirementAssignedBy")\n',
    ),
    (
        '  qaAnalysisReviews QaEvidenceAnalysisReview[]\n',
        '  qaAnalysisReviews QaEvidenceAnalysisReview[]\n'
        '  qaRequirementAssignments QaRequirementAssignment[]\n',
    ),
    (
        '  analyses     QaEvidenceAnalysis[]\n\n  @@unique([criterionId, code])',
        '  analyses     QaEvidenceAnalysis[]\n'
        '  assignments  QaRequirementAssignment[]\n\n'
        '  @@unique([criterionId, code])',
    ),
    (
        '  analyses    QaEvidenceAnalysis[]\n\n  @@index([programmeId, status])',
        '  analyses    QaEvidenceAnalysis[]\n'
        '  assignments QaRequirementAssignment[]\n\n'
        '  @@index([programmeId, status])',
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected schema anchor once, found {count}: {old[:60]!r}")
    text = text.replace(old, new, 1)

anchor = '''  @@index([frameworkId])
}

/// Verifiable evidence for one requirement. Direct programme ownership makes
'''
model = '''  @@index([frameworkId])
}

/// One primary QA/SAR work owner for a requirement in one assessment cycle.
/// This is workflow ownership only; it does not change evidence, analysis, or
/// the separate human self-assessment/rating record.
model QaRequirementAssignment {
  id            String            @id @default(uuid())
  programmeId   String
  programme     Programme         @relation(fields: [programmeId], references: [id], onDelete: Restrict)
  cycleId       String
  cycle         QaAssessmentCycle @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  requirementId String
  requirement   QaRequirement     @relation(fields: [requirementId], references: [id], onDelete: Restrict)
  assigneeId    String
  assignee      User              @relation("QaRequirementAssignee", fields: [assigneeId], references: [id], onDelete: Restrict)
  assignedById  String
  assignedBy    User              @relation("QaRequirementAssignedBy", fields: [assignedById], references: [id], onDelete: Restrict)
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  @@unique([cycleId, requirementId])
  @@index([programmeId, cycleId])
  @@index([cycleId, assigneeId])
  @@index([assignedById])
}

/// Verifiable evidence for one requirement. Direct programme ownership makes
'''

count = text.count(anchor)
if count != 1:
    raise SystemExit(f"Expected assignment-model anchor once, found {count}")

path.write_text(text.replace(anchor, model, 1))
