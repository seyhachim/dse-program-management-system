import { describe, expect, test } from "bun:test";
import { buildCourseDocument } from "./course-document-model";
import { documentSltReviewLines } from "./course-document-slt-review";
import { emptyWeek, type WeekForm } from "./weekly-plan-model";
import { emptyClo, type CloForm } from "./clo-model";
import { emptyAssessment, type AssessmentForm } from "./assessment-model";
import type { CourseInfoForm } from "./course-info-section";

function teaching(week: number, hours = 8): WeekForm {
  return { ...emptyWeek([]), id: `session-${week}`, week: String(week), topic: `Topic ${week}: Synthetic investigation`, cloCodes: ["CLO1"], lloItems: ["Analyse"], activities: ["Practice"], lectureHours: "2", selfStudyHours: String(hours - 2), teachingMethodIds: ["method"] };
}
function exam(week: number, hours: number, topic = "Final written examination"): WeekForm {
  return { ...emptyWeek([]), id: `session-${week}`, week: String(week), topic, sessionType: "assessment", cloCodes: ["CLO1"], otherHours: String(hours), assessment: "Written task" };
}
function clo(hours: string): CloForm {
  return { ...emptyClo(), id: "clo-1", code: "CLO1", description: "Analyse", mappedPlos: ["PLO1", "PLO2"], sltHours: hours, teachingMethodIds: ["method"] };
}
function assessment(physical: string, independent: string): AssessmentForm {
  return { ...emptyAssessment(), id: "assessment-1", name: "Synthetic assessment", cloCodes: ["CLO1"], physicalSltHours: physical, onlineSltHours: "0", independentSltHours: independent };
}
function info(code: string, totalSltHours: number | null | undefined = 120): CourseInfoForm {
  return { programmeTitle: "Synthetic programme", courseTitle: code, courseCode: code, credits: "3", prerequisites: "", courseType: "Core", description: "Synthetic only", totalSltHours, instructorName: "", instructorTitle: "", qualification: "", email: "", telephone: "", otherLecturers: "", semester: "First", programmeYear: "3" };
}
function document(code: string, weeks: WeekForm[], clos: CloForm[], assessments: AssessmentForm[], sltPresentation: "historical" | "review" = "review", courseInfo = info(code)) {
  return buildCourseDocument({ courseId: "synthetic", courseInfo, weeklyPlan: weeks, clos, assessments, mapping: [], sltPresentation, courseTotalSlt: 120 });
}
describe("Phase 3A.1B — synthetic export projections", () => {
  test("TSA301 retains actual week IDs and exam workload; missing CLO allocation is not invented", () => {
    const weeks = [...Array.from({ length: 16 }, (_, i) => i + 1).map(n => n === 8 ? exam(n, 4, "Midterm written examination") : n === 16 ? exam(n, 4) : teaching(n))];
    const original = JSON.stringify(weeks);
    const doc = document("TSA301", weeks, [clo("")], [assessment("", "")]);
    expect(doc.weeklyPlan.map(w => w.week)).toEqual(weeks.map(w => w.week));
    expect(doc.weeklyPlan.map(w => w.id)).toEqual(weeks.map(w => w.id));
    expect(doc.weeklyPlan[7]?.topic).toContain("Assessment-only session");
    expect(doc.totals.courseContentSlt).toBe(120);
    expect(doc.totals.grandSlt).toBe(120);
    expect(doc.sltReview?.assessmentOnlyTotal).toBe(8);
    expect(doc.mapping[0]?.sltHours).toBe("");
    expect(doc.mapping[0]?.focusPercent).toBeNull();
    expect(doc.sltReview?.allocationNotes[0]).toContain("weekly-only equal-share estimate 120 h");
    expect(doc.sltReview?.warnings).toContain("missing-assessment-allocation");
    expect(documentSltReviewLines(doc).join(" ")).toContain("not an approved total");
    expect(JSON.stringify(weeks)).toBe(original);
  });
  test("DSS301 preserves stored CLO allocation and reports incomplete assessment data", () => {
    const weeks = [...Array.from({ length: 14 }, (_, i) => teaching(i + 1)), exam(15, 3, "Midterm Assessment"), exam(16, 5, "Final Assessment")];
    const stored = [clo("120")];
    const doc = document("DSS301", weeks, stored, [assessment("", "")]);
    expect(doc.totals.courseContentSlt).toBe(120);
    expect(doc.totals.grandSlt).toBe(120);
    expect(doc.mapping[0]?.sltHours).toBe("120");
    expect(doc.sltReview?.allocationNotes).toEqual(["CLO1: stored 120 h"]);
    expect(doc.sltReview?.missingAssessmentAllocations).toBe(1);
    expect(documentSltReviewLines(doc).join(" ")).toContain("1 incomplete");
  });
  test("WEF201 keeps fifteenth instructional session and does not add 52 hours to 120", () => {
    const weeks = [...Array.from({ length: 14 }, (_, i) => teaching(i + 1)), { ...teaching(15, 4), sessionType: "teaching_and_assessment" as const, assessment: "Demonstration" }, exam(16, 4)];
    const items = [assessment("8", "44"), { ...assessment("99", "99"), status: "inactive" as const }];
    const doc = document("WEF201", weeks, [clo("120")], items);
    expect(doc.weeklyPlan).toHaveLength(16);
    expect(doc.sltReview?.instructionalWeeks).toBe(15);
    expect(doc.totals.assessmentSlt).toBe(52);
    expect(doc.totals.grandSlt).toBe(120);
    expect(doc.sltReview?.separateTotal).toBe(168);
    expect(doc.sltReview?.warnings).toContain("verify-assessment-overlap");
    expect(documentSltReviewLines(doc).join(" ")).toContain("Do not add these automatically");
    expect(doc.mapping[0]?.sltHours).toBe("120");
    expect(doc.mapping[0]?.focusCode).toBe("");
    const historical = document("WEF201", weeks, [clo("120")], items, "historical");
    expect(historical.sltReview).toBeUndefined();
    expect(historical.totals.grandSlt).toBe(168);
    expect(historical.weeklyPlan).toHaveLength(15);
    expect(documentSltReviewLines(historical)).toEqual([]);
  });
  test("separate candidate does not discard exam rows or count the same exam twice", () => {
    const doc = document("SYNTHETIC", [teaching(1, 90), exam(16, 2)], [clo("120")], [assessment("2", "28")]);
    expect(doc.totals.courseContentSlt).toBe(92);
    expect(doc.totals.grandSlt).toBe(120);
    expect(doc.sltReview?.separateMatches).toBe(true);
    expect(doc.weeklyPlan[1]?.week).toBe("16");
  });
  test("mismatched or absent declaration produces unresolved total, not a fabricated fallback", () => {
    const mismatch = document("SYNTHETIC", [teaching(1, 100)], [clo("120")], []);
    expect(mismatch.totals.grandSlt).toBeNull();
    expect(mismatch.sltReview?.blocking).toContain("total-mismatch");
    const missing = document("SYNTHETIC", [teaching(1, 120)], [clo("120")], [], "review", info("SYNTHETIC", null));
    expect(missing.sltReview?.declared).toBeNull();
    expect(missing.totals.grandSlt).toBeNull();
    expect(documentSltReviewLines(missing).join(" ")).toContain("unresolved");
  });
  test("stored zero is distinct from a missing allocation and is never replaced by an estimate", () => {
    const doc = document("SYNTHETIC", [teaching(1, 120)], [clo("0")], []);
    expect(doc.mapping[0]?.sltHours).toBe("0");
    expect(doc.sltReview?.allocationNotes).toEqual(["CLO1: stored 0 h"]);
    expect(doc.sltReview?.blocking).toContain("clo-total-mismatch");
    expect(doc.totals.grandSlt).toBeNull();
  });
  test("preview/PDF and Word consume the same review lines and legacy path stays explicit", async () => {
    const [preview, word, pdf, controls, historical, editor, readOnly] = await Promise.all(
      ["document-preview-pages.tsx", "document-word-renderer.ts", "document-pdf-export.ts", "document-preview-impl.tsx", "versions/[versionId]/historical-version-client.tsx", "spec-client.tsx", "read-only-spec-client.tsx"]
        .map(path => Bun.file(new URL(path, import.meta.url)).text()),
    );
    expect(preview).toContain("documentSltReviewLines(document)");
    expect(word).toContain("documentSltReviewLines(document)");
    expect(preview).toContain("REVIEW_MAPPING_NOTE");
    expect(word).toContain("REVIEW_MAPPING_NOTE");
    expect(pdf).toContain("[data-doc-page]");
    expect(pdf).toContain("if (sltReview?.blocking.length) throw");
    expect(word).toContain("if (document.sltReview?.blocking.length) throw");
    expect(controls).toContain("exportCourseSpecPdf(printRoot, info.courseCode, resolvedDocument.sltReview)");
    expect(pdf).toContain('sltReview ? "-review" : ""');
    expect(word).toContain('document.sltReview ? "-review" : ""');
    expect(controls).toContain("Boolean(resolvedDocument.sltReview?.blocking.length)");
    expect(historical).toContain('sltPresentation: "historical"');
    for (const source of [editor, readOnly]) expect(source).toContain('sltPresentation: review?.status === "approved" ? "historical" : "review"');
  });
});
