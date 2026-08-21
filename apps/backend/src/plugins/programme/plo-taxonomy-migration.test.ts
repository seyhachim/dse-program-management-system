import { describe, expect, test } from "bun:test";

const migrationUrl = new URL(
  "../../../prisma/migrations/20260821153000_backfill_canonical_dse_plo_taxonomy/migration.sql",
  import.meta.url,
);

const canonicalTaxonomy = [
  ["PLO1", "MD1: Knowledge", "LD1: Knowledge", "Specific", "Cognitive"],
  ["PLO2", "MD2: Cognitive skills", "LD2: Cognitive skills", "Specific", "Cognitive"],
  [
    "PLO3",
    "MD3: Psychomotor/Technical skills",
    "LD3: Psychomotor/Technical skills",
    "Specific",
    "Psychomotor",
  ],
  [
    "PLO4",
    "MD4: Interpersonal skills and responsibility",
    "LD4: Interpersonal skills",
    "Generic",
    "Affective",
  ],
  [
    "PLO5",
    "MD4: Interpersonal skills and responsibility",
    "LD5: Responsibility",
    "Generic",
    "Affective",
  ],
  [
    "PLO6",
    "MD4: Interpersonal skills and responsibility",
    "LD6: Entrepreneurial skills",
    "Specific",
    "Affective",
  ],
  [
    "PLO7",
    "MD4: Interpersonal skills and responsibility",
    "LD7: Ethics and Professionalism",
    "Generic",
    "Affective",
  ],
  [
    "PLO8",
    "MD5: Communication, information technology, and numerical skills",
    "LD8: Communication",
    "Generic",
    "Affective",
  ],
  [
    "PLO9",
    "MD5: Communication, information technology, and numerical skills",
    "LD9: Information technology skills",
    "Specific",
    "Psychomotor",
  ],
  [
    "PLO10",
    "MD5: Communication, information technology, and numerical skills",
    "LD10: Numerical skills",
    "Specific",
    "Cognitive or Psychomotor",
  ],
] as const;

describe("canonical DSE PLO taxonomy migration", () => {
  test("contains the approved taxonomy for every PLO", async () => {
    const sql = await Bun.file(migrationUrl).text();

    for (const row of canonicalTaxonomy) {
      for (const value of row) {
        expect(sql).toContain(`'${value}'`);
      }
    }
  });

  test("fills only missing taxonomy values on existing PLO rows", async () => {
    const sql = await Bun.file(migrationUrl).text();

    expect(sql).toContain('ON CONFLICT ("code") DO UPDATE');
    expect(sql).toContain(
      '"major" = COALESCE("ProgramLearningOutcome"."major", EXCLUDED."major")',
    );
    expect(sql).toContain(
      '"learningDomain" = COALESCE("ProgramLearningOutcome"."learningDomain", EXCLUDED."learningDomain")',
    );
    expect(sql).toContain(
      '"specificOrGeneric" = COALESCE("ProgramLearningOutcome"."specificOrGeneric", EXCLUDED."specificOrGeneric")',
    );
    expect(sql).toContain(
      '"cap" = COALESCE("ProgramLearningOutcome"."cap", EXCLUDED."cap")',
    );
  });

  test("does not mutate course specification records", async () => {
    const sql = await Bun.file(migrationUrl).text();
    const statements = sql
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean)
      .filter((statement) => !statement.startsWith("--"));

    expect(statements.every((statement) => !/UPDATE\s+"CourseSpec"/i.test(statement))).toBe(true);
    expect(statements.every((statement) => !/INSERT\s+INTO\s+"CourseSpec"/i.test(statement))).toBe(true);
    expect(statements.every((statement) => !/DELETE\s+FROM\s+"CourseSpec"/i.test(statement))).toBe(true);
  });
});
