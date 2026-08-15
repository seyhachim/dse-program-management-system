from pathlib import Path

path = Path("apps/backend/prisma/schema.prisma")
text = path.read_text()

if "model QaEvidenceMapping {" in text:
    raise SystemExit(0)

replacements = [
    (
        '  qaEvidenceCreated       QaEvidence[]              @relation("QaEvidenceCreator")\n',
        '  qaEvidenceCreated       QaEvidence[]              @relation("QaEvidenceCreator")\n'
        '  qaEvidenceMappings      QaEvidenceMapping[]       @relation("QaEvidenceMapper")\n',
    ),
    (
        '  qaEvidence      QaEvidence[]\n',
        '  qaEvidence      QaEvidence[]\n'
        '  qaEvidenceMappings QaEvidenceMapping[]\n',
    ),
    (
        '  evidence     QaEvidence[]\n  assessments  QaRequirementAssessment[]',
        '  evidenceMappings QaEvidenceMapping[]\n  assessments      QaRequirementAssessment[]',
    ),
    (
        '  expectedEvidence QaExpectedEvidence[]\n  analyses         QaEvidenceAnalysis[]',
        '  expectedEvidence QaExpectedEvidence[]\n  analyses         QaEvidenceAnalysis[]\n  evidenceMappings QaEvidenceMapping[]',
    ),
    (
        '  evidence    QaEvidence[]\n  assessments QaRequirementAssessment[]\n  analyses    QaEvidenceAnalysis[]\n  assignments QaRequirementAssignment[]',
        '  evidenceMappings QaEvidenceMapping[]\n  assessments      QaRequirementAssessment[]\n  analyses         QaEvidenceAnalysis[]\n  assignments      QaRequirementAssignment[]',
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected schema anchor once, found {count}: {old[:80]!r}")
    text = text.replace(old, new, 1)

old_evidence = '''/// Verifiable evidence for one requirement. Direct programme ownership makes
/// scope explicit and supports efficient fail-closed authorisation checks.
model QaEvidence {
  id              String            @id @default(uuid())
  programmeId     String
  programme       Programme         @relation(fields: [programmeId], references: [id], onDelete: Restrict)
  cycleId         String
  cycle           QaAssessmentCycle @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  requirementId   String
  requirement     QaRequirement     @relation(fields: [requirementId], references: [id], onDelete: Restrict)
  title           String
  description     String            @default("")
  kind            QaEvidenceKind
  sourceUrl       String?
  sourceRef       String            @default("")
  reportingPeriod String            @default("")
  status          QaEvidenceStatus  @default(Draft)
  createdById     String?
  createdBy       User?             @relation("QaEvidenceCreator", fields: [createdById], references: [id], onDelete: SetNull)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  analysisSources QaEvidenceAnalysisSource[]

  @@index([programmeId, cycleId])
  @@index([requirementId])
  @@index([status])
}
'''
new_evidence = '''/// Canonical programme evidence item. Applicability to an assessment cycle,
/// requirement, and optional quality expectation is expressed through mappings
/// so the same survey, minutes, policy, or report is stored once and reused.
model QaEvidence {
  id              String           @id @default(uuid())
  programmeId     String
  programme       Programme        @relation(fields: [programmeId], references: [id], onDelete: Restrict)
  title           String
  description     String           @default("")
  kind            QaEvidenceKind
  sourceUrl       String?
  sourceRef       String           @default("")
  reportingPeriod String           @default("")
  status          QaEvidenceStatus @default(Draft)
  createdById     String?
  createdBy       User?            @relation("QaEvidenceCreator", fields: [createdById], references: [id], onDelete: SetNull)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  mappings        QaEvidenceMapping[]
  analysisSources QaEvidenceAnalysisSource[]

  @@index([programmeId])
  @@index([status])
}

/// Cycle-specific use of one canonical evidence item. A single evidence item can
/// support multiple requirements while each cycle/requirement link remains
/// explicit, auditable, and optionally tied to one quality expectation.
model QaEvidenceMapping {
  id              String               @id @default(uuid())
  programmeId     String
  programme       Programme            @relation(fields: [programmeId], references: [id], onDelete: Restrict)
  cycleId         String
  cycle           QaAssessmentCycle    @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  evidenceId      String
  evidence        QaEvidence           @relation(fields: [evidenceId], references: [id], onDelete: Cascade)
  requirementId   String
  requirement     QaRequirement        @relation(fields: [requirementId], references: [id], onDelete: Restrict)
  expectationId   String?
  expectation     QaQualityExpectation? @relation(fields: [expectationId], references: [id], onDelete: SetNull)
  relevanceNote   String               @default("")
  mappedById      String?
  mappedBy        User?                @relation("QaEvidenceMapper", fields: [mappedById], references: [id], onDelete: SetNull)
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  @@unique([cycleId, evidenceId, requirementId])
  @@index([programmeId, cycleId])
  @@index([requirementId])
  @@index([evidenceId])
  @@index([expectationId])
  @@index([mappedById])
}
'''
if text.count(old_evidence) != 1:
    raise SystemExit(f"Expected QaEvidence block once, found {text.count(old_evidence)}")
text = text.replace(old_evidence, new_evidence, 1)
path.write_text(text)
