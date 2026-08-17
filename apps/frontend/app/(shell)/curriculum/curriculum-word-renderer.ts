import {
  AlignmentType,
  BorderStyle,
  Document,
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
import type { CurriculumArtifactCourse, CurriculumArtifactView } from "@dse-pms/shared-types";

const PAGE_WIDTH = 15840; // 11in Letter landscape
const PAGE_HEIGHT = 12240; // 8.5in
const LEFT_RIGHT_MARGIN = 432; // 0.3in — matches the supplied wide landscape table
const TOP_MARGIN = 576; // 0.4in
const BOTTOM_MARGIN = 432; // 0.3in
const CONTENT_WIDTH = PAGE_WIDTH - LEFT_RIGHT_MARGIN * 2;
const FONT = "Times New Roman";
const BODY = 18;
const SMALL = 16;
const LECTURER = 16;
const HEADER_SHADE = "FFFFFF";
const YEAR_SHADE = "FFFFFF";

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
  semester: "First" | "Second",
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
  semester: "First" | "Second",
  fallback: number,
) {
  return (
    artifact.declaredTotals?.semesterCredits.find(
      (total) => total.yearLevel === yearLevel && total.semester === semester,
    )?.credits ?? fallback
  );
}

function declaredPathwayCredits(
  artifact: CurriculumArtifactView,
  pathwayCode: string | null | undefined,
  fallback: number,
) {
  if (!pathwayCode) return fallback;
  return (
    artifact.declaredTotals?.pathwayCredits.find(
      (total) => total.pathwayCode === pathwayCode,
    )?.credits ?? fallback
  );
}

function standardYearTable(artifact: CurriculumArtifactView, yearLevel: number) {
  const first = scopeCourses(artifact, yearLevel, "First", null);
  const second = scopeCourses(artifact, yearLevel, "Second", null);
  const rows: TableRow[] = [
    new TableRow({ children: [mergedCell(`Year ${["I", "II", "III", "IV"][yearLevel - 1]}`, 0, 8, YEAR_SHADE)] }),
    new TableRow({ children: [mergedCell("Semester I", 0, 4), mergedCell("Semester II", 4, 4)] }),
    new TableRow({ children: [...headerHalf(0), ...headerHalf(4)] }),
  ];
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
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders,
    rows,
  });
}

function yearFourTable(artifact: CurriculumArtifactView) {
  const first = scopeCourses(artifact, 4, "First", null);
  const pathways = artifact.pathways
    .filter((pathway) => pathway.yearLevel === 4 && pathway.semester === "Second")
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  const defaultPathway =
    pathways.find((pathway) => pathway.code === artifact.curriculum.defaultPathwayCode) ??
    pathways.find((pathway) => pathway.isDefault) ??
    pathways[0] ??
    null;
  const defaultCourses = defaultPathway
    ? scopeCourses(artifact, 4, "Second", defaultPathway.code)
    : scopeCourses(artifact, 4, "Second", null);

  const rows: TableRow[] = [
    new TableRow({ children: [mergedCell("Year IV", 0, 8, YEAR_SHADE)] }),
    new TableRow({ children: [mergedCell("Semester I", 0, 4), mergedCell("Semester II", 4, 4)] }),
    new TableRow({
      children: [
        ...blankHalf(),
        mergedCell(defaultPathway?.name ?? "Option 1", 4, 4),
      ],
    }),
    new TableRow({ children: [...headerHalf(0), ...headerHalf(4)] }),
  ];

  const paired = Math.max(first.length, defaultCourses.length);
  for (let index = 0; index < paired; index += 1) {
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          ...courseHalf(first[index] ?? null, 0),
          ...courseHalf(defaultCourses[index] ?? null, 4),
        ],
      }),
    );
  }
  const firstTotals = scopeTotals(first);
  const defaultTotals = scopeTotals(defaultCourses);
  const firstCredits = declaredSemesterCredits(artifact, 4, "First", firstTotals.credits);
  const defaultCredits = declaredPathwayCredits(
    artifact,
    defaultPathway?.code,
    defaultTotals.credits,
  );
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
        simpleCell(defaultTotals.hasHours ? `${defaultTotals.hours} Hours` : "", widths[6]!, {
          bold: true,
          center: true,
        }),
        simpleCell(`${defaultCredits} Credits`, widths[7]!, { bold: true, center: true }),
      ],
    }),
  );

  for (const pathway of pathways.filter((pathway) => pathway.code !== defaultPathway?.code)) {
    const courses = scopeCourses(artifact, 4, "Second", pathway.code);
    rows.push(
      new TableRow({
        children: [...blankHalf(), mergedCell(pathway.name, 4, 4)],
      }),
    );
    if (courses.length > 1 || courses.some((course) => course.weeklyHours !== null)) {
      rows.push(new TableRow({ children: [...blankHalf(), ...headerHalf(4)] }));
    }
    for (const course of courses) {
      rows.push(
        new TableRow({
          cantSplit: true,
          children: [...blankHalf(), ...courseHalf(course, 4)],
        }),
      );
    }
  }

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders,
    rows,
  });
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
    standardYearTable(artifact, 1),
    para("", { after: 60 }),
    standardYearTable(artifact, 2),
    para("", { after: 60 }),
    standardYearTable(artifact, 3),
    para("", { after: 60 }),
    yearFourTable(artifact),
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
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT, orientation: "landscape" },
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
