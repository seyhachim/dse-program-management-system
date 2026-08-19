from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if text.count(old) != 1:
        raise RuntimeError(f"{path}: expected one match for {old!r}, found {text.count(old)}")
    p.write_text(text.replace(old, new, 1))

replace_once(
    'apps/frontend/app/(shell)/course-delivery/course-delivery-client.tsx',
    '      {assessment?.mode !== "individual" ? (\n        <GroupAssessmentPanel offeringId={offering.offeringId} assessment={assessment} onChanged={onChanged} />',
    '      {assessment && assessment.mode !== "individual" ? (\n        <GroupAssessmentPanel offeringId={offering.offeringId} assessment={assessment} onChanged={onChanged} />',
)

replace_once(
    'apps/frontend/app/(shell)/courses/[id]/spec/weekly-plan/week-suggestions.test.ts',
    '  mode: "individual",\n  status: "active",',
    '  mode: "individual",\n  groupWeight: "",\n  individualWeight: "",\n  individualCriterionIds: [],\n  status: "active",',
)
