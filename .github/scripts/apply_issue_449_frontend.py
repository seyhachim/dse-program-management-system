from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

fields = 'apps/frontend/app/(shell)/courses/[id]/spec/assessment/assessment-form-fields.tsx'
replace_once(
    fields,
    '''  const nameError = touched && draft.name.trim().length === 0;\n  const selectedRubric = rubrics.find((rubric) => rubric.id === draft.rubricId);''',
    '''  const errors = assessmentFormErrors(draft);\n  const nameError = touched && errors.name;\n  const groupWeightsError = touched && errors.groupWeights;\n  const selectedRubric = rubrics.find((rubric) => rubric.id === draft.rubricId);''',
)
replace_once(
    fields,
    '''  const toggleTopic = (topic: number) => {''',
    '''  const setCriterionScope = (criterionId: string, scope: "group" | "individual") => {\n    const current = new Set(draft.individualCriterionIds);\n    if (scope === "individual") current.add(criterionId);\n    else current.delete(criterionId);\n    set({ individualCriterionIds: [...current] });\n  };\n\n  const toggleTopic = (topic: number) => {''',
)
replace_once(
    fields,
    '''          <Field label="Group / Individual" required>\n            <select\n              value={draft.mode}\n              onChange={(event) =>\n                set({ mode: event.target.value as AssessmentForm["mode"] })\n              }\n              className={selectCls}\n            >\n              <option value="individual">Individual</option>\n              <option value="group">Group</option>\n            </select>\n          </Field>\n\n          <Field label="Status" required>''',
    '''          <Field label="Assessment Mode" required>\n            <select\n              value={draft.mode}\n              onChange={(event) => {\n                const mode = event.target.value as AssessmentForm["mode"];\n                set({\n                  mode,\n                  ...(mode === "group_individual"\n                    ? {}\n                    : { groupWeight: "", individualWeight: "", individualCriterionIds: [] }),\n                });\n              }}\n              className={selectCls}\n            >\n              <option value="individual">Individual</option>\n              <option value="group">Group</option>\n              <option value="group_individual">Group + Individual</option>\n            </select>\n          </Field>\n\n          {draft.mode === "group_individual" ? (\n            <>\n              <Field\n                label="Group Contribution (%)"\n                required\n                error={groupWeightsError ? "Group and individual contributions must be positive and total 100%." : undefined}\n              >\n                <input\n                  type="number"\n                  min={0.01}\n                  max={100}\n                  step="0.01"\n                  value={draft.groupWeight}\n                  onChange={(event) => set({ groupWeight: event.target.value })}\n                  placeholder="e.g. 70"\n                  className={inputCls(groupWeightsError)}\n                />\n              </Field>\n              <Field label="Individual Contribution (%)" required>\n                <input\n                  type="number"\n                  min={0.01}\n                  max={100}\n                  step="0.01"\n                  value={draft.individualWeight}\n                  onChange={(event) => set({ individualWeight: event.target.value })}\n                  placeholder="e.g. 30"\n                  className={inputCls(groupWeightsError)}\n                />\n                <Hint>These two percentages define how the final student result is derived. They are separate from the assessment's course-grade weight below.</Hint>\n              </Field>\n            </>\n          ) : null}\n\n          <Field label="Status" required>''',
)
replace_once(
    fields,
    '''              onChange={(event) => set({ rubricId: event.target.value, criterionCloMappings: [] })}''',
    '''              onChange={(event) =>\n                set({\n                  rubricId: event.target.value,\n                  criterionCloMappings: [],\n                  individualCriterionIds: [],\n                })\n              }''',
)
replace_once(
    fields,
    '''                  className="flex items-center gap-3 px-4 py-2.5 text-sm"''',
    '''                  className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"''',
)
replace_once(
    fields,
    '''                  <div className="min-w-0 flex-1">\n                    <span className="text-foreground">{criterion.name}</span>''',
    '''                  <div className="min-w-0 flex-1">\n                    <div className="flex flex-wrap items-center justify-between gap-2">\n                      <span className="text-foreground">{criterion.name}</span>\n                      {draft.mode === "group_individual" ? (\n                        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">\n                          Score as\n                          <select\n                            value={draft.individualCriterionIds.includes(criterion.id) ? "individual" : "group"}\n                            onChange={(event) => setCriterionScope(criterion.id, event.target.value as "group" | "individual")}\n                            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"\n                          >\n                            <option value="group">Group evidence</option>\n                            <option value="individual">Individual evidence</option>\n                          </select>\n                        </label>\n                      ) : null}\n                    </div>''',
)
replace_once(
    fields,
    '''export function assessmentFormErrors(draft: AssessmentForm) {\n  return {\n    name: draft.name.trim().length === 0,\n    weight:\n      draft.countsTowardGrade &&\n      (draft.weight === "" || Number(draft.weight) <= 0 || Number(draft.weight) > 100),\n  };\n}''',
    '''export function assessmentFormErrors(draft: AssessmentForm) {\n  const groupWeight = Number(draft.groupWeight);\n  const individualWeight = Number(draft.individualWeight);\n  return {\n    name: draft.name.trim().length === 0,\n    weight:\n      draft.countsTowardGrade &&\n      (draft.weight === "" || Number(draft.weight) <= 0 || Number(draft.weight) > 100),\n    groupWeights:\n      draft.mode === "group_individual" &&\n      (draft.groupWeight === "" ||\n        draft.individualWeight === "" ||\n        !Number.isFinite(groupWeight) ||\n        !Number.isFinite(individualWeight) ||\n        groupWeight <= 0 ||\n        individualWeight <= 0 ||\n        groupWeight > 100 ||\n        individualWeight > 100 ||\n        Math.abs(groupWeight + individualWeight - 100) > 0.000001),\n  };\n}''',
)

page = 'apps/frontend/app/(shell)/courses/[id]/spec/assessment/assessment-form-page.tsx'
replace_once(
    page,
    '''    if (assessmentFormErrors(draft).name) {\n      return;\n    }''',
    '''    const validation = assessmentFormErrors(draft);\n    if (Object.values(validation).some(Boolean)) {\n      return;\n    }''',
)

client = 'apps/frontend/app/(shell)/course-delivery/course-delivery-client.tsx'
replace_once(
    client,
    '''import { Topbar } from "../topbar";''',
    '''import { Topbar } from "../topbar";\nimport { GroupAssessmentPanel } from "./group-assessment-panel";''',
)
replace_once(
    client,
    '''            {assessment ? (\n              <Button type="button" onClick={publishAssessment} disabled={publishing || !readyToPublish}>\n                <CheckCircle2 />{publishing ? "Publishing…" : allPublished ? "Published & locked" : "Publish assessment"}\n              </Button>\n            ) : null}''',
    '''            {assessment?.mode === "individual" ? (\n              <Button type="button" onClick={publishAssessment} disabled={publishing || !readyToPublish}>\n                <CheckCircle2 />{publishing ? "Publishing…" : allPublished ? "Published & locked" : "Publish assessment"}\n              </Button>\n            ) : null}''',
)
replace_once(
    client,
    '''        {assessment ? (\n          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">\n            <span className="rounded-full bg-muted px-3 py-1">{draftCount} draft</span>\n            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{publishedCount} published</span>\n            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700 dark:bg-amber-950 dark:text-amber-300">{missingCount} missing</span>\n          </div>\n        ) : null}\n        {missingCount > 0 ? <p className="mt-3 text-sm text-muted-foreground">Complete all {missingCount} missing student mark{missingCount === 1 ? "" : "s"} before publishing this assessment.</p> : null}\n        {publishedCount > 0 && !allPublished ? <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Legacy partially published results detected. Existing published rows stay locked; complete the remaining drafts, then publish the rest.</p> : null}''',
    '''        {assessment?.mode === "individual" ? (\n          <>\n            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">\n              <span className="rounded-full bg-muted px-3 py-1">{draftCount} draft</span>\n              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{publishedCount} published</span>\n              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700 dark:bg-amber-950 dark:text-amber-300">{missingCount} missing</span>\n            </div>\n            {missingCount > 0 ? <p className="mt-3 text-sm text-muted-foreground">Complete all {missingCount} missing student mark{missingCount === 1 ? "" : "s"} before publishing this assessment.</p> : null}\n            {publishedCount > 0 && !allPublished ? <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Legacy partially published results detected. Existing published rows stay locked; complete the remaining drafts, then publish the rest.</p> : null}\n          </>\n        ) : assessment ? (\n          <p className="mt-3 text-sm text-muted-foreground">This assessment uses {assessment.mode === "group" ? "Group" : "Group + Individual"} scoring. Configure membership and source evidence in the group workspace below.</p>\n        ) : null}''',
)
replace_once(
    client,
    '''      {assessment ? (\n        <Panel title={assessment.name} description={allPublished ? "Published results are locked against ordinary edits." : `${draftCount} of ${assessment.results.length} student marks saved as drafts.`}>\n          <div className="space-y-3">\n            {assessment.results.map((row) => <ResultRow key={row.enrollmentId} assessment={assessment} row={row} onChanged={onChanged} />)}\n            {!assessment.results.length ? <Muted>No students are enrolled in this section.</Muted> : null}\n          </div>\n        </Panel>\n      ) : null}''',
    '''      {assessment?.mode !== "individual" ? (\n        <GroupAssessmentPanel offeringId={offering.offeringId} assessment={assessment} onChanged={onChanged} />\n      ) : assessment ? (\n        <Panel title={assessment.name} description={allPublished ? "Published results are locked against ordinary edits." : `${draftCount} of ${assessment.results.length} student marks saved as drafts.`}>\n          <div className="space-y-3">\n            {assessment.results.map((row) => <ResultRow key={row.enrollmentId} assessment={assessment} row={row} onChanged={onChanged} />)}\n            {!assessment.results.length ? <Muted>No students are enrolled in this section.</Muted> : null}\n          </div>\n        </Panel>\n      ) : null}''',
)

# Focused frontend form-model regression tests.
Path('apps/frontend/app/(shell)/courses/[id]/spec/assessment-model.test.ts').write_text(r'''import { describe, expect, test } from "bun:test";
import { emptyAssessment, toAssessmentForm, toAssessmentPayload } from "./assessment-model";

describe("Group + Individual assessment form model", () => {
  test("new assessments keep Individual as the backward-compatible default", () => {
    const item = emptyAssessment();
    expect(item.mode).toBe("individual");
    expect(item.groupWeight).toBe("");
    expect(item.individualCriterionIds).toEqual([]);
  });

  test("round-trips weights and individual-scoped rubric criteria", () => {
    const item = {
      ...emptyAssessment(),
      id: "assessment-1",
      name: "Capstone",
      mode: "group_individual" as const,
      groupWeight: "70",
      individualWeight: "30",
      individualCriterionIds: ["oral-defense"],
    };
    const payload = toAssessmentPayload([item]);
    expect(payload.items[0]?.mode).toBe("group_individual");
    expect(payload.items[0]?.groupWeight).toBe(70);
    expect(payload.items[0]?.individualWeight).toBe(30);
    expect(payload.items[0]?.individualCriterionIds).toEqual(["oral-defense"]);

    const roundTrip = toAssessmentForm(payload)[0]!;
    expect(roundTrip.mode).toBe("group_individual");
    expect(roundTrip.groupWeight).toBe("70");
    expect(roundTrip.individualWeight).toBe("30");
    expect(roundTrip.individualCriterionIds).toEqual(["oral-defense"]);
  });

  test("clears group-only metadata from non-combined payloads", () => {
    const item = {
      ...emptyAssessment(),
      id: "assessment-1",
      name: "Quiz",
      mode: "individual" as const,
      groupWeight: "70",
      individualWeight: "30",
      individualCriterionIds: ["criterion-1"],
    };
    const saved = toAssessmentPayload([item]).items[0]!;
    expect(saved.groupWeight).toBeNull();
    expect(saved.individualWeight).toBeNull();
    expect(saved.individualCriterionIds).toEqual([]);
  });
});
''')
