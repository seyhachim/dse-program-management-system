import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  ImageRun,
  PageBreak,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

import { LETTER_GRADES, PLOS } from "@dse-pms/shared-types";
import {
  COURSE_DOCUMENT_STYLE,
  type CourseDocumentModel,
} from "./course-document-model";

const CONTENT_WIDTH_TWIPS =
  COURSE_DOCUMENT_STYLE.page.word.widthTwips -
  COURSE_DOCUMENT_STYLE.page.word.marginLeftTwips -
  COURSE_DOCUMENT_STYLE.page.word.marginRightTwips;

const FONT = COURSE_DOCUMENT_STYLE.fontFamily;
const BODY = COURSE_DOCUMENT_STYLE.fontSize.body * 2;
const SMALL = COURSE_DOCUMENT_STYLE.fontSize.small * 2;
const HEADING = COURSE_DOCUMENT_STYLE.fontSize.heading * 2;
const BORDER = COURSE_DOCUMENT_STYLE.borderColor.replace("#", "");
const LABEL = COURSE_DOCUMENT_STYLE.labelBackground.replace("#", "");
const TABLE_HEADER = COURSE_DOCUMENT_STYLE.colors.tableHeaderBackground.replace(
  "#",
  "",
);

const borders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  left: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  right: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
};

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: BORDER },
  bottom: { style: BorderStyle.NONE, size: 0, color: BORDER },
  left: { style: BorderStyle.NONE, size: 0, color: BORDER },
  right: { style: BorderStyle.NONE, size: 0, color: BORDER },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: BORDER },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: BORDER },
};

const noTopBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: BORDER },
};

const noBottomBorder = {
  bottom: { style: BorderStyle.NONE, size: 0, color: BORDER },
};

function text(text: string, bold = false, size = BODY) {
  return new TextRun({ text, bold, font: FONT, size });
}

function paragraph(value: string, bold = false, size = BODY) {
  return new Paragraph({
    spacing: { before: 0, after: 40, line: 220 },
    children: [text(value, bold, size)],
  });
}

function centered(value: string, bold = false, size = BODY) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 20 },
    children: [text(value, bold, size)],
  });
}

function sectionTitle(number: string, title: string) {
  return new Paragraph({
    spacing: { before: 30, after: 60 },
    children: [text(`${number}. ${title}`, true, HEADING)],
  });
}

function colWidths(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) =>
    Math.floor((w / total) * CONTENT_WIDTH_TWIPS),
  );
  const distributed = widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1]! += CONTENT_WIDTH_TWIPS - distributed;
  return widths;
}

function cell(
  value: string,
  options?: {
    bold?: boolean;
    shade?: string;
    width?: number;
    columnSpan?: number;
  },
) {
  return new TableCell({
    width: options?.width
      ? { size: options.width, type: WidthType.DXA }
      : undefined,
    columnSpan: options?.columnSpan,
    shading: options?.shade ? { fill: options.shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 55, bottom: 55, left: 70, right: 70 },
    children: [paragraph(value || "—", options?.bold ?? false, SMALL)],
  });
}

function headerCell(value: string, width?: number) {
  return cell(value, { bold: true, shade: TABLE_HEADER, width });
}

function table(rows: TableRow[], columnWidths?: number[]) {
  return new Table({
    width: columnWidths
      ? { size: columnWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA }
      : { size: 100, type: WidthType.PERCENTAGE },
    columnWidths,
    layout: TableLayoutType.FIXED,
    borders,
    rows,
  });
}

function sectionBox(children: (Paragraph | Table)[]) {
  return new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH_TWIPS],
    layout: TableLayoutType.FIXED,
    borders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 70, bottom: 70, left: 75, right: 75 },
            children,
          }),
        ],
      }),
    ],
  });
}

function values(items: string[]) {
  return items.length ? items.join(", ") : "—";
}

function compactParagraph(value: string, bold = false, size = 18) {
  return new Paragraph({
    spacing: { before: 0, after: 18, line: 220 },
    children: [text(value, bold, size)],
  });
}

function programmeProfileCell(title: string, children: Paragraph[]) {
  return new TableCell({
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 45, bottom: 45, left: 70, right: 70 },
    children: [compactParagraph(title, true, 20), ...children],
  });
}

async function programmeProfileHeader(document: CourseDocumentModel) {
  const response = await fetch("/rupp-logo.png");
  if (!response.ok)
    throw new Error("Could not load the RUPP logo for Word export");
  const logo = new Uint8Array(await response.arrayBuffer());
  const sideWidth = Math.round(CONTENT_WIDTH_TWIPS * 0.16);
  const centerWidth = CONTENT_WIDTH_TWIPS - sideWidth * 2;

  return new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: [sideWidth, centerWidth, sideWidth],
    layout: TableLayoutType.FIXED,
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: sideWidth, type: WidthType.DXA },
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [
              new Paragraph({
                spacing: { before: 0, after: 0 },
                children: [
                  new ImageRun({
                    data: logo,
                    transformation: {
                      width: COURSE_DOCUMENT_STYLE.logo.width,
                      height: COURSE_DOCUMENT_STYLE.logo.height,
                    },
                    type: "png",
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: centerWidth, type: WidthType.DXA },
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [
              centered("Royal University of Phnom Penh", true, 22),
              centered("Faculty of Engineering", true, 19),
              centered(
                "Department of Information Technology Engineering",
                true,
                19,
              ),
              centered(document.courseInformation.programmeTitle, true, 19),
              centered("Course Specification", true, 28),
            ],
          }),
          new TableCell({
            width: { size: sideWidth, type: WidthType.DXA },
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [new Paragraph({ children: [] })],
          }),
        ],
      }),
    ],
  });
}

async function programmeProfileTable(document: CourseDocumentModel) {
  const profile = document.programmeProfile;
  const row = (...cells: TableCell[]) => new TableRow({ children: cells });
  const mission = profile.mission.length
    ? profile.mission.map((item, index) =>
        compactParagraph(`Mission ${index + 1}: ${item}`, false, 18),
      )
    : [compactParagraph("—", false, 18)];
  const goals = profile.goals.length
    ? profile.goals.map((item) => compactParagraph(`• ${item}`, false, 18))
    : [compactParagraph("• —", false, 18)];
  const philosophy = profile.educationalPhilosophy.length
    ? profile.educationalPhilosophy.map((item) =>
        compactParagraph(
          `• ${item.code}: ${item.title}: ${item.description}`,
          false,
          17,
        ),
      )
    : [compactParagraph("• —", false, 17)];
  const peos = profile.peos.length
    ? profile.peos.map((item) =>
        compactParagraph(
          `• ${item.code}: ${item.title}: ${item.description}`,
          false,
          18,
        ),
      )
    : [compactParagraph("• —", false, 18)];
  const leftWidth = Math.round(CONTENT_WIDTH_TWIPS * 0.34);
  const rightWidth = CONTENT_WIDTH_TWIPS - leftWidth;

  return table(
    [
      row(
        programmeProfileCell("PROGRAM VISION:", [
          compactParagraph(profile.vision || "—", false, 18),
        ]),
        programmeProfileCell("PROGRAM MISSION", mission),
      ),
      row(
        programmeProfileCell("PROGRAM GOALS", [
          compactParagraph("Our program aims to:", false, 18),
          ...goals,
        ]),
        programmeProfileCell("PROGRAM EDUCATIONAL PHILOSOPHY", philosophy),
      ),
      row(
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
}

function courseInformationTable(
  info: CourseDocumentModel["courseInformation"],
) {
  const row = (...cells: TableCell[]) => new TableRow({ children: cells });
  const w = colWidths([28, 24, 16, 32]);
  const labelValueRow = (label: string, value: string) =>
    row(
      cell(label, { bold: true, shade: LABEL, width: w[0] }),
      cell(value, { width: w[1]! + w[2]! + w[3]!, columnSpan: 3 }),
    );
  const fourCellRow = (
    label1: string,
    value1: string,
    label2: string,
    value2: string,
  ) =>
    row(
      cell(label1, { bold: true, shade: LABEL, width: w[0] }),
      cell(value1, { width: w[1] }),
      cell(label2, { bold: true, shade: LABEL, width: w[2] }),
      cell(value2, { width: w[3] }),
    );

  return table(
    [
      labelValueRow("1. Programme Title", info.programmeTitle),
      labelValueRow("2. Course Title", info.courseTitle),
      fourCellRow(
        "3. Course Code",
        info.courseCode,
        "4. No. of Credits",
        info.credits,
      ),
      labelValueRow("5. Pre-requisites (If any)", info.prerequisites),
      fourCellRow(
        "6. Course Instructor",
        info.instructor,
        "7. Qualification",
        info.qualification,
      ),
      fourCellRow("8. Email", info.email, "9. Telephone No.", info.telephone),
      labelValueRow("10. Other Course Lecturer(s)", info.otherLecturers),
      labelValueRow("11. Course Type", info.courseType),
      fourCellRow(
        "12. Course Availability",
        info.semester,
        "Year",
        info.programmeYear,
      ),
      labelValueRow("13. Course Description / Synopsis", info.description),
    ],
    w,
  );
}

function levelParts(level: string) {
  const normalized = level.trim().toUpperCase();
  return {
    c: normalized.startsWith("C") ? normalized : "",
    a: normalized.startsWith("A") ? normalized : "",
    p: normalized.startsWith("P") ? normalized : "",
  };
}

function compactWordCell(
  value: string,
  width: number,
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT,
  bold = false,
) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 28, bottom: 28, left: 48, right: 48 },
    children: [
      new Paragraph({
        alignment,
        spacing: { before: 0, after: 0, line: 205 },
        children: [text(value, bold, SMALL)],
      }),
    ],
  });
}

function cloSection(document: CourseDocumentModel): (Paragraph | Table)[] {
  const bodyW = colWidths([7, 59, 8.3, 8.57, 8.57, 8.56]);
  const descriptionWidth = bodyW[0]! + bodyW[1]!;
  const domainWidth = bodyW[3]! + bodyW[4]! + bodyW[5]!;

  const mainRows: TableRow[] = [
    new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          columnSpan: 2,
          width: { size: descriptionWidth, type: WidthType.DXA },
          shading: { fill: LABEL },
          borders: noBottomBorder,
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 42, bottom: 18, left: 45, right: 45 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 0, line: 210 },
              children: [
                text(
                  "Description of the course learning outcomes – CLOs At the end of the course, students will be able to:",
                  false,
                  SMALL,
                ),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: bodyW[2]!, type: WidthType.DXA },
          shading: { fill: LABEL },
          borders: noBottomBorder,
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 42, bottom: 18, left: 35, right: 35 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 0 },
              children: [text("PLO", false, SMALL)],
            }),
          ],
        }),
        new TableCell({
          columnSpan: 3,
          width: { size: domainWidth, type: WidthType.DXA },
          shading: { fill: LABEL },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 25, bottom: 25, left: 22, right: 22 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 0, line: 210 },
              children: [
                text(
                  "Levels in Learning Domain:\nKnowledge (Cognitive-C), Attitude\n(Affective-A), Skills (Psychomotor-P)",
                  false,
                  SMALL,
                ),
              ],
            }),
          ],
        }),
      ],
    }),
    new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          columnSpan: 2,
          width: { size: descriptionWidth, type: WidthType.DXA },
          shading: { fill: LABEL },
          borders: noTopBorder,
          margins: { top: 0, bottom: 28, left: 45, right: 45 },
          children: [
            new Paragraph({ spacing: { before: 0, after: 0 }, children: [] }),
          ],
        }),
        new TableCell({
          width: { size: bodyW[2]!, type: WidthType.DXA },
          shading: { fill: LABEL },
          borders: noTopBorder,
          margins: { top: 0, bottom: 28, left: 35, right: 35 },
          children: [
            new Paragraph({ spacing: { before: 0, after: 0 }, children: [] }),
          ],
        }),
        ...(["C", "A", "P"] as const).map(
          (label, index) =>
            new TableCell({
              width: { size: bodyW[index + 3]!, type: WidthType.DXA },
              shading: { fill: LABEL },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 20, bottom: 20, left: 18, right: 18 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 0, after: 0 },
                  children: [text(label, false, SMALL)],
                }),
              ],
            }),
        ),
      ],
    }),
  ];

  if (document.clos.length) {
    for (const clo of document.clos) {
      const domain = levelParts(clo.level);
      mainRows.push(
        new TableRow({
          cantSplit: true,
          children: [
            compactWordCell(clo.code, bodyW[0]!, AlignmentType.CENTER),
            compactWordCell(clo.outcome, bodyW[1]!),
            compactWordCell(
              values(clo.mappedPlos),
              bodyW[2]!,
              AlignmentType.CENTER,
            ),
            compactWordCell(domain.c, bodyW[3]!, AlignmentType.CENTER),
            compactWordCell(domain.a, bodyW[4]!, AlignmentType.CENTER),
            compactWordCell(domain.p, bodyW[5]!, AlignmentType.CENTER),
          ],
        }),
      );
    }
  } else {
    mainRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 6,
            width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
            margins: { top: 35, bottom: 35, left: 50, right: 50 },
            children: [
              paragraph(
                "No Course Learning Outcomes have been added.",
                false,
                SMALL,
              ),
            ],
          }),
        ],
      }),
    );
  }

  const mainTable = new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: bodyW,
    layout: TableLayoutType.FIXED,
    borders,
    rows: mainRows,
  });

  const taxonomyData: [string, [string, string, string][]][] = [
    [
      "Cognitive",
      [
        ["1", "Remembering", "C1"],
        ["2", "Understanding", "C2"],
        ["3", "Applying", "C3"],
        ["4", "Analyzing", "C4"],
        ["5", "Evaluating", "C5"],
        ["6", "Creating", "C6"],
      ],
    ],
    [
      "Affective",
      [
        ["1", "Receiving", "A1"],
        ["2", "Responding", "A2"],
        ["3", "Valuing", "A3"],
        ["4", "Organizing", "A4"],
        ["5", "Internationalizing", "A5"],
      ],
    ],
    [
      "Psychomotor",
      [
        ["1", "Perception", "P1"],
        ["2", "Set", "P2"],
        ["3", "Guided Response", "P3"],
        ["4", "Mechanism", "P4"],
        ["5", "Complex over response", "P5"],
        ["6", "Adaptation", "P6"],
        ["7", "Origination", "P7"],
      ],
    ],
  ];
  const legendW = colWidths([1, 1, 1]);
  const legendCells = taxonomyData.map(([title, entries], domainIndex) => {
    const innerW = [
      Math.round(legendW[domainIndex]! * 0.12),
      Math.round(legendW[domainIndex]! * 0.75),
      0,
    ];
    innerW[2] = legendW[domainIndex]! - innerW[0]! - innerW[1]!;
    const inner = new Table({
      width: { size: legendW[domainIndex]!, type: WidthType.DXA },
      columnWidths: innerW,
      layout: TableLayoutType.FIXED,
      borders,
      rows: entries.map(
        ([number, label, code]) =>
          new TableRow({
            cantSplit: true,
            children: [
              compactWordCell(number, innerW[0]!, AlignmentType.CENTER),
              compactWordCell(label, innerW[1]!),
              compactWordCell(code, innerW[2]!, AlignmentType.CENTER),
            ],
          }),
      ),
    });
    return new TableCell({
      width: { size: legendW[domainIndex]!, type: WidthType.DXA },
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 30, bottom: 30, left: 35, right: 35 },
      children: [
        new Paragraph({
          spacing: { before: 0, after: 20 },
          children: [text(title, true, SMALL)],
        }),
        inner,
      ],
    });
  });
  const legendTable = new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: legendW,
    layout: TableLayoutType.FIXED,
    borders,
    rows: [new TableRow({ cantSplit: true, children: legendCells })],
  });

  const title = new Paragraph({
    keepNext: true,
    keepLines: true,
    spacing: { before: 30, after: 18 },
    children: [text("14. Course Learning Outcomes", true, 22)],
  });
  const subtitle = new Paragraph({
    keepNext: true,
    keepLines: true,
    spacing: { before: 0, after: 35, line: 210 },
    children: [text("Here are the CLOs of this course:", false, 20)],
  });
  const legendCaption = new Paragraph({
    keepNext: true,
    spacing: { before: 55, after: 20, line: 205 },
    children: [
      text(
        "* Levels in Learning Domain: Knowledge (Cognitive-C), Attitude (Affective-A), Skills (Psychomotor-P)",
        false,
        SMALL,
      ),
    ],
  });

  return [title, subtitle, mainTable, legendCaption, legendTable];
}

function mappingTable(document: CourseDocumentModel) {
  const w = colWidths([8, 15, 9, 34, 34]);
  const rows = [
    new TableRow({
      children: [
        headerCell("CLO", w[0]),
        headerCell("PLO", w[1]),
        headerCell("C/A/P Level", w[2]),
        headerCell("Teaching Method", w[3]),
        headerCell("Assessment Methods", w[4]),
      ],
    }),
  ];
  for (const row of document.mapping) {
    const rowValues = [
      row.cloCode,
      values(row.ploCodes),
      row.level,
      values(row.teachingMethods),
      values(row.assessmentMethods),
    ];
    rows.push(
      new TableRow({
        children: rowValues.map((v, i) => cell(v, { width: w[i] })),
      }),
    );
  }
  return table(rows, w);
}

function cloPloMatrixTable(
  document: CourseDocumentModel,
  mode: "percent" | "hours",
) {
  const w = colWidths([6, ...PLOS.map(() => 9.4)]);
  const rows = [
    new TableRow({
      children: [
        headerCell("CLO", w[0]),
        ...PLOS.map((plo, i) => headerCell(plo.id, w[i + 1])),
      ],
    }),
  ];
  for (const row of document.mapping) {
    rows.push(
      new TableRow({
        children: [
          cell(row.cloCode, { bold: true, width: w[0] }),
          ...PLOS.map((plo, i) => {
            const width = w[i + 1];
            if (!row.ploCodes.includes(plo.id)) return cell("", { width });
            if (mode === "percent") {
              return cell(
                row.focusCode && row.focusPercent != null
                  ? `${row.focusCode} (${row.focusPercent}%)`
                  : "—",
                { width },
              );
            }
            return cell(row.sltHours || "—", { width });
          }),
        ],
      }),
    );
  }
  return table(rows, w);
}

function sltTable(document: CourseDocumentModel) {
  const w = colWidths([5, 29, 8, 7, 7, 7, 7, 9, 11]);
  const headers = [
    "Week",
    "Course Content / Topic",
    "CLOs",
    "L",
    "T",
    "P",
    "O",
    "Independent",
    "Total SLT",
  ];
  const rows = [
    new TableRow({ children: headers.map((h, i) => headerCell(h, w[i])) }),
  ];
  const sumOf = (key: keyof CourseDocumentModel["weeklyPlan"][number]) =>
    String(
      document.weeklyPlan.reduce((s, week) => s + (Number(week[key]) || 0), 0),
    );
  for (const week of document.weeklyPlan) {
    const rowValues = [
      week.week,
      week.topic,
      values(week.cloCodes),
      week.lectureHours,
      week.tutorialHours,
      week.practiceHours,
      week.otherHours,
      week.selfStudyHours,
      week.sltHours ? `${week.sltHours} h` : "—",
    ];
    rows.push(
      new TableRow({
        children: rowValues.map((v, i) => cell(v, { width: w[i] })),
      }),
    );
  }
  rows.push(
    new TableRow({
      children: [
        cell("Total", { bold: true, width: w[0] }),
        cell("Course Content SLT", { bold: true, width: w[1] }),
        cell("", { width: w[2] }),
        cell(sumOf("lectureHours"), { bold: true, width: w[3] }),
        cell(sumOf("tutorialHours"), { bold: true, width: w[4] }),
        cell(sumOf("practiceHours"), { bold: true, width: w[5] }),
        cell(sumOf("otherHours"), { bold: true, width: w[6] }),
        cell(sumOf("selfStudyHours"), { bold: true, width: w[7] }),
        cell(`${document.totals.courseContentSlt} h`, {
          bold: true,
          width: w[8],
        }),
      ],
    }),
  );
  return table(rows, w);
}

function rubricCell(
  assessment: CourseDocumentModel["assessments"][number],
  width?: number,
) {
  if (!assessment.rubricName) return cell("", { width });
  if (!assessment.rubricUrl) return cell(assessment.rubricName, { width });
  const href =
    typeof window !== "undefined"
      ? new URL(assessment.rubricUrl, window.location.origin).toString()
      : assessment.rubricUrl;
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 55, bottom: 55, left: 70, right: 70 },
    children: [
      new Paragraph({
        spacing: { before: 0, after: 40, line: 220 },
        children: [
          new ExternalHyperlink({
            link: href,
            children: [
              new TextRun({
                text: `${assessment.rubricName} ↗`,
                font: FONT,
                size: SMALL,
                color: COURSE_DOCUMENT_STYLE.colors.link.replace("#", ""),
                underline: { type: "single" },
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function assessmentTable(document: CourseDocumentModel) {
  const w = colWidths([7, 8, 10, 23, 7, 7, 24, 14]);
  const headers = [
    "CLOs",
    "PLO",
    "C/A/P Level",
    "Assessment & Description",
    "G/I",
    "Weight (%)",
    "Evaluation Definition",
    "Rubric",
  ];
  const rows = [
    new TableRow({ children: headers.map((h, i) => headerCell(h, w[i])) }),
  ];
  for (const assessment of document.assessments) {
    const assessmentDescription = assessment.description
      ? `${assessment.name}\n${assessment.description}`
      : assessment.name;
    rows.push(
      new TableRow({
        children: [
          cell(values(assessment.cloCodes), { width: w[0] }),
          cell(values(assessment.mappedPlos), { width: w[1] }),
          cell(values(assessment.capLevels), { width: w[2] }),
          cell(assessmentDescription, { width: w[3] }),
          cell(assessment.mode === "group" ? "G" : "I", { width: w[4] }),
          cell(assessment.weight ? `${assessment.weight}%` : "—", {
            width: w[5],
          }),
          cell(assessment.evaluationDefinition, { width: w[6] }),
          rubricCell(assessment, w[7]),
        ],
      }),
    );
  }
  rows.push(
    new TableRow({
      children: [
        cell("Total", { bold: true, width: w[0] }),
        cell("", { width: w[1] }),
        cell("", { width: w[2] }),
        cell("", { width: w[3] }),
        cell("", { width: w[4] }),
        cell(`${document.totals.assessmentWeight}%`, {
          bold: true,
          width: w[5],
        }),
        cell("", { width: w[6] }),
        cell("", { width: w[7] }),
      ],
    }),
  );
  return table(rows, w);
}

function lessonPlanTable(weeks: CourseDocumentModel["weeklyPlan"]) {
  const w = colWidths([5, 9, 15, 8, 20, 18, 15, 10]);
  const headers = [
    "Week",
    "Hour (L/T/P/O)",
    "Topic",
    "CLO",
    "Lesson Learning Outcomes",
    "Teaching Method / Activity",
    "Assessment",
    "Resources",
  ];
  const rows = [
    new TableRow({ children: headers.map((h, i) => headerCell(h, w[i])) }),
  ];
  for (const week of weeks) {
    const rowValues = [
      week.week,
      [
        week.lectureHours,
        week.tutorialHours,
        week.practiceHours,
        week.otherHours,
      ]
        .map((h) => h || "0")
        .join("/"),
      week.topic,
      values(week.cloCodes),
      week.lloItems.length
        ? week.lloItems.map((v, i) => `LLO${i + 1}: ${v}`).join("\n")
        : "—",
      values(
        week.teachingMethods.length
          ? week.teachingMethods
          : week.learningActivities,
      ),
      values([week.assessment, ...week.assessmentMethods].filter(Boolean)),
      values(week.resources),
    ];
    rows.push(
      new TableRow({
        children: rowValues.map((v, i) => cell(v, { width: w[i] })),
      }),
    );
  }
  return table(rows, w);
}

function resourcesTable(resources: CourseDocumentModel["resources"]) {
  const w = colWidths([18, 27, 25, 30]);
  const headers = [
    "Resource Type",
    "Resource Name / Description",
    "Link",
    "Notes",
  ];
  const rows = [
    new TableRow({ children: headers.map((h, i) => headerCell(h, w[i])) }),
  ];
  for (const resource of resources) {
    const rowValues = [
      resource.resourceType,
      resource.title,
      resource.url,
      resource.notes,
    ];
    rows.push(
      new TableRow({
        children: rowValues.map((v, i) => cell(v, { width: w[i] })),
      }),
    );
  }
  return table(rows, w);
}

function bulletedList(items: string[]) {
  return items.map(
    (item) =>
      new Paragraph({
        bullet: { level: 0 },
        spacing: { before: 0, after: 60, line: 220 },
        children: [text(item, false, SMALL)],
      }),
  );
}

function policyParagraphs(policy: CourseDocumentModel["policy"]) {
  const sections: [string, string][] = [
    ["Attendance & Preparation", policy.attendancePreparation],
    ["Academic Integrity", policy.academicIntegrity],
    ["Homework & Assignments", policy.assignmentsLateSubmission],
    ["Examinations", policy.examinationRules],
    ["Penalties", policy.penaltiesConsequences],
  ];
  return sections.flatMap(([label, value]) => [
    paragraph(label, true, SMALL),
    paragraph(value || "—", false, SMALL),
  ]);
}

function ratingScaleTable() {
  const w = colWidths([25, 25, 25, 25]);
  const headers = ["Letter Grade", "Grade Point", "Score", "Explanation"];
  const rows = [
    new TableRow({ children: headers.map((h, i) => headerCell(h, w[i])) }),
  ];
  for (const grade of LETTER_GRADES) {
    const rowValues = [grade.grade, grade.point, grade.score, grade.label];
    rows.push(
      new TableRow({
        children: rowValues.map((v, i) => cell(v, { width: w[i] })),
      }),
    );
  }
  return table(rows, w);
}

export async function exportCourseSpecWord(document: CourseDocumentModel) {
  const children: (Paragraph | Table)[] = [];
  const info = document.courseInformation;

  children.push(await programmeProfileHeader(document));
  children.push(
    centered("PART 1: VISION, MISSION, GOALS, AND OBJECTIVES", true, 24),
  );
  children.push(await programmeProfileTable(document));

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(paragraph(document.partTitle, true));
  children.push(paragraph("Course Information", true));
  children.push(courseInformationTable(info));

  children.push(sectionBox(cloSection(document)));

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    sectionBox([
      sectionTitle(
        "15",
        "Mapping of the Course Learning Outcomes to the Programme Learning Outcomes, Teaching Methods and Assessment Methods",
      ),
      paragraph("Programme Learning Outcomes — Percentages", true, SMALL),
      cloPloMatrixTable(document, "percent"),
      paragraph(
        "Fully (F) indicates a focus of more than 50% of the total SLT on this PLO, Moderate (M) indicates a focus of 31%–50% of the total SLT, and Partial (P) indicates a focus of less than 30% of the total SLT on the PLO.",
        false,
        SMALL,
      ),
      paragraph(
        "Programme Learning Outcomes — Total Hours for Student Learning Time (SLT)",
        true,
        SMALL,
      ),
      cloPloMatrixTable(document, "hours"),
      paragraph("1 Credit = 40 Student Learning Time (SLT)", false, SMALL),
      mappingTable(document),
    ]),
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    sectionBox([
      sectionTitle("16", "Distribution of Student Learning Time (SLT)"),
      sltTable(document),
      paragraph(
        "Assessment-specific SLT is not currently stored in the course assessment records and is therefore not inferred.",
        false,
        SMALL,
      ),
    ]),
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    sectionBox([
      sectionTitle("17", "Course Assessment Plan"),
      assessmentTable(document),
      paragraph(
        "Assessment SLT is omitted because the current assessment data model does not contain an assessment-SLT field.",
        false,
        SMALL,
      ),
    ]),
  );

  const chunkSize = 7;
  for (let i = 0; i < document.weeklyPlan.length; i += chunkSize) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    const chunk = document.weeklyPlan.slice(i, i + chunkSize);
    children.push(
      sectionBox([
        sectionTitle(
          "18",
          `Course Outline / Detailed Lesson Plan — Weeks ${chunk[0]?.week ?? ""}–${chunk[chunk.length - 1]?.week ?? ""}`,
        ),
        lessonPlanTable(chunk),
      ]),
    );
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    sectionBox([
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
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    sectionBox([
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
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    sectionBox([
      sectionTitle("23", "Course Policy"),
      ...policyParagraphs(document.policy),
    ]),
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    sectionBox([sectionTitle("24", "Rating Scale"), ratingScaleTable()]),
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: COURSE_DOCUMENT_STYLE.page.word.widthTwips,
              height: COURSE_DOCUMENT_STYLE.page.word.heightTwips,
            },
            margin: {
              top: COURSE_DOCUMENT_STYLE.page.word.marginTopTwips,
              bottom: COURSE_DOCUMENT_STYLE.page.word.marginBottomTwips,
              left: COURSE_DOCUMENT_STYLE.page.word.marginLeftTwips,
              right: COURSE_DOCUMENT_STYLE.page.word.marginRightTwips,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${info.courseCode || "course"}-course-specification.docx`;
  window.document.body.appendChild(anchor);
  anchor.click();
  window.document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
