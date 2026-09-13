import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const courseSource = readFileSync(new URL("./portal-course.tsx", import.meta.url), "utf8");
const attendanceSource = readFileSync(
  new URL("./portal-course-attendance.tsx", import.meta.url),
  "utf8",
);

describe("Student Course Detail tabs", () => {
  test("keeps the richer tab set visible even when optional data is missing", () => {
    for (const tab of [
      ["overview", "Overview"],
      ["attendance", "Attendance"],
      ["weekly-notes", "Weekly Notes"],
      ["learning", "Learning"],
      ["assessments", "Assessments"],
      ["grades", "Grades"],
      ["resources", "Resources"],
    ] as const) {
      expect(courseSource).toContain(
        `<TabsTrigger value="${tab[0]}">${tab[1]}</TabsTrigger>`,
      );
    }
    expect(courseSource).toContain(
      'className="max-w-full justify-start overflow-x-auto whitespace-nowrap"',
    );
  });

  test("moves the course description into Overview and removes the global warning", () => {
    const overview = courseSource.indexOf('<TabsContent value="overview"');
    const description = courseSource.indexOf('title="Course description"');
    expect(overview).toBeGreaterThan(-1);
    expect(description).toBeGreaterThan(overview);
    expect(courseSource).toContain(
      'data.description || "Course description is not available yet."',
    );
    expect(courseSource).not.toContain("Detailed course learning content is not available yet");
  });

  test("uses neutral in-tab states instead of hiding optional tabs", () => {
    expect(courseSource).toContain("Learning details will appear here when the approved course specification is published.");
    expect(courseSource).toContain("Assessment details are not available yet. They will appear here when they are published.");
    expect(courseSource).toContain("Grades are not available yet. Published results will appear here when they are released.");
    expect(courseSource).toContain("Learning resources are not available yet. They will appear here when they are published.");
  });

  test("attendance is self-scoped and read-only in the student UI", () => {
    expect(courseSource).toContain("<PortalCourseAttendance offeringId={offeringId} />");
    expect(attendanceSource).toContain("Your attendance");
    expect(attendanceSource).toContain("Attendance is read-only and shows only your record");
    expect(attendanceSource).not.toContain("row.note");
    expect(attendanceSource).not.toContain("studentId");
    expect(attendanceSource).not.toContain("sessionId");
    expect(attendanceSource).not.toContain("permissionPendingSince");
  });

  test("grades remain downstream of published assessment results", () => {
    expect(courseSource).toContain("const publishedResults = data.assessments.filter((item) => item.result)");
    expect(courseSource).toContain("data.courseGradeComplete && data.totalCourseGrade !== null");
    expect(courseSource).toContain("A final course grade is shown only when the full configured grade is complete.");
  });
});
