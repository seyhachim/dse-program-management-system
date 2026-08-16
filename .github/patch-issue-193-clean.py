from pathlib import Path

path = Path("apps/backend/prisma/schema.prisma")
schema = path.read_text()

if "model QaEvaluationScenario {" in schema:
    raise SystemExit(0)

user_anchor = '  qaSarReleasesFinalized   QaSarRelease[]             @relation("QaSarReleaseFinalizedBy")\n'
if user_anchor not in schema:
    raise SystemExit("User relation anchor not found")
schema = schema.replace(
    user_anchor,
    user_anchor
    + '  qaEvaluationGoldReviews  QaEvaluationScenario[]      @relation("QaEvaluationGoldReviewer")\n'
    + '  qaEvaluationRatings      QaEvaluationHumanRating[]   @relation("QaEvaluationHumanReviewer")\n',
    1,
)

requirement_anchor = '  sarSubmissions   QaSarSubmission[]\n'
if requirement_anchor not in schema:
    raise SystemExit("QaRequirement relation anchor not found")
schema = schema.replace(
    requirement_anchor,
    requirement_anchor + '  evaluationScenarios QaEvaluationScenario[]\n',
    1,
)

expectation_anchor = '  evidenceMappings QaEvidenceMapping[]\n'
if expectation_anchor not in schema:
    raise SystemExit("QaQualityExpectation relation anchor not found")
schema = schema.replace(
    expectation_anchor,
    expectation_anchor + '  evaluationScenarios QaEvaluationScenario[]\n',
    1,
)

permission_anchor = 'model Permission {\n'
if permission_anchor not in schema:
    raise SystemExit("Permission model anchor not found")

models = '''/// Controlled/synthetic research scenario. Intentionally has no Programme FK so
/// evaluation data remains isolated from operational institutional QA records.
model QaEvaluationScenario {
  id              String                     @id @default(uuid())
  requirementId   String
  requirement     QaRequirement              @relation(fields: [requirementId], references: [id], onDelete: Restrict)
  expectationId   String
  expectation     QaQualityExpectation       @relation(fields: [expectationId], references: [id], onDelete: Restrict)
  name            String
  description     String
  goldState       QaEvidenceAnalysisState?
  goldReviewerId  String?
  goldReviewer    User?                      @relation("QaEvaluationGoldReviewer", fields: [goldReviewerId], references: [id], onDelete: SetNull)
  goldAnnotatedAt DateTime?
  goldNote        String                     @default("")
  evidence        QaEvaluationScenarioEvidence[]
  runs            QaEvaluationRun[]
  createdAt       DateTime                   @default(now())
  updatedAt       DateTime                   @updatedAt

  @@index([requirementId])
  @@index([expectationId])
  @@index([goldState])
}

model QaEvaluationScenarioEvidence {
  id            String               @id @default(uuid())
  scenarioId    String
  scenario      QaEvaluationScenario @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  order         Int
  sourceDomain  String
  entityType    String
  label         String
  text          String
  referenceKey  String               @default("")
  reportingDate DateTime?
  goldRelevant  Boolean?
  runLinks       QaEvaluationRunEvidence[]

  @@unique([scenarioId, order])
  @@index([scenarioId, goldRelevant])
}

/// Immutable prototype output for one controlled scenario. Gold labels are read
/// from the separate human annotation fields and are never generated here.
model QaEvaluationRun {
  id             String                     @id @default(uuid())
  scenarioId     String
  scenario       QaEvaluationScenario       @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  predictedState QaEvidenceAnalysisState
  engine         String
  engineVersion  String
  promptVersion  String                     @default("")
  explanation    String
  createdAt      DateTime                   @default(now())
  retrieved      QaEvaluationRunEvidence[]
  humanRatings   QaEvaluationHumanRating[]

  @@index([scenarioId, createdAt])
  @@index([engine, engineVersion, promptVersion])
}

model QaEvaluationRunEvidence {
  runId              String
  run                QaEvaluationRun              @relation(fields: [runId], references: [id], onDelete: Cascade)
  scenarioEvidenceId String
  scenarioEvidence   QaEvaluationScenarioEvidence @relation(fields: [scenarioEvidenceId], references: [id], onDelete: Cascade)
  relevance          Float?

  @@id([runId, scenarioEvidenceId])
  @@index([scenarioEvidenceId])
}

/// Human assessment of evidence relevance and explanation usefulness for one
/// exact prototype run. One reviewer contributes at most one immutable rating.
model QaEvaluationHumanRating {
  id                 String          @id @default(uuid())
  runId              String
  run                QaEvaluationRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  reviewerId         String
  reviewer           User            @relation("QaEvaluationHumanReviewer", fields: [reviewerId], references: [id], onDelete: Restrict)
  evidenceRelevance  Int
  explanationClarity Int
  understandability  Int
  usefulness         Int
  traceability       Int
  comment            String          @default("")
  createdAt          DateTime        @default(now())

  @@unique([runId, reviewerId])
  @@index([reviewerId])
}

'''

schema = schema.replace(permission_anchor, models + permission_anchor, 1)
path.write_text(schema)
