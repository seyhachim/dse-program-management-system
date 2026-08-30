from pathlib import Path

preview = Path("apps/frontend/app/(shell)/courses/[id]/spec/document-preview-pages.tsx")
source = preview.read_text()

helper_anchor = "export function DocumentPages({ document, zoom }: { document: CourseDocumentModel; zoom: number }) {\n"
helpers = r'''function compactSltValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric === 0) return "";
  return String(value).replace(/\.0+$/, "");
}

function SltCell({
  value,
  className = "",
  colSpan,
}: {
  value: string | number | null | undefined;
  className?: string;
  colSpan?: number;
}) {
  const display = compactSltValue(value);
  return (
    <td
      colSpan={colSpan}
      className={["border border-black px-1 py-[1px] align-middle", className].join(" ")}
    >
      {display || " "}
    </td>
  );
}

function AssessmentSltTable({
  document,
  category,
}: {
  document: CourseDocumentModel;
  category: "continuous" | "final";
}) {
  const label = category === "continuous" ? "Continuous Assessment" : "Final Assessment";
  const assessments = document.assessments.filter(
    (assessment) => assessment.assessmentCategory === category,
  );
  const paddedRows = Array.from(
    { length: Math.max(5, assessments.length) },
    (_, index) => assessments[index] ?? null,
  );
  const categoryTotal =
    category === "continuous"
      ? document.totals.continuousAssessmentSlt
      : document.totals.finalAssessmentSlt;

  return (
    <Table className="section16-assessment-table mt-4 text-[8px] leading-[1.05]">
      <colgroup>
        <col style={{ width: "3%" }} />
        <col style={{ width: "38%" }} />
        <col style={{ width: "6%" }} />
        <col style={{ width: "16%" }} />
        <col style={{ width: "19%" }} />
        <col style={{ width: "13%" }} />
        <col style={{ width: "5%" }} />
      </colgroup>
      <thead>
        <tr>
          <TH rowSpan={2} colSpan={2} className="bg-[#E2EEDB] text-center font-normal">{label}</TH>
          <TH rowSpan={2} className="bg-[#E2EEDB] text-center font-normal">%</TH>
          <TH colSpan={2} className="bg-[#E2EEDB] text-center font-normal">Face to Face (F2F)</TH>
          <TH rowSpan={2} className="bg-[#E2EEDB] text-center font-normal">NF2F<br />Independent Learning<br />(Asynchronous)</TH>
          <TH rowSpan={2} className="bg-[#E2EEDB] text-center font-normal">Total<br />SLT</TH>
        </tr>
        <tr>
          <TH className="bg-[#E2EEDB] text-center font-normal">Physical</TH>
          <TH className="bg-[#E2EEDB] text-center font-normal">Online/Technology-mediated<br />(Synchronous)</TH>
        </tr>
      </thead>
      <tbody>
        {paddedRows.map((assessment, index) => (
          <tr key={assessment?.id ?? `${category}-blank-${index}`}>
            <SltCell value={index + 1} className="text-center" />
            <SltCell value={assessment?.name ?? ""} />
            <SltCell value={assessment?.weight ?? ""} className="text-center" />
            <SltCell value={assessment?.physicalSltHours ?? ""} className="text-center" />
            <SltCell value={assessment?.onlineSltHours ?? ""} className="text-center" />
            <SltCell value={assessment?.independentSltHours ?? ""} className="text-center" />
            <SltCell value={assessment?.totalSltHours ?? ""} className="text-center" />
          </tr>
        ))}
        <tr>
          <td colSpan={6} className="border border-black px-1 py-[1px] text-right align-middle font-semibold">
            Total SLT for {label}:
          </td>
          <SltCell value={categoryTotal} className="bg-[#FFF2CC] text-center font-semibold" />
        </tr>
      </tbody>
    </Table>
  );
}

'''
if helper_anchor not in source:
    raise SystemExit("DocumentPages anchor not found")
if "function AssessmentSltTable" not in source:
    source = source.replace(helper_anchor, helpers + helper_anchor, 1)

start = source.find('      <Page zoom={zoom} pageNumber={7}><div id="slt"')
end = source.find('      <Page zoom={zoom} pageNumber={8}', start)
if start == -1 or end == -1:
    raise SystemExit("Section 16 preview page block not found")

new_block = r'''      <Page zoom={zoom} pageNumber={7}><div id="slt" className="h-full px-[54px] py-[42px]"><PartTwoRow>
        <SectionTitle number="16">Distribution of Student Learning Time (SLT)</SectionTitle>
        <p className="mb-3 text-[8.5px]">* Lecture (L), Tutoring (T), Practice (P), Other (O)</p>
        <Table className="section16-content-table text-[8px] leading-[1.05]">
          <colgroup>
            <col style={{ width: "3.125%" }} />
            <col style={{ width: "39.583%" }} />
            <col style={{ width: "5.208%" }} />
            {Array.from({ length: 8 }, (_, index) => <col key={`activity-col-${index}`} style={{ width: "4.167%" }} />)}
            <col style={{ width: "11.458%" }} />
            <col style={{ width: "7.292%" }} />
          </colgroup>
          <thead>
            <tr>
              <TH rowSpan={4} colSpan={2} className="bg-[#E2EEDB] text-center font-normal">Course Content Outline and subtopics</TH>
              <TH rowSpan={4} className="bg-[#E2EEDB] text-center font-normal">CLOs</TH>
              <TH colSpan={9} className="bg-[#E2EEDB] text-center font-normal">Learning and Teaching Activities</TH>
              <TH rowSpan={4} className="bg-[#E2EEDB] text-center font-normal">Total<br />SLT</TH>
            </tr>
            <tr>
              <TH colSpan={8} className="bg-[#E2EEDB] text-center font-normal">Face to Face (F2F)</TH>
              <TH rowSpan={3} className="bg-[#E2EEDB] text-center font-normal">NF2F<br />Independent Learning<br />(Asynchronous)</TH>
            </tr>
            <tr>
              <TH colSpan={4} className="bg-[#E2EEDB] text-center font-normal">Physical</TH>
              <TH colSpan={4} className="bg-[#E2EEDB] text-center font-normal">Online/Technology-mediated<br />(Synchronous)</TH>
            </tr>
            <tr>
              {(["L", "T", "P", "O", "L", "T", "P", "O"] as const).map((label, index) => (
                <TH key={`${label}-${index}`} className="bg-[#E2EEDB] text-center font-normal">{label}</TH>
              ))}
            </tr>
          </thead>
          <tbody>
            {document.weeklyPlan.map((week) => (
              <tr key={week.id}>
                <SltCell value={week.week} className="text-center" />
                <td className="border border-black px-1 py-[1px] align-middle">
                  <strong>Topic {week.week}:</strong>{" "}{week.topic}
                </td>
                <SltCell value={week.cloCodes.join(", ")} className="text-center" />
                <SltCell value={week.lectureHours} className="text-center" />
                <SltCell value={week.tutorialHours} className="text-center" />
                <SltCell value={week.practiceHours} className="text-center" />
                <SltCell value={week.otherHours} className="text-center" />
                <SltCell value="" className="text-center" />
                <SltCell value="" className="text-center" />
                <SltCell value="" className="text-center" />
                <SltCell value="" className="text-center" />
                <SltCell value={week.selfStudyHours} className="text-center" />
                <SltCell value={week.sltHours} className="text-center" />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="border border-black px-1 py-[1px] text-right align-middle font-semibold">Total SLT for Course Content</td>
              <SltCell value={document.weeklyPlan.reduce((sum, week) => sum + (Number(week.lectureHours) || 0), 0)} className="text-center font-semibold" />
              <SltCell value={document.weeklyPlan.reduce((sum, week) => sum + (Number(week.tutorialHours) || 0), 0)} className="text-center font-semibold" />
              <SltCell value={document.weeklyPlan.reduce((sum, week) => sum + (Number(week.practiceHours) || 0), 0)} className="text-center font-semibold" />
              <SltCell value={document.weeklyPlan.reduce((sum, week) => sum + (Number(week.otherHours) || 0), 0)} className="text-center font-semibold" />
              <SltCell value="" className="text-center" />
              <SltCell value="" className="text-center" />
              <SltCell value="" className="text-center" />
              <SltCell value="" className="text-center" />
              <SltCell value={document.weeklyPlan.reduce((sum, week) => sum + (Number(week.selfStudyHours) || 0), 0)} className="text-center font-semibold" />
              <SltCell value={document.totals.courseContentSlt} className="text-center font-semibold" />
            </tr>
          </tfoot>
        </Table>
        <AssessmentSltTable document={document} category="continuous" />
        <AssessmentSltTable document={document} category="final" />
      </PartTwoRow><PageFooter courseCode={info.courseCode} page={7} /></div></Page>

'''
source = source[:start] + new_block + source[end:]
preview.write_text(source)

themed = Path("apps/frontend/app/(shell)/courses/[id]/spec/themed-document-pages.tsx")
style = themed.read_text()
css_anchor = '''        .course-spec-theme-root #clos .section14-table {\n          table-layout: fixed !important;\n        }\n'''
css = '''        .course-spec-theme-root #slt .section16-content-table,\n        .course-spec-theme-root #slt .section16-assessment-table {\n          table-layout: fixed !important;\n          margin-top: 3pt !important;\n          margin-bottom: 3pt !important;\n        }\n\n        .course-spec-theme-root #slt .section16-content-table th,\n        .course-spec-theme-root #slt .section16-content-table td,\n        .course-spec-theme-root #slt .section16-assessment-table th,\n        .course-spec-theme-root #slt .section16-assessment-table td {\n          padding: 1.25pt 1pt !important;\n          font-size: 7.5pt !important;\n          line-height: 1.05 !important;\n          vertical-align: middle !important;\n        }\n\n        .course-spec-theme-root #slt .section16-content-table th,\n        .course-spec-theme-root #slt .section16-assessment-table th {\n          background: #e2eedb !important;\n          text-align: center !important;\n          font-weight: 400 !important;\n        }\n\n'''
if css_anchor not in style:
    raise SystemExit("Section 14 CSS anchor not found")
if "#slt .section16-content-table" not in style:
    style = style.replace(css_anchor, css + css_anchor, 1)
themed.write_text(style)

test = Path("apps/frontend/app/(shell)/courses/[id]/spec/document-preview-pages-layout.test.ts")
tests = test.read_text()
old_test = '''  test("shows persisted assessment SLT in Sections 16 and 17", async () => {\n    const source = await Bun.file(SOURCE_PATH).text();\n    expect(source).toContain("document.totals.continuousAssessmentSlt");\n    expect(source).toContain("document.totals.finalAssessmentSlt");\n    expect(source).toContain("document.totals.grandSlt");\n    expect(source).toContain("assessment.totalSltHours");\n  });\n'''
new_test = '''  test("matches the approved Section 16 SLT distribution layout", async () => {\n    const source = await Bun.file(SOURCE_PATH).text();\n    expect(source).toContain("Course Content Outline and subtopics");\n    expect(source).toContain("Learning and Teaching Activities");\n    expect(source).toContain("Face to Face (F2F)");\n    expect(source).toContain("Online/Technology-mediated");\n    expect(source).toContain("NF2F<br />Independent Learning<br />(Asynchronous)");\n    expect(source).toContain("* Lecture (L), Tutoring (T), Practice (P), Other (O)");\n    expect(source).toContain('category="continuous"');\n    expect(source).toContain('category="final"');\n    expect(source).toContain("physicalSltHours");\n    expect(source).toContain("onlineSltHours");\n    expect(source).toContain("independentSltHours");\n    expect(source).toContain("document.totals.continuousAssessmentSlt");\n    expect(source).toContain("document.totals.finalAssessmentSlt");\n    expect(source).not.toContain("Assessment SLT</p>");\n  });\n\n  test("shows persisted assessment SLT in Section 17", async () => {\n    const source = await Bun.file(SOURCE_PATH).text();\n    expect(source).toContain("assessment.totalSltHours");\n  });\n'''
if old_test not in tests:
    raise SystemExit("Existing Section 16 test block not found")
test.write_text(tests.replace(old_test, new_test, 1))

style_test = Path("apps/frontend/app/(shell)/courses/[id]/spec/section16-preview-style.test.ts")
style_test.write_text('''import { describe, expect, test } from "bun:test";\n\nconst THEME_PATH = new URL("./themed-document-pages.tsx", import.meta.url);\n\ndescribe("Section 16 preview style", () => {\n  test("keeps the official SLT tables compact enough for the landscape page", async () => {\n    const source = await Bun.file(THEME_PATH).text();\n    expect(source).toContain("#slt .section16-content-table");\n    expect(source).toContain("#slt .section16-assessment-table");\n    expect(source).toContain("font-size: 7.5pt !important");\n    expect(source).toContain("padding: 1.25pt 1pt !important");\n    expect(source).toContain("table-layout: fixed !important");\n  });\n});\n''')
