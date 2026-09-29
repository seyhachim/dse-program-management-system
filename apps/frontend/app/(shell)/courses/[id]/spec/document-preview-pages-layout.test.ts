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

    expect(source.match(/<PartTwoRow>/g)?.length).toBe(15);
    expect(source.match(/<\/PartTwoRow>/g)?.length).toBe(15);

    expect(source).toContain(
      '<span>14.</span><span className="font-bold">Course Learning Outcomes</span>',
    );

    for (const section of [
      'number="15">Mapping of the Course Learning Outcomes',
      'number="16">Distribution of Student Learning Time (SLT)',
      'number="17">Course Assessment Plan',
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
    expect(source).toContain('<SectionTitle number="18">');
    expect(source).toContain("Course Outline / Detailed Lesson Plan");
  });

  test("matches the official Course Information and CLO presentation", async () => {
    const source = await Bun.file(SOURCE_PATH).text();
    expect(source).toContain("COURSE_DOCUMENT_STYLE.courseInfoTitle");
    expect(source).toContain('text-[9px]">Here are the CLOs of this course:');
    expect(source).toContain(
      "Description of the course learning outcomes – CLOs. At the end of the course, students will be able to:",
    );
    expect(source).toContain(">PLO</TH>");
    expect(source).toContain(
      "Levels in Learning Domain:<br />Knowledge (Cognitive-C), Attitude<br />(Affective-A), Skills (Psychomotor-P)",
    );
    for (const domainCode of ["C", "A", "P"]) {
      expect(source).toContain(
        `className="bg-[#E2EEDB] text-center font-normal">${domainCode}</TH>`,
      );
    }
    expect(source).toContain('className="section14-header-row"');
    expect(source).toContain('className="section14-header-table');
    expect(source).toContain('className="section14-body-table');
    expect(source).not.toContain('<thead><tr className="section14-header-row">');
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
    expect(source).toContain("formatCourseDocumentSltHours(row.sltHours)");
    expect(source).toContain("function BlankTD");
    expect(source).not.toContain(
      "The mapping shown here is generated from the current CLO, PLO, teaching-method and assessment-method records stored in the PMS.",
    );
  });

  test("matches the approved Section 16 SLT distribution layout", async () => {
    const source = await Bun.file(SOURCE_PATH).text();
    expect(source).toContain("Course Content Outline and subtopics");
    expect(source).toContain("Learning and Teaching Activities");
    expect(source).toContain("Face to Face (F2F)");
    expect(source).toContain("Online/Technology-mediated");
    expect(source).toContain("NF2F<br />Independent Learning<br />(Asynchronous)");
    expect(source).toContain("* Lecture (L), Tutoring (T), Practice (P), Other (O)");
    expect(source).toContain('category="continuous"');
    expect(source).toContain('category="final"');
    expect(source).toContain("physicalSltHours");
    expect(source).toContain("onlineSltHours");
    expect(source).toContain("independentSltHours");
    expect(source).toContain("assessment?.totalSltHours");
    expect(source).toContain("assessment?.weight");
    expect(source).toContain("document.totals.continuousAssessmentSlt");
    expect(source).toContain("document.totals.finalAssessmentSlt");
    expect(source).not.toContain("Assessment SLT</p>");
  });


  test("keeps Section 18 summaries off the weekly detail page", async () => {
    const source = await Bun.file(SOURCE_PATH).text();

    expect(source).toContain("const SECTION18_WEEK_ROWS_PER_PAGE = 7;");
    expect(source).toContain(
      "const resourcesPage = weeklyStartPage + weeklyPages.length * 2;",
    );
    expect(source).toContain(
      "const section18DetailPage = weeklyStartPage + index * 2;",
    );
    expect(source).toContain(
      "const section18SummaryPage = section18DetailPage + 1;",
    );
    expect(source).toContain('className="section18-summary-page h-full px-[54px] py-[42px]"');
    expect(source).toContain("Learning Activities");
    expect(source).toContain("Active Learning Strategies");
    expect(source).toContain("Teaching Resources");

    const section18Start = source.indexOf(
      "{weeklyPages.map((weeks, index) => {",
    );
    const detailFooter = source.indexOf(
      "<PageFooter courseCode={info.courseCode} page={section18DetailPage} />",
      section18Start,
    );
    const summaryPage = source.indexOf(
      'className="section18-summary-page h-full px-[54px] py-[42px]"',
      section18Start,
    );
    const learningActivities = source.indexOf(
      "<strong>Learning Activities</strong>",
      section18Start,
    );

    expect(section18Start).toBeGreaterThan(-1);
    expect(detailFooter).toBeGreaterThan(section18Start);
    expect(summaryPage).toBeGreaterThan(detailFooter);
    expect(learningActivities).toBeGreaterThan(summaryPage);
  });

  test("shows persisted assessment SLT in Section 17", async () => {
    const source = await Bun.file(SOURCE_PATH).text();
    expect(source).toContain("assessment.totalSltHours");
  });
});