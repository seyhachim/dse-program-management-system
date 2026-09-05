"use client";

import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { jsPDF } from "jspdf";
import type {
  DseDocumentContent,
  DseTextAlign,
  DseTextNode,
  QaSarBookDocument,
} from "@dse-pms/shared-types";
import { parseStoredDocumentContent } from "@/lib/document-content";

const PAGE_MARGIN_TWIPS = 900;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function safeSarBookFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function sarBookExportBaseName(model: QaSarBookDocument): string {
  const release = model.release ? `release-v${model.release.version}` : model.mode === "official" ? "official-preview" : "draft-preview";
  return safeSarBookFilename(`${model.programme.code}-AUN-QA-SAR-${model.cycle.title}-${release}`);
}

function docxAlignment(align?: DseTextAlign) {
  if (align === "center") return AlignmentType.CENTER;
  if (align === "right") return AlignmentType.RIGHT;
  if (align === "justify") return AlignmentType.JUSTIFIED;
  if (align === "left") return AlignmentType.LEFT;
  return undefined;
}

function richTextRuns(nodes: DseTextNode[]): TextRun[] {
  return nodes.map((node) => new TextRun({
    text: node.text,
    bold: node.marks?.bold,
    italics: node.marks?.italic,
    underline: node.marks?.underline ? {} : undefined,
  }));
}

function richDocxBlocks(document: DseDocumentContent): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const block of document.content) {
    if (block.type === "heading") {
      paragraphs.push(new Paragraph({
        children: richTextRuns(block.content),
        heading: block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        alignment: docxAlignment(block.align),
        spacing: { before: 100, after: 80 },
      }));
      continue;
    }
    if (block.type === "paragraph") {
      paragraphs.push(new Paragraph({
        children: richTextRuns(block.content),
        alignment: docxAlignment(block.align),
        spacing: { after: 100 },
      }));
      continue;
    }
    for (const item of block.items) {
      paragraphs.push(
        block.type === "bulletList"
          ? new Paragraph({ children: richTextRuns(item), bullet: { level: 0 }, spacing: { after: 40 } })
          : new Paragraph({ children: richTextRuns(item), numbering: { reference: "sar-numbering", level: 0 }, spacing: { after: 40 } }),
      );
    }
  }
  return paragraphs;
}

function sectionHeading(number: string, title: string, level: 1 | 2 | 3 = 2) {
  const heading = level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
  return new Paragraph({ text: `${number} ${title}`, heading, spacing: { before: 180, after: 80 } });
}

function narrativeDocx(number: string, title: string, content: string): Paragraph[] {
  return [sectionHeading(number, title), ...richDocxBlocks(parseStoredDocumentContent(content))];
}

function qaDocumentDocx(
  content: QaSarBookDocument["part2"]["criteria"][number]["requirements"][number]["content"],
  evidenceNumbers: Map<string, string>,
): Paragraph[] {
  if (!content) return [new Paragraph({ children: [new TextRun({ text: "No included source content.", italics: true })] })];
  const paragraphs: Paragraph[] = [];
  for (const block of content.blocks) {
    if (block.type === "richText") {
      paragraphs.push(...richDocxBlocks(parseStoredDocumentContent(block.content)));
    } else if (block.type === "heading") {
      paragraphs.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_3 }));
    } else if (block.type === "bullet") {
      paragraphs.push(new Paragraph({ text: block.text, bullet: { level: 0 } }));
    } else if (block.type === "evidenceReference") {
      const number = evidenceNumbers.get(block.evidenceId) ?? block.evidenceId;
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: `[${number}] ${block.label}`, bold: true })] }));
    } else if (block.type === "pmsData") {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: `[PMS data] ${block.label}`, italics: true })] }));
    } else {
      paragraphs.push(new Paragraph({ text: block.text }));
    }
  }
  return paragraphs;
}

function evidenceTable(model: QaSarBookDocument): Table {
  const rows = [
    new TableRow({
      children: ["Exhibit", "Title", "Period", "Used in", "Source"].map((label) =>
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
      ),
    }),
    ...model.part4.evidenceRegister.items.map((item) => new TableRow({
      children: [
        item.number,
        item.title,
        item.reportingPeriod || "—",
        item.usages.map((usage) => usage.requirementCode ?? usage.sectionTitle).join(", "),
        item.sourceUrl ?? item.sourceRef ?? "—",
      ].map((value) => new TableCell({ children: [new Paragraph(String(value))] })),
    })),
  ];
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function improvementTable(model: QaSarBookDocument): Table {
  const rows = [
    new TableRow({
      children: ["Requirement", "Action", "Indicator", "Owner", "Due", "Status"].map((label) =>
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
      ),
    }),
    ...model.part3.snapshot.improvementActions.map((item) => new TableRow({
      children: [
        item.requirementCode,
        item.plannedAction,
        item.indicator || "—",
        item.ownerName ?? "—",
        item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—",
        item.status,
      ].map((value) => new TableCell({ children: [new Paragraph(String(value))] })),
    })),
  ];
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

export function sarBookDocumentLines(model: QaSarBookDocument): string[] {
  const lines = [
    "SELF-ASSESSMENT REPORT",
    model.programme.name,
    model.cycle.title,
    model.release ? `OFFICIAL RELEASE v${model.release.version}` : model.mode === "official" ? "OFFICIAL PREVIEW" : "DRAFT PREVIEW",
    "",
    "Table of Contents",
    ...model.toc.map((entry) => `${entry.number} ${entry.title}`),
    "",
    model.part1.title,
  ];
  for (const section of model.part1.sections) lines.push(`${section.number} ${section.title}`, section.plainText, "");
  lines.push(model.part2.title);
  for (const criterion of model.part2.criteria) {
    lines.push(`${criterion.number} Criterion ${criterion.criterionCode}: ${criterion.criterionTitle}`);
    for (const requirement of criterion.requirements) {
      lines.push(`${requirement.number} ${requirement.requirementCode} ${requirement.requirementTitle}`, requirement.plainText || "[No included source content]", "");
    }
  }
  lines.push(model.part3.title, `${model.part3.strengths.number} ${model.part3.strengths.title}`, model.part3.strengths.plainText, "", `${model.part3.weaknesses.number} ${model.part3.weaknesses.title}`, model.part3.weaknesses.plainText, "", "3.3 Self-Ratings", model.part3.snapshot.note);
  for (const criterion of model.part3.snapshot.criteria) {
    lines.push(`Criterion ${criterion.criterionCode}: ${criterion.criterionTitle} — ${criterion.rating ?? "Not rated"}/7`, criterion.opinion || "");
    for (const requirement of criterion.requirements) {
      lines.push(`${requirement.requirementCode}: ${requirement.rating ?? "Not rated"}/7 — ${requirement.justification || ""}`);
    }
  }
  lines.push("", "3.4 Improvement Plan");
  for (const item of model.part3.snapshot.improvementActions) lines.push(`${item.requirementCode} — ${item.plannedAction} — ${item.status}`);
  lines.push("", model.part4.title, `${model.part4.glossary.number} ${model.part4.glossary.title}`, model.part4.glossary.plainText, "", `4.2 ${model.part4.evidenceRegister.terminology.evidenceRegisterTitle}`);
  for (const item of model.part4.evidenceRegister.items) lines.push(`${item.number} — ${item.title} — ${item.reportingPeriod || "—"} — ${item.sourceUrl ?? item.sourceRef ?? "—"}`);
  lines.push("", "4.3 Supporting Documents", ...model.part4.evidenceRegister.items.map((item) => `${item.number} — ${item.title}`));
  return lines;
}

export async function exportSarBookDocx(model: QaSarBookDocument) {
  const evidenceNumbers = new Map(model.part4.evidenceRegister.items.map((item) => [item.evidenceId, item.number]));
  const children: Array<Paragraph | Table> = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "SELF-ASSESSMENT REPORT", bold: true, size: 32 })], spacing: { after: 180 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: model.programme.name, bold: true, size: 28 })], spacing: { after: 100 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: model.cycle.title, size: 22 })], spacing: { after: 100 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: model.release ? `OFFICIAL RELEASE v${model.release.version}` : model.mode === "official" ? "OFFICIAL PREVIEW" : "DRAFT PREVIEW", bold: true })] }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ text: "Table of Contents", heading: HeadingLevel.HEADING_1 }),
    ...model.toc.map((entry) => new Paragraph({ text: `${entry.number} ${entry.title}`, indent: { left: (entry.level - 1) * 360 }, spacing: { after: 40 } })),
    new Paragraph({ children: [new PageBreak()] }),
    sectionHeading("1", "Part 1 — Introduction", 1),
  ];

  for (const section of model.part1.sections) children.push(...narrativeDocx(section.number, section.title, section.content));
  children.push(sectionHeading("2", "Part 2 — AUN-QA Criteria", 1));
  for (const criterion of model.part2.criteria) {
    children.push(sectionHeading(criterion.number, `Criterion ${criterion.criterionCode}: ${criterion.criterionTitle}`, 2));
    for (const requirement of criterion.requirements) {
      children.push(sectionHeading(requirement.number, `${requirement.requirementCode} ${requirement.requirementTitle}`, 3));
      children.push(new Paragraph({ children: [new TextRun({ text: requirement.submissionVersion ? `Pinned approved submission v${requirement.submissionVersion}` : `Source: ${requirement.sourceKind ?? "none"}`, italics: true })] }));
      children.push(...qaDocumentDocx(requirement.content, evidenceNumbers));
    }
  }

  children.push(sectionHeading("3", "Part 3 — Strengths and Weaknesses Analysis", 1));
  children.push(...narrativeDocx(model.part3.strengths.number, model.part3.strengths.title, model.part3.strengths.content));
  children.push(...narrativeDocx(model.part3.weaknesses.number, model.part3.weaknesses.title, model.part3.weaknesses.content));
  children.push(sectionHeading("3.3", "Self-Ratings"), new Paragraph({ children: [new TextRun({ text: model.part3.snapshot.note, italics: true })] }));
  for (const criterion of model.part3.snapshot.criteria) {
    children.push(new Paragraph({ children: [new TextRun({ text: `Criterion ${criterion.criterionCode}: ${criterion.criterionTitle} — ${criterion.rating ?? "Not rated"}/7`, bold: true })] }));
    if (criterion.opinion) children.push(new Paragraph(criterion.opinion));
    for (const requirement of criterion.requirements) {
      children.push(new Paragraph({ children: [new TextRun({ text: `${requirement.requirementCode} — ${requirement.rating ?? "Not rated"}/7`, bold: true }), new TextRun({ text: requirement.justification ? ` — ${requirement.justification}` : "" })] }));
    }
  }
  children.push(sectionHeading("3.4", "Improvement Plan"), improvementTable(model));

  children.push(sectionHeading("4", "Part 4 — Appendices", 1));
  children.push(...narrativeDocx(model.part4.glossary.number, model.part4.glossary.title, model.part4.glossary.content));
  children.push(sectionHeading("4.2", model.part4.evidenceRegister.terminology.evidenceRegisterTitle), evidenceTable(model));
  children.push(sectionHeading("4.3", "Supporting Documents"));
  for (const item of model.part4.evidenceRegister.items) children.push(new Paragraph({ text: `${item.number} — ${item.title}`, bullet: { level: 0 } }));

  const header = new Header({ children: [new Paragraph({ children: [new TextRun({ text: `${model.programme.code} · AUN-QA Self-Assessment Report`, size: 18 })] })] });
  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: model.release ? `Official Release v${model.release.version} · Page ` : "Preview · Page ", size: 18 }), new TextRun({ size: 18, children: [PageNumber.CURRENT] })] })] });
  const doc = new Document({
    numbering: { config: [{ reference: "sar-numbering", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.LEFT }] }] },
    sections: [{
      properties: { page: { margin: { top: PAGE_MARGIN_TWIPS, right: PAGE_MARGIN_TWIPS, bottom: PAGE_MARGIN_TWIPS, left: PAGE_MARGIN_TWIPS } } },
      headers: { default: header },
      footers: { default: footer },
      children,
    }],
  });
  downloadBlob(await Packer.toBlob(doc), `${sarBookExportBaseName(model)}.docx`);
}

export function exportSarBookPdf(model: QaSarBookDocument) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 18;
  const maxWidth = 210 - margin * 2;
  const pageBottom = 278;
  let y = 22;
  const addWrapped = (text: string, bold = false, size = 10) => {
    pdf.setFontSize(size);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    const wrapped = pdf.splitTextToSize(text || " ", maxWidth) as string[];
    const lineHeight = Math.max(4.5, size * 0.42);
    for (const line of wrapped) {
      if (y + lineHeight > pageBottom - 8) {
        pdf.addPage();
        y = 22;
      }
      pdf.text(line, margin, y);
      y += lineHeight;
    }
    y += 1.5;
  };
  for (const line of sarBookDocumentLines(model)) {
    const part = /^Part [1-4]/.test(line);
    const numbered = /^\d(?:\.\d+)*\s/.test(line);
    addWrapped(line, part || numbered || line === "SELF-ASSESSMENT REPORT" || line === "Table of Contents", part ? 13 : line === "SELF-ASSESSMENT REPORT" ? 16 : numbered ? 11 : 10);
  }
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`${model.programme.code} · AUN-QA Self-Assessment Report`, margin, 9);
    pdf.text(`${model.release ? `Official Release v${model.release.version}` : "Preview"} · Page ${page} of ${pageCount}`, 105, 291, { align: "center" });
  }
  pdf.save(`${sarBookExportBaseName(model)}.pdf`);
}
