import { describe, expect, test } from "bun:test";
import { rubricContentHash } from "./rubric-context.ts";

describe("rubric content hash", () => {
  test("is stable by order and changes when scoring context changes", () => {
    const base = { id: "r1", levelRows: [{ id: "l1", label: "Good", points: 3, order: 1 }, { id: "l0", label: "Low", points: 1, order: 0 }], criterionRows: [{ id: "c1", name: "Analysis", order: 0 }] };
    expect(rubricContentHash(base)).toBe(rubricContentHash({ ...base, levelRows: [...base.levelRows].reverse() }));
    expect(rubricContentHash(base)).not.toBe(rubricContentHash({ ...base, levelRows: base.levelRows.map((row) => row.id === "l1" ? { ...row, points: 4 } : row) }));
  });
});

test("marking scheme hash changes with question maxima while legacy hashes remain stable", () => {
  const base = { id: "scheme", levelRows: [], criterionRows: [{ id: "q1", name: "Q1", order: 0, maxPoints: 6 }] };
  const legacy = rubricContentHash(base);
  expect(rubricContentHash({ ...base, instrumentKind: "rubric" })).toBe(legacy);
  const scheme = { ...base, instrumentKind: "marking_scheme" };
  expect(rubricContentHash(scheme)).toStartWith("marking-scheme-v1:");
  expect(rubricContentHash({ ...scheme, criterionRows: [{ ...base.criterionRows[0]!, maxPoints: 8 }] })).not.toBe(rubricContentHash(scheme));
});
