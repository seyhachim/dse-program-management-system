import { describe, expect, test } from "bun:test";

const SOURCE_PATH = new URL("./document-word-renderer.ts", import.meta.url);

describe("Course Specification Word Part 1 layout", () => {
  test("matches the approved preview header typography", async () => {
    const source = await Bun.file(SOURCE_PATH).text();

    expect(source).toContain('centered("Royal University of Phnom Penh", true, 22)');
    expect(source).toContain('centered("Faculty of Engineering", true, 22)');
    expect(source).toContain('centered(document.courseInformation.programmeTitle, true, 22)');
    expect(source).toContain('centered("Course Specification", true, 22)');
    expect(source).toContain(
      'text("PART 1: VISION, MISSION, GOALS, AND OBJECTIVES", true, 28)',
    );
  });

  test("keeps the full PLO block as the fourth Part 1 table row", async () => {
    const source = await Bun.file(SOURCE_PATH).text();

    expect(source).toContain("children: [programmePloContinuationCell(document)]");
    expect(source).toContain("const weights = [19, 19, 35, 12, 15];");
    expect(source).toContain('ploHeaderCell("CQF Learning Domains"');
    expect(source).toContain('ploHeaderCell("Major Domain"');
    expect(source).toContain('ploHeaderCell("Learning Domain"');
    expect(source).toContain('ploHeaderCell("Specific/Generic"');
    expect(source).toContain('ploHeaderCell("Learning/Assessment Domains"');
    expect(source).toContain("VerticalMergeType.RESTART");
    expect(source).toContain("VerticalMergeType.CONTINUE");
    expect(source).toContain("contiguousRowSpans(plos, (plo) => plo.major)");
    expect(source).toContain("contiguousRowSpans(plos, (plo) => plo.cap)");
    expect(source).toContain("programmePloCountLabel(document.plos.length)");
    expect(source).toContain("splitLeadingWord(plo.description)");
    expect(source).toContain('text("Specific (Subject-Specific) PLOs:", true, 18)');
    expect(source).toContain('text("Generic PLOs:", true, 18)');

    expect(source).not.toContain(
      "Part 1 (continued): Programme Learning Outcomes — Taxonomy",
    );
    expect(source).not.toContain("colWidths([6, 8, 38, 16, 16, 8, 8])");
  });
});
