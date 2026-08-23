"use client";

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
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
  QaSarDocumentModelView,
} from "@dse-pms/shared-types";
import {
  SAR_DOCUMENT_STYLE,
  buildSarDocumentLayout,
  buildSarEvidenceNumberMap,
  type SarLayoutBlock,
} from "./sar-document-layout";

export function sarEvidenceNumberMap(model: QaSarDocumentModelView): Map<string, string> {
  return buildSarEvidenceNumberMap(model);
}

export function sarDocumentLines(model: QaSarDocumentModelView): string[] {
  const layout = buildSarDocumentLayout(model);
  const lines: string[] = [
    layout.title,
    layout.programmeName,
    layout.cycleTitle,
    layout.modeLabel,
    "",
  ];

  for (const criterion of layout.criteria) {
    lines.push(`Criterion ${criterion.code}: ${criterion.title}`, "");
    for (const section of criterion.sections) {
      lines.push(`${section.requirementCode} ${section.requirementTitle}`);
      lines.push(`Status: ${section.statusLabel}`);
      if (section.submissionLabel) lines.push(section.submissionLabel);
      if (section.missingMessage) {
        lines.push(`[${section.missingMessage}]`, "");
        continue;
      }
      for (const block of section.blocks) {
        const text = block.type === "bullet" ? `• ${block.text}` : block.text;
        if (text.trim()) lines.push(text);
      }
      lines.push("");
    }
  }

  lines.push("Evidence Register", "");
  for (const item of layout.evidenceRows) {
    lines.push(
      `${item.number} — ${item.title} | ${item.reportingPeriod} | ${item.requirementCodes} | ${item.source}`,
    );
  }
  return lines;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function docxAlignment(align?: DseTextAlign): AlignmentType | undefined {
  if (align === "center") return AlignmentType.CENTER;
  if (align === "right") return AlignmentType.RIGHT;
  if (align === "justify") return AlignmentType.JUSTIFIED;
  if (align === "left") return AlignmentType.LEFT;
  return undefined;
}

function richTextRuns(nodes: DseTextNode[]): TextRun[] {
  return nodes.map(
    (node) =>
      new TextRun({
        text: node.text,
        bold: node.marks?.bold,
        italics: node.marks?.italic,
        underline: node.marks?.underline ? {} : undefined,
      }),
  );
}

function richDocxBlocks(document: DseDocumentContent): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const block of document.content) {
    if (block.type === "heading") {
      const heading = block.level === 1
        ? HeadingLevel.HEADING_1
        : block.level === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3;
      paragraphs.push(
        new Paragraph({
          children: richTextRuns(block.content),
          heading,
          alignment: docxAlignment(block.align),
          spacing: { before: 100, after: 80 },
        }),
      );
      continue;
    }
    if (block.type === "paragraph") {
      paragraphs.push(
        new Paragraph({
          children: richTextRuns(block.content),
          alignment: docxAlignment(block.align),
          spacing: { after: 100 },
        }),
      );
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

function docxBlock(block: SarLayoutBlock): Paragraph[] {
  if (block.type === "richText") return richDocxBlocks(block.document);
  if (block.type === "heading") {
    return [new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_3 })];
  }
  if (block.type === "bullet") {
    return [new Paragraph({ text: block.text, bullet: { level: 0 } })];
  }
  if (block.type === "evidenceReference") {
    return [new Paragraph({
      children: [new TextRun({ text: block.text, bold: true })],
      spacing: { before: 80, after: 80 },
    })];
  }
  if (block.type === "pmsData") {
    return [new Paragraph({
      children: [new TextRun({ text: block.text, italics: true })],
      spacing: { before: 80, after: 80 },
    })];
  }
  return [new Paragraph({ text: block.text, spacing: { after: 100 } })];
}

export async function exportSarDocx(model: QaSarDocumentModelView, baseName?: string) {
  const layout = buildSarDocumentLayout(model);
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: layout.title, bold: true, size: SAR_DOCUMENT_STYLE.titleSize })],
      spacing: { after: 160 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: layout.programmeName, bold: true, size: SAR_DOCUMENT_STYLE.programmeSize })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: layout.cycleTitle, size: SAR_DOCUMENT_STYLE.cycleSize })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: layout.modeLabel, bold: true })],
      spacing: { after: 240 },
    }),
  ];

  for (const criterion of layout.criteria) {
    children.push(
      new Paragraph({
        text: `Criterion ${criterion.code}: ${criterion.title}`,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
      }),
    );

    for (const section of criterion.sections) {
      children.push(
        new Paragraph({
          text: `${section.requirementCode} ${section.requirementTitle}`,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 180, after: 40 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Status: ${section.statusLabel}`, bold: true }),
            ...(section.submissionLabel
              ? [new TextRun({ text: `  ·  ${section.submissionLabel}`, italics: true })]
              : []),
          ],
          spacing: { after: 100 },
        }),
      );

      if (section.missingMessage) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: section.missingMessage, italics: true })],
            spacing: { after: 120 },
          }),
        );
        continue;
      }

      children.push(...section.blocks.flatMap(docxBlock));
    }
  }

  children.push(
    new Paragraph({
      text: "Evidence Register",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 80 },
    }),
    new Paragraph({
      text: "Canonical evidence is listed once even when reused across multiple requirements.",
      spacing: { after: 120 },
    }),
  );

  const evidenceRows = [
    new TableRow({
      children: ["ID", "Evidence", "Period", "Used in", "Source"].map(
        (label) =>
          new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: label, bold: true })] }),
            ],
          }),
      ),
    }),
    ...layout.evidenceRows.map(
      (item) =>
        new TableRow({
          children: [
            item.number,
            item.title,
            item.reportingPeriod,
            item.requirementCodes,
            item.source,
          ].map((value) => new TableCell({ children: [new Paragraph(String(value))] })),
        }),
    ),
  ];
  children.push(new Table({ rows: evidenceRows, width: { size: 100, type: WidthType.PERCENTAGE } }));

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "sar-numbering",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: SAR_DOCUMENT_STYLE.pageMarginTwips,
              right: SAR_DOCUMENT_STYLE.pageMarginTwips,
              bottom: SAR_DOCUMENT_STYLE.pageMarginTwips,
              left: SAR_DOCUMENT_STYLE.pageMarginTwips,
            },
          },
        },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(
    blob,
    `${safeFilename(baseName || `${layout.programmeCode}-${layout.cycleTitle}-${layout.mode}-SAR`)}.docx`,
  );
}

export function exportSarPdf(model: QaSarDocumentModelView, baseName?: string) {
  const layout = buildSarDocumentLayout(model);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 18;
  const maxWidth = 210 - margin * 2;
  const pageBottom = 279;
  let y = 20;

  const addWrapped = (text: string, options?: { bold?: boolean; size?: number; gap?: number }) => {
    const size = options?.size ?? 10;
    pdf.setFontSize(size);
    pdf.setFont("helvetica", options?.bold ? "bold" : "normal");
    const wrapped = pdf.splitTextToSize(text || " ", maxWidth) as string[];
    const lineHeight = Math.max(4.5, size * 0.42);
    for (const line of wrapped) {
      if (y + lineHeight > pageBottom) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(line, margin, y);
      y += lineHeight;
    }
    y += options?.gap ?? 1.5;
  };

  for (const line of sarDocumentLines(model)) {
    if (line === layout.title) addWrapped(line, { bold: true, size: 16, gap: 2 });
    else if (/^Criterion \d/.test(line)) addWrapped(line, { bold: true, size: 13, gap: 2 });
    else if (/^\d\.\d\s/.test(line) || line === "Evidence Register") addWrapped(line, { bold: true, size: 11, gap: 1.5 });
    else addWrapped(line, { size: 10 });
  }

  pdf.save(
    `${safeFilename(baseName || `${layout.programmeCode}-${layout.cycleTitle}-${layout.mode}-SAR`)}.pdf`,
  );
}
