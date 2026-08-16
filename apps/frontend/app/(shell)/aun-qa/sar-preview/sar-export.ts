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
import type { QaSarBlock, QaSarDocumentModelView } from "@dse-pms/shared-types";

export function sarEvidenceNumberMap(model: QaSarDocumentModelView): Map<string, string> {
  return new Map(
    model.evidenceRegister.map((item, index) => [item.evidenceId, `E${String(index + 1).padStart(3, "0")}`]),
  );
}

function blockText(block: QaSarBlock, evidenceNumbers: Map<string, string>): string {
  if (block.type === "evidenceReference") {
    return `[${evidenceNumbers.get(block.evidenceId) ?? "Evidence"}] ${block.label}`;
  }
  if (block.type === "pmsData") return `[PMS data] ${block.label}`;
  if (block.type === "bullet") return `• ${block.text}`;
  return block.text;
}

export function sarDocumentLines(model: QaSarDocumentModelView): string[] {
  const evidenceNumbers = sarEvidenceNumberMap(model);
  const lines: string[] = [
    "SELF-ASSESSMENT REPORT",
    model.programmeName,
    model.cycleTitle,
    model.mode === "working" ? "WORKING DRAFT" : "OFFICIAL SAR",
    "",
  ];

  for (const criterion of model.criteria) {
    lines.push(`Criterion ${criterion.code}: ${criterion.title}`, "");
    for (const section of criterion.sections) {
      lines.push(`${section.requirementCode} ${section.requirementTitle}`);
      if (!section.content) {
        lines.push(
          model.mode === "official"
            ? "[No approved submission; excluded from official SAR]"
            : "[SAR writing has not started]",
          "",
        );
        continue;
      }
      for (const block of section.content.blocks) {
        const text = blockText(block, evidenceNumbers).trim();
        if (text) lines.push(text);
      }
      lines.push("");
    }
  }

  lines.push("Evidence Register", "");
  for (const item of model.evidenceRegister) {
    const number = evidenceNumbers.get(item.evidenceId) ?? "Evidence";
    const source = item.sourceRef || item.sourceUrl || "—";
    lines.push(`${number} — ${item.title} | ${item.reportingPeriod || "—"} | ${item.requirementCodes.join(", ")} | ${source}`);
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

export async function exportSarDocx(model: QaSarDocumentModelView, baseName?: string) {
  const evidenceNumbers = sarEvidenceNumberMap(model);
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "SELF-ASSESSMENT REPORT", bold: true, size: 30 })],
      spacing: { after: 160 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: model.programmeName, bold: true, size: 28 })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: model.cycleTitle, size: 22 })],
      spacing: { after: 200 },
    }),
  ];

  if (model.mode === "working") {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "WORKING DRAFT", bold: true })],
        spacing: { after: 240 },
      }),
    );
  }

  for (const criterion of model.criteria) {
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
          spacing: { before: 180, after: 80 },
        }),
      );
      if (!section.content) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text:
                  model.mode === "official"
                    ? "No approved submission yet; excluded from official SAR."
                    : "SAR writing has not started.",
                italics: true,
              }),
            ],
          }),
        );
        continue;
      }
      for (const block of section.content.blocks) {
        if (block.type === "heading") {
          children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_3 }));
        } else if (block.type === "bullet") {
          children.push(new Paragraph({ text: block.text, bullet: { level: 0 } }));
        } else if (block.type === "evidenceReference") {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[${evidenceNumbers.get(block.evidenceId) ?? "Evidence"}] ${block.label}`,
                  bold: true,
                }),
              ],
            }),
          );
        } else if (block.type === "pmsData") {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `[PMS data] ${block.label}`, italics: true })],
            }),
          );
        } else if (block.text.trim()) {
          children.push(new Paragraph({ text: block.text, spacing: { after: 100 } }));
        }
      }
    }
  }

  children.push(
    new Paragraph({ text: "Evidence Register", heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 } }),
  );
  const evidenceRows = [
    new TableRow({
      children: ["ID", "Evidence", "Period", "Used in", "Source"].map(
        (label) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
      ),
    }),
    ...model.evidenceRegister.map(
      (item) =>
        new TableRow({
          children: [
            evidenceNumbers.get(item.evidenceId) ?? "Evidence",
            item.title,
            item.reportingPeriod || "—",
            item.requirementCodes.join(", "),
            item.sourceRef || item.sourceUrl || "—",
          ].map((value) => new TableCell({ children: [new Paragraph(String(value))] })),
        }),
    ),
  ];
  children.push(new Table({ rows: evidenceRows, width: { size: 100, type: WidthType.PERCENTAGE } }));

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } },
      },
      children,
    }],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${safeFilename(baseName || `${model.programmeCode}-${model.cycleTitle}-${model.mode}-SAR`)}.docx`);
}

export function exportSarPdf(model: QaSarDocumentModelView, baseName?: string) {
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
    if (line === "SELF-ASSESSMENT REPORT") addWrapped(line, { bold: true, size: 16, gap: 2 });
    else if (/^Criterion \d/.test(line)) addWrapped(line, { bold: true, size: 13, gap: 2 });
    else if (/^\d\.\d\s/.test(line) || line === "Evidence Register") addWrapped(line, { bold: true, size: 11, gap: 1.5 });
    else addWrapped(line, { size: 10 });
  }

  pdf.save(`${safeFilename(baseName || `${model.programmeCode}-${model.cycleTitle}-${model.mode}-SAR`)}.pdf`);
}
