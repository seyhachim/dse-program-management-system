from pathlib import Path

preview = Path('apps/frontend/app/(shell)/courses/[id]/spec/document-preview-pages.tsx')
src = preview.read_text()
start = src.index('        <div className="section14-table">')
end = src.index('        <TaxonomyLegend />', start)
new = '''        <div className="section14-table">
          <Table className="section14-header-table text-[10.5px] leading-[1.22]">
            <colgroup>
              <col style={{ width: "7%" }} />
              <col style={{ width: "58%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
            </colgroup>
            <tbody>
              <tr className="section14-header-row">
                <TH rowSpan={2} colSpan={2} className="bg-[#E2EEDB] text-center font-normal">Description of the course learning outcomes – CLOs. At the end of the course, students will be able to:</TH>
                <TH rowSpan={2} className="bg-[#E2EEDB] text-center font-normal">PLO</TH>
                <TH colSpan={3} className="bg-[#E2EEDB] text-center font-normal">Levels in Learning Domain:<br />Knowledge (Cognitive-C), Attitude<br />(Affective-A), Skills (Psychomotor-P)</TH>
              </tr>
              <tr className="section14-header-row">
                <TH className="bg-[#E2EEDB] text-center font-normal">C</TH>
                <TH className="bg-[#E2EEDB] text-center font-normal">A</TH>
                <TH className="bg-[#E2EEDB] text-center font-normal">P</TH>
              </tr>
            </tbody>
          </Table>
          <Table className="section14-body-table text-[10.5px] leading-[1.22]">
            <colgroup>
              <col style={{ width: "7%" }} />
              <col style={{ width: "58%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
            </colgroup>
            <tbody>
              {document.clos.length ? document.clos.map((clo) => {
                const domain = learningDomain(clo.level);
                return <tr key={clo.code}>
                  <TD className="text-center align-middle">{clo.code}</TD>
                  <TD className="text-left align-middle">{clo.outcome}</TD>
                  <TD className="text-center align-middle">{joinValues(clo.mappedPlos)}</TD>
                  <TD className="text-center align-middle">{domain.cognitive || " "}</TD>
                  <TD className="text-center align-middle">{domain.affective || " "}</TD>
                  <TD className="text-center align-middle">{domain.psychomotor || " "}</TD>
                </tr>;
              }) : <tr><TD colSpan={6}>No Course Learning Outcomes have been added.</TD></tr>}
            </tbody>
          </Table>
        </div>
'''
preview.write_text(src[:start] + new + src[end:])

themed = Path('apps/frontend/app/(shell)/courses/[id]/spec/themed-document-pages.tsx')
css = themed.read_text()
anchor = '''        .course-spec-theme-root #clos .section14-table > table {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          table-layout: fixed !important;
          box-sizing: border-box !important;
        }
'''
replacement = anchor + '''
        .course-spec-theme-root #clos .section14-header-table,
        .course-spec-theme-root #clos .section14-body-table {
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }

        .course-spec-theme-root #clos .section14-body-table {
          margin-top: -1px !important;
        }
'''
if anchor not in css:
    raise SystemExit('Section 14 CSS anchor missing')
themed.write_text(css.replace(anchor, replacement, 1))

test = Path('apps/frontend/app/(shell)/courses/[id]/spec/document-preview-pages-layout.test.ts')
t = test.read_text()
t = t.replace("    expect(source).toContain('<thead><tr className=\\\"section14-header-row\\\">');\n    expect(source).toContain('</thead><tbody>{document.clos.length ?');\n", "    expect(source).toContain('className=\"section14-header-table');\n    expect(source).toContain('className=\"section14-body-table');\n    expect(source).not.toContain('<thead><tr className=\\\"section14-header-row\\\">');\n")
test.write_text(t)

style_test = Path('apps/frontend/app/(shell)/courses/[id]/spec/section14-preview-style.test.ts')
st = style_test.read_text()
marker = '    expect(source).toContain("font-size: 8.5pt !important");\n'
if marker in st and '.section14-body-table' not in st:
    st = st.replace(marker, marker + '    expect(source).toContain(".section14-header-table");\n    expect(source).toContain(".section14-body-table");\n')
style_test.write_text(st)
