import { expect, test } from "bun:test";
import {
  AUN_QA_V4_CATALOG,
  CreateQaCycleSchema,
  CreateQaEvidenceSchema,
  UpsertQaSelfAssessmentSchema,
} from "./qa.ts";

test("AUN-QA v4 catalogue contains eight criteria and 53 unique requirements", () => {
  expect(AUN_QA_V4_CATALOG).toHaveLength(8);
  const codes = AUN_QA_V4_CATALOG.flatMap((criterion) =>
    criterion.requirements.map(([code]) => code),
  );
  expect(codes).toHaveLength(53);
  expect(new Set(codes).size).toBe(53);
  expect(codes[0]).toBe("1.1");
  expect(codes.at(-1)).toBe("8.5");
});

test("QA cycle rejects inverted reporting dates", () => {
  const result = CreateQaCycleSchema.safeParse({
    programmeId: "dse",
    title: "Annual QA cycle",
    reportingStart: "2026-08-31",
    reportingEnd: "2025-09-01",
  });
  expect(result.success).toBe(false);
});

test("evidence requires provenance appropriate to its kind", () => {
  const base = {
    programmeId: "dse",
    requirementCode: "1.1",
    title: "Approved programme outcomes",
  };
  expect(
    CreateQaEvidenceSchema.safeParse({ ...base, kind: "externalLink" }).success,
  ).toBe(false);
  expect(
    CreateQaEvidenceSchema.safeParse({
      ...base,
      kind: "systemLink",
      sourceRef: "/programme-management",
    }).success,
  ).toBe(true);
});

test("self-assessment enforces the 1-7 range and a meaningful narrative", () => {
  expect(
    UpsertQaSelfAssessmentSchema.safeParse({
      programmeId: "dse",
      rating: 8,
      narrative: "A sufficiently detailed justification for this requirement.",
    }).success,
  ).toBe(false);
  expect(
    UpsertQaSelfAssessmentSchema.safeParse({
      programmeId: "dse",
      rating: 5,
      narrative: "A sufficiently detailed justification for this requirement.",
    }).success,
  ).toBe(true);
});
