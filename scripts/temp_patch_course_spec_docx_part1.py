from pathlib import Path

PATH = Path("apps/frontend/app/(shell)/courses/[id]/spec/document-word-renderer.ts")
source = PATH.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    source = source.replace(old, new, 1)


replace_once(
    '  VerticalAlign,\n  WidthType,\n} from "docx";',
    '  VerticalAlign,\n  VerticalMergeType,\n  WidthType,\n} from "docx";',
    "VerticalMergeType import",
)

replace_once(
    'import {\n  COURSE_DOCUMENT_STYLE,\n  type CourseDocumentModel,\n} from "./course-document-model";\n',
    'import {\n  COURSE_DOCUMENT_STYLE,\n  type CourseDocumentModel,\n} from "./course-document-model";\nimport {\n  contiguousRowSpans,\n  programmePloCountLabel,\n  splitLeadingWord,\n} from "./plo-preview-format";\n',
    "PLO formatting helper imports",
)

replace_once(
    '''              centered("Royal University of Phnom Penh", true, 22),
              centered("Faculty of Engineering", true, 19),
              centered(
                "Department of Information Technology Engineering",
                true,
                19,
              ),
              centered(document.courseInformation.programmeTitle, true, 19),
              centered("Course Specification", true, 28),''',
    '''              centered("Royal University of Phnom Penh", true, 22),
              centered("Faculty of Engineering", true, 22),
              centered(
                "Department of Information Technology Engineering",
                true,
                22,
              ),
              centered(document.courseInformation.programmeTitle, true, 22),
              centered("Course Specification", true, 22),''',
    "Part 1 Word header typography",
)

old_peo_tail = '''      row(
        new TableCell({
          columnSpan: 2,
          verticalAlign: VerticalAlign.TOP,
          margins: { top: 45, bottom: 45, left: 70, right: 70 },
          children: [
            compactParagraph("PROGRAM EDUCATIONAL OBJECTIVES (PEOs)", true, 20),
            compactParagraph(
              "What graduates are expected to achieve within 3–5 years of graduation:",
              false,
              18,
            ),
            ...peos,
          ],
        }),
      ),
    ],
    [leftWidth, rightWidth],
  );
}'''

new_peo_tail = '''      row(
        new TableCell({
          columnSpan: 2,
          verticalAlign: VerticalAlign.TOP,
          margins: { top: 45, bottom: 45, left: 70, right: 70 },
          children: [
            compactParagraph("PROGRAM EDUCATIONAL OBJECTIVES (PEOs)", true, 20),
            compactParagraph(
              "What graduates are expected to achieve within 3–5 years of graduation:",
              false,
              18,
            ),
            ...peos,
          ],
        }),
      ),
      new TableRow({
        cantSplit: true,
        children: [programmePloContinuationCell(document)],
      }),
    ],
    [leftWidth, rightWidth],
  );
}'''
replace_once(old_peo_tail, new_peo_tail, "Part 1 PLO continuation row")

old_plo_function = '''function ploTaxonomyTable(plos: CourseDocumentModel["plos"]) {
  const w = colWidths([6, 8, 38, 16, 16, 8, 8]);
  const headers = [
    "No.",
    "PLO",
    "Description",
    "Major",
    "Learning Domain",
    "Specific / Generic",
    "C/A/P",
  ];
  const rows = [
    new TableRow({ children: headers.map((h, i) => headerCell(h, w[i])) }),
  ];
  plos.forEach((plo, index) => {
    const rowValues = [
      String(index + 1),
      plo.code,
      plo.description,
      plo.major ?? "",
      plo.learningDomain ?? "",
      plo.specificOrGeneric ?? "",
      plo.cap ?? "",
    ];
    rows.push(
      new TableRow({
        children: rowValues.map((v, i) =>
          cell(v, { width: w[i], bold: i === 1 }),
        ),
      }),
    );
  });
  return table(rows, w);
}'''

new_plo_function = '''function ploColumnWidths(totalWidth: number) {
  const weights = [19, 19, 35, 12, 15];
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const widths = weights.map((weight) =>
    Math.floor((weight / totalWeight) * totalWidth),
  );
  const distributed = widths.reduce((sum, width) => sum + width, 0);
  widths[widths.length - 1]! += totalWidth - distributed;
  return widths;
}

function ploWordCell(
  width: number,
  children: TextRun[],
  options?: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    columnSpan?: number;
    verticalMerge?: (typeof VerticalMergeType)[keyof typeof VerticalMergeType];
  },
) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: options?.columnSpan,
    verticalMerge: options?.verticalMerge,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 28, bottom: 28, left: 36, right: 36 },
    children: [
      new Paragraph({
        alignment: options?.alignment ?? AlignmentType.LEFT,
        spacing: { before: 0, after: 0, line: 205 },
        children,
      }),
    ],
  });
}

function ploHeaderCell(
  value: string,
  width: number,
  options?: {
    columnSpan?: number;
    verticalMerge?: (typeof VerticalMergeType)[keyof typeof VerticalMergeType];
  },
) {
  return ploWordCell(width, value ? [text(value, true, SMALL)] : [], {
    alignment: AlignmentType.CENTER,
    columnSpan: options?.columnSpan,
    verticalMerge: options?.verticalMerge,
  });
}

function ploMergedValueCell(
  value: string,
  width: number,
  span: number,
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT,
) {
  if (span === 0) {
    return ploWordCell(width, [], {
      alignment,
      verticalMerge: VerticalMergeType.CONTINUE,
    });
  }
  return ploWordCell(width, value ? [text(value, false, SMALL)] : [], {
    alignment,
    verticalMerge: span > 1 ? VerticalMergeType.RESTART : undefined,
  });
}

function ploTaxonomyTable(plos: CourseDocumentModel["plos"], totalWidth: number) {
  const w = ploColumnWidths(totalWidth);
  const majorRowSpans = contiguousRowSpans(plos, (plo) => plo.major);
  const capRowSpans = contiguousRowSpans(plos, (plo) => plo.cap);
  const rows: TableRow[] = [
    new TableRow({
      cantSplit: true,
      children: [
        ploHeaderCell("CQF Learning Domains", w[0]! + w[1]!, {
          columnSpan: 2,
        }),
        ploHeaderCell("PLO", w[2]!, {
          verticalMerge: VerticalMergeType.RESTART,
        }),
        ploHeaderCell("Specific/Generic", w[3]!, {
          verticalMerge: VerticalMergeType.RESTART,
        }),
        ploHeaderCell("Learning/Assessment Domains", w[4]!, {
          verticalMerge: VerticalMergeType.RESTART,
        }),
      ],
    }),
    new TableRow({
      cantSplit: true,
      children: [
        ploHeaderCell("Major Domain", w[0]!),
        ploHeaderCell("Learning Domain", w[1]!),
        ploHeaderCell("", w[2]!, {
          verticalMerge: VerticalMergeType.CONTINUE,
        }),
        ploHeaderCell("", w[3]!, {
          verticalMerge: VerticalMergeType.CONTINUE,
        }),
        ploHeaderCell("", w[4]!, {
          verticalMerge: VerticalMergeType.CONTINUE,
        }),
      ],
    }),
  ];

  plos.forEach((plo, index) => {
    const { leadingWord, remainder } = splitLeadingWord(plo.description);
    const descriptionRuns = [
      text(`${plo.code}: ${leadingWord}`.trim(), true, SMALL),
      ...(remainder ? [text(` ${remainder}`, false, SMALL)] : []),
    ];
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          ploMergedValueCell(
            plo.major ?? "",
            w[0]!,
            majorRowSpans[index] ?? 1,
          ),
          ploWordCell(
            w[1]!,
            [text(plo.learningDomain || "—", false, SMALL)],
          ),
          ploWordCell(w[2]!, descriptionRuns),
          ploWordCell(
            w[3]!,
            [text(plo.specificOrGeneric || "—", false, SMALL)],
            { alignment: AlignmentType.CENTER },
          ),
          ploMergedValueCell(
            plo.cap ?? "",
            w[4]!,
            capRowSpans[index] ?? 1,
            AlignmentType.CENTER,
          ),
        ],
      }),
    );
  });

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: w,
    layout: TableLayoutType.FIXED,
    borders,
    rows,
  });
}

function programmePloContinuationCell(document: CourseDocumentModel) {
  const cellMargin = 120;
  const innerWidth = CONTENT_WIDTH_TWIPS - cellMargin * 2;
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { before: 0, after: 24, line: 220 },
      children: [text("PROGRAM LEARNING OUTCOME (PLOs)", true, 20)],
    }),
    new Paragraph({
      spacing: { before: 0, after: 50, line: 220 },
      children: [
        text(
          `Our program has ${programmePloCountLabel(document.plos.length)} PLOs:`,
          false,
          18,
        ),
      ],
    }),
  ];

  if (document.plos.length === 0) {
    children.push(
      new Paragraph({
        spacing: { before: 0, after: 0, line: 220 },
        children: [
          text("No programme learning outcomes have been configured.", false, 18),
        ],
      }),
    );
  } else {
    children.push(ploTaxonomyTable(document.plos, innerWidth));
    children.push(
      new Paragraph({
        spacing: { before: 45, after: 12 },
        children: [text("*", false, 18)],
      }),
      new Paragraph({
        spacing: { before: 0, after: 12, line: 220 },
        children: [
          text("Specific (Subject-Specific) PLOs:", true, 18),
          text(
            " Directly related to data science and engineering knowledge, tools, and technical skills)",
            false,
            18,
          ),
        ],
      }),
      new Paragraph({
        spacing: { before: 0, after: 0, line: 220 },
        children: [
          text("Generic PLOs:", true, 18),
          text(
            " Transferable skills applicable across disciplines and professions",
            false,
            18,
          ),
        ],
      }),
    );
  }

  return new TableCell({
    columnSpan: 2,
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    margins: {
      top: cellMargin,
      bottom: cellMargin,
      left: cellMargin,
      right: cellMargin,
    },
    children,
  });
}'''
replace_once(old_plo_function, new_plo_function, "preview-equivalent PLO matrix")

replace_once(
    '''  children.push(
    centered("PART 1: VISION, MISSION, GOALS, AND OBJECTIVES", true, 24),
  );
  children.push(await programmeProfileTable(document));

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    paragraph("Part 1 (continued): Programme Learning Outcomes — Taxonomy", true),
  );
  children.push(
    document.plos.length === 0
      ? paragraph(
          "No programme learning outcomes have been configured.",
          false,
          SMALL,
        )
      : ploTaxonomyTable(document.plos),
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));''',
    '''  children.push(
    new Paragraph({
      spacing: { before: 0, after: 120, line: 220 },
      children: [
        text("PART 1: VISION, MISSION, GOALS, AND OBJECTIVES", true, 28),
      ],
    }),
  );
  children.push(await programmeProfileTable(document));

  children.push(new Paragraph({ children: [new PageBreak()] }));''',
    "Part 1 title and PLO pagination",
)

PATH.write_text(source, encoding="utf-8")
print(f"Patched {PATH}")
