import { describe, expect, test } from "bun:test";

const COURSE_INFO_PATH = new URL("./course-info-section.tsx", import.meta.url);
const CLIENT_PATH = new URL("./spec-client.tsx", import.meta.url);

describe("Course Information synopsis-only authoring", () => {
  test("sends only the lecturer-editable synopsis in the CourseSpec payload", async () => {
    const source = await Bun.file(COURSE_INFO_PATH).text();
    const start = source.indexOf("export function toCourseInfoPayload");
    const end = source.indexOf("/**", start + 1);
    const payloadSource = source.slice(start, end);

    expect(payloadSource).toContain("return { description }");
    expect(payloadSource).not.toContain("prerequisites:");
  });

  test("keeps prerequisites read-only while the synopsis remains editable", async () => {
    const source = await Bun.file(COURSE_INFO_PATH).text();

    expect(source).toContain('value={value.prerequisites} disabled readOnly');
    expect(source).toContain('onChange={(e) => set({ description: e.target.value })}');
    expect(source).not.toContain('set({ prerequisites:');
  });

  test("preserves the first-class Course Information tab introduced by #839", async () => {
    const source = await Bun.file(CLIENT_PATH).text();

    expect(source).toContain('{ id: "courseInfo", label: "Course Information" }');
    expect(source).toContain('<TabsContent value="courseInfo"');
    expect(source).toContain('setActiveTab("courseInfo")');
    expect(source).toContain('"courseInfo",');
    expect(source).not.toContain("courseInfoDialogOpen");
  });
});
