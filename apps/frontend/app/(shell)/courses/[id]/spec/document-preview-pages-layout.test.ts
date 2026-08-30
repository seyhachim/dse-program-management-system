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
    expect(source).toContain(
      '<ValueCell colSpan={4} className="part-two-continuation-cell">',
    );

    expect(source.match(/<PartTwoRow>/g)?.length).toBe(13);
    expect(source.match(/<\/PartTwoRow>/g)?.length).toBe(13);

    expect(source).toContain(
      '<span>14.</span><span className="font-bold">Course Learning Outcomes</span>',
    );

    for (const section of [
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

  test("matches the official Course Information and CLO presentation", async () => {
    const source = await Bun.file(SOURCE_PATH).text();
    expect(source).toContain("COURSE_DOCUMENT_STYLE.courseInfoTitle");
    expect(source).toContain('text-[9px]">Here are the CLOs of this course:');
    expect(source).toContain(
      "Description of the course learning outcomes – CLOs. At the end of the course, students will be able to:",
    );
    expect(source).toContain(">PLO</TH>");
    expect(source).toContain("Levels in Learning Domain:<br />Knowledge (Cognitive-C), Attitude (Affective-A), Skills (Psychomotor-P)");
    expect(source).toContain('>C</TH><TH className="bg-[#E2EEDB] text-center font-normal">A</TH><TH className="bg-[#E2EEDB] text-center font-normal">P</TH>');
    expect(source).toContain('className="section14-header-row"');
    expect(source).not.toContain('<thead><tr><TH rowSpan={2} colSpan={2}');
    expect(source).toContain('className="bg-[#E2EEDB] text-center font-normal"');
    expect(source).toContain('{domain.cognitive || " "}');
    expect(source).toContain('{domain.affective || " "}');
    expect(source).toContain('{domain.psychomotor || " "}');
    expect(source).toContain('className="text-left align-middle">{clo.outcome}');
    expect(source).toContain('className="border border-black px-1.5 py-[2px] text-left"');
  });

  test("renders Section 15 hours before percentages with assessment-inclusive wording", async () => {
    const source = await Bun.file(SOURCE_PATH).text();
    const hours = '<CloPloMatrix mapping={document.mapping} mode="hours" />';
    const percent = '<CloPloMatrix mapping={document.mapping} mode="percent" />';
    expect(source.indexOf(hours)).toBeGreaterThan(-1);
    expect(source.indexOf(percent)).toBeGreaterThan(source.indexOf(hours));
    expect(source).toContain("including learning and assessment");
    expect(source).toContain("function BlankTD");
    expect(source).not.toContain(
      "The mapping shown here is generated from the current CLO, PLO, teaching-method and assessment-method records stored in the PMS.",
    );
  });

  test("shows persisted assessment SLT in Sections 16 and 17", async () => {
    const source = await Bun.file(SOURCE_PATH).text();
    expect(source).toContain("document.totals.continuousAssessmentSlt");
    expect(source).toContain("document.totals.finalAssessmentSlt");
    expect(source).toContain("document.totals.grandSlt");
    expect(source).toContain("assessment.totalSltHours");
  });
});