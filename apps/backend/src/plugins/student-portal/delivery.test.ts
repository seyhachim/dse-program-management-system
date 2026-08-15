import { describe, expect, test } from "bun:test";
import { deliveryOfferingScope, summarizeAnonymousFeedback } from "./service.ts";

const response = (overall: number, workload: string, positive = "", improvement = "") => ({
  overallRating: overall,
  teachingClarityRating: overall - 1,
  assessmentClarityRating: overall,
  workload,
  positiveComment: positive,
  improvementComment: improvement,
});

describe("course delivery access", () => {
  test("lecturers are scoped to primary or co-lecturer assignments", () => {
    expect(deliveryOfferingScope("lecturer-1", false)).toEqual({
      OR: [
        { lecturerId: "lecturer-1" },
        { coLecturers: { some: { lecturerId: "lecturer-1" } } },
      ],
    });
    expect(deliveryOfferingScope("coordinator-1", true)).toEqual({});
  });
});

describe("anonymous feedback summaries", () => {
  test("withholds all detail below the privacy threshold", () => {
    const summary = summarizeAnonymousFeedback([
      response(5, "appropriate", "Clear examples", "More practice"),
      response(4, "heavy", "Good feedback", "Slow down"),
    ]);
    expect(summary.available).toBe(false);
    expect(summary.responseCount).toBe(2);
    expect(summary.averages).toBeNull();
    expect(summary.workload).toEqual({ light: 0, appropriate: 0, heavy: 0 });
    expect(summary.positiveComments).toEqual([]);
  });

  test("returns aggregate ratings, workload, and anonymous comments at three responses", () => {
    const summary = summarizeAnonymousFeedback([
      response(5, "appropriate", "Clear examples", "More practice"),
      response(4, "heavy", "Good feedback", "Slow down"),
      response(3, "appropriate", "", "More examples"),
    ]);
    expect(summary.available).toBe(true);
    expect(summary.averages).toEqual({ overall: 4, teachingClarity: 3, assessmentClarity: 4 });
    expect(summary.workload).toEqual({ light: 0, appropriate: 2, heavy: 1 });
    expect(summary.positiveComments).toEqual(["Clear examples", "Good feedback"]);
    expect(summary.improvementComments).toEqual(["More practice", "Slow down", "More examples"]);
  });
});
