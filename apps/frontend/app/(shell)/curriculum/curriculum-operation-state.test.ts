import { describe, expect, test } from "bun:test";
import {
  curriculumOperationCopy,
  type CurriculumOperation,
} from "./curriculum-operation-state";

describe("curriculum operation progress copy", () => {
  test("describes each async curriculum operation", () => {
    const operations: Exclude<CurriculumOperation, null>[] = [
      "loading-version",
      "reading-file",
      "previewing",
      "applying",
      "exporting",
    ];

    for (const operation of operations) {
      const copy = curriculumOperationCopy(operation);
      expect(copy?.title.length).toBeGreaterThan(0);
      expect(copy?.description.length).toBeGreaterThan(0);
    }
  });

  test("explains that bulk apply can take up to a minute", () => {
    const copy = curriculumOperationCopy("applying");

    expect(copy?.title).toBe("Applying curriculum…");
    expect(copy?.description).toContain("up to a minute");
    expect(copy?.description).toContain("keep this page open");
  });

  test("has no progress copy when idle", () => {
    expect(curriculumOperationCopy(null)).toBeNull();
  });
});
