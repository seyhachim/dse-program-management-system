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

const FONT = COURSE_DOCUMENT_STYLE.fontFamily;
const BODY = COURSE_DOCUMENT_STYLE.fontSize.body * 2;
const SMALL = COURSE_DOCUMENT_STYLE.fontSize.small * 2;
const HEADING = COURSE_DOCUMENT_STYLE.fontSize.heading * 2;
const BORDER = COURSE_DOCUMENT_STYLE.borderColor.replace("#", "");
const LABEL = COURSE_DOCUMENT_STYLE.labelBackground.replace("#", "");
const TABLE_HEADER = COURSE_DOCUMENT_STYLE.colors.tableHeaderBackground.replace("#", "");

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
    spacing: { before: 80, after: 80 },
    children: [text(`${number}. ${title}`, true, HEADING)],
  });
}

function cell(
  value: string,
  options?: { bold?: boolean; shade?: string; width?: number },
) {
  return new TableCell({
    width: options?.width
      ? { size: options.width, type: WidthType.PERCENTAGE }
      : undefined,
    shading: options?.shade ? { fill: options.shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: {
      top: 55,
      bottom: 55,
      left: 70,
      right: 70,
    },
    children: [paragraph(value || "—", options?.bold ?? false, SMALL)],
  });
}

function headerCell(value: string) {
  return cell(value, { bold: true, shade: TABLE_HEADER });
}

function table(rows: TableRow[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders,
    rows,
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

function programmeProfileCell(
  title: string,
  children: Paragraph[],
  columnSpan?: number,
) {
  return new TableCell({
    columnSpan,
    verticalAlign: VerticalAlign.TOP,
    margins: {
      top: 45,
      bottom: 45,
      left: 70,
      right: 70,
    },
    children: [
      compactParagraph(title, true, 20),
      ...children,
    ],
  });
}

async function programmeProfileHeader(document: CourseDocumentModel) {
  const response = await fetch("/rupp-logo.png");
  if (!response.ok)
    throw new Error("Could not load the RUPP logo for Word export");
  const logo = new Uint8Array(await response.arrayBuffer());

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 16, type: WidthType.PERCENTAGE },
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
            width: { size: 68, type: WidthType.PERCENTAGE },
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
            width: { size: 16, type: WidthType.PERCENTAGE },
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

  return table([
    row(
      programmeProfileCell("PROGRAM VISION:", [
        compactParagraph(profile.vision || "—", false, 18),
      ], 34),
      programmeProfileCell("PROGRAM MISSION", mission, 66),
    ),
    row(
      programmeProfileCell("PROGRAM GOALS", [
        compactParagraph("Our program aims to:", false, 18),
        ...goals,
      ], 34),
      programmeProfileCell("PROGRAM EDUCATIONAL PHILOSOPHY", philosophy, 66),
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
  ]);
}

function courseInformationTable(
  info: CourseDocumentModel["courseInformation"],
) {
  const row = (...cells: TableCell[]) => new TableRow({ children: cells });
  return table([
    row(
      cell("1. Programme Title", { bold: true, shade: LABEL }),
      cell(info.programmeTitle),
    ),
    row(
      cell("2. Course Title", { bold: true, shade: LABEL }),
      cell(info.courseTitle),
    ),
    row(
      cell("3. Course Code", { bold: true, shade: LABEL }),
      cell(info.courseCode),
      cell("4. No. of Credits", { bold: true, shade: LABEL }),
      cell(info.credits),
    ),
    row(
      cell("5. Pre-requisites (If any)", { bold: true, shade: LABEL }),
      cell(info.prerequisites),
    ),
    row(
      cell("6. Course Instructor", { bold: true, shade: LABEL }),
      cell(info.instructor),
      cell("7. Qualification", { bold: true, shade: LABEL }),
      cell(info.qualification),
    ),
    row(
      cell("8. Email", { bold: true, shade: LABEL }),
      cell(info.email),
      cell("9. Telephone No.", { bold: true, shade: LABEL }),
      cell(info.telephone),
    ),
    row(
      cell("10. Other Course Lecturer(s)", { bold: true, shade: LABEL }),
      cell(info.otherLecturers),
    ),
    row(
      cell("11. Course Type", { bold: true, shade: LABEL }),
      cell(info.courseType),
    ),
    row(
      cell("12. Course Availability", { bold: true, shade: LABEL }),
      cell(info.semester),
      cell("Year", { bold: true, shade: LABEL }),
      cell(info.programmeYear),
    ),
    row(
      cell("13. Course Description / Synopsis", { bold: true, shade: LABEL }),
      cell(info.description),
    ),
  ]);
}

function cloTable(document: CourseDocumentModel) {
  const rows = [
    new TableRow({
      children: [
        headerCell("CLO"),
        headerCell("Description"),
        headerCell("C/A/P"),
        headerCell("PLO"),
      ],
    }),
  ];
  for (const clo of document.clos) {
    rows.push(
      new TableRow({
        children: [
          cell(clo.code),
          cell(clo.outcome),
          cell(clo.level),
          cell(values(clo.mappedPlos)),
        ],
      }),
    );
  }
  return table(rows);
}

function mappingTable(document: CourseDocumentModel) {
  const rows = [
    new TableRow({
      children: [
        headerCell("CLO"),
        headerCell("PLO"),
        headerCell("C/A/P Level"),
        headerCell("Teaching Method"),
        headerCell("Assessment Methods"),
      ],
    }),
  ];
  for (const row of document.mapping) {
    rows.push(
      new TableRow({
        children: [
          cell(row.cloCode),
          cell(values(row.ploCodes)),
          cell(row.level),
          cell(values(row.teachingMethods)),
          cell(values(row.assessmentMethods)),
        ],
      }),
    );
  }
  return table(rows);
}

function cloPloMatrixTable(
  document: CourseDocumentModel,
  mode: "percent" | "hours",
) {
  const rows = [
    new TableRow({
      children: [
        headerCell("CLO"),
        ...PLOS.map((plo) => headerCell(plo.id)),
      ],
    }),
  ];
  for (const row of document.mapping) {
    rows.push(
      new TableRow({
        children: [
          cell(row.cloCode, { bold: true }),
          ...PLOS.map((plo) => {
            if (!row.ploCodes.includes(plo.id)) return cell("");
            if (mode === "percent") {
              return cell(
                row.focusCode && row.focusPercent != null
                  ? `${row.focusCode} (${row.focusPercent}%)`
                  : "—",
              );
            }
            return cell(row.sltHours || "—");
          }),
        ],
      }),
    );
  }
  return table(rows);
}

function sltTable(document: CourseDocumentModel) {
  const rows = [
    new TableRow({
      children: [
        headerCell("Week"),
        headerCell("Course Content / Topic"),
        headerCell("CLOs"),
        headerCell("L"),
        headerCell("T"),
        headerCell("P"),
        headerCell("O"),
        headerCell("Independent"),
        headerCell("Total SLT"),
      ],
    }),
  ];
  for (const week of document.weeklyPlan) {
    rows.push(
      new TableRow({
        children: [
          cell(week.week),
          cell(week.topic),
          cell(values(week.cloCodes)),
          cell(week.lectureHours),
          cell(week.tutorialHours),
          cell(week.practiceHours),
          cell(week.otherHours),
          cell(week.selfStudyHours),
          cell(week.sltHours ? `${week.sltHours} h` : "—"),
        ],
      }),
    );
  }
  rows.push(
    new TableRow({
      children: [
        cell("Total", { bold: true }),
        cell("Course Content SLT", { bold: true }),
        cell(""),
        cell(
          String(
            document.weeklyPlan.reduce(
              (s, w) => s + (Number(w.lectureHours) || 0),
              0,
            ),
          ),
          { bold: true },
        ),
        cell(
          String(
            document.weeklyPlan.reduce(
              (s, w) => s + (Number(w.tutorialHours) || 0),
              0,
            ),
          ),
          { bold: true },
        ),
        cell(
          String(
            document.weeklyPlan.reduce(
              (s, w) => s + (Number(w.practiceHours) || 0),
              0,
            ),
          ),
          { bold: true },
        ),
        cell(
          String(
            document.weeklyPlan.reduce(
              (s, w) => s + (Number(w.otherHours) || 0),
              0,
            ),
          ),
          { bold: true },
        ),
        cell(
          String(
            document.weeklyPlan.reduce(
              (s, w) => s + (Number(w.selfStudyHours) || 0),
              0,
            ),
          ),
          { bold: true },
        ),
        cell(`${document.totals.courseContentSlt} h`, { bold: true }),
      ],
    }),
  );
  return table(rows);
}

function rubricCell(assessment: CourseDocumentModel["assessments"][number]) {
  if (!assessment.rubricName) return cell("");
  if (!assessment.rubricUrl) return cell(assessment.rubricName);

  const href =
    typeof window !== "undefined"
      ? new URL(assessment.rubricUrl, window.location.origin).toString()
      : assessment.rubricUrl;

  return new TableCell({
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
  const rows = [
    new TableRow({
      children: [
        headerCell("CLOs"),
        headerCell("PLO"),
        headerCell("C/A/P Level"),
        headerCell("Assessment & Description"),
        headerCell("G/I"),
        headerCell("Weight (%)"),
        headerCell("Evaluation Definition"),
        headerCell("Rubric"),
      ],
    }),
  ];

  for (const assessment of document.assessments) {
    const assessmentDescription = assessment.description
      ? `${assessment.name}\n${assessment.description}`
      : assessment.name;

    rows.push(
      new TableRow({
        children: [
          cell(values(assessment.cloCodes)),
          cell(values(assessment.mappedPlos)),
          cell(values(assessment.capLevels)),
          cell(assessmentDescription),
          cell(assessment.mode === "group" ? "G" : "I"),
          cell(assessment.weight ? `${assessment.weight}%` : "—"),
          cell(assessment.evaluationDefinition),
          rubricCell(assessment),
        ],
      }),
    );
  }

  rows.push(
    new TableRow({
      children: [
        cell("Total", { bold: true }),
        cell(""),
        cell(""),
        cell(""),
        cell(""),
        cell(`${document.totals.assessmentWeight}%`, { bold: true }),
        cell(""),
        cell(""),
      ],
    }),
  );

  return table(rows);
}

function lessonPlanTable(weeks: CourseDocumentModel["weeklyPlan"]) {
  const rows = [
    new TableRow({
      children: [
        headerCell("Week"),
        headerCell("Hour (L/T/P/O)"),
        headerCell("Topic"),
        headerCell("CLO"),
        headerCell("Lesson Learning Outcomes"),
        headerCell("Teaching Method / Activity"),
        headerCell("Assessment"),
        headerCell("Resources"),
      ],
    }),
  ];
  for (const week of weeks) {
    rows.push(
      new TableRow({
        children: [
          cell(week.week),
          cell(
            [
              week.lectureHours,
              week.tutorialHours,
              week.practiceHours,
              week.otherHours,
            ]
              .map((h) => h || "0")
              .join("/"),
          ),
          cell(week.topic),
          cell(values(week.cloCodes)),
          cell(
            week.lloItems.length
              ? week.lloItems.map((v, i) => `LLO${i + 1}: ${v}`).join("\n")
              : "—",
          ),
          cell(
            values(
              week.teachingMethods.length
                ? week.teachingMethods
                : week.learningActivities,
            ),
          ),
          cell(
            values(
              [week.assessment, ...week.assessmentMethods].filter(Boolean),
            ),
          ),
          cell(values(week.resources)),
        ],
      }),
    );
  }
  return table(rows);
}

function resourcesTable(resources: CourseDocumentModel["resources"]) {
  const rows = [
    new TableRow({
      children: [
        headerCell("Resource Type"),
        headerCell("Resource Name / Description"),
        headerCell("Link"),
        headerCell("Notes"),
      ],
    }),
  ];
  for (const resource of resources) {
    rows.push(
      new TableRow({
        children: [
          cell(resource.resourceType),
          cell(resource.title),
          cell(resource.url),
          cell(resource.notes),
        ],
      }),
    );
  }
  return table(rows);
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
  const rows = [
    new TableRow({
      children: [
        headerCell("Letter Grade"),
        headerCell("Grade Point"),
        headerCell("Score"),
        headerCell("Explanation"),
      ],
    }),
  ];
  for (const grade of LETTER_GRADES) {
    rows.push(
      new TableRow({
        children: [
          cell(grade.grade),
          cell(grade.point),
          cell(grade.score),
          cell(grade.label),
        ],
      }),
    );
  }
  return table(rows);
}

export async function exportCourseSpecWord(document: CourseDocumentModel) {
  const children: (Paragraph | Table)[] = [];
  const info = document.courseInformation;

  // Page 1 is the fixed programme-profile cover layout. Content still comes
  // exclusively from the existing DSE PMS document model.
  children.push(await programmeProfileHeader(document));
  children.push(
    centered("PART 1: VISION, MISSION, GOALS, AND OBJECTIVES", true, 24),
  );
  children.push(await programmeProfileTable(document));

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(centered("Royal University of Phnom Penh", true));
  children.push(centered("Faculty of Engineering", false, SMALL));
  children.push(
    centered("Department of Information Technology Engineering", false, SMALL),
  );
  children.push(centered(info.programmeTitle, true, SMALL));
  children.push(centered("Course Specification", true, HEADING));
  children.push(paragraph(document.partTitle, true));
  children.push(paragraph("Course Information", true));
  children.push(courseInformationTable(info));

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionTitle("14", "Course Learning Outcomes"));
  children.push(cloTable(document));
  children.push(
    paragraph(
      "Learning-domain level values are taken directly from the current CLO records.",
      false,
      SMALL,
    ),
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    sectionTitle(
      "15",
      "Mapping of the Course Learning Outcomes to the Programme Learning Outcomes, Teaching Methods and Assessment Methods",
    ),
  );
  children.push(
    paragraph("Programme Learning Outcomes — Percentages", true, SMALL),
  );
  children.push(cloPloMatrixTable(document, "percent"));
  children.push(
    paragraph(
      "Fully (F) indicates a focus of more than 50% of the total SLT on this PLO, Moderate (M) indicates a focus of 31%–50% of the total SLT, and Partial (P) indicates a focus of less than 30% of the total SLT on the PLO.",
      false,
      SMALL,
    ),
  );
  children.push(
    paragraph(
      "Programme Learning Outcomes — Total Hours for Student Learning Time (SLT)",
      true,
      SMALL,
    ),
  );
  children.push(cloPloMatrixTable(document, "hours"));
  children.push(paragraph("1 Credit = 40 Student Learning Time (SLT)", false, SMALL));
  children.push(mappingTable(document));

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    sectionTitle("16", "Distribution of Student Learning Time (SLT)"),
  );
  children.push(sltTable(document));
  children.push(
    paragraph(
      "Assessment-specific SLT is not currently stored in the course assessment records and is therefore not inferred.",
      false,
      SMALL,
    ),
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionTitle("17", "Course Assessment Plan"));
  children.push(assessmentTable(document));
  children.push(
    paragraph(
      "Assessment SLT is omitted because the current assessment data model does not contain an assessment-SLT field.",
      false,
      SMALL,
    ),
  );

  const chunkSize = 7;
  for (let i = 0; i < document.weeklyPlan.length; i += chunkSize) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    const chunk = document.weeklyPlan.slice(i, i + chunkSize);
    children.push(
      sectionTitle(
        "18",
        `Course Outline / Detailed Lesson Plan — Weeks ${chunk[0]?.week ?? ""}–${chunk[chunk.length - 1]?.week ?? ""}`,
      ),
    );
    children.push(lessonPlanTable(chunk));
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    sectionTitle("19", "Required Resources to Deliver the Course"),
  );
  if (document.resources.length === 0) {
    children.push(
      paragraph("No required resources have been confirmed.", false, SMALL),
    );
  } else {
    children.push(resourcesTable(document.resources));
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionTitle("21", "Student Responsibility"));
  if (document.responsibilities.length === 0) {
    children.push(
      paragraph("No student responsibilities have been recorded.", false, SMALL),
    );
  } else {
    children.push(...bulletedList(document.responsibilities));
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionTitle("23", "Course Policy"));
  children.push(...policyParagraphs(document.policy));

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionTitle("24", "Rating Scale"));
  children.push(ratingScaleTable());

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
