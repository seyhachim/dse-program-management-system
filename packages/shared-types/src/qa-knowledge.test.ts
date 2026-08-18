import { expect, test } from "bun:test";
import {
  AUN_QA_V4_PILOT_KNOWLEDGE,
  QA_PILOT_REQUIREMENT_CODES,
  QaEvidenceSourceDomainSchema,
  QaExpectedEvidenceRoleSchema,
} from "./qa-knowledge.ts";

test("QA pilot knowledge covers every selected requirement exactly once", () => {
  const codes = AUN_QA_V4_PILOT_KNOWLEDGE.map((item) => item.requirementCode);
  expect(codes).toEqual([...QA_PILOT_REQUIREMENT_CODES]);
  expect(new Set(codes).size).toBe(QA_PILOT_REQUIREMENT_CODES.length);
});

test("every pilot expectation has usable expected-evidence definitions", () => {
  for (const item of AUN_QA_V4_PILOT_KNOWLEDGE) {
    expect(item.statement.length).toBeGreaterThan(20);
    expect(item.purpose.length).toBeGreaterThan(20);
    expect(item.evidence.length).toBeGreaterThan(0);

    const evidenceTypes = new Set<string>();
    for (const [evidenceType, description, role, sourceDomain] of item.evidence) {
      expect(evidenceType.length).toBeGreaterThan(2);
      expect(description.length).toBeGreaterThan(10);
      expect(QaExpectedEvidenceRoleSchema.safeParse(role).success).toBe(true);
      expect(QaEvidenceSourceDomainSchema.safeParse(sourceDomain).success).toBe(true);
      expect(evidenceTypes.has(evidenceType)).toBe(false);
      evidenceTypes.add(evidenceType);
    }
  }
});

test("pilot begins with structured PMS evidence before document-only analysis", () => {
  const domains = new Set(
    AUN_QA_V4_PILOT_KNOWLEDGE.flatMap((item) =>
      item.evidence.map(([, , , sourceDomain]) => sourceDomain),
    ),
  );

  expect(domains.has("courseSpec")).toBe(true);
  expect(domains.has("assessment")).toBe(true);
  expect(domains.has("teachingLearning")).toBe(true);
  expect(domains.has("staff")).toBe(true);
  expect(domains.has("document")).toBe(true);
});
