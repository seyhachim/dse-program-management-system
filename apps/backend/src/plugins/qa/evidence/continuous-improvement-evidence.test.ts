import { describe, expect, test } from "bun:test";
import { QA_STRUCTURED_EVIDENCE_TYPES } from "@dse-pms/shared-types";

describe("Criterion 8 continuous-improvement evidence contract", () => {
  test("registers the four explicit chain evidence types", () => {
    for (const type of ["outcome-concerns", "qa-review-records", "improvement-actions", "follow-up-evidence"]) {
      expect(QA_STRUCTURED_EVIDENCE_TYPES).toContain(type as never);
    }
  });

  test("adapter source encodes only stored relationship identifiers", async () => {
    const source = await Bun.file(new URL("./continuous-improvement-evidence.ts", import.meta.url)).text();
    expect(source).toContain("'analysisId', v.\"analysisId\"");
    expect(source).toContain("'reviewId', x.\"reviewId\"");
    expect(source).toContain("'actionId', f.\"actionId\"");
    expect(source).toContain("JOIN \"QaImprovementActionFollowUp\" f");
    expect(source).not.toContain("similarity");
    expect(source).not.toContain("ILIKE");
  });
});
