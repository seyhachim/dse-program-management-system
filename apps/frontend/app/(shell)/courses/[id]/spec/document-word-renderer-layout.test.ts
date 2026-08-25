import { describe, expect, test } from "bun:test";

const SOURCE_PATH = new URL("./document-word-renderer.ts", import.meta.url);

describe("Course Specification Word layout", () => {
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

  test("keeps Part 2 as one Word table and lets Word paginate rows 14 through 25", async () => {
    const source = await Bun.file(SOURCE_PATH).text();

    expect(source).toContain("continuationRows: TableRow[] = []");
    expect(source).toContain("...continuationRows");
    expect(source).toContain("function partTwoContinuationRow");
    expect(source).toContain("function partTwoContinuationRows");
    expect(source).toContain("columnSpan: 4");
    expect(source).toContain("partTwoContinuationRow(cloSection(document))");
    expect(source).toContain('sectionTitle("15"');
    expect(source).toContain('sectionTitle("16"');
    expect(source).toContain('sectionTitle("17"');
    expect(source).toContain('sectionTitle("18"');
    expect(source).toContain('sectionTitle("19"');
    expect(source).toContain('sectionTitle("20"');
    expect(source).toContain('sectionTitle("21"');
    expect(source).toContain('sectionTitle("22"');
    expect(source).toContain('sectionTitle("23"');
    expect(source).toContain('sectionTitle("24"');
    expect(source).toContain('sectionTitle("25"');
    expect(source).toContain(
      "courseInformationTable(info, partTwoContinuationRows(document))",
    );

    // Only the intentional Part 1 -> Part 2 page break remains. Word is free to
    // carry continuation rows onto the next page based on actual rendered height.
    expect(source.match(/new PageBreak\(\)/g)?.length).toBe(1);
    expect(source).not.toContain("function sectionBox");
  });
});
