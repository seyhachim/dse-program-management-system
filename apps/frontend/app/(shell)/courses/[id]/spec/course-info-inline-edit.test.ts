import { describe, expect, test } from "bun:test";

const OVERVIEW_PATH = new URL("./overview-tab.tsx", import.meta.url);
const CLIENT_PATH = new URL("./spec-client.tsx", import.meta.url);
const INFO_PATH = new URL("./course-info-section.tsx", import.meta.url);
const READ_ONLY_PATH = new URL("./read-only-spec-client.tsx", import.meta.url);

describe("Course Information inline editing", () => {
  test("edits only the Course Description / Synopsis from the Overview card", async () => {
    const source = await Bun.file(OVERVIEW_PATH).text();

    expect(source).toContain('CardHeader title="Course Information"');
    expect(source).toContain("Edit description");
    expect(source).toContain("Save changes");
    expect(source).toContain("Cancel");
    expect(source).toContain("onSaveCourseDescription");
    expect(source).not.toContain("onEditCourseInfo");
  });

  test("removes the Course Information dialog workflow", async () => {
    const source = await Bun.file(CLIENT_PATH).text();

    expect(source).toContain("persistCourseDescription");
    expect(source).toContain("onSaveCourseDescription={persistCourseDescription}");
    expect(source).not.toContain("courseInfoDialogOpen");
    expect(source).not.toContain("<CourseInfoSection");
    expect(source).not.toContain("<Dialog");
  });

  test("read-only history view uses the new Overview contract without exposing editing", async () => {
    const source = await Bun.file(READ_ONLY_PATH).text();

    expect(source).toContain("onSaveCourseDescription={() => Promise.resolve(false)}");
    expect(source).toContain("readOnly");
    expect(source).not.toContain("onEditCourseInfo");
  });

  test("course-info payload only persists the synopsis", async () => {
    const source = await Bun.file(INFO_PATH).text();

    expect(source).toContain("description: description || undefined");
    expect(source).not.toContain("prerequisites: trimmed");
  });
});
