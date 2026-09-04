import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalMergeType,
  WidthType,
} from "docx";

import {
  DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
  PLOS,
  referenceKindLabel,
  type CourseSpecDocumentTheme,
} from "@dse-pms/shared-types";
import {
  COURSE_DOCUMENT_STYLE,
  type CourseDocumentModel,
} from "./course-document-model";
import { resolveCourseSpecWordTheme } from "./document-word-theme";
import {
  contiguousRowSpans,
  programmePloCountLabel,
  splitLeadingWord,
} from "./plo-preview-format";

let wordTheme = resolveCourseSpecWordTheme(DEFAULT_COURSE_SPEC_DOCUMENT_THEME);
let CONTENT_WIDTH_TWIPS = wordTheme.contentWidthTwips;
let FONT = wordTheme.fontFamily;
let BODY = wordTheme.bodyHalfPoints;
let SMALL = wordTheme.tableHalfPoints;
let HEADING = wordTheme.heading1HalfPoints;
let TABLE_CELL_PADDING = wordTheme.tableCellPaddingTwips;
let exportQueue: Promise<void> = Promise.resolve();

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
const noTopBorder = { top: { style: BorderStyle.NONE, size: 0, color: BORDER } };
const noBottomBorder = { bottom: { style: BorderStyle.NONE, size: 0, color: BORDER } };

function applyWordTheme(theme: CourseSpecDocumentTheme) {
  wordTheme = resolveCourseSpecWordTheme(theme);
  CONTENT_WIDTH_TWIPS = wordTheme.contentWidthTwips;
  FONT = wordTheme.fontFamily;
  BODY = wordTheme.bodyHalfPoints;
  SMALL = wordTheme.tableHalfPoints;
  HEADING = wordTheme.heading1HalfPoints;
  TABLE_CELL_PADDING = wordTheme.tableCellPaddingTwips;
}

function defaultAlignment() {
  if (wordTheme.defaultAlignment === "center") return AlignmentType.CENTER;
  if (wordTheme.defaultAlignment === "right") return AlignmentType.RIGHT;
  if (wordTheme.defaultAlignment === "justify") return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function tableCellMargins() {
  return {
    top: TABLE_CELL_PADDING,
    bottom: TABLE_CELL_PADDING,
    left: TABLE_CELL_PADDING,
    right: TABLE_CELL_PADDING,
  };
}

function text(value: string, bold = false, size = BODY) {
  return new TextRun({
    text: value,
    bold,
    font: FONT,
    size,
    characterSpacing: wordTheme.characterSpacingTwips,
  });
}

function paragraph(value: string, bold = false, size = BODY) {
  return new Paragraph({
    alignment: defaultAlignment(),
    spacing: {
      before: 0,
      after: wordTheme.paragraphAfterTwips,
      line: wordTheme.lineTwips,
    },
    children: [text(value, bold, size)],
  });
}

function centered(value: string, bold = false, size = BODY) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: {
      before: 0,
      after: wordTheme.paragraphAfterTwips,
      line: wordTheme.lineTwips,
    },
    children: [text(value, bold, size)],
  });
}

function sectionTitle(number: string, title: string) {
  return new Paragraph({
    spacing: { before: 30, after: 60, line: wordTheme.lineTwips },
    children: [text(`${number}. ${title}`, true, HEADING)],
  });
}

function colWidths(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((weight) => Math.floor((weight / total) * CONTENT_WIDTH_TWIPS));
  const distributed = widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1]! += CONTENT_WIDTH_TWIPS - distributed;
  return widths;
}

function cell(value: string, options?: { bold?: boolean; shade?: string; width?: number; columnSpan?: number }) {
  return new TableCell({
    width: options?.width ? { size: options.width, type: WidthType.DXA } : undefined,
    columnSpan: options?.columnSpan,
    shading: options?.shade ? { fill: options.shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: tableCellMargins(),
    children: [paragraph(value || "—", options?.bold ?? false, SMALL)],
  });
}

function courseInfoCell(value: string, options?: { bold?: boolean; shade?: string; width?: number; columnSpan?: number }) {
  return new TableCell({
    width: options?.width ? { size: options.width, type: WidthType.DXA } : undefined,
    columnSpan: options?.columnSpan,
    shading: options?.shade ? { fill: options.shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: tableCellMargins(),
    children: [new Paragraph({ alignment: defaultAlignment(), spacing: { before: 0, after: wordTheme.paragraphAfterTwips, line: wordTheme.lineTwips }, children: [text(value || "—", options?.bold ?? false, SMALL)] })],
  });
}

function headerCell(value: string, width?: number) { return cell(value, { bold: true, shade: TABLE_HEADER, width }); }
function table(rows: TableRow[], columnWidths?: number[]) {
  return new Table({ width: columnWidths ? { size: columnWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA } : { size: 100, type: WidthType.PERCENTAGE }, columnWidths, layout: TableLayoutType.FIXED, borders, rows });
}
function values(items: string[]) { return items.length ? items.join(", ") : "—"; }
function compactParagraph(value: string, bold = false, size = 18) { return new Paragraph({ spacing: { before: 0, after: 18, line: 220 }, children: [text(value, bold, size)] }); }

function programmeProfileCell(title: string, children: Paragraph[]) {
  return new TableCell({ verticalAlign: VerticalAlign.TOP, margins: { top: 45, bottom: 45, left: 70, right: 70 }, children: [compactParagraph(title, true, 20), ...children] });
}

async function programmeProfileHeader(document: CourseDocumentModel) {
  const response = await fetch("/rupp-logo.png");
  if (!response.ok) throw new Error("Could not load the RUPP logo for Word export");
  const logo = new Uint8Array(await response.arrayBuffer());
  const sideWidth = Math.round(CONTENT_WIDTH_TWIPS * 0.16);
  const centerWidth = CONTENT_WIDTH_TWIPS - sideWidth * 2;
  return new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, columnWidths: [sideWidth, centerWidth, sideWidth], layout: TableLayoutType.FIXED, borders: noBorders,
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: sideWidth, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new ImageRun({ data: logo, transformation: { width: COURSE_DOCUMENT_STYLE.logo.width, height: COURSE_DOCUMENT_STYLE.logo.height }, type: "png" })] })] }),
      new TableCell({ width: { size: centerWidth, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [centered("Royal University of Phnom Penh", true, 22), centered("Faculty of Engineering", true, 22), centered("Department of Information Technology Engineering", true, 22), centered(document.courseInformation.programmeTitle, true, 22), centered("Course Specification", true, 22)] }),
      new TableCell({ width: { size: sideWidth, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [new Paragraph({ children: [] })] }),
    ] })],
  });
}

async function programmeProfileTable(document: CourseDocumentModel) {
  const profile = document.programmeProfile;
  const row = (...cells: TableCell[]) => new TableRow({ children: cells });
  const mission = profile.mission.length ? profile.mission.map((item, index) => compactParagraph(`Mission ${index + 1}: ${item}`, false, 18)) : [compactParagraph("—", false, 18)];
  const goals = profile.goals.length ? profile.goals.map((item) => compactParagraph(`• ${item}`, false, 18)) : [compactParagraph("• —", false, 18)];
  const philosophy = profile.educationalPhilosophy.length ? profile.educationalPhilosophy.map((item) => compactParagraph(`• ${item.code}: ${item.title}: ${item.description}`, false, 17)) : [compactParagraph("• —", false, 17)];
  const peos = profile.peos.length ? profile.peos.map((item) => compactParagraph(`• ${item.code}: ${item.title}: ${item.description}`, false, 18)) : [compactParagraph("• —", false, 18)];
  const leftWidth = Math.round(CONTENT_WIDTH_TWIPS * 0.34);
  const rightWidth = CONTENT_WIDTH_TWIPS - leftWidth;
  return table([
    row(programmeProfileCell("PROGRAM VISION:", [compactParagraph(profile.vision || "—", false, 18)]), programmeProfileCell("PROGRAM MISSION", mission)),
    row(programmeProfileCell("PROGRAM GOALS", [compactParagraph("Our program aims to:", false, 18), ...goals]), programmeProfileCell("PROGRAM EDUCATIONAL PHILOSOPHY", philosophy)),
    row(new TableCell({ columnSpan: 2, verticalAlign: VerticalAlign.TOP, margins: { top: 45, bottom: 45, left: 70, right: 70 }, children: [compactParagraph("PROGRAM EDUCATIONAL OBJECTIVES (PEOs)", true, 20), compactParagraph("What graduates are expected to achieve within 3–5 years of graduation:", false, 18), ...peos] })),
    new TableRow({ cantSplit: true, children: [programmePloContinuationCell(document)] }),
  ], [leftWidth, rightWidth]);
}

function courseInformationTable(info: CourseDocumentModel["courseInformation"], continuationRows: TableRow[] = []) {
  const row = (...cells: TableCell[]) => new TableRow({ children: cells });
  const w = colWidths([28, 24, 16, 32]);
  const labelValueRow = (label: string, value: string) => row(courseInfoCell(label, { bold: true, shade: LABEL, width: w[0] }), courseInfoCell(value, { width: w[1]! + w[2]! + w[3]!, columnSpan: 3 }));
  const fourCellRow = (label1: string, value1: string, label2: string, value2: string) => row(courseInfoCell(label1, { bold: true, shade: LABEL, width: w[0] }), courseInfoCell(value1, { width: w[1] }), courseInfoCell(label2, { bold: true, shade: LABEL, width: w[2] }), courseInfoCell(value2, { width: w[3] }));
  return table([
    labelValueRow("1. Programme Title", info.programmeTitle), labelValueRow("2. Course Title", info.courseTitle), fourCellRow("3. Course Code", info.courseCode, "4. No. of Credits", info.credits), labelValueRow("5. Pre-requisites (If any)", info.prerequisites), fourCellRow("6. Course Instructor", info.instructor, "7. Qualification", info.qualification), fourCellRow("8. Email", info.email, "9. Telephone No.", info.telephone), labelValueRow("10. Other Course Lecturer(s)", info.otherLecturers), labelValueRow("11. Course Type", info.courseType), fourCellRow("12. Course Availability", info.semester, "Year", info.programmeYear), labelValueRow("13. Course Description / Synopsis", info.description), ...continuationRows,
  ], w);
}

function levelParts(level: string) { const normalized = level.trim().toUpperCase(); return { c: normalized.startsWith("C") ? normalized : "", a: normalized.startsWith("A") ? normalized : "", p: normalized.startsWith("P") ? normalized : "" }; }

function compactWordCell(value: string, width: number, alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = defaultAlignment(), bold = false, size = SMALL) {
  return new TableCell({ width: { size: width, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment, spacing: { before: 0, after: 0, line: wordTheme.lineTwips }, children: [text(value, bold, size)] })] });
}

function cloSection(document: CourseDocumentModel): (Paragraph | Table)[] {
  const bodyW = colWidths([7, 59, 8.3, 8.57, 8.57, 8.56]);
  const descriptionWidth = bodyW[0]! + bodyW[1]!;
  const domainWidth = bodyW[3]! + bodyW[4]! + bodyW[5]!;
  const mainRows: TableRow[] = [
    new TableRow({ cantSplit: true, children: [
      new TableCell({ columnSpan: 2, width: { size: descriptionWidth, type: WidthType.DXA }, shading: { fill: LABEL }, borders: noBottomBorder, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: wordTheme.lineTwips }, children: [text("Description of the course learning outcomes – CLOs. At the end of the course, students will be able to:", false, BODY)] })] }),
      new TableCell({ width: { size: bodyW[2]!, type: WidthType.DXA }, shading: { fill: LABEL }, borders: noBottomBorder, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [text("PLO", false, BODY)] })] }),
      new TableCell({ columnSpan: 3, width: { size: domainWidth, type: WidthType.DXA }, shading: { fill: LABEL }, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: wordTheme.lineTwips }, children: [text("Levels in Learning Domain:\nKnowledge (Cognitive-C), Attitude\n(Affective-A), Skills (Psychomotor-P)", false, BODY)] })] }),
    ] }),
    new TableRow({ cantSplit: true, children: [
      new TableCell({ columnSpan: 2, width: { size: descriptionWidth, type: WidthType.DXA }, shading: { fill: LABEL }, borders: noTopBorder, margins: tableCellMargins(), children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [] })] }),
      new TableCell({ width: { size: bodyW[2]!, type: WidthType.DXA }, shading: { fill: LABEL }, borders: noTopBorder, margins: tableCellMargins(), children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [] })] }),
      ...(["C", "A", "P"] as const).map((label, index) => new TableCell({ width: { size: bodyW[index + 3]!, type: WidthType.DXA }, shading: { fill: LABEL }, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [text(label, false, BODY)] })] })),
    ] }),
  ];
  if (document.clos.length) {
    for (const clo of document.clos) {
      const domain = levelParts(clo.level);
      mainRows.push(new TableRow({ cantSplit: true, children: [compactWordCell(clo.code, bodyW[0]!, AlignmentType.CENTER, false, BODY), compactWordCell(clo.outcome, bodyW[1]!, defaultAlignment(), false, BODY), compactWordCell(values(clo.mappedPlos), bodyW[2]!, AlignmentType.CENTER, false, BODY), compactWordCell(domain.c, bodyW[3]!, AlignmentType.CENTER, false, BODY), compactWordCell(domain.a, bodyW[4]!, AlignmentType.CENTER, false, BODY), compactWordCell(domain.p, bodyW[5]!, AlignmentType.CENTER, false, BODY)] }));
    }
  } else {
    mainRows.push(new TableRow({ children: [new TableCell({ columnSpan: 6, width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, margins: tableCellMargins(), children: [paragraph("No Course Learning Outcomes have been added.", false, SMALL)] })] }));
  }
  const mainTable = new Table({ width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, columnWidths: bodyW, layout: TableLayoutType.FIXED, borders, rows: mainRows });
  const taxonomyData: [string, [string, string, string][]][] = [
    ["Cognitive", [["1", "Remembering", "C1"], ["2", "Understanding", "C2"], ["3", "Applying", "C3"], ["4", "Analyzing", "C4"], ["5", "Evaluating", "C5"], ["6", "Creating", "C6"]]],
    ["Affective", [["1", "Receiving", "A1"], ["2", "Responding", "A2"], ["3", "Valuing", "A3"], ["4", "Organizing", "A4"], ["5", "Internationalizing", "A5"]]],
    ["Psychomotor", [["1", "Perception", "P1"], ["2", "Set", "P2"], ["3", "Guided Response", "P3"], ["4", "Mechanism", "P4"], ["5", "Complex over response", "P5"], ["6", "Adaptation", "P6"], ["7", "Origination", "P7"]]],
  ];
  const legendW = colWidths([1, 1, 1]);
  const legendCells = taxonomyData.map(([title, entries], domainIndex) => {
    const innerW = [Math.round(legendW[domainIndex]! * 0.12), Math.round(legendW[domainIndex]! * 0.75), 0];
    innerW[2] = legendW[domainIndex]! - innerW[0]! - innerW[1]!;
    const inner = new Table({ width: { size: legendW[domainIndex]!, type: WidthType.DXA }, columnWidths: innerW, layout: TableLayoutType.FIXED, borders, rows: entries.map(([number, label, code]) => new TableRow({ cantSplit: true, children: [compactWordCell(number, innerW[0]!, AlignmentType.CENTER), compactWordCell(label, innerW[1]!, defaultAlignment()), compactWordCell(code, innerW[2]!, AlignmentType.CENTER)] })) });
    return new TableCell({ width: { size: legendW[domainIndex]!, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP, margins: tableCellMargins(), children: [new Paragraph({ alignment: defaultAlignment(), spacing: { before: 0, after: wordTheme.paragraphAfterTwips }, children: [text(title, true, SMALL)] }), inner] });
  });
  const legendTable = new Table({ width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, columnWidths: legendW, layout: TableLayoutType.FIXED, borders, rows: [new TableRow({ cantSplit: true, children: legendCells })] });
  const title = new Paragraph({ keepNext: true, keepLines: true, spacing: { before: 30, after: wordTheme.paragraphAfterTwips, line: wordTheme.lineTwips }, children: [text("14. Course Learning Outcomes", true, HEADING)] });
  const subtitle = new Paragraph({ keepNext: true, keepLines: true, alignment: defaultAlignment(), spacing: { before: 0, after: wordTheme.paragraphAfterTwips, line: wordTheme.lineTwips }, children: [text("Here are the CLOs of this course:", false, BODY)] });
  const legendCaption = new Paragraph({ keepNext: true, alignment: defaultAlignment(), spacing: { before: 55, after: wordTheme.paragraphAfterTwips, line: wordTheme.lineTwips }, children: [text("* Levels in Learning Domain: Knowledge (Cognitive-C), Attitude (Affective-A), Skills (Psychomotor-P)", false, SMALL)] });
  return [title, subtitle, mainTable, legendCaption, legendTable];
}

function officialCloPloMatrixTable(document: CourseDocumentModel, mode: "percent" | "hours") {
  const w = colWidths([7, ...PLOS.map(() => 9.3)]);
  const ploWidth = w.slice(1).reduce((sum, width) => sum + width, 0);
  const matrixTitle = mode === "hours" ? "Programme Learning Outcomes – Total Hours for Student Learning Time (SLT) including learning and assessment" : "Programme Learning Outcomes – Percentages";
  const rows: TableRow[] = [
    new TableRow({ cantSplit: true, children: [new TableCell({ width: { size: w[0]!, type: WidthType.DXA }, shading: { fill: LABEL }, borders: noBottomBorder, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [text("CLO", false, SMALL)] })] }), new TableCell({ columnSpan: 10, width: { size: ploWidth, type: WidthType.DXA }, shading: { fill: LABEL }, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: wordTheme.lineTwips }, children: [text(matrixTitle, false, SMALL)] })] })] }),
    new TableRow({ cantSplit: true, children: [new TableCell({ width: { size: w[0]!, type: WidthType.DXA }, shading: { fill: LABEL }, borders: noTopBorder, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [] })] }), ...PLOS.map((plo, index) => new TableCell({ width: { size: w[index + 1]!, type: WidthType.DXA }, shading: { fill: LABEL }, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [text(plo.id === "PLO9" ? "PLO 9" : plo.id, false, SMALL)] })] }))] }),
  ];
  for (const row of document.mapping) rows.push(new TableRow({ cantSplit: true, children: [compactWordCell(row.cloCode, w[0]!, AlignmentType.CENTER), ...PLOS.map((plo, index) => { const width = w[index + 1]!; if (!row.ploCodes.includes(plo.id)) return compactWordCell("", width, AlignmentType.CENTER); const value = mode === "percent" ? row.focusCode && row.focusPercent != null ? `${row.focusCode} (${row.focusPercent}%)` : "" : row.sltHours || ""; return compactWordCell(value, width, AlignmentType.CENTER); })] }));
  return new Table({ width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, borders, rows });
}

function mappingDetailTable(document: CourseDocumentModel) {
  const w = colWidths([7, 10, 9, 37, 37]);
  const headers = ["CLO", "PLO", "C/A/P Level", "Teaching Method", "Assessment Methods"];
  const rows = [new TableRow({ cantSplit: true, children: headers.map((header, index) => headerCell(header, w[index])) })];
  for (const mapping of document.mapping) {
    rows.push(new TableRow({ cantSplit: true, children: [compactWordCell(mapping.cloCode, w[0]!, AlignmentType.CENTER), compactWordCell(mapping.ploCodes.join(", "), w[1]!, AlignmentType.CENTER), compactWordCell(mapping.level, w[2]!, AlignmentType.CENTER), compactWordCell(mapping.teachingMethods.join(" + "), w[3]!), compactWordCell(mapping.assessmentMethods.join(", "), w[4]!)] }));
  }
  return table(rows, w);
}

function cleanSltValue(value: string | number | null | undefined) { if (value == null || value === "") return ""; const numeric = Number(value); if (Number.isFinite(numeric) && numeric === 0) return ""; return String(value); }

function headerMergeCell(value: string, width: number, options?: { columnSpan?: number; top?: boolean; bottom?: boolean; bold?: boolean }) {
  const top = options?.top ?? true; const bottom = options?.bottom ?? true;
  return new TableCell({ width: { size: width, type: WidthType.DXA }, columnSpan: options?.columnSpan, shading: { fill: LABEL }, borders: top && bottom ? undefined : top ? noBottomBorder : bottom ? noTopBorder : { ...noTopBorder, ...noBottomBorder }, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: wordTheme.lineTwips }, children: value ? [text(value, options?.bold ?? false, SMALL)] : [] })] });
}

function topicSltCell(week: string, topic: string, width: number) { return new TableCell({ width: { size: width, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment: defaultAlignment(), spacing: { before: 0, after: 0, line: wordTheme.lineTwips }, children: [text(`Topic ${week}: `, true, SMALL), text(topic, false, SMALL)] })] }); }

function courseContentSltTable(document: CourseDocumentModel) {
  const w = colWidths([3, 38, 5, 4, 4, 4, 4, 4, 4, 4, 4, 11, 7]);
  const contentWidth = w[0]! + w[1]!; const activityWidth = w.slice(3, 12).reduce((sum, width) => sum + width, 0); const f2fWidth = w.slice(3, 11).reduce((sum, width) => sum + width, 0); const physicalWidth = w.slice(3, 7).reduce((sum, width) => sum + width, 0); const onlineWidth = w.slice(7, 11).reduce((sum, width) => sum + width, 0);
  const rows: TableRow[] = [
    new TableRow({ cantSplit: true, children: [headerMergeCell("Course Content Outline and subtopics", contentWidth, { columnSpan: 2, bottom: false }), headerMergeCell("CLOs", w[2]!, { bottom: false }), headerMergeCell("Learning and Teaching Activities", activityWidth, { columnSpan: 9 }), headerMergeCell("Total\nSLT", w[12]!, { bottom: false })] }),
    new TableRow({ cantSplit: true, children: [headerMergeCell("", contentWidth, { columnSpan: 2, top: false, bottom: false }), headerMergeCell("", w[2]!, { top: false, bottom: false }), headerMergeCell("Face to Face (F2F)", f2fWidth, { columnSpan: 8 }), headerMergeCell("NF2F\nIndependent Learning\n(Asynchronous)", w[11]!, { bottom: false }), headerMergeCell("", w[12]!, { top: false, bottom: false })] }),
    new TableRow({ cantSplit: true, children: [headerMergeCell("", contentWidth, { columnSpan: 2, top: false, bottom: false }), headerMergeCell("", w[2]!, { top: false, bottom: false }), headerMergeCell("Physical", physicalWidth, { columnSpan: 4 }), headerMergeCell("Online/Technology-mediated\n(Synchronous)", onlineWidth, { columnSpan: 4 }), headerMergeCell("", w[11]!, { top: false, bottom: false }), headerMergeCell("", w[12]!, { top: false, bottom: false })] }),
    new TableRow({ cantSplit: true, children: [headerMergeCell("", contentWidth, { columnSpan: 2, top: false }), headerMergeCell("", w[2]!, { top: false }), ...(["L", "T", "P", "O", "L", "T", "P", "O"] as const).map((label, index) => headerMergeCell(label, w[index + 3]!)), headerMergeCell("", w[11]!, { top: false }), headerMergeCell("", w[12]!, { top: false })] }),
  ];
  for (const week of document.weeklyPlan) rows.push(new TableRow({ cantSplit: true, children: [compactWordCell(week.week, w[0]!, AlignmentType.CENTER), topicSltCell(week.week, week.topic, w[1]!), compactWordCell(week.cloCodes.join(", "), w[2]!, AlignmentType.CENTER), compactWordCell(cleanSltValue(week.lectureHours), w[3]!, AlignmentType.CENTER), compactWordCell(cleanSltValue(week.tutorialHours), w[4]!, AlignmentType.CENTER), compactWordCell(cleanSltValue(week.practiceHours), w[5]!, AlignmentType.CENTER), compactWordCell(cleanSltValue(week.otherHours), w[6]!, AlignmentType.CENTER), compactWordCell("", w[7]!, AlignmentType.CENTER), compactWordCell("", w[8]!, AlignmentType.CENTER), compactWordCell("", w[9]!, AlignmentType.CENTER), compactWordCell("", w[10]!, AlignmentType.CENTER), compactWordCell(cleanSltValue(week.selfStudyHours), w[11]!, AlignmentType.CENTER), compactWordCell(cleanSltValue(week.sltHours), w[12]!, AlignmentType.CENTER)] }));
  const labelWidth = w.slice(0, 12).reduce((sum, width) => sum + width, 0);
  rows.push(new TableRow({ cantSplit: true, children: [new TableCell({ columnSpan: 12, width: { size: labelWidth, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [text("Total SLT for Course Content", true, SMALL)] })] }), compactWordCell(String(document.totals.courseContentSlt), w[12]!, AlignmentType.CENTER)] }));
  return new Table({ width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, borders, rows });
}

function assessmentSltTable(document: CourseDocumentModel, category: "continuous" | "final") {
  const w = colWidths([3, 38, 6, 16, 19, 13, 5]); const nameWidth = w[0]! + w[1]!; const f2fWidth = w[3]! + w[4]!; const label = category === "continuous" ? "Continuous Assessment" : "Final Assessment"; const assessments = document.assessments.filter((assessment) => assessment.assessmentCategory === category); const categoryTotal = category === "continuous" ? document.totals.continuousAssessmentSlt : document.totals.finalAssessmentSlt;
  const rows: TableRow[] = [new TableRow({ cantSplit: true, children: [headerMergeCell(label, nameWidth, { columnSpan: 2, bottom: false }), headerMergeCell("%", w[2]!, { bottom: false }), headerMergeCell("Face to Face (F2F)", f2fWidth, { columnSpan: 2 }), headerMergeCell("NF2F\nIndependent Learning\n(Asynchronous)", w[5]!, { bottom: false }), headerMergeCell("Total\nSLT", w[6]!, { bottom: false })] }), new TableRow({ cantSplit: true, children: [headerMergeCell("", nameWidth, { columnSpan: 2, top: false }), headerMergeCell("", w[2]!, { top: false }), headerMergeCell("Physical", w[3]!), headerMergeCell("Online/Technology-mediated\n(Synchronous)", w[4]!), headerMergeCell("", w[5]!, { top: false }), headerMergeCell("", w[6]!, { top: false })] })];
  assessments.forEach((assessment, index) => rows.push(new TableRow({ cantSplit: true, children: [compactWordCell(String(index + 1), w[0]!, AlignmentType.CENTER), compactWordCell(assessment.name, w[1]!), compactWordCell(cleanSltValue(assessment.weight), w[2]!, AlignmentType.CENTER), compactWordCell(cleanSltValue(assessment.physicalSltHours), w[3]!, AlignmentType.CENTER), compactWordCell(cleanSltValue(assessment.onlineSltHours), w[4]!, AlignmentType.CENTER), compactWordCell(cleanSltValue(assessment.independentSltHours), w[5]!, AlignmentType.CENTER), compactWordCell(cleanSltValue(assessment.totalSltHours), w[6]!, AlignmentType.CENTER)] })));
  const totalLabelWidth = w.slice(0, 6).reduce((sum, width) => sum + width, 0);
  rows.push(new TableRow({ cantSplit: true, children: [new TableCell({ columnSpan: 6, width: { size: totalLabelWidth, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [text(`Total SLT for ${label}`, true, SMALL)] })] }), compactWordCell(String(categoryTotal), w[6]!, AlignmentType.CENTER)] }));
  return new Table({ width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, borders, rows });
}

function grandTotalSltTable(document: CourseDocumentModel) {
  const w = colWidths([93, 7]);
  return new Table({ width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, borders, rows: [new TableRow({ cantSplit: true, children: [new TableCell({ width: { size: w[0]!, type: WidthType.DXA }, margins: tableCellMargins(), children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [text("Grand Total SLT", true, SMALL)] })] }), compactWordCell(String(document.totals.grandSlt), w[1]!, AlignmentType.CENTER, true)] })] });
}

function assessmentPlanTable(document: CourseDocumentModel) {
  const topicWeights = Array.from({ length: 15 }, () => 2.1);
  const w = colWidths([4.5, 4.5, 21.5, 8, 6, 4.5, 5.5, ...topicWeights, 7, 7]);
  const topicWidth = w.slice(7, 22).reduce((sum, width) => sum + width, 0);
  const rows: TableRow[] = [
    new TableRow({ cantSplit: true, children: [headerMergeCell("CLO", w[0]!, { bottom: false }), headerMergeCell("PLO", w[1]!, { bottom: false }), headerMergeCell("Assessment", w[2]!, { bottom: false }), headerMergeCell("Group (G) /\nIndividual (I)", w[3]!, { bottom: false }), headerMergeCell("Weight\n%", w[4]!, { bottom: false }), headerMergeCell("SLT", w[5]!, { bottom: false }), headerMergeCell("C/A/P\nLevel", w[6]!, { bottom: false }), headerMergeCell("Topic", topicWidth, { columnSpan: 15 }), headerMergeCell("Total\nWeight\n(%)", w[22]!, { bottom: false }), headerMergeCell("Total\nSLT", w[23]!, { bottom: false })] }),
    new TableRow({ cantSplit: true, children: [headerMergeCell("", w[0]!, { top: false }), headerMergeCell("", w[1]!, { top: false }), headerMergeCell("", w[2]!, { top: false }), headerMergeCell("", w[3]!, { top: false }), headerMergeCell("", w[4]!, { top: false }), headerMergeCell("", w[5]!, { top: false }), headerMergeCell("", w[6]!, { top: false }), ...Array.from({ length: 15 }, (_, index) => headerMergeCell(String(index + 1), w[index + 7]!)), headerMergeCell("", w[22]!, { top: false }), headerMergeCell("", w[23]!, { top: false })] }),
  ];
  const baseGroupKeys = document.assessments.map((assessment) => [...assessment.cloCodes].sort().join("|") || assessment.id); let runIndex = -1; let previousBaseKey: string | null = null; const rowGroupKeys = baseGroupKeys.map((baseKey) => { if (baseKey !== previousBaseKey) { runIndex += 1; previousBaseKey = baseKey; } return `${runIndex}::${baseKey}`; });
  const groupTotals = new Map<string, { weight: number; slt: number }>(); document.assessments.forEach((assessment, index) => { const key = rowGroupKeys[index]!; const current = groupTotals.get(key) ?? { weight: 0, slt: 0 }; current.weight += Number(assessment.weight) || 0; current.slt += assessment.totalSltHours; groupTotals.set(key, current); });
  document.assessments.forEach((assessment, index) => { const key = rowGroupKeys[index]!; const firstInGroup = index === 0 || rowGroupKeys[index - 1] !== key; const totals = groupTotals.get(key) ?? { weight: 0, slt: 0 }; rows.push(new TableRow({ cantSplit: true, children: [compactWordCell(firstInGroup ? assessment.cloCodes.join(", ") : "", w[0]!, AlignmentType.CENTER), compactWordCell(firstInGroup ? assessment.mappedPlos.join(", ") : "", w[1]!, AlignmentType.CENTER), compactWordCell(assessment.name, w[2]!), compactWordCell(assessment.mode === "group" ? "G" : "I", w[3]!, AlignmentType.CENTER), compactWordCell(cleanSltValue(assessment.weight), w[4]!, AlignmentType.CENTER), compactWordCell(cleanSltValue(assessment.totalSltHours), w[5]!, AlignmentType.CENTER), compactWordCell(assessment.capLevels.join(", "), w[6]!, AlignmentType.CENTER), ...Array.from({ length: 15 }, (_, topicIndex) => compactWordCell(assessment.topicNumbers.includes(topicIndex + 1) ? "✓" : "", w[topicIndex + 7]!, AlignmentType.CENTER)), compactWordCell(firstInGroup && totals.weight > 0 ? String(totals.weight) : "", w[22]!, AlignmentType.CENTER), compactWordCell(firstInGroup && totals.slt > 0 ? String(totals.slt) : "", w[23]!, AlignmentType.CENTER)] })); });
  const prefixWidth = w.slice(0, 4).reduce((sum, width) => sum + width, 0); const footerTopicWidth = w.slice(7, 22).reduce((sum, width) => sum + width, 0);
  rows.push(new TableRow({ cantSplit: true, children: [new TableCell({ columnSpan: 4, width: { size: prefixWidth, type: WidthType.DXA }, margins: tableCellMargins(), children: [new Paragraph({ children: [] })] }), compactWordCell(cleanSltValue(document.totals.assessmentWeight), w[4]!, AlignmentType.CENTER, true), compactWordCell("", w[5]!, AlignmentType.CENTER), compactWordCell("", w[6]!, AlignmentType.CENTER), new TableCell({ columnSpan: 15, width: { size: footerTopicWidth, type: WidthType.DXA }, margins: tableCellMargins(), children: [new Paragraph({ children: [] })] }), compactWordCell(cleanSltValue(document.totals.assessmentWeight), w[22]!, AlignmentType.CENTER), new TableCell({ width: { size: w[23]!, type: WidthType.DXA }, shading: { fill: "F4B183" }, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: wordTheme.lineTwips }, children: [text(String(document.totals.assessmentSlt), true, SMALL)] })] })] }));
  return new Table({ width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, borders, rows });
}

function lloText(week: CourseDocumentModel["weeklyPlan"][number]) { return week.lloItems.length ? week.lloItems.map((value, index) => `LLO${index + 1}: ${value}`).join("\n") : ""; }
function lessonLearningOutcomesTable(weeks: CourseDocumentModel["weeklyPlan"]) {
  const w = colWidths([3.5, 25.5, 6, 65]); const rows: TableRow[] = [new TableRow({ cantSplit: true, children: [new TableCell({ columnSpan: 4, width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, shading: { fill: LABEL }, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [centered("Lesson Learning Outcome (LLOs)", false, SMALL)] })] }), new TableRow({ cantSplit: true, children: [headerMergeCell("", w[0]!), headerMergeCell("Topic", w[1]!), headerMergeCell("CLOs", w[2]!), headerMergeCell("Lesson Learning Outcomes (LLOs)", w[3]!)] })];
  for (const week of weeks) rows.push(new TableRow({ cantSplit: true, children: [compactWordCell(week.week, w[0]!, AlignmentType.CENTER), topicSltCell(week.week, week.topic, w[1]!), compactWordCell(week.cloCodes.join(", "), w[2]!, AlignmentType.CENTER), compactWordCell(lloText(week), w[3]!)] }));
  return new Table({ width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, borders, rows });
}

function assessmentWeightForWeek(document: CourseDocumentModel, weekNumber: string) { return document.assessments.filter((assessment) => assessment.dueWeek.trim() === weekNumber.trim()).reduce((sum, assessment) => sum + (Number(assessment.weight) || 0), 0); }
function lectureOutlineText(week: CourseDocumentModel["weeklyPlan"][number]) { const lloCodes = week.lloItems.map((_, index) => `LLO${index + 1}`); return lloCodes.length ? `Topic ${week.week}: ${week.topic}\n- ${lloCodes.join(", ")}` : `Topic ${week.week}: ${week.topic}`; }
function detailCourseSyllabusTable(document: CourseDocumentModel, weeks: CourseDocumentModel["weeklyPlan"]) {
  const w = colWidths([5, 8, 18, 7, 20, 20, 10, 12]); const headers = ["Week", "Hour\n(L/T/P/O)", "Lecture", "CLOs", "Teaching Method/Activity", "Learning Method/Activity\n(ALS)", "Assessment\n(Weight %)", "T&L Resources"]; const rows: TableRow[] = [new TableRow({ cantSplit: true, children: headers.map((header, index) => headerMergeCell(header, w[index]!)) })];
  for (const week of weeks) { const hourText = [week.lectureHours, week.tutorialHours, week.practiceHours, week.otherHours].map((hours) => hours || "0").join("/"); const teaching = week.teachingMethods.join(", "); const learning = (week.activeLearningStrategies.length ? week.activeLearningStrategies : week.learningActivities).join(", "); const assessmentWeight = assessmentWeightForWeek(document, week.week); rows.push(new TableRow({ cantSplit: true, children: [compactWordCell(week.week, w[0]!, AlignmentType.CENTER), compactWordCell(hourText, w[1]!, AlignmentType.CENTER), compactWordCell(lectureOutlineText(week), w[2]!), compactWordCell(week.cloCodes.join(", "), w[3]!, AlignmentType.CENTER), compactWordCell(teaching, w[4]!, AlignmentType.CENTER), compactWordCell(learning, w[5]!, AlignmentType.CENTER), compactWordCell(String(assessmentWeight), w[6]!, AlignmentType.CENTER), compactWordCell(week.resources.join(", "), w[7]!, AlignmentType.CENTER)] })); }
  return new Table({ width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, borders, rows });
}

function resourcesTable(resources: CourseDocumentModel["resources"]) { const w = colWidths([18, 27, 25, 30]); const headers = ["Resource Type", "Resource Name / Description", "Link", "Notes"]; const rows = [new TableRow({ children: headers.map((header, index) => headerCell(header, w[index])) })]; for (const resource of resources) { const rowValues = [resource.resourceType, resource.title, resource.url, resource.notes]; rows.push(new TableRow({ children: rowValues.map((value, index) => cell(value, { width: w[index] })) })); } return table(rows, w); }
function referenceCitation(reference: CourseDocumentModel["references"][number]): string { const parts = [reference.authors, reference.year ? `(${reference.year})` : "", reference.title, reference.publisher].filter(Boolean); return parts.length ? parts.join(". ") : "—"; }
function referencesTable(references: CourseDocumentModel["references"]) { const w = colWidths([13, 45, 12, 15, 15]); const headers = ["Kind", "Citation", "ISBN", "Link", "Notes"]; const rows = [new TableRow({ children: headers.map((header, index) => headerCell(header, w[index])) })]; for (const reference of references) { const rowValues = [referenceKindLabel(reference.kind), referenceCitation(reference), reference.isbn, reference.url, reference.notes]; rows.push(new TableRow({ children: rowValues.map((value, index) => cell(value, { width: w[index] })) })); } return table(rows, w); }
function bulletedList(items: string[]) { return items.map((item) => new Paragraph({ bullet: { level: 0 }, alignment: defaultAlignment(), spacing: { before: 0, after: wordTheme.paragraphAfterTwips, line: wordTheme.lineTwips }, children: [text(item, false, SMALL)] })); }
function policyParagraphs(policy: CourseDocumentModel["policy"]) { const sections: [string, string][] = [["Attendance & Preparation", policy.attendancePreparation], ["Academic Integrity", policy.academicIntegrity], ["Homework & Assignments", policy.assignmentsLateSubmission], ["Examinations", policy.examinationRules], ["Penalties", policy.penaltiesConsequences]]; return sections.flatMap(([label, value]) => [paragraph(label, true, wordTheme.heading3HalfPoints), paragraph(value || "—", false, BODY)]); }
function rubricGridTable(rubric: CourseDocumentModel["rubrics"][number]) { const w = colWidths([22, ...rubric.levels.map(() => 78 / rubric.levels.length)]); const headers = ["Criteria", ...rubric.levels.map((level) => `${level.points} – ${level.label}`)]; const rows = [new TableRow({ children: headers.map((header, index) => headerCell(header, w[index])) })]; for (const criterion of rubric.criteria) { const rowValues = [criterion.name, ...rubric.levels.map((_level, levelIndex) => criterion.descriptors[levelIndex] ?? "—")]; rows.push(new TableRow({ children: rowValues.map((value, index) => cell(value, { width: w[index], bold: index === 0 })) })); } return table(rows, w); }
function rubricSection(document: CourseDocumentModel) { if (document.rubrics.length === 0) return [paragraph("No assessment has a rubric linked from the Rubric Library.", false, BODY)]; return document.rubrics.flatMap((rubric) => [paragraph(`${rubric.assessmentName} — ${rubric.name} (${rubric.type})`, true, wordTheme.heading2HalfPoints), paragraph(`Rating Scale: ${rubric.scaleSummary}`, false, BODY), rubricGridTable(rubric), new Paragraph({ spacing: { before: 90, after: 0 }, children: [] })]); }

function ploColumnWidths(totalWidth: number) { const weights = [19, 19, 35, 12, 15]; const totalWeight = weights.reduce((sum, weight) => sum + weight, 0); const widths = weights.map((weight) => Math.floor((weight / totalWeight) * totalWidth)); const distributed = widths.reduce((sum, width) => sum + width, 0); widths[widths.length - 1]! += totalWidth - distributed; return widths; }
function ploWordCell(width: number, children: TextRun[], options?: { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; columnSpan?: number; verticalMerge?: (typeof VerticalMergeType)[keyof typeof VerticalMergeType] }) { return new TableCell({ width: { size: width, type: WidthType.DXA }, columnSpan: options?.columnSpan, verticalMerge: options?.verticalMerge, verticalAlign: VerticalAlign.CENTER, margins: tableCellMargins(), children: [new Paragraph({ alignment: options?.alignment ?? defaultAlignment(), spacing: { before: 0, after: 0, line: wordTheme.lineTwips }, children })] }); }
function ploHeaderCell(value: string, width: number, options?: { columnSpan?: number; verticalMerge?: (typeof VerticalMergeType)[keyof typeof VerticalMergeType] }) { return ploWordCell(width, value ? [text(value, true, SMALL)] : [], { alignment: AlignmentType.CENTER, columnSpan: options?.columnSpan, verticalMerge: options?.verticalMerge }); }
function ploMergedValueCell(value: string, width: number, span: number, alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = defaultAlignment()) { if (span === 0) return ploWordCell(width, [], { alignment, verticalMerge: VerticalMergeType.CONTINUE }); return ploWordCell(width, value ? [text(value, false, SMALL)] : [], { alignment, verticalMerge: span > 1 ? VerticalMergeType.RESTART : undefined }); }
function ploTaxonomyTable(plos: CourseDocumentModel["plos"], totalWidth: number) {
  const w = ploColumnWidths(totalWidth); const majorRowSpans = contiguousRowSpans(plos, (plo) => plo.major); const capRowSpans = contiguousRowSpans(plos, (plo) => plo.cap); const rows: TableRow[] = [new TableRow({ cantSplit: true, children: [ploHeaderCell("CQF Learning Domains", w[0]! + w[1]!, { columnSpan: 2 }), ploHeaderCell("PLO", w[2]!, { verticalMerge: VerticalMergeType.RESTART }), ploHeaderCell("Specific/Generic", w[3]!, { verticalMerge: VerticalMergeType.RESTART }), ploHeaderCell("Learning/Assessment Domains", w[4]!, { verticalMerge: VerticalMergeType.RESTART })] }), new TableRow({ cantSplit: true, children: [ploHeaderCell("Major Domain", w[0]!), ploHeaderCell("Learning Domain", w[1]!), ploHeaderCell("", w[2]!, { verticalMerge: VerticalMergeType.CONTINUE }), ploHeaderCell("", w[3]!, { verticalMerge: VerticalMergeType.CONTINUE }), ploHeaderCell("", w[4]!, { verticalMerge: VerticalMergeType.CONTINUE })] })];
  plos.forEach((plo, index) => { const { leadingWord, remainder } = splitLeadingWord(plo.description); const descriptionRuns = [text(`${plo.code}: ${leadingWord}`.trim(), true, SMALL), ...(remainder ? [text(` ${remainder}`, false, SMALL)] : [])]; rows.push(new TableRow({ cantSplit: true, children: [ploMergedValueCell(plo.major ?? "", w[0]!, majorRowSpans[index] ?? 1), ploWordCell(w[1]!, [text(plo.learningDomain || "—", false, SMALL)]), ploWordCell(w[2]!, descriptionRuns), ploWordCell(w[3]!, [text(plo.specificOrGeneric || "—", false, SMALL)], { alignment: AlignmentType.CENTER }), ploMergedValueCell(plo.cap ?? "", w[4]!, capRowSpans[index] ?? 1, AlignmentType.CENTER)] })); });
  return new Table({ width: { size: totalWidth, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, borders, rows });
}
function programmePloContinuationCell(document: CourseDocumentModel) {
  const cellMargin = 120; const innerWidth = CONTENT_WIDTH_TWIPS - cellMargin * 2; const children: (Paragraph | Table)[] = [new Paragraph({ spacing: { before: 0, after: 24, line: 220 }, children: [text("PROGRAM LEARNING OUTCOME (PLOs)", true, 20)] }), new Paragraph({ spacing: { before: 0, after: 50, line: 220 }, children: [text(`Our program has ${programmePloCountLabel(document.plos.length)} PLOs:`, false, 18)] })];
  if (document.plos.length === 0) children.push(new Paragraph({ spacing: { before: 0, after: 0, line: 220 }, children: [text("No programme learning outcomes have been configured.", false, 18)] }));
  else { children.push(ploTaxonomyTable(document.plos, innerWidth)); children.push(new Paragraph({ spacing: { before: 45, after: 12 }, children: [text("*", false, 18)] }), new Paragraph({ spacing: { before: 0, after: 12, line: 220 }, children: [text("Specific (Subject-Specific) PLOs:", true, 18), text(" Directly related to data science and engineering knowledge, tools, and technical skills)", false, 18)] }), new Paragraph({ spacing: { before: 0, after: 0, line: 220 }, children: [text("Generic PLOs:", true, 18), text(" Transferable skills applicable across disciplines and professions", false, 18)] })); }
  return new TableCell({ columnSpan: 2, width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP, margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin }, children });
}

function partTwoContinuationRow(children: (Paragraph | Table)[]) { return new TableRow({ children: [new TableCell({ columnSpan: 4, width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP, margins: tableCellMargins(), children })] }); }
function partTwoContinuationRows(document: CourseDocumentModel): TableRow[] {
  return [
    partTwoContinuationRow(cloSection(document)),
    partTwoContinuationRow([
      sectionTitle("15", "Mapping of the Course Learning Outcomes to the Programme Learning Outcomes, Teaching Methods and Assessment Methods"),
      officialCloPloMatrixTable(document, "hours"),
      paragraph("1 Credit = 40 Student Learning Time (SLT)", false, BODY),
      officialCloPloMatrixTable(document, "percent"),
      paragraph("*", false, BODY),
      paragraph("• Fully (F) indicates a focus of more than 50% of the total SLT on this PLO.", false, BODY),
      paragraph("• Moderate (M) indicates a focus of 31%–50% of the total SLT on this PLO.", false, BODY),
      paragraph("• Partial (P) indicates a focus of less than 30% of the total SLT on this PLO.", false, BODY),
      mappingDetailTable(document),
    ]),
    partTwoContinuationRow([sectionTitle("16", "Distribution of Student Learning Time (SLT)"), paragraph("* Lecture (L), Tutoring (T), Practice (P), Other (O)", false, BODY), courseContentSltTable(document), new Paragraph({ spacing: { before: 90, after: 0 }, children: [] }), assessmentSltTable(document, "continuous"), new Paragraph({ spacing: { before: 70, after: 0 }, children: [] }), assessmentSltTable(document, "final"), new Paragraph({ spacing: { before: 45, after: 0 }, children: [] }), grandTotalSltTable(document)]),
    partTwoContinuationRow([sectionTitle("17", "Course Assessment Plan"), assessmentPlanTable(document)]),
    partTwoContinuationRow([sectionTitle("18", "Course Outline/detailed lesson plan"), lessonLearningOutcomesTable(document.weeklyPlan), paragraph("* Active Learning Strategies (ALS)", false, BODY), centered("Detail Course Syllabus", false, wordTheme.heading2HalfPoints), detailCourseSyllabusTable(document, document.weeklyPlan)]),
    partTwoContinuationRow([sectionTitle("19", "Required Resources to Deliver the Course"), ...(document.resources.length === 0 ? [paragraph("No required resources have been confirmed.", false, BODY)] : [resourcesTable(document.resources)])]),
    partTwoContinuationRow([sectionTitle("20", "References / Textbooks"), ...(document.references.length === 0 ? [paragraph("No references have been recorded.", false, BODY)] : [referencesTable(document.references)])]),
    partTwoContinuationRow([sectionTitle("21", "Student Responsibility"), ...(document.responsibilities.length === 0 ? [paragraph("No student responsibilities have been recorded.", false, BODY)] : bulletedList(document.responsibilities))]),
    partTwoContinuationRow([sectionTitle("22", "Rubric"), ...rubricSection(document)]),
    partTwoContinuationRow([sectionTitle("23", "Course Policy"), ...policyParagraphs(document.policy)]),
    partTwoContinuationRow([sectionTitle("24", "Rating Scale"), ratingScaleTable(document)]),
    partTwoContinuationRow([sectionTitle("25", "Date"), dateTable(document.specDate)]),
  ];
}

function dateTable(specDate: CourseDocumentModel["specDate"]) { const w = colWidths([50, 50]); return table([new TableRow({ children: ["Item", "Date"].map((header, index) => headerCell(header, w[index])) }), new TableRow({ children: [cell("Course Specification Last Revised / Approved", { width: w[0] }), cell(specDate ?? "", { width: w[1] })] })], w); }
function ratingScaleTable(document: CourseDocumentModel) { const w = colWidths([25, 25, 25, 25]); const headers = ["Letter Grade", "Grade Point", "Score", "Explanation"]; const rows = [new TableRow({ children: headers.map((header, index) => headerCell(header, w[index])) })]; const grades = document.gradingScale?.grades ?? []; if (grades.length === 0) { rows.push(new TableRow({ children: [cell("No approved programme grading scale is bound to this Course Specification.", { width: w[0] }), cell("", { width: w[1] }), cell("", { width: w[2] }), cell("", { width: w[3] })] })); return table(rows, w); } for (const grade of grades) { const rowValues = [grade.letterGrade, grade.gradePoint.toFixed(2), grade.scoreLabel, grade.explanation]; rows.push(new TableRow({ children: rowValues.map((value, index) => cell(value, { width: w[index] })) })); } return table(rows, w); }

function documentHeader() {
  if (!wordTheme.showHeader) return undefined;
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [text("Course Specification", false, wordTheme.headerHalfPoints)],
      }),
    ],
  });
}

function documentFooter(courseCode: string) {
  if (!wordTheme.showFooter) return undefined;
  const pageNumberRuns = wordTheme.showPageNumbers
    ? [new TextRun({ font: FONT, size: wordTheme.footerHalfPoints, children: [PageNumber.CURRENT] })]
    : [];
  return new Footer({
    children: [
      new Table({
        width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
        columnWidths: [Math.floor(CONTENT_WIDTH_TWIPS / 2), Math.ceil(CONTENT_WIDTH_TWIPS / 2)],
        layout: TableLayoutType.FIXED,
        borders: noBorders,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [text(courseCode || "Course Specification", false, wordTheme.footerHalfPoints)] })],
              }),
              new TableCell({
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: pageNumberRuns })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

async function exportCourseSpecWordInternal(document: CourseDocumentModel, theme: CourseSpecDocumentTheme) {
  applyWordTheme(theme);
  const children: (Paragraph | Table)[] = []; const info = document.courseInformation;
  children.push(await programmeProfileHeader(document));
  children.push(new Paragraph({ spacing: { before: 0, after: 120, line: 220 }, children: [text("PART 1: VISION, MISSION, GOALS, AND OBJECTIVES", true, 28)] }));
  children.push(await programmeProfileTable(document));
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(paragraph(document.partTitle, true, wordTheme.documentTitleHalfPoints));
  children.push(paragraph(COURSE_DOCUMENT_STYLE.courseInfoTitle, true, wordTheme.heading1HalfPoints));
  children.push(courseInformationTable(info, partTwoContinuationRows(document)));
  const header = documentHeader();
  const footer = documentFooter(info.courseCode);
  const doc = new Document({ sections: [{ properties: { page: { size: { width: COURSE_DOCUMENT_STYLE.page.word.widthTwips, height: COURSE_DOCUMENT_STYLE.page.word.heightTwips }, margin: { top: wordTheme.marginTopTwips, bottom: wordTheme.marginBottomTwips, left: wordTheme.marginLeftTwips, right: wordTheme.marginRightTwips } } }, headers: header ? { default: header } : undefined, footers: footer ? { default: footer } : undefined, children }] });
  const blob = await Packer.toBlob(doc); const url = URL.createObjectURL(blob); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `${info.courseCode || "course"}-course-specification.docx`; window.document.body.appendChild(anchor); anchor.click(); window.document.body.removeChild(anchor); URL.revokeObjectURL(url);
}

export function exportCourseSpecWord(
  document: CourseDocumentModel,
  theme: CourseSpecDocumentTheme,
): Promise<void> {
  const nextExport = exportQueue.then(() =>
    exportCourseSpecWordInternal(document, theme),
  );
  exportQueue = nextExport.catch(() => undefined);
  return nextExport;
}
