import { describe, expect, test } from "bun:test";

const OVERVIEW_PATH = new URL("./overview-tab.tsx", import.meta.url);
const CLIENT_PATH = new URL("./spec-client.tsx", import.meta.url);
const INFO_PATH = new URL("./course-info-section.tsx", import.meta.url);

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

  test("course-info payload only persists the synopsis", async () => {
    const source = await Bun.file(INFO_PATH).text();

    expect(source).toContain("return { description: description || undefined }");
    expect(source).not.toContain("prerequisites: trimmed");
  });
});
