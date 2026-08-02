import {
  AlignmentType,
  BorderStyle,
  Document,
  PageBreak,
  PageOrientation,
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

import {
  COURSE_DOCUMENT_STYLE,
  type CourseDocumentModel,
} from "./course-document-model";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const FONT_FAMILY = COURSE_DOCUMENT_STYLE.fontFamily || "Arial";

const LABEL_BACKGROUND = COURSE_DOCUMENT_STYLE.labelBackground.replace("#", "");

const BORDER_COLOR = COURSE_DOCUMENT_STYLE.borderColor.replace("#", "");

/**
 * docx font sizes are half-points.
 *
 * 18 = 9pt
 * 20 = 10pt
 * 22 = 11pt
 * 24 = 12pt
 * 28 = 14pt
 */
const BODY_FONT_SIZE = 18;
const HEADING_FONT_SIZE = 24;
const PART_TITLE_FONT_SIZE = 28;

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                            */
/* -------------------------------------------------------------------------- */

function displayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "—";
  }

  return String(value);
}

function joinValues(values: string[]): string {
  if (!values.length) {
    return "—";
  }

  return values.join(", ");
}

function percentValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "—";
  }

  const text = String(value).trim();

  return text.endsWith("%") ? text : `${text}%`;
}

/* -------------------------------------------------------------------------- */
/* Borders                                                                    */
/* -------------------------------------------------------------------------- */

const TABLE_BORDERS = {
  top: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: BORDER_COLOR,
  },

  bottom: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: BORDER_COLOR,
  },

  left: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: BORDER_COLOR,
  },

  right: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: BORDER_COLOR,
  },

  insideHorizontal: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: BORDER_COLOR,
  },

  insideVertical: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: BORDER_COLOR,
  },
};

/* -------------------------------------------------------------------------- */
/* Paragraph helpers                                                          */
/* -------------------------------------------------------------------------- */

function bodyParagraph(
  text: string,
  options?: {
    bold?: boolean;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  },
) {
  return new Paragraph({
    alignment: options?.alignment ?? AlignmentType.LEFT,

    spacing: {
      before: 0,
      after: 0,
      line: 240,
    },

    children: [
      new TextRun({
        text,
        bold: options?.bold,
        font: FONT_FAMILY,
        size: BODY_FONT_SIZE,
      }),
    ],
  });
}

function sectionHeading(number: string, title: string) {
  return new Paragraph({
    spacing: {
      before: 260,
      after: 140,
    },

    children: [
      new TextRun({
        text: `${number}. ${title}`,
        bold: true,
        font: FONT_FAMILY,
        size: HEADING_FONT_SIZE,
      }),
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Course Information cells                                                   */
/* -------------------------------------------------------------------------- */

function labelCell(
  number: string,
  label: string,
  options?: {
    columnSpan?: number;
  },
) {
  return new TableCell({
    columnSpan: options?.columnSpan,

    shading: {
      fill: LABEL_BACKGROUND,
    },

    verticalAlign: VerticalAlign.CENTER,

    margins: {
      top: 80,
      bottom: 80,
      left: 100,
      right: 100,
    },

    children: [
      new Paragraph({
        spacing: {
          before: 0,
          after: 0,
        },

        children: [
          new TextRun({
            text: `${number}.   `,
            font: FONT_FAMILY,
            size: BODY_FONT_SIZE,
          }),

          new TextRun({
            text: label,
            bold: true,
            font: FONT_FAMILY,
            size: BODY_FONT_SIZE,
          }),
        ],
      }),
    ],
  });
}

function plainLabelCell(label: string) {
  return new TableCell({
    shading: {
      fill: LABEL_BACKGROUND,
    },

    verticalAlign: VerticalAlign.CENTER,

    margins: {
      top: 80,
      bottom: 80,
      left: 100,
      right: 100,
    },

    children: [
      bodyParagraph(label, {
        bold: true,
      }),
    ],
  });
}

function valueCell(
  value: unknown,
  options?: {
    columnSpan?: number;
  },
) {
  const text =
    value === null || value === undefined || String(value).trim() === ""
      ? "—"
      : String(value);

  return new TableCell({
    columnSpan: options?.columnSpan,

    verticalAlign: VerticalAlign.CENTER,

    margins: {
      top: 80,
      bottom: 80,
      left: 100,
      right: 100,
    },

    children: [bodyParagraph(text)],
  });
}

/* -------------------------------------------------------------------------- */
/* Standard document table cells                                              */
/* -------------------------------------------------------------------------- */

function headerCell(value: string, width?: number) {
  return new TableCell({
    width:
      width !== undefined
        ? {
            size: width,
            type: WidthType.PERCENTAGE,
          }
        : undefined,

    shading: {
      fill: "F8FAFC",
    },

    verticalAlign: VerticalAlign.CENTER,

    margins: {
      top: 80,
      bottom: 80,
      left: 80,
      right: 80,
    },

    children: [
      bodyParagraph(value, {
        bold: true,
      }),
    ],
  });
}

function tableValueCell(value: unknown, width?: number) {
  return new TableCell({
    width:
      width !== undefined
        ? {
            size: width,
            type: WidthType.PERCENTAGE,
          }
        : undefined,

    verticalAlign: VerticalAlign.TOP,

    margins: {
      top: 70,
      bottom: 70,
      left: 80,
      right: 80,
    },

    children: [
      bodyParagraph(
        value === null || value === undefined || String(value).trim() === ""
          ? "—"
          : String(value),
      ),
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Checkbox helpers                                                           */
/* -------------------------------------------------------------------------- */

function checkbox(checked: boolean): string {
  return checked ? "☑" : "☐";
}

function courseTypeText(value: string): string {
  const normalized = value.trim().toLowerCase();

  const selected = (...values: string[]) =>
    values.some((candidate) => normalized === candidate.toLowerCase());

  return [
    `Basic ${checkbox(selected("Basic"))}`,

    `Core ${checkbox(selected("Core"))}`,

    `Elective ${checkbox(selected("Elective"))}`,

    `Specialization ${checkbox(selected("Specialization", "Specialisation"))}`,
  ].join("        ");
}

function semesterText(semester: string): string {
  const normalized = semester.trim().toLowerCase();

  const first = normalized.includes("1") || normalized.includes("first");

  const second = normalized.includes("2") || normalized.includes("second");

  return [
    `1st Semester ${checkbox(first)}`,
    `2nd Semester ${checkbox(second)}`,
  ].join("        ");
}

/* -------------------------------------------------------------------------- */
/* Course Information table                                                   */
/* -------------------------------------------------------------------------- */

function buildCourseInformationTable(document: CourseDocumentModel) {
  const info = document.courseInformation;

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },

    layout: TableLayoutType.FIXED,

    borders: TABLE_BORDERS,

    rows: [
      /* ------------------------------------------------------------------ */
      /* 1. Programme Title                                                 */
      /* ------------------------------------------------------------------ */

      new TableRow({
        children: [
          labelCell("1", "Programme Title"),

          valueCell(info.programmeTitle, {
            columnSpan: 3,
          }),
        ],
      }),

      /* ------------------------------------------------------------------ */
      /* 2. Course Title                                                    */
      /* ------------------------------------------------------------------ */

      new TableRow({
        children: [
          labelCell("2", "Course Title"),

          valueCell(info.courseTitle, {
            columnSpan: 3,
          }),
        ],
      }),

      /* ------------------------------------------------------------------ */
      /* 3 + 4                                                              */
      /* ------------------------------------------------------------------ */

      new TableRow({
        children: [
          labelCell("3", "Course Code"),

          valueCell(info.courseCode),

          labelCell("4", "No. of Credits"),

          valueCell(info.credits),
        ],
      }),

      /* ------------------------------------------------------------------ */
      /* 5                                                                  */
      /* ------------------------------------------------------------------ */

      new TableRow({
        children: [
          labelCell("5", "Pre-requisites (If any)"),

          valueCell(info.prerequisites, {
            columnSpan: 3,
          }),
        ],
      }),

      /* ------------------------------------------------------------------ */
      /* 6 + 7                                                              */
      /* ------------------------------------------------------------------ */

      new TableRow({
        children: [
          labelCell("6", "Course Instructor"),

          valueCell(info.instructor),

          labelCell("7", "Qualification"),

          valueCell(info.qualification),
        ],
      }),

      /* ------------------------------------------------------------------ */
      /* 8 + 9                                                              */
      /* ------------------------------------------------------------------ */

      new TableRow({
        children: [
          labelCell("8", "Email"),

          valueCell(info.email),

          labelCell("9", "Telephone No."),

          valueCell(info.telephone),
        ],
      }),

      /* ------------------------------------------------------------------ */
      /* 10                                                                 */
      /* ------------------------------------------------------------------ */

      new TableRow({
        children: [
          labelCell("10", "Other Course Lecturer(s) (If any)"),

          valueCell(info.otherLecturers, {
            columnSpan: 3,
          }),
        ],
      }),

      /* ------------------------------------------------------------------ */
      /* 11                                                                 */
      /* ------------------------------------------------------------------ */

      new TableRow({
        children: [
          labelCell("11", "Course Type"),

          valueCell(courseTypeText(info.courseType), {
            columnSpan: 3,
          }),
        ],
      }),

      /* ------------------------------------------------------------------ */
      /* 12                                                                 */
      /* ------------------------------------------------------------------ */

      new TableRow({
        children: [
          labelCell("12", "Course Availability"),

          valueCell(semesterText(info.semester)),

          plainLabelCell("Year"),

          valueCell(info.programmeYear),
        ],
      }),

      /* ------------------------------------------------------------------ */
      /* 13                                                                 */
      /* ------------------------------------------------------------------ */

      new TableRow({
        children: [
          labelCell("13", "Course Description / Synopsis"),

          valueCell(info.description, {
            columnSpan: 3,
          }),
        ],
      }),
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* CLO table                                                                  */
/* -------------------------------------------------------------------------- */

function buildCloTable(document: CourseDocumentModel) {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },

    layout: TableLayoutType.FIXED,

    borders: TABLE_BORDERS,

    rows: [
      new TableRow({
        children: [
          headerCell("CLO", 10),

          headerCell("Learning Outcome", 78),

          headerCell("Level", 12),
        ],
      }),

      ...document.clos.map(
        (clo) =>
          new TableRow({
            children: [
              tableValueCell(displayValue(clo.code), 10),

              tableValueCell(displayValue(clo.outcome), 78),

              tableValueCell(displayValue(clo.level), 12),
            ],
          }),
      ),
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Weekly Teaching Plan                                                       */
/* -------------------------------------------------------------------------- */

function buildWeeklyPlanTable(document: CourseDocumentModel) {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },

    layout: TableLayoutType.FIXED,

    borders: TABLE_BORDERS,

    rows: [
      new TableRow({
        children: [
          headerCell("Week", 8),

          headerCell("Topic", 62),

          headerCell("CLO", 18),

          headerCell("SLT", 12),
        ],
      }),

      ...document.weeklyPlan.map(
        (week) =>
          new TableRow({
            children: [
              tableValueCell(displayValue(week.week), 8),

              tableValueCell(displayValue(week.topic), 62),

              tableValueCell(joinValues(week.cloCodes), 18),

              tableValueCell(week.sltHours ? `${week.sltHours} h` : "—", 12),
            ],
          }),
      ),
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Assessment table                                                           */
/* -------------------------------------------------------------------------- */

function buildAssessmentTable(document: CourseDocumentModel) {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },

    layout: TableLayoutType.FIXED,

    borders: TABLE_BORDERS,

    rows: [
      new TableRow({
        children: [
          headerCell("Assessment", 45),

          headerCell("Type", 20),

          headerCell("CLO", 20),

          headerCell("Weight", 15),
        ],
      }),

      ...document.assessments.map(
        (assessment) =>
          new TableRow({
            children: [
              tableValueCell(displayValue(assessment.name), 45),

              tableValueCell(displayValue(assessment.type), 20),

              tableValueCell(joinValues(assessment.cloCodes), 20),

              tableValueCell(percentValue(assessment.weight), 15),
            ],
          }),
      ),
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

function emptyParagraph(message: string) {
  return new Paragraph({
    spacing: {
      after: 120,
    },

    children: [
      new TextRun({
        text: message,
        italics: true,
        font: FONT_FAMILY,
        size: BODY_FONT_SIZE,
        color: "666666",
      }),
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

export async function exportCourseSpecWord(document: CourseDocumentModel) {
  const info = document.courseInformation;

  const children = [
    /* -------------------------------------------------------------------- */
    /* PAGE 1                                                               */
    /* -------------------------------------------------------------------- */

    new Paragraph({
      spacing: {
        after: 160,
      },

      children: [
        new TextRun({
          text: document.partTitle || "PART 2: COURSE DETAILS",

          bold: true,
          font: FONT_FAMILY,
          size: PART_TITLE_FONT_SIZE,
          smallCaps: true,
        }),
      ],
    }),

    new Paragraph({
      spacing: {
        after: 180,
      },

      children: [
        new TextRun({
          text: "Course Information",
          bold: true,
          font: FONT_FAMILY,
          size: BODY_FONT_SIZE,
        }),
      ],
    }),

    buildCourseInformationTable(document),

    /* -------------------------------------------------------------------- */
    /* PAGE 2                                                               */
    /* -------------------------------------------------------------------- */

    new Paragraph({
      children: [new PageBreak()],
    }),

    sectionHeading("2", "Course Learning Outcomes"),

    ...(document.clos.length > 0
      ? [buildCloTable(document)]
      : [emptyParagraph("No Course Learning Outcomes have been added.")]),

    /* -------------------------------------------------------------------- */
    /* Weekly Teaching Plan                                                 */
    /* -------------------------------------------------------------------- */

    sectionHeading("3", "Weekly Teaching Plan"),

    ...(document.weeklyPlan.length > 0
      ? [buildWeeklyPlanTable(document)]
      : [emptyParagraph("No weekly teaching plan has been added.")]),

    /* -------------------------------------------------------------------- */
    /* Assessment                                                           */
    /* -------------------------------------------------------------------- */

    sectionHeading("4", "Assessment"),

    ...(document.assessments.length > 0
      ? [buildAssessmentTable(document)]
      : [emptyParagraph("No assessments have been added.")]),
  ];

  const wordDocument = new Document({
    creator: "DSE Program Management System",

    title: `${info.courseCode} ${info.courseTitle} Course Specification`.trim(),

    description:
      "Course Specification generated by the DSE Program Management System.",

    styles: {
      default: {
        document: {
          run: {
            font: FONT_FAMILY,
            size: BODY_FONT_SIZE,
          },

          paragraph: {
            spacing: {
              after: 0,
            },
          },
        },
      },
    },

    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
            },

            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },

        children,
      },
    ],
  });

  const blob = await Packer.toBlob(wordDocument);

  const filename = `${info.courseCode || "course"}-course-specification.docx`
    .replace(/\s+/g, "-")
    .toLowerCase();

  const url = URL.createObjectURL(blob);

  const anchor = window.document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  window.document.body.appendChild(anchor);

  anchor.click();

  window.document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}
