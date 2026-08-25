import { describe, expect, test } from "bun:test";

const SOURCE_PATH = new URL("./document-preview-pages.tsx", import.meta.url);

describe("Course Specification Part 2 continuation rows", () => {
  test("continues rows 14 through 25 with the Course Details table geometry", async () => {
    const source = await Bun.file(SOURCE_PATH).text();

    expect(source).toContain("function PartTwoRow");
    expect(source).toContain('className="part-two-continuation-table"');
    expect(source).toContain('<col className="w-[28%]" />');
    expect(source).toContain('<col className="w-[24%]" />');
    expect(source).toContain('<col className="w-[16%]" />');
    expect(source).toContain('<col className="w-[32%]" />');
    expect(source).toContain('<ValueCell colSpan={4} className="part-two-continuation-cell">');

    // One source wrapper covers each fixed section/page group: 14, both 15 pages,
    // 16, 17, repeated 18 pages, 19, 20, 21, repeated 22 pages, 23, 24, 25.
    expect(source.match(/<PartTwoRow>/g)?.length).toBe(13);
    expect(source.match(/<\/PartTwoRow>/g)?.length).toBe(13);

    for (const section of [
      'number="14">Course Learning Outcomes',
      'number="15">Mapping of the Course Learning Outcomes',
      'number="16">Distribution of Student Learning Time (SLT)',
      'number="17">Course Assessment Plan',
      'number="18">Course Outline / Detailed Lesson Plan',
      'number="19">Required Resources to Deliver the Course',
      'number="20">References / Textbooks',
      'number="21">Student Responsibility',
      'number="22">Rubric',
      'number="23">Course Policy',
      'number="24">Rating Scale',
      'number="25">Date',
    ]) {
      expect(source).toContain(section);
    }
  });
});
