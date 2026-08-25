from pathlib import Path

PATH = Path("apps/frontend/app/(shell)/courses/[id]/spec/document-preview-pages.tsx")
TEST_PATH = Path("apps/frontend/app/(shell)/courses/[id]/spec/document-preview-pages-layout.test.ts")
source = PATH.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    source = source.replace(old, new, 1)


section_title = '''function SectionTitle({
  number,
  children,
}: {
  number: string;
  children: ReactNode;
}) {
  return (
    <h2 className="mb-3 text-[15px] font-bold">
      {number}. {children}
    </h2>
  );
}
'''

part_two_row = section_title + '''
function PartTwoRow({ children }: { children: ReactNode }) {
  return (
    <Table className="part-two-continuation-table">
      <colgroup>
        <col className="w-[28%]" />
        <col className="w-[24%]" />
        <col className="w-[16%]" />
        <col className="w-[32%]" />
      </colgroup>
      <tbody>
        <tr>
          <ValueCell colSpan={4} className="part-two-continuation-cell">
            {children}
          </ValueCell>
        </tr>
      </tbody>
    </Table>
  );
}
'''
replace_once(section_title, part_two_row, "PartTwoRow helper")

# Wrap every fixed-page Part 2 section after row 13 in one full-width continuation row.
openings = [
    ('<div id="clos" className="h-full px-[54px] py-[42px]" style={{ display: "block" }}>', '<div id="clos" className="h-full px-[54px] py-[42px]" style={{ display: "block" }}><PartTwoRow>'),
    ('<div id="mapping" className="h-full px-[54px] py-[42px]">', '<div id="mapping" className="h-full px-[54px] py-[42px]"><PartTwoRow>'),
    ('<Page zoom={zoom} pageNumber={6}><div className="h-full px-[54px] py-[42px]">', '<Page zoom={zoom} pageNumber={6}><div className="h-full px-[54px] py-[42px]"><PartTwoRow>'),
    ('<div id="slt" className="h-full px-[54px] py-[42px]">', '<div id="slt" className="h-full px-[54px] py-[42px]"><PartTwoRow>'),
    ('<div id="assessment-plan" className="h-full px-[54px] py-[42px]">', '<div id="assessment-plan" className="h-full px-[54px] py-[42px]"><PartTwoRow>'),
    ('<div id={index === 0 ? "lesson-plan" : undefined} className="h-full px-[54px] py-[42px]">', '<div id={index === 0 ? "lesson-plan" : undefined} className="h-full px-[54px] py-[42px]"><PartTwoRow>'),
    ('<div id="resources" className="h-full px-[54px] py-[42px]">', '<div id="resources" className="h-full px-[54px] py-[42px]"><PartTwoRow>'),
    ('<div id="references" className="h-full px-[54px] py-[42px]">', '<div id="references" className="h-full px-[54px] py-[42px]"><PartTwoRow>'),
    ('<div id="responsibility" className="h-full px-[54px] py-[42px]">', '<div id="responsibility" className="h-full px-[54px] py-[42px]"><PartTwoRow>'),
    ('<div id="rubric" className="h-full px-[54px] py-[42px]">', '<div id="rubric" className="h-full px-[54px] py-[42px]"><PartTwoRow>'),
    ('<div id="policy" className="h-full px-[54px] py-[42px]">', '<div id="policy" className="h-full px-[54px] py-[42px]"><PartTwoRow>'),
    ('<div id="rating-scale" className="h-full px-[54px] py-[42px]">', '<div id="rating-scale" className="h-full px-[54px] py-[42px]"><PartTwoRow>'),
    ('<div id="spec-date" className="h-full px-[54px] py-[42px]">', '<div id="spec-date" className="h-full px-[54px] py-[42px]"><PartTwoRow>'),
]
for old, new in openings:
    replace_once(old, new, f"wrap opening {old[:45]}")

closings = [
    ('<PageFooter courseCode={info.courseCode} page={4} />', '</PartTwoRow><PageFooter courseCode={info.courseCode} page={4} />'),
    ('<PageFooter courseCode={info.courseCode} page={5} />', '</PartTwoRow><PageFooter courseCode={info.courseCode} page={5} />'),
    ('<PageFooter courseCode={info.courseCode} page={6} />', '</PartTwoRow><PageFooter courseCode={info.courseCode} page={6} />'),
    ('<PageFooter courseCode={info.courseCode} page={7} />', '</PartTwoRow><PageFooter courseCode={info.courseCode} page={7} />'),
    ('<PageFooter courseCode={info.courseCode} page={8} />', '</PartTwoRow><PageFooter courseCode={info.courseCode} page={8} />'),
    ('<PageFooter courseCode={info.courseCode} page={weeklyStartPage + index} />', '</PartTwoRow><PageFooter courseCode={info.courseCode} page={weeklyStartPage + index} />'),
    ('<PageFooter courseCode={info.courseCode} page={resourcesPage} />', '</PartTwoRow><PageFooter courseCode={info.courseCode} page={resourcesPage} />'),
    ('<PageFooter courseCode={info.courseCode} page={referencesPage} />', '</PartTwoRow><PageFooter courseCode={info.courseCode} page={referencesPage} />'),
    ('<PageFooter courseCode={info.courseCode} page={responsibilityPage} />', '</PartTwoRow><PageFooter courseCode={info.courseCode} page={responsibilityPage} />'),
    ('<PageFooter courseCode={info.courseCode} page={rubricStartPage + index} />', '</PartTwoRow><PageFooter courseCode={info.courseCode} page={rubricStartPage + index} />'),
    ('<PageFooter courseCode={info.courseCode} page={policyPage} />', '</PartTwoRow><PageFooter courseCode={info.courseCode} page={policyPage} />'),
    ('<PageFooter courseCode={info.courseCode} page={ratingScalePage} />', '</PartTwoRow><PageFooter courseCode={info.courseCode} page={ratingScalePage} />'),
    ('<PageFooter courseCode={info.courseCode} page={datePage} />', '</PartTwoRow><PageFooter courseCode={info.courseCode} page={datePage} />'),
]
for old, new in closings:
    replace_once(old, new, f"wrap closing {old}")

PATH.write_text(source, encoding="utf-8")

TEST_PATH.write_text('''import { describe, expect, test } from "bun:test";\n\nconst SOURCE_PATH = new URL("./document-preview-pages.tsx", import.meta.url);\n\ndescribe("Course Specification Part 2 continuation rows", () => {\n  test("continues rows 14 through 25 with the Course Details table geometry", async () => {\n    const source = await Bun.file(SOURCE_PATH).text();\n\n    expect(source).toContain("function PartTwoRow");\n    expect(source).toContain('className="part-two-continuation-table"');\n    expect(source).toContain('<col className="w-[28%]" />');\n    expect(source).toContain('<col className="w-[24%]" />');\n    expect(source).toContain('<col className="w-[16%]" />');\n    expect(source).toContain('<col className="w-[32%]" />');\n    expect(source).toContain('<ValueCell colSpan={4} className="part-two-continuation-cell">');\n\n    // One source wrapper covers each fixed section/page group: 14, both 15 pages,\n    // 16, 17, repeated 18 pages, 19, 20, 21, repeated 22 pages, 23, 24, 25.\n    expect(source.match(/<PartTwoRow>/g)?.length).toBe(13);\n    expect(source.match(/<\\/PartTwoRow>/g)?.length).toBe(13);\n\n    for (const section of [\n      'number="14">Course Learning Outcomes',\n      'number="15">Mapping of the Course Learning Outcomes',\n      'number="16">Distribution of Student Learning Time (SLT)',\n      'number="17">Course Assessment Plan',\n      'number="18">Course Outline / Detailed Lesson Plan',\n      'number="19">Required Resources to Deliver the Course',\n      'number="20">References / Textbooks',\n      'number="21">Student Responsibility',\n      'number="22">Rubric',\n      'number="23">Course Policy',\n      'number="24">Rating Scale',\n      'number="25">Date',\n    ]) {\n      expect(source).toContain(section);\n    }\n  });\n});\n''', encoding="utf-8")
