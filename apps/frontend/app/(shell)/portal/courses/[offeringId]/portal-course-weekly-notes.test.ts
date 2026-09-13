import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const courseSource = readFileSync(new URL("./portal-course.tsx", import.meta.url), "utf8");
const weeklyNotesSource = readFileSync(
  new URL("./portal-course-weekly-notes.tsx", import.meta.url),
  "utf8",
);

describe("Student Course Weekly Notes", () => {
  test("keeps Weekly Notes available independently of CourseSpec", () => {
    expect(courseSource).toContain('<TabsTrigger value="weekly-notes">Weekly Notes</TabsTrigger>');
    expect(courseSource).toContain('<TabsContent value="weekly-notes" className="mt-3">');
    expect(courseSource).toContain("<PortalCourseWeeklyNotes offeringId={offeringId} />");
    expect(courseSource).not.toContain("!data.specAvailable ?");
  });

  test("renders only the student-safe teaching fields in compact cards", () => {
    expect(weeklyNotesSource).toContain("Week unavailable");
    expect(weeklyNotesSource).toContain("formatDate(entry.date)");
    expect(weeklyNotesSource).toContain("Topic");
    expect(weeklyNotesSource).toContain("Learned");
    expect(weeklyNotesSource).toContain("Held");
    expect(weeklyNotesSource).toContain("Lecturer ·");
    expect(weeklyNotesSource).toContain("entry.learningSummary");
    expect(weeklyNotesSource).toContain("entry.lecturerName");
    expect(weeklyNotesSource).toContain("rounded-xl border px-3 py-3");
    expect(weeklyNotesSource).toContain('className="space-y-2.5"');
    expect(weeklyNotesSource).not.toContain("mt-4 grid gap-4");
  });

  test("does not render private monitor or leave fields", () => {
    expect(weeklyNotesSource).not.toContain("entry.note");
    expect(weeklyNotesSource).not.toContain("leaveReason");
    expect(weeklyNotesSource).not.toContain("attachment");
    expect(weeklyNotesSource).not.toContain("dispute");
    expect(weeklyNotesSource).not.toContain("recordedBy");
  });
});
