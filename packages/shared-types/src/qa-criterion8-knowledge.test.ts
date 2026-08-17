import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    import.meta.dir,
    "../../../apps/backend/prisma/migrations/20260817233000_add_criterion8_research_knowledge/migration.sql",
  ),
  "utf8",
);

const expectationIds = [
  "aun-qa-v4:8.1:research:c8-e01",
  "aun-qa-v4:8.1:research:c8-e02",
  "aun-qa-v4:8.4:research:c8-e03",
  "aun-qa-v4:8.4:research:c8-e04",
  "aun-qa-v4:8.5:research:c8-e05",
] as const;

const requiredEvidenceTypes = {
  "aun-qa-v4:8.1:research:c8-e01": ["cohort-membership", "student-progression-records"],
  "aun-qa-v4:8.1:research:c8-e02": ["completion-records"],
  "aun-qa-v4:8.4:research:c8-e03": ["clo-attainment-snapshots"],
  "aun-qa-v4:8.4:research:c8-e04": ["programme-outcome-indicators"],
  "aun-qa-v4:8.5:research:c8-e05": [
    "outcome-concerns",
    "qa-review-records",
    "improvement-actions",
    "follow-up-evidence",
  ],
} as const;

describe("Criterion 8 research knowledge migration", () => {
  it("pins exactly five stable research expectation identifiers in intended order", () => {
    const positions = expectationIds.map((id) => migration.indexOf(`'${id}'`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    const expectationInsert = migration.slice(
      migration.indexOf('INSERT INTO "QaQualityExpectation"'),
      migration.indexOf('INSERT INTO "QaExpectedEvidence"'),
    );
    for (const id of expectationIds) {
      expect(expectationInsert.match(new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length).toBe(1);
    }
  });

  it("pins the required evidence catalogue for every research expectation", () => {
    for (const [expectationId, evidenceTypes] of Object.entries(requiredEvidenceTypes)) {
      for (const evidenceType of evidenceTypes) {
        expect(migration).toContain(`'${expectationId}'`);
        expect(migration).toContain(`'${evidenceType}'`);
      }
    }
  });

  it("pins maturity, longitudinal, authority, and relationship semantics", () => {
    expect(migration).toContain('{"kind":"cohortMaturity","minimumElapsedYears":4}');
    expect(migration).toContain('{"kind":"longitudinal","minimumPeriods":3}');
    expect(migration).toContain('{"minimumAuthority":"officialInstitutionalRecord"}');
    expect(migration).toContain('"relation":"reviewedBy"');
    expect(migration).toContain('"relation":"resultsIn"');
    expect(migration).toContain('"relation":"followedUpBy"');
  });
});
