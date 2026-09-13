import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const courseSource = readFileSync(new URL("./portal-course.tsx", import.meta.url), "utf8");
const weeklyNotesSource = readFileSync(
  new URL("./portal-course-weekly-notes.tsx", import.meta.url),
  "utf8",
);

describe("Student Course Weekly Notes", () => {
  test("keeps Weekly Notes available when CourseSpec is unavailable", () => {
    expect(courseSource).toContain('<TabsTrigger value="weekly-notes">Weekly Notes</TabsTrigger>');
    expect(courseSource).toContain('<TabsContent value="weekly-notes" className="mt-4">');
    expect(courseSource).toContain("<PortalCourseWeeklyNotes offeringId={offeringId} />");
    expect(courseSource.indexOf('<Tabs defaultValue="overview">')).toBeGreaterThan(-1);
    expect(courseSource.indexOf('<Tabs defaultValue="overview">')).toBeGreaterThan(
      courseSource.indexOf("!data.specAvailable"),
    );
  });

  test("renders exactly the student-safe teaching fields", () => {
    expect(weeklyNotesSource).toContain("Week unavailable");
    expect(weeklyNotesSource).toContain("formatDate(entry.date)");
    expect(weeklyNotesSource).toContain("Topic");
    expect(weeklyNotesSource).toContain("What we learned");
    expect(weeklyNotesSource).toContain("Class held");
    expect(weeklyNotesSource).toContain("Lecturer:");
    expect(weeklyNotesSource).toContain("entry.learningSummary");
    expect(weeklyNotesSource).toContain("entry.lecturerName");
  });

  test("does not render private monitor or leave fields", () => {
    expect(weeklyNotesSource).not.toContain("entry.note");
    expect(weeklyNotesSource).not.toContain("leaveReason");
    expect(weeklyNotesSource).not.toContain("attachment");
    expect(weeklyNotesSource).not.toContain("dispute");
    expect(weeklyNotesSource).not.toContain("recordedBy");
  });
});
