import { describe, expect, test } from "bun:test";
import { rubricContentHash } from "./rubric-context.ts";

describe("rubric content hash", () => {
  test("is stable by order and changes when scoring context changes", () => {
    const base = { id: "r1", levelRows: [{ id: "l1", label: "Good", points: 3, order: 1 }, { id: "l0", label: "Low", points: 1, order: 0 }], criterionRows: [{ id: "c1", name: "Analysis", order: 0 }] };
    expect(rubricContentHash(base)).toBe(rubricContentHash({ ...base, levelRows: [...base.levelRows].reverse() }));
    expect(rubricContentHash(base)).not.toBe(rubricContentHash({ ...base, levelRows: base.levelRows.map((row) => row.id === "l1" ? { ...row, points: 4 } : row) }));
  });
});
