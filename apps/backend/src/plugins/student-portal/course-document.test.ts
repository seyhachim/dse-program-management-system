import { expect, test } from "bun:test";
import type { PortalCourseDetail } from "@dse-pms/shared-types";
import { buildPortalCourseDocument } from "./course-document.ts";

const fixture = {
  offeringId: "offering", enrollmentId: "enrollment", courseId: "course", code: "PAN202",
  title: "Predictive <Analytics>", description: "Approved & safe", credits: 3, term: "2026-S2", sectionCode: "A",
  lifecycle: "current",
  lecturer: null, coLecturers: [], meetings: [], specAvailable: true, nextAssessment: null,
  clos: [{ code: "CLO1", description: "Build models", level: "C3", mappedPlos: ["PLO1"] }],
  weeks: [{ id: "week", week: 1, topic: "Introduction", cloCodes: ["CLO1"], learningOutcomes: [], activities: [] }],
  assessments: [{
    id: "assessment", name: "Project", type: "Project", description: "Build a model", mode: "individual",
    cloCodes: ["CLO1"], weight: 40, countsTowardGrade: true, courseGradeWeight: 40, dueAt: null, dueWeek: 8,
    format: "Notebook", submissionMethod: "PMS", instructions: "Do <not> paste secrets", rubricName: "Project rubric",
    rubricCriteria: [{ id: "criterion", name: "Method", cloCodes: ["CLO1"], levels: [] }], result: null,
  }],
  resources: [{ id: "resource", resourceType: "Reference", title: "Guide", url: "https://example.com/?a=1&b=2", notes: "" }],
  totalCourseGrade: null, courseGradeComplete: false, completedGradeWeight: 0, configuredGradeWeight: 40,
  achievements: [], overallAchievement: null, feedbackSubmitted: false,
} satisfies PortalCourseDetail;

test("approved course document has a stable filename/content type and escapes student-visible content", () => {
  const document = buildPortalCourseDocument(fixture);
  expect(document.fileName).toBe("PAN202-approved-course-specification.html");
  expect(document.contentType).toBe("text/html; charset=utf-8");
  expect(document.content).toContain("Predictive &lt;Analytics&gt;");
  expect(document.content).toContain("Approved &amp; safe");
  expect(document.content).toContain("Do &lt;not&gt; paste secrets");
  expect(document.content).toContain("Project rubric");
  expect(document.content).not.toContain("<script");
});
