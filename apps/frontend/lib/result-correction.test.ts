import { describe, expect, test } from "bun:test";
import {
  correctionCountLabel,
  percentage,
  validateResultCorrection,
} from "./result-correction.ts";

const current = {
  score: 72,
  maxScore: 100,
  feedback: "Original feedback",
};

describe("finalized result correction UI helpers", () => {
  test("requires a substantive change and correction reason", () => {
    const unchanged = validateResultCorrection(current, {
      score: "72",
      maxScore: "100",
      feedback: "Original feedback",
      reason: "Transcription check",
    });
    expect(unchanged.valid).toBe(false);
    expect(unchanged.errors.noChange).toContain("Change");

    const missingReason = validateResultCorrection(current, {
      score: "82",
      maxScore: "100",
      feedback: "Corrected feedback",
      reason: "   ",
    });
    expect(missingReason.valid).toBe(false);
    expect(missingReason.errors.reason).toContain("required");
  });

  test("rejects invalid mark bounds", () => {
    expect(validateResultCorrection(current, {
      score: "-1",
      maxScore: "100",
      feedback: "Original feedback",
      reason: "Input error",
    }).valid).toBe(false);

    expect(validateResultCorrection(current, {
      score: "10",
      maxScore: "0",
      feedback: "Original feedback",
      reason: "Input error",
    }).valid).toBe(false);

    const aboveMax = validateResultCorrection(current, {
      score: "101",
      maxScore: "100",
      feedback: "Original feedback",
      reason: "Input error",
    });
    expect(aboveMax.valid).toBe(false);
    expect(aboveMax.errors.score).toContain("cannot exceed");
  });

  test("normalizes valid correction values for the mutation", () => {
    const validation = validateResultCorrection(current, {
      score: "82",
      maxScore: "100",
      feedback: "  Corrected feedback  ",
      reason: "  Question 4 was omitted during transcription  ",
    });

    expect(validation).toMatchObject({
      valid: true,
      score: 82,
      maxScore: 100,
      feedback: "Corrected feedback",
      reason: "Question 4 was omitted during transcription",
      changed: true,
    });
    expect(percentage(82, 100)).toBe(82);
    expect(percentage(1, 3)).toBe(33.33);
  });

  test("formats correction-history indicators", () => {
    expect(correctionCountLabel(1)).toBe("Corrected 1×");
    expect(correctionCountLabel(3)).toBe("Corrected 3×");
  });
});
