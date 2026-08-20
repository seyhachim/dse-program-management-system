import { describe, expect, test } from "bun:test";
import { assertRubricLevelScoreMatches } from "./group-assessment-results.ts";
import { assertGenericFinalizedCorrectionMode } from "./results-lifecycle.ts";
import { PortalConflictError } from "./service.ts";

describe("group assessment integrity boundaries", () => {
  test("generic finalized-result correction remains available only for Individual assessments", () => {
    expect(() => assertGenericFinalizedCorrectionMode("Individual")).not.toThrow();
    expect(() => assertGenericFinalizedCorrectionMode("Group")).toThrow(PortalConflictError);
    expect(() => assertGenericFinalizedCorrectionMode("GroupIndividual")).toThrow(PortalConflictError);
  });

  test("group rubric criterion score must equal the selected rubric level points", () => {
    expect(() => assertRubricLevelScoreMatches(4, 4)).not.toThrow();
    expect(() => assertRubricLevelScoreMatches(3.0000000001, 3)).not.toThrow();
    expect(() => assertRubricLevelScoreMatches(2, 4)).toThrow(
      /selected rubric level points do not match the criterion score/i,
    );
  });
});
