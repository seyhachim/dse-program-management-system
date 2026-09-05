import { describe, expect, test } from "bun:test";

const OVERVIEW_PATH = new URL("./overview-tab.tsx", import.meta.url);
const CLIENT_PATH = new URL("./spec-client.tsx", import.meta.url);
const READ_ONLY_PATH = new URL("./read-only-spec-client.tsx", import.meta.url);

describe("Course Information Overview-only editing", () => {
  test("edits only the Course Description / Synopsis from the Overview card", async () => {
    const source = await Bun.file(OVERVIEW_PATH).text();

    expect(source).toContain('CardHeader title="Course Information"');
    expect(source).toContain("Edit description");
    expect(source).toContain("Save changes");
    expect(source).toContain("Cancel");
    expect(source).toContain("onSaveCourseDescription");
    expect(source).not.toContain("onEditCourseInfo");
  });

  test("uses Course Team terminology on Overview", async () => {
    const source = await Bun.file(OVERVIEW_PATH).text();

    expect(source).toContain('label="Responsible Lecturer"');
    expect(source).toContain('label="Co-Lecturer(s)"');
    expect(source).toContain('label="Course Team (Shared Responsibility)"');
    expect(source).not.toContain('label="Instructor"');
  });

  test("removes Course Information from editable tab navigation and redirects stale routes", async () => {
    const source = await Bun.file(CLIENT_PATH).text();

    expect(source).toContain("persistCourseDescription");
    expect(source).toContain("onSaveCourseDescription={persistCourseDescription}");
    expect(source).not.toContain('{ id: "courseInfo", label: "Course Information" }');
    expect(source).toContain('requested === "courseInfo"');
    expect(source).toContain('policyNormalizedId === "courseInfo"');
    expect(source).toContain('sectionId === "courseInfo"');
  });

  test("removes Course Information from read-only tab navigation and keeps history non-editable", async () => {
    const source = await Bun.file(READ_ONLY_PATH).text();

    expect(source).not.toContain('{ id: "courseInfo", label: "Course Information" }');
    expect(source).toContain('requested === "courseInfo"');
    expect(source).toContain('policyNormalizedId === "courseInfo"');
    expect(source).toContain("onSaveCourseDescription={() => Promise.resolve(false)}");
    expect(source).toContain("readOnly");
  });
});
