import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./cohort-roster-sync-client.tsx", import.meta.url), "utf8");

describe("canonical roster sync UI safety", () => {
  test("requires explicit course-offering selection before apply", () => {
    expect(source).toContain("selectedOfferingIds");
    expect(source).toContain('type="checkbox"');
    expect(source).toContain("offeringIds: selectedOfferingIds");
    expect(source).toContain("Synchronize selected");
  });

  test("keeps electives/repeats opt-in and blocked/completed rows unselectable", () => {
    expect(source).toContain("Electives/repeats can be left unselected");
    expect(source).toContain('item.status !== "Completed" && item.state !== "blocked"');
    expect(source).toContain("Select all safe");
    expect(source).toContain("never silently removes");
  });
});
