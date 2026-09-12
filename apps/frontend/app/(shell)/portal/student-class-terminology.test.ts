import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const portalHomeSource = readFileSync(
  new URL("./portal-home.tsx", import.meta.url),
  "utf8",
);
const scheduleSource = readFileSync(
  new URL("./schedule/portal-schedule.tsx", import.meta.url),
  "utf8",
);
const announcementsSource = readFileSync(
  new URL("./announcements/portal-announcements.tsx", import.meta.url),
  "utf8",
);
const assessmentsSource = readFileSync(
  new URL("./assessments/portal-assessments.tsx", import.meta.url),
  "utf8",
);
const resultsSource = readFileSync(
  new URL("./results/portal-results.tsx", import.meta.url),
  "utf8",
);
const courseDetailSource = readFileSync(
  new URL("./courses/[offeringId]/portal-course.tsx", import.meta.url),
  "utf8",
);

describe("Student Portal class terminology", () => {
  test("uses Class wherever a student-facing section code is labelled", () => {
    expect(portalHomeSource).toContain(
      "{nextMeeting.course.code} · Class {nextMeeting.course.sectionCode}",
    );
    expect(scheduleSource).toContain(
      "{course.code} · Class {course.sectionCode} · {meeting.activityType}",
    );
    expect(announcementsSource).toContain(
      "{item.courseCode} · Class {item.sectionCode}",
    );
    expect(assessmentsSource).toContain("Class {item.sectionCode}");
    expect(resultsSource).toContain(
      "{course.code} · Class {course.sectionCode}",
    );
    expect(courseDetailSource).toContain("Class {data.sectionCode}");
  });

  test("removes student-facing Section wording without renaming the domain contract", () => {
    const labelledSources = [
      portalHomeSource,
      scheduleSource,
      announcementsSource,
      assessmentsSource,
      resultsSource,
      courseDetailSource,
    ];

    for (const source of labelledSources) {
      expect(source).not.toContain(" · Section ");
    }
    expect(assessmentsSource).not.toContain("Section {item.sectionCode}");
    expect(courseDetailSource).not.toContain("Section {data.sectionCode}");
    expect(scheduleSource).not.toContain("section timetable");
    expect(courseDetailSource).not.toContain("course section");

    for (const source of labelledSources) {
      expect(source).toContain("sectionCode");
    }
  });

  test("uses class wording in supporting student copy", () => {
    expect(scheduleSource).toContain(
      "Class meetings will appear after your class timetable is published.",
    );
    expect(courseDetailSource).toContain("allowed per class.");
  });
});
