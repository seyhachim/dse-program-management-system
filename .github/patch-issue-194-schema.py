from pathlib import Path

path = Path("apps/backend/prisma/schema.prisma")
schema = path.read_text()

if 'evidenceType  String' in schema[schema.index('model QaEvaluationScenarioEvidence {'):schema.index('model QaEvaluationRun {')]:
    raise SystemExit(0)

old = '''model QaEvaluationScenarioEvidence {\n  id            String               @id @default(uuid())\n  scenarioId    String\n  scenario      QaEvaluationScenario @relation(fields: [scenarioId], references: [id], onDelete: Cascade)\n  order         Int\n  sourceDomain  String\n  entityType    String\n  label         String\n  text          String\n  referenceKey  String               @default(\"\")\n  reportingDate DateTime?\n  goldRelevant  Boolean?\n  runLinks       QaEvaluationRunEvidence[]\n\n  @@unique([scenarioId, order])\n  @@index([scenarioId, goldRelevant])\n}\n'''
new = '''model QaEvaluationScenarioEvidence {\n  id            String               @id @default(uuid())\n  scenarioId    String\n  scenario      QaEvaluationScenario @relation(fields: [scenarioId], references: [id], onDelete: Cascade)\n  order         Int\n  evidenceType  String               @default(\"\")\n  sourceDomain  String\n  entityType    String\n  label         String\n  text          String\n  referenceKey  String               @default(\"\")\n  reportingDate DateTime?\n  attributes    Json                 @default(\"{}\")\n  goldRelevant  Boolean?\n  runLinks       QaEvaluationRunEvidence[]\n\n  @@unique([scenarioId, order])\n  @@index([scenarioId, goldRelevant])\n  @@index([scenarioId, evidenceType])\n}\n'''
if old not in schema:
    raise SystemExit("QaEvaluationScenarioEvidence model anchor not found")
schema = schema.replace(old, new, 1)
path.write_text(schema)
