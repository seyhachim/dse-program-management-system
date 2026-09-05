import { describe, expect, test } from "bun:test";

const UI_PATH = new URL("./authoring-section-ui.tsx", import.meta.url);
const CLIENT_PATH = new URL("./spec-client.tsx", import.meta.url);

const AUTHORING_PATHS = [
  new URL("./course-info-section.tsx", import.meta.url),
  new URL("./clos-section.tsx", import.meta.url),
  new URL("./teaching-learning/teaching-learning-workspace.tsx", import.meta.url),
  new URL("./assessment-section.tsx", import.meta.url),
  new URL("./weekly-plan-section.tsx", import.meta.url),
];

describe("Course Specification authoring shell", () => {
  test("defines one shared header, readiness, notice, and empty-state language", async () => {
    const source = await Bun.file(UI_PATH).text();

    expect(source).toContain("export function CourseSpecAuthoringHeader");
    expect(source).toContain("export function CourseSpecAuthoringStack");
    expect(source).toContain("export function CourseSpecNotice");
    expect(source).toContain("export function CourseSpecEmptyState");
    expect(source).toContain("space-y-5");
    expect(source).toContain("rounded-xl border border-border bg-card p-5 shadow-sm");
    expect(source).toContain('{ready ? "Ready" : "Needs attention"}');
  });

  test("all five lecturer authoring areas use the shared header and spacing shell", async () => {
    for (const path of AUTHORING_PATHS) {
      const source = await Bun.file(path).text();
      expect(source).toContain("CourseSpecAuthoringHeader");
      expect(source).toContain("CourseSpecAuthoringStack");
    }
  });

  test("keeps Course Information on Overview instead of a separate navigation tab", async () => {
    const source = await Bun.file(CLIENT_PATH).text();

    expect(source).not.toContain('{ id: "courseInfo", label: "Course Information" }');
    expect(source).not.toContain('<TabsContent value="courseInfo"');
    expect(source).toContain('requested === "courseInfo"');
    expect(source).toContain('return "overview"');
    expect(source).toContain('policyNormalizedId === "courseInfo"');
    expect(source).not.toContain("courseInfoDialogOpen");
    expect(source).not.toContain("<Dialog");
  });

  test("wires readiness from the same five authoring semantics used by Review & Submit", async () => {
    const source = await Bun.file(CLIENT_PATH).text();

    expect(source).toContain('ready={status.courseInfo === "complete"}');
    expect(source).toContain("ready={cloReady}");
    expect(source).toContain('ready={status.assessmentPlan === "complete"}');
    expect(source).toContain('ready={status.slt === "complete"}');
    expect(source).toContain("teachingLearningIsReady(teachingLearningProfile, clos)");
  });

  test("keeps Course Information out of review-lock tab routing", async () => {
    const source = await Bun.file(CLIENT_PATH).text();

    const editableStart = source.indexOf("const EDITABLE_SPEC_TABS");
    const editableEnd = source.indexOf("const REVIEW_EDITABLE_STATUSES");
    const editableBlock = source.slice(editableStart, editableEnd);

    expect(editableBlock).not.toContain('"courseInfo"');
    expect(source).toContain('policyNormalizedId === "courseInfo"');
    expect(source).toContain('? "overview"');
    expect(source).toContain("locked && EDITABLE_SPEC_TABS.has(normalizedId)");
  });
});
