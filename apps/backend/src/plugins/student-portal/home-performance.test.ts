import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

async function serviceSource() {
  return readFile(join(here, "service.ts"), "utf8");
}

function homeBlock(source: string): string {
  const start = source.indexOf("async home(userId: string): Promise<StudentPortalHome>");
  const end = source.indexOf("async submitFeedback", start);
  if (start < 0 || end < 0) throw new Error("Student portal home service block not found");
  return source.slice(start, end);
}

describe("student portal home cold-start read path", () => {
  test("does not build full course details or perform per-course feedback lookups", async () => {
    const source = await serviceSource();
    const home = homeBlock(source);

    expect(home).toContain("rows.map(homeCourseSnapshot)");
    expect(home).not.toContain("toDetail(");
    expect(home).not.toContain("courseFeedback.findUnique");
    expect(home).not.toContain("feedbackKey(");
  });

  test("loads the validated student once and overlaps independent home reads", async () => {
    const home = homeBlock(await serviceSource());

    expect(home).toContain("const student = await studentForUser(userId)");
    expect(home).toContain("await Promise.all([");
    expect(home).toContain("enrolledRowsForStudent(student)");
    expect(home).toContain("academicCalendarForStudentRecord(student)");
  });

  test("keeps approved-spec, published-result, CLO achievement, and upcoming-assessment rules", async () => {
    const source = await serviceSource();
    const snapshotStart = source.indexOf("function homeCourseSnapshot");
    const snapshotEnd = source.indexOf("async function toDetail", snapshotStart);
    if (snapshotStart < 0 || snapshotEnd < 0) throw new Error("Home course snapshot helper not found");
    const snapshot = source.slice(snapshotStart, snapshotEnd);

    expect(snapshot).toContain("const spec = approvedSpec(row)");
    expect(snapshot).toContain("result.courseSpecId === spec.id");
    expect(snapshot).toContain("calculateCloAchievements(");
    expect(snapshot).toContain('item.status === "Active" && !resultAssessmentIds.has(item.id)');
    expect(snapshot).toContain("deadline.courseSpecId === spec.id");
  });
});
