import { expect, test } from "bun:test";
import {
  CreateQaEvidenceItemSchema,
  MapQaEvidenceSchema,
} from "./qa-evidence-library.ts";

test("canonical QA evidence can be created without choosing a requirement", () => {
  const parsed = CreateQaEvidenceItemSchema.parse({
    programmeId: "dse",
    title: "Employer Survey 2025",
    description: "Annual employer feedback survey",
    kind: "externalLink",
    sourceUrl: "https://example.edu/evidence/employer-survey-2025",
    reportingPeriod: "2025",
    status: "ready",
  });

  expect(parsed.programmeId).toBe("dse");
  expect("requirementCode" in parsed).toBe(false);
});

test("the same canonical evidence can be mapped one requirement at a time", () => {
  const first = MapQaEvidenceSchema.parse({
    programmeId: "dse",
    requirementCode: "2.3",
    relevanceNote: "Used in curriculum consultation review",
  });
  const second = MapQaEvidenceSchema.parse({
    programmeId: "dse",
    requirementCode: "8.5",
    relevanceNote: "Used as stakeholder satisfaction evidence",
  });

  expect(first.requirementCode).toBe("2.3");
  expect(second.requirementCode).toBe("8.5");
});

test("system-linked canonical evidence still requires a PMS reference", () => {
  const result = CreateQaEvidenceItemSchema.safeParse({
    programmeId: "dse",
    title: "PLO attainment",
    kind: "systemLink",
    sourceRef: "",
  });

  expect(result.success).toBe(false);
});
