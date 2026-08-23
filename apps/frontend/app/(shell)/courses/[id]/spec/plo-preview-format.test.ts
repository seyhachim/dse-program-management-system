import { describe, expect, test } from "bun:test";
import {
  contiguousRowSpans,
  programmePloCountLabel,
  splitLeadingWord,
} from "./plo-preview-format";

describe("PLO document preview formatting", () => {
  test("groups contiguous CQF major domains without reordering PLOs", () => {
    const rows = [
      "MD1: Knowledge",
      "MD2: Cognitive skills",
      "MD3: Psychomotor/Technical skills",
      "MD4: Interpersonal skills and responsibility",
      "MD4: Interpersonal skills and responsibility",
      "MD4: Interpersonal skills and responsibility",
      "MD4: Interpersonal skills and responsibility",
      "MD5: Communication, information technology, and numerical skills",
      "MD5: Communication, information technology, and numerical skills",
      "MD5: Communication, information technology, and numerical skills",
    ];

    expect(contiguousRowSpans(rows, (value) => value)).toEqual([
      1,
      1,
      1,
      4,
      0,
      0,
      0,
      3,
      0,
      0,
    ]);
  });

  test("groups contiguous learning and assessment domains", () => {
    const rows = [
      "Cognitive",
      "Cognitive",
      "Psychomotor",
      "Affective",
      "Affective",
      "Affective",
      "Affective",
      "Affective",
      "Psychomotor",
      "Cognitive",
    ];

    expect(contiguousRowSpans(rows, (value) => value)).toEqual([
      2,
      0,
      1,
      5,
      0,
      0,
      0,
      0,
      1,
      1,
    ]);
  });

  test("does not merge missing classifications", () => {
    expect(contiguousRowSpans([null, null, "Cognitive"], (value) => value)).toEqual([
      1,
      1,
      1,
    ]);
  });

  test("uses the approved worded count for the current ten PLOs", () => {
    expect(programmePloCountLabel(10)).toBe("ten");
    expect(programmePloCountLabel(24)).toBe("24");
  });

  test("separates the leading action verb for emphasis without changing text", () => {
    expect(splitLeadingWord("Apply knowledge in data science")).toEqual({
      leadingWord: "Apply",
      remainder: "knowledge in data science",
    });
  });
});
