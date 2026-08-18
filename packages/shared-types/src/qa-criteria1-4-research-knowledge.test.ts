import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    import.meta.dir,
    "../../../apps/backend/prisma/migrations/20260817234000_add_criteria1_4_research_knowledge/migration.sql",
  ),
  "utf8",
);

const criterion1Ids = [
  "aun-qa-v4:1.1:research:c1-e01",
  "aun-qa-v4:1.2:research:c1-e02",
  "aun-qa-v4:1.2:research:c1-e03",
  "aun-qa-v4:1.1:research:c1-e04",
  "aun-qa-v4:1.1:research:c1-e05",
] as const;

const criterion4Ids = [
  "aun-qa-v4:4.1:research:c4-e01",
  "aun-qa-v4:4.1:research:c4-e02",
  "aun-qa-v4:4.4:research:c4-e03",
  "aun-qa-v4:4.5:research:c4-e04",
  "aun-qa-v4:4.5:research:c4-e05",
] as const;

const requiredEvidence = [
  "programme-outcomes",
  "clo-plo-mappings",
  "course-clo-plo-coverage",
  "learning-outcome-revision-history",
  "approval-history",
  "assessment-plan",
  "clo-assessment-alignment",
  "rubrics",
  "published-results",
  "clo-attainment-snapshots",
] as const;

describe("Criteria 1 and 4 research knowledge migration", () => {
  it("defines exactly five stable research expectations for each criterion", () => {
    const expectationInsert = migration.slice(
      migration.indexOf('INSERT INTO "QaQualityExpectation"'),
      migration.indexOf('INSERT INTO "QaExpectedEvidence"'),
    );

    const c1Matches = expectationInsert.match(/aun-qa-v4:1\.[0-9]+:research:c1-e0[1-5]/g) ?? [];
    const c4Matches = expectationInsert.match(/aun-qa-v4:4\.[0-9]+:research:c4-e0[1-5]/g) ?? [];

    expect(c1Matches).toEqual([...criterion1Ids]);
    expect(c4Matches).toEqual([...criterion4Ids]);
  });

  it("pins the evidence types required by the comparison set", () => {
    for (const evidenceType of requiredEvidence) {
      expect(migration).toContain(`'${evidenceType}'`);
    }
  });

  it("keeps research expectations attached to existing official requirement identities", () => {
    for (const requirementId of [
      "aun-qa-programme-v4:1.1",
      "aun-qa-programme-v4:1.2",
      "aun-qa-programme-v4:4.1",
      "aun-qa-programme-v4:4.4",
      "aun-qa-programme-v4:4.5",
    ]) {
      expect(migration).toContain(`'${requirementId}'`);
    }
    expect(migration).not.toContain('INSERT INTO "QaRequirement"');
  });

  it("pins scope, authority, time, and relationship semantics for research evaluation", () => {
    expect(migration).toContain('"courseSpecVersion"');
    expect(migration).toContain('"assessment"');
    expect(migration).toContain('"offering"');
    expect(migration).toContain('"population"');
    expect(migration).toContain('{"kind":"withinCycle"}');
    expect(migration).toContain('{"minimumAuthority":"approvedDocument"}');
    expect(migration).toContain('{"minimumAuthority":"controlledInternalRecord"}');
    expect(migration).toContain('"relation":"supports"');
    expect(migration).toContain('"relation":"derivedFrom"');
  });
});
