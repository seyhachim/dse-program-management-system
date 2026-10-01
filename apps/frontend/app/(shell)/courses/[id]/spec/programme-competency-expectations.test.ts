import { describe, expect, test } from "bun:test";

const PANEL_PATH = new URL("./programme-competency-expectations.tsx", import.meta.url);
const MAPPING_PATH = new URL("./mapping-section.tsx", import.meta.url);
const OVERVIEW_PATH = new URL("./overview-tab.tsx", import.meta.url);
const READ_ONLY_PATH = new URL("./read-only-spec-client.tsx", import.meta.url);

describe("CourseSpec programme competency UX", () => {
  test("keeps programme T/U/A read-only and edits only CLO evidence links", async () => {
    const source = await Bun.file(PANEL_PATH).text();

    expect(source).toContain("Programme Competency Expectations");
    expect(source).toContain("T/U/A remains programme-owned and read-only");
    expect(source).toContain("Link CLO evidence");
    expect(source).toContain("saveCompetencyEvidence");
    expect(source).not.toContain("updateCurriculumCourseCompetencyMapping");
  });

  test("explains that evidence coverage is traceability, not an academic level verdict", async () => {
    const source = await Bun.file(PANEL_PATH).text();

    expect(source).toContain("Evidence status confirms traceability only");
    expect(source).toContain("Academic reviewers decide");
    expect(source).toContain("Needs evidence");
  });

  test("removes competency edit controls from the read-only CourseSpec view", async () => {
    const panel = await Bun.file(PANEL_PATH).text();
    const readOnly = await Bun.file(READ_ONLY_PATH).text();

    expect(panel).toContain('!readOnly && data.context.state === "ready"');
    expect(readOnly).toContain("readOnly");
    expect(readOnly).toContain("courseId={courseId}");
  });

  test("places programme expectations inside existing Constructive Alignment and keeps Overview compact", async () => {
    const mapping = await Bun.file(MAPPING_PATH).text();
    const overview = await Bun.file(OVERVIEW_PATH).text();

    expect(mapping).toContain("<ProgrammeCompetencyExpectations");
    expect(mapping).toContain("<AlignmentSummary");
    expect(
      mapping.indexOf("<ProgrammeCompetencyExpectations"),
    ).toBeLessThan(mapping.indexOf("<AlignmentSummary"));
    expect(overview).toContain("Programme Competency Alignment");
    expect(overview).toContain("View Alignment");
    expect(overview).not.toContain("Link CLO evidence");
  });
});
