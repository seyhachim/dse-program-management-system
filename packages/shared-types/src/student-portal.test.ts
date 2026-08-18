import { expect, test } from "bun:test";
import {
  comparePortalAssessmentDeadlines,
  portalAssessmentDeadlineState,
  type PortalAssessmentOverview,
} from "./student-portal.ts";

function assessment(
  name: string,
  dueAt: string | null,
  dueWeek: number | null,
): PortalAssessmentOverview {
  return {
    offeringId: "offering",
    courseCode: "PAN202",
    courseTitle: "Predictive Analytics",
    sectionCode: "A",
    term: "2026-S2",
    assessmentId: name,
    name,
    type: "Project",
    description: "",
    mode: "individual",
    cloCodes: ["CLO1"],
    weight: 20,
    dueAt,
    dueWeek,
    format: "",
    submissionMethod: "",
    instructions: "",
    rubricName: "",
    rubricCriteria: [],
  };
}

test("assessment deadline state distinguishes overdue, upcoming, week-only, and missing deadlines", () => {
  const now = new Date("2026-08-18T00:00:00.000Z");
  expect(portalAssessmentDeadlineState(assessment("late", "2026-08-17T23:59:59.000Z", null), now)).toBe("overdue");
  expect(portalAssessmentDeadlineState(assessment("soon", "2026-08-18T00:00:00.000Z", null), now)).toBe("upcoming");
  expect(portalAssessmentDeadlineState(assessment("week", null, 12), now)).toBe("week-only");
  expect(portalAssessmentDeadlineState(assessment("missing", null, null), now)).toBe("unscheduled");
});

test("assessment ordering prefers exact deadlines, then configured weeks, then unscheduled items", () => {
  const rows = [
    assessment("No deadline", null, null),
    assessment("Week 10", null, 10),
    assessment("Later exact", "2026-08-20T02:00:00.000Z", null),
    assessment("Earlier exact", "2026-08-19T02:00:00.000Z", null),
    assessment("Week 4", null, 4),
  ].sort(comparePortalAssessmentDeadlines);

  expect(rows.map((row) => row.name)).toEqual([
    "Earlier exact",
    "Later exact",
    "Week 4",
    "Week 10",
    "No deadline",
  ]);
});
