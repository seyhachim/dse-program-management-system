from pathlib import Path
import re

path = Path("apps/frontend/app/(shell)/courses/[id]/spec/document-word-renderer.ts")
source = path.read_text(encoding="utf-8")

# The old sectionBox model creates independent outer tables for every numbered
# section. Part 2 now uses one outer Course Details table instead.
source, removed = re.subn(
    r"\nfunction sectionBox\(children: \(Paragraph \| Table\)\[\]\) \{.*?\n\}\n\nfunction values",
    "\nfunction values",
    source,
    count=1,
    flags=re.S,
)
assert removed == 1, "sectionBox helper not found exactly once"

old_signature = '''function courseInformationTable(
  info: CourseDocumentModel["courseInformation"],
) {'''
new_signature = '''function courseInformationTable(
  info: CourseDocumentModel["courseInformation"],
  continuationRows: TableRow[] = [],
) {'''
assert old_signature in source, "courseInformationTable signature not found"
source = source.replace(old_signature, new_signature, 1)

old_rows_end = '''      labelValueRow("13. Course Description / Synopsis", info.description),
    ],
    w,
  );
}'''
new_rows_end = '''      labelValueRow("13. Course Description / Synopsis", info.description),
      ...continuationRows,
    ],
    w,
  );
}'''
assert old_rows_end in source, "Course Information row 13 block not found"
source = source.replace(old_rows_end, new_rows_end, 1)

marker = '''function dateTable(specDate: CourseDocumentModel["specDate"]) {'''
assert marker in source, "dateTable marker not found"

helper = r'''function partTwoContinuationRow(children: (Paragraph | Table)[]) {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 4,
        width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        margins: { top: 70, bottom: 70, left: 75, right: 75 },
        children,
      }),
    ],
  });
}

function partTwoContinuationRows(document: CourseDocumentModel): TableRow[] {
  return [
    partTwoContinuationRow(cloSection(document)),
    partTwoContinuationRow([
      sectionTitle(
        "15",
        "Mapping of the Course Learning Outcomes to the Programme Learning Outcomes, Teaching Methods and Assessment Methods",
      ),
      officialCloPloMatrixTable(document, "hours"),
      paragraph("1 Credit = 40 Student Learning Time (SLT)", false, SMALL),
      officialCloPloMatrixTable(document, "percent"),
      paragraph(
        "Fully (F) indicates a focus of more than 50% of the total SLT on this PLO, Moderate (M) indicates a focus of 31%–50% of the total SLT, and Partial (P) indicates a focus of less than 30% of the total SLT on the PLO.",
        false,
        SMALL,
      ),
    ]),
    partTwoContinuationRow([
      sectionTitle("16", "Distribution of Student Learning Time (SLT)"),
      paragraph("* Lecture (L), Tutoring (T), Practice (P), Other (O)", false, SMALL),
      courseContentSltTable(document),
      new Paragraph({ spacing: { before: 90, after: 0 }, children: [] }),
      assessmentSltTable(document, "continuous"),
      new Paragraph({ spacing: { before: 70, after: 0 }, children: [] }),
      assessmentSltTable(document, "final"),
      new Paragraph({ spacing: { before: 45, after: 0 }, children: [] }),
      grandTotalSltTable(document),
    ]),
    partTwoContinuationRow([
      sectionTitle("17", "Course Assessment Plan"),
      assessmentPlanTable(document),
    ]),
    partTwoContinuationRow([
      sectionTitle("18", "Course Outline/detailed lesson plan"),
      lessonLearningOutcomesTable(document.weeklyPlan),
      paragraph("* Active Learning Strategies (ALS)", false, SMALL),
      centered("Detail Course Syllabus", false, SMALL),
      detailCourseSyllabusTable(document, document.weeklyPlan),
    ]),
    partTwoContinuationRow([
      sectionTitle("19", "Required Resources to Deliver the Course"),
      ...(document.resources.length === 0
        ? [
            paragraph(
              "No required resources have been confirmed.",
              false,
              SMALL,
            ),
          ]
        : [resourcesTable(document.resources)]),
    ]),
    partTwoContinuationRow([
      sectionTitle("20", "References / Textbooks"),
      ...(document.references.length === 0
        ? [
            paragraph(
              "No references have been recorded.",
              false,
              SMALL,
            ),
          ]
        : [referencesTable(document.references)]),
    ]),
    partTwoContinuationRow([
      sectionTitle("21", "Student Responsibility"),
      ...(document.responsibilities.length === 0
        ? [
            paragraph(
              "No student responsibilities have been recorded.",
              false,
              SMALL,
            ),
          ]
        : bulletedList(document.responsibilities)),
    ]),
    partTwoContinuationRow([
      sectionTitle("22", "Rubric"),
      ...rubricSection(document),
    ]),
    partTwoContinuationRow([
      sectionTitle("23", "Course Policy"),
      ...policyParagraphs(document.policy),
    ]),
    partTwoContinuationRow([
      sectionTitle("24", "Rating Scale"),
      ratingScaleTable(document),
    ]),
    partTwoContinuationRow([
      sectionTitle("25", "Date"),
      dateTable(document.specDate),
    ]),
  ];
}

'''
source = source.replace(marker, helper + marker, 1)

start_marker = '''  children.push(courseInformationTable(info));

  children.push(sectionBox(cloSection(document)));
'''
end_marker = '''  const doc = new Document({'''
start = source.find(start_marker)
assert start >= 0, "old Part 2 export sequence start not found"
end = source.find(end_marker, start)
assert end >= 0, "Document construction marker not found"
source = (
    source[:start]
    + '''  children.push(
    courseInformationTable(info, partTwoContinuationRows(document)),
  );

'''
    + source[end:]
)

# Exactly one forced page break should remain: the intentional Part 1 -> Part 2 break.
assert source.count("new PageBreak()") == 1, "unexpected forced Word page breaks remain"
assert "sectionBox(" not in source, "old sectionBox usage remains"
assert "courseInformationTable(info, partTwoContinuationRows(document))" in source
assert "...continuationRows" in source

path.write_text(source, encoding="utf-8")
