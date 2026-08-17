import { describe, expect, test } from "bun:test";
import {
  FinalizedResultCorrectionHistorySchema,
  FinalizedResultCorrectionWorkspaceSchema,
} from "./result-corrections.ts";

const baseRow = {
  assessmentResultId: "8da4e4dd-e41c-42ab-bbad-d36d001ab077",
  assessmentItemId: "assessment-1",
  assessmentName: "Midterm Examination",
  enrollmentId: "4e9ba741-e525-4d46-87cb-757540d9ed46",
  studentId: "b2bb75ca-a32e-4fdc-b3f2-08461db2d55b",
  studentCode: "DSE001",
  studentName: "Student One",
  score: 82,
  maxScore: 100,
  feedback: "Corrected feedback",
  updatedAt: "2026-08-17T12:00:00.000Z",
  publishedAt: "2026-08-16T10:00:00.000Z",
  publishedByName: "Primary Lecturer",
  finalizedAt: "2026-08-16T11:00:00.000Z",
  finalizedByName: "Primary Lecturer",
  correctionSummary: {
    count: 1,
    lastCorrectedAt: "2026-08-17T12:00:00.000Z",
    lastCorrectedByName: "Primary Lecturer",
  },
};

describe("finalized result correction contracts", () => {
  test("accepts staff-only correction workspace metadata", () => {
    const parsed = FinalizedResultCorrectionWorkspaceSchema.parse({
      offeringId: "e586dc2a-7e4d-468c-86d5-2bc2aa2fb177",
      courseCode: "PAN202",
      courseTitle: "Predictive Analytics",
      sectionCode: "A",
      term: "2026-S2",
      results: [baseRow],
    });

    expect(parsed.results[0]?.correctionSummary.count).toBe(1);
  });

  test("accepts immutable newest-first history entries", () => {
    const parsed = FinalizedResultCorrectionHistorySchema.parse({
      ...baseRow,
      offeringId: "e586dc2a-7e4d-468c-86d5-2bc2aa2fb177",
      courseCode: "PAN202",
      courseTitle: "Predictive Analytics",
      sectionCode: "A",
      corrections: [
        {
          correctionId: "2a7c8c35-8674-4dcc-a741-0a39f57682ef",
          beforeScore: 72,
          beforeMaxScore: 100,
          beforeFeedback: "Original feedback",
          afterScore: 82,
          afterMaxScore: 100,
          afterFeedback: "Corrected feedback",
          reason: "Question 4 was omitted during transcription",
          correctedAt: "2026-08-17T12:00:00.000Z",
          correctedById: "15cd4db9-c97a-47ab-8920-c8041e1b4e62",
          correctedByName: "Primary Lecturer",
        },
      ],
    });

    expect(parsed.corrections[0]?.afterScore).toBe(82);
  });

  test("rejects malformed score and correction summary values", () => {
    const malformed = FinalizedResultCorrectionWorkspaceSchema.safeParse({
      offeringId: "e586dc2a-7e4d-468c-86d5-2bc2aa2fb177",
      courseCode: "PAN202",
      courseTitle: "Predictive Analytics",
      sectionCode: "A",
      term: "2026-S2",
      results: [{
        ...baseRow,
        maxScore: 0,
        correctionSummary: { ...baseRow.correctionSummary, count: -1 },
      }],
    });

    expect(malformed.success).toBe(false);
  });
});
