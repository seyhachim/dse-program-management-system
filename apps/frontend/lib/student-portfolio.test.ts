import { describe, expect, test } from "bun:test";
import { normalizeCareerInterests } from "./student-portfolio";

describe("normalizeCareerInterests", () => {
  test("trims, removes blanks, and preserves first-occurrence order", () => {
    expect(normalizeCareerInterests(" Machine Learning, Data Engineering, , Machine Learning ")).toEqual([
      "Machine Learning",
      "Data Engineering",
    ]);
  });
});
