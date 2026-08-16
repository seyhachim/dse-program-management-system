from pathlib import Path

path = Path("apps/backend/prisma/schema.prisma")
schema = path.read_text()

# Repair an early insertion that placed the expectation inverse relation on
# QaRequirement. Keep exactly one QaRequirement.evaluationScenarios relation.
schema = schema.replace(
    "  evidenceMappings QaEvidenceMapping[]\n  evaluationScenarios QaEvaluationScenario[]\n  assessments      QaRequirementAssessment[]\n",
    "  evidenceMappings QaEvidenceMapping[]\n  assessments      QaRequirementAssessment[]\n",
    1,
)

# Add the inverse relation to QaQualityExpectation, scoped to that model only.
quality_start = schema.index("model QaQualityExpectation {")
quality_end = schema.index("model QaExpectedEvidence {", quality_start)
quality_block = schema[quality_start:quality_end]
if "evaluationScenarios QaEvaluationScenario[]" not in quality_block:
    anchor = "  evidenceMappings QaEvidenceMapping[]\n"
    if anchor not in quality_block:
        raise SystemExit("QaQualityExpectation relation anchor not found")
    quality_block = quality_block.replace(
        anchor,
        anchor + "  evaluationScenarios QaEvaluationScenario[]\n",
        1,
    )
    schema = schema[:quality_start] + quality_block + schema[quality_end:]

path.write_text(schema)
