import { describe, expect, test } from "bun:test";
import {
  QaSarBookPart3ViewSchema,
  UpdateQaSarCriterionSelfRatingSchema,
  UpdateQaSarRequirementSelfRatingSchema,
} from "./qa-sar-book-part3.ts";

const programmeId = "dse";

describe("SAR book Part 3 contracts", () => {
  test("accepts only whole-number 1-7 human self-ratings", () => {
    for (let rating = 1; rating <= 7; rating += 1) {
      expect(
        UpdateQaSarRequirementSelfRatingSchema.safeParse({
          programmeId,
          rating,
          justification: "Human judgement based on the cited programme evidence.",
          evidenceIds: [],
        }).success,
      ).toBe(true);
    }

    for (const rating of [0, 8, 3.5]) {
      expect(
        UpdateQaSarRequirementSelfRatingSchema.safeParse({
          programmeId,
          rating,
          justification: "Human judgement based on the cited programme evidence.",
          evidenceIds: [],
        }).success,
      ).toBe(false);
    }
  });

  test("requires an explicit criterion opinion rather than deriving a verdict", () => {
    expect(
      UpdateQaSarCriterionSelfRatingSchema.safeParse({
        programmeId,
        rating: 5,
        opinion: "The SAR team judges this criterion to be substantially fulfilled.",
        evidenceIds: [],
      }).success,
    ).toBe(true);
    expect(
      UpdateQaSarCriterionSelfRatingSchema.safeParse({
        programmeId,
        rating: 5,
        opinion: "short",
        evidenceIds: [],
      }).success,
    ).toBe(false);
  });

  test("Part 3 view has no overall or arithmetic accreditation verdict field", () => {
    const parsed = QaSarBookPart3ViewSchema.parse({
      programmeId,
      cycleId: "11111111-1111-4111-8111-111111111111",
      generatedAt: new Date().toISOString(),
      note: "Human self-assessment only — ratings are not external assessor scores or an accreditation verdict.",
      criteria: [],
      associations: [],
      improvementActions: [],
      readiness: {
        totalRequirements: 0,
        ratedRequirements: 0,
        totalCriteria: 0,
        ratedCriteria: 0,
        missingRequirementRatings: [],
        missingCriterionRatings: [],
      },
    });
    expect("overallRating" in parsed).toBe(false);
    expect("averageRating" in parsed).toBe(false);
    expect("accreditationVerdict" in parsed).toBe(false);
  });
});
