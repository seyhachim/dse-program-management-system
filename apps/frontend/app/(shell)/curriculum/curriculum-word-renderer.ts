import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { CurriculumArtifactCourse, CurriculumArtifactView } from "@dse-pms/shared-types";

// `docx` swaps width/height when landscape orientation is set. Supplying the
// portrait Letter dimensions below produces the correct OOXML landscape size:
// 15840 x 12240 twips. Keep the usable table width based on the final landscape
// width so LibreOffice/Word do not clip the Semester II half.
const DOCX_PAGE_WIDTH = 12240;
const DOCX_PAGE_HEIGHT = 15840;
const LANDSCAPE_PAGE_WIDTH = 15840;
const LEFT_RIGHT_MARGIN = 432; // 0.3in — matches the supplied wide landscape table
const TOP_MARGIN = 576; // 0.4in
const BOTTOM_MARGIN = 432; // 0.3in
const CONTENT_WIDTH = LANDSCAPE_PAGE_WIDTH - LEFT_RIGHT_MARGIN * 2;
const FONT = "Times New Roman";
const BODY = 18;
const SMALL = 16;
const LECTURER = 16;
const HEADER_SHADE = "FFFFFF";
const YEAR_SHADE = "FFFFFF";

type CurriculumSemester = "First" | "Second";
type CurriculumPathway = CurriculumArtifactView["pathways"][number];

const borders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
};

// One semester is one half-page. The source allocates most space to Course.
const widths = [900, 4200, 1120, 1268, 900, 4200, 1120, 1268];

function text(value: string, bold = false, size = BODY, color?: string) {
  return new TextRun({ text: value, bold, font: FONT, size, color });
}

function para(
  value: string,
  options: { bold?: boolean; size?: number; center?: boolean; after?: number; color?: string } = {},
) {
  return new Paragraph({
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: 0, after: options.after ?? 0, line: 190 },
    children: [text(value, options.bold ?? false, options.size ?? BODY, options.color)],
  });
}

function simpleCell(
  value: string,
  width: number,
  options: { bold?: boolean; center?: boolean; shade?: string; span?: number } = {},
) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: options.span,
    shading: options.shade ? { fill: options.shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 30, bottom: 30, left: 45, right: 45 },
    children: [
      para(value, {
        bold: options.bold,
        size: SMALL,
        center: options.center,
      }),
    ],
  });
}

function mergedCell(value: string, start: number, span: number, shade?: string) {
  const width = widths.slice(start, start + span).reduce((sum, current) => sum + current, 0);
  return simpleCell(value, width, { bold: true, center: true, shade, span });
}

function blankHalf() {
  return [
    simpleCell("", widths[0]!),
    simpleCell("", widths[1]!),
    simpleCell("", widths[2]!),
    simpleCell("", widths[3]!),
  ];
}

function pathwayLabelHalf(pathway: CurriculumPathway | null, offset: 0 | 4) {
  return pathway ? [mergedCell(pathway.name, offset, 4)] : blankHalf();
}

function headerHalf(offset: 0 | 4) {
  return [
    simpleCell("Code", widths[offset]!, { bold: true, center: true, shade: HEADER_SHADE }),
    simpleCell("Course", widths[offset + 1]!, { bold: true, center: true, shade: HEADER_SHADE }),
    simpleCell("Hour\n(Lecture–Lab–\nField visit) /\nweek", widths[offset + 2]!, {
      bold: true,
      center: true,
      shade: HEADER_SHADE,
    }),
    simpleCell("Credit\n(Lecture–\nLab–Field\nvisit)", widths[offset + 3]!, {
      bold: true,
      center: true,
      shade: HEADER_SHADE,
    }),
  ];
}

function courseCell(course: CurriculumArtifactCourse | null, width: number) {
  if (!course) return simpleCell("", width);
  const lecturerLines = course.lecturerText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 30, bottom: 30, left: 45, right: 45 },
    children: [
      para(course.title, { size: SMALL }),
      ...lecturerLines.map((line) => para(line, { size: LECTURER, color: "FF0000" })),
    ],
  });
}

function hourText(course: CurriculumArtifactCourse | null) {
  if (!course?.weeklyHours) return "";
  const value = course.weeklyHours;
  return `${value.total}(${value.lecture}-${value.lab}-${value.fieldVisit})`;
}

function creditText(course: CurriculumArtifactCourse | null) {
  if (!course) return "";
  const value = course.credits;
  const breakdownUnavailable =
    value.breakdownProvided === false ||
    (course.weeklyHours === null &&
      value.total > 0 &&
      value.lecture === 0 &&
      value.lab === 0 &&
      value.fieldVisit === 0);
  if (breakdownUnavailable) return `${value.total} Credits`;
  return `${value.total}(${value.lecture}-${value.lab}-${value.fieldVisit})`;
}

function courseHalf(course: CurriculumArtifactCourse | null, offset: 0 | 4) {
  return [
    simpleCell(course?.code ?? "", widths[offset]!, { center: true }),
    courseCell(course, widths[offset + 1]!),
    simpleCell(hourText(course), widths[offset + 2]!, { center: true }),
    simpleCell(creditText(course), widths[offset + 3]!, { center: true }),
  ];
}

function sortCourses(courses: CurriculumArtifactCourse[]) {
  return courses.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

function scopeCourses(
  artifact: CurriculumArtifactView,
  yearLevel: number,
  semester: CurriculumSemester,
  pathwayCode: string | null,
) {
  return sortCourses(
    artifact.courses.filter(
      (course) =>
        course.yearLevel === yearLevel &&
        course.semester === semester &&
        course.pathwayCode === pathwayCode,
    ),
  );
}

function pathwaysForLocation(
  artifact: CurriculumArtifactView,
  yearLevel: number,
  semester: CurriculumSemester,
) {
  return artifact.pathways
    .filter((pathway) => pathway.yearLevel === yearLevel && pathway.semester === semester)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

function selectedPathway(
  artifact: CurriculumArtifactView,
  pathways: CurriculumPathway[],
): CurriculumPathway | null {
  return (
    pathways.find((pathway) => pathway.code === artifact.curriculum.defaultPathwayCode) ??
    pathways.find((pathway) => pathway.isDefault) ??
    pathways[0] ??
    null
  );
}

function selectedRouteCourses(
  artifact: CurriculumArtifactView,
  yearLevel: number,
  semester: CurriculumSemester,
  pathway: CurriculumPathway | null,
) {
  const common = scopeCourses(artifact, yearLevel, semester, null);
  if (!pathway) return common;
  return sortCourses([
    ...common,
    ...scopeCourses(artifact, yearLevel, semester, pathway.code),
  ]);
}

function scopeTotals(courses: CurriculumArtifactCourse[]) {
  return {
    hours: courses.reduce((sum, course) => sum + (course.weeklyHours?.total ?? 0), 0),
    hasHours: courses.some((course) => course.weeklyHours !== null),
    credits: courses.reduce((sum, course) => sum + course.credits.total, 0),
  };
}

function declaredSemesterCredits(
  artifact: CurriculumArtifactView,
  yearLevel: number,
  semester: CurriculumSemester,
  fallback: number,
) {
  return (
    artifact.declaredTotals?.semesterCredits.find(
      (total) => total.yearLevel === yearLevel && total.semester === semester,
    )?.credits ?? fallback
  );
}

function appendAlternativePathwayRows(
  rows: TableRow[],
  artifact: CurriculumArtifactView,
  yearLevel: number,
  semester: CurriculumSemester,
  pathways: CurriculumPathway[],
  selected: CurriculumPathway | null,
  offset: 0 | 4,
) {
  for (const pathway of pathways.filter((item) => item.code !== selected?.code)) {
    const courses = scopeCourses(artifact, yearLevel, semester, pathway.code);
    if (courses.length === 0) continue;

    rows.push(
      new TableRow({
        children:
          offset === 0
            ? [mergedCell(pathway.name, 0, 4), ...blankHalf()]
            : [...blankHalf(), mergedCell(pathway.name, 4, 4)],
      }),
    );
    if (courses.length > 1 || courses.some((course) => course.weeklyHours !== null)) {
      rows.push(
        new TableRow({
          children:
            offset === 0
              ? [...headerHalf(0), ...blankHalf()]
              : [...blankHalf(), ...headerHalf(4)],
        }),
      );
    }
    for (const course of courses) {
      rows.push(
        new TableRow({
          cantSplit: true,
          children:
            offset === 0
              ? [...courseHalf(course, 0), ...blankHalf()]
              : [...blankHalf(), ...courseHalf(course, 4)],
        }),
      );
    }
  }
}

function yearTable(artifact: CurriculumArtifactView, yearLevel: number) {
  const firstPathways = pathwaysForLocation(artifact, yearLevel, "First");
  const secondPathways = pathwaysForLocation(artifact, yearLevel, "Second");
  const firstSelected = selectedPathway(artifact, firstPathways);
  const secondSelected = selectedPathway(artifact, secondPathways);
  const first = selectedRouteCourses(artifact, yearLevel, "First", firstSelected);
  const second = selectedRouteCourses(artifact, yearLevel, "Second", secondSelected);

  const rows: TableRow[] = [
    new TableRow({
      children: [
        mergedCell(`Year ${["I", "II", "III", "IV"][yearLevel - 1]}`, 0, 8, YEAR_SHADE),
      ],
    }),
    new TableRow({ children: [mergedCell("Semester I", 0, 4), mergedCell("Semester II", 4, 4)] }),
  ];

  if (firstSelected || secondSelected) {
    rows.push(
      new TableRow({
        children: [
          ...pathwayLabelHalf(firstSelected, 0),
          ...pathwayLabelHalf(secondSelected, 4),
        ],
      }),
    );
  }

  rows.push(new TableRow({ children: [...headerHalf(0), ...headerHalf(4)] }));

  const length = Math.max(first.length, second.length);
  for (let index = 0; index < length; index += 1) {
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          ...courseHalf(first[index] ?? null, 0),
          ...courseHalf(second[index] ?? null, 4),
        ],
      }),
    );
  }

  const firstTotals = scopeTotals(first);
  const secondTotals = scopeTotals(second);
  const firstCredits = declaredSemesterCredits(artifact, yearLevel, "First", firstTotals.credits);
  const secondCredits = declaredSemesterCredits(artifact, yearLevel, "Second", secondTotals.credits);
  rows.push(
    new TableRow({
      children: [
        simpleCell("", widths[0]!),
        simpleCell("", widths[1]!),
        simpleCell(firstTotals.hasHours ? `${firstTotals.hours} Hours` : "", widths[2]!, {
          bold: true,
          center: true,
        }),
        simpleCell(`${firstCredits} Credits`, widths[3]!, { bold: true, center: true }),
        simpleCell("", widths[4]!),
        simpleCell("", widths[5]!),
        simpleCell(secondTotals.hasHours ? `${secondTotals.hours} Hours` : "", widths[6]!, {
          bold: true,
          center: true,
        }),
        simpleCell(`${secondCredits} Credits`, widths[7]!, { bold: true, center: true }),
      ],
    }),
  );

  appendAlternativePathwayRows(
    rows,
    artifact,
    yearLevel,
    "First",
    firstPathways,
    firstSelected,
    0,
  );
  appendAlternativePathwayRows(
    rows,
    artifact,
    yearLevel,
    "Second",
    secondPathways,
    secondSelected,
    4,
  );

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders,
    rows,
  });
}

function sourcePageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

export function buildCurriculumWordDocument(artifact: CurriculumArtifactView) {
  const children: (Paragraph | Table)[] = [
    para("ROYAL UNIVERSITY OF PHNOM PENH", { bold: true, center: true, size: 24, after: 25 }),
    para("Faculty of Engineering", { bold: false, center: true, size: 22, after: 25 }),
    para(`Curriculum of ${artifact.curriculum.name}`, {
      center: true,
      size: 21,
      after: 120,
    }),
    yearTable(artifact, 1),
    sourcePageBreak(),
    yearTable(artifact, 2),
    para("", { after: 60 }),
    yearTable(artifact, 3),
    sourcePageBreak(),
    yearTable(artifact, 4),
    para("", { after: 60 }),
    para(
      `Total: ${artifact.totals.selectedRouteCourseCount} Courses, ${artifact.totals.selectedRouteCredits} Credits`,
      { bold: true, size: BODY, center: true },
    ),
  ];

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: DOCX_PAGE_WIDTH,
              height: DOCX_PAGE_HEIGHT,
              orientation: "landscape",
            },
            margin: {
              top: TOP_MARGIN,
              bottom: BOTTOM_MARGIN,
              left: LEFT_RIGHT_MARGIN,
              right: LEFT_RIGHT_MARGIN,
            },
          },
        },
        children,
      },
    ],
  });
}

export async function exportCurriculumWord(artifact: CurriculumArtifactView) {
  const blob = await Packer.toBlob(buildCurriculumWordDocument(artifact));
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  const year = artifact.curriculum.academicYear || "curriculum";
  anchor.download = `DSE-Curriculum-${year}-v${artifact.curriculum.version}.docx`;
  window.document.body.appendChild(anchor);
  anchor.click();
  window.document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
