import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const courseSource = readFileSync(new URL("./portal-course.tsx", import.meta.url), "utf8");
const attendanceSource = readFileSync(
  new URL("./portal-course-attendance.tsx", import.meta.url),
  "utf8",
);

describe("Student Course Detail v1", () => {
  test("keeps operational course tabs available independently of CourseSpec", () => {
    expect(courseSource).toContain('<Tabs defaultValue="overview">');
    expect(courseSource).toContain('<TabsTrigger value="overview">Overview</TabsTrigger>');
    expect(courseSource).toContain('<TabsTrigger value="attendance">Attendance</TabsTrigger>');
    expect(courseSource).toContain('<TabsTrigger value="weekly-notes">Weekly Notes</TabsTrigger>');
    expect(courseSource.indexOf('<Tabs defaultValue="overview">')).toBeLessThan(
      courseSource.indexOf("!data.specAvailable"),
    );
  });

  test("attendance UI is self-scoped and does not render private notes or student identifiers", () => {
    expect(attendanceSource).toContain("Your attendance");
    expect(attendanceSource).toContain("Attendance here is read-only and shows only your record");
    expect(attendanceSource).not.toContain("row.note");
    expect(attendanceSource).not.toContain("studentId");
    expect(attendanceSource).not.toContain("sessionId");
  });
});
