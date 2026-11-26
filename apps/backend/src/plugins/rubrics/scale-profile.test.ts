import { expect, test } from "bun:test";
import { previewCriterionPoints, snapshotScaleProfile } from "./scale-profile.ts";

const candidate = (count: number) => ({
  id: "synthetic", version: count,
  levels: Array.from({ length: count }, (_, i) => ({
    label: `L${count - 1 - i}`, points: count - 1 - i, fraction: (count - 1 - i) / (count - 1),
  })),
});
test("TSA301 synthetic four-level and DSS301 synthetic five-level retain exact scale", () => {
  const four = snapshotScaleProfile(candidate(4));
  const five = snapshotScaleProfile(candidate(5));
  expect(previewCriterionPoints(four, 30, 2)).toBe(20);
  expect(previewCriterionPoints(five, 30, 2)).toBe(15);
  expect(four.version).toBe(4);
  expect(five.version).toBe(5);
});
test("zero differs from unmarked", () => {
  expect(previewCriterionPoints(candidate(5), 20, 0)).toBe(0);
  expect(previewCriterionPoints(candidate(5), 20, null)).toBeNull();
});
test("unknown levels and invalid scale ordering are rejected", () => {
  expect(() => previewCriterionPoints(candidate(4), 20, 5)).toThrow();
  const invalid = candidate(5);
  invalid.levels[1]!.points = invalid.levels[0]!.points;
  expect(() => snapshotScaleProfile(invalid)).toThrow();
});
test("snapshots do not change when authoring input changes", () => {
  const draft = candidate(5);
  const snapshot = snapshotScaleProfile(draft);
  draft.levels[0]!.label = "edited";
  expect(snapshot.levels[0]?.label).toBe("L4");
});
