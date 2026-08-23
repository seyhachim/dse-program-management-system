"use client";

import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import type {
  DseDocumentBlock,
  DseTextAlign,
  DseTextNode,
} from "./document-content";
import type {
  StudentHandbookExportBlock,
  StudentHandbookExportModel,
} from "./student-handbook-export-model";

const A4_WIDTH_TWIP = 11_906;
const A4_HEIGHT_TWIP = 16_838;
const NUMBERING_REFERENCE = "student-handbook-numbering";
const BULLET_REFERENCE = "student-handbook-bullets";

function ptToHalfPoint(value: number): number {
  return Math.round(value * 2);
}

function ptToTwip(value: number): number {
  return Math.round(value * 20);
}

function mmToTwip(value: number): number {
  return Math.round(value * 56.6929133858);
}

function alignment(value: DseTextAlign | undefined, fallback: DseTextAlign): (typeof AlignmentType)[keyof typeof AlignmentType] {
  const selected = value ?? fallback;
  if (selected === "center") return AlignmentType.CENTER;
  if (selected === "right") return AlignmentType.RIGHT;
  if (selected === "justify") return AlignmentType.BOTH;
  return AlignmentType.LEFT;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function textRuns(nodes: DseTextNode[], model: StudentHandbookExportModel): TextRun[] {
  return nodes.map(
    (node) =>
      new TextRun({
        text: node.text,
        font: model.theme.bodyFontFamily,
        size: ptToHalfPoint(model.theme.bodyFontSizePt),
        bold: node.marks?.bold,
        italics: node.marks?.italic,
        underline: node.marks?.underline ? {} : undefined,
      }),
  );
}

function paragraphSpacing(model: StudentHandbookExportModel) {
  return {
    after: ptToTwip(model.theme.paragraphSpacingPt),
    line: ptToTwip(model.theme.bodyFontSizePt * model.theme.lineHeight),
  };
}

function documentBlockToDocx(
  block: DseDocumentBlock,
  model: StudentHandbookExportModel,
  listInstance: number,
): Paragraph[] {
  if (block.type === "paragraph") {
    return [
      new Paragraph({
        children: textRuns(block.content, model),
        alignment: alignment(block.align, model.theme.defaultAlignment),
        spacing: paragraphSpacing(model),
      }),
    ];
  }

  if (block.type === "heading") {
    const heading =
      block.level === 1
        ? HeadingLevel.HEADING_1
        : block.level === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3;
    const headingSize =
      block.level === 1
        ? model.theme.heading1SizePt
        : block.level === 2
          ? model.theme.heading2SizePt
          : model.theme.heading3SizePt;
    return [
      new Paragraph({
        heading,
        children: block.content.map(
          (node) =>
            new TextRun({
              text: node.text,
              font: model.theme.bodyFontFamily,
              size: ptToHalfPoint(headingSize),
              bold: true,
              italics: node.marks?.italic,
              underline: node.marks?.underline ? {} : undefined,
            }),
        ),
        alignment: alignment(block.align, model.theme.defaultAlignment),
        spacing: paragraphSpacing(model),
      }),
    ];
  }

  return block.items.map(
    (item) =>
      new Paragraph({
        children: textRuns(item, model),
        numbering: {
          reference: block.type === "orderedList" ? NUMBERING_REFERENCE : BULLET_REFERENCE,
          level: 0,
          instance: listInstance,
        },
        spacing: paragraphSpacing(model),
      }),
  );
}

function sourceBlockToDocx(
  block: Extract<StudentHandbookExportBlock, { type: "SOURCE_DATA" }>,
  model: StudentHandbookExportModel,
): Array<Paragraph | Table> {
  const output: Array<Paragraph | Table> = [
    new Paragraph({
      children: [
        new TextRun({
          text: block.source.label,
          bold: true,
          font: model.theme.bodyFontFamily,
          size: ptToHalfPoint(model.theme.bodyFontSizePt),
        }),
      ],
      spacing: paragraphSpacing(model),
    }),
  ];

  if (block.source.unavailable) {
    output.push(
      new Paragraph({
        children: [
          new TextRun({
            text: block.source.message ?? "PMS source data is unavailable.",
            italics: true,
            font: model.theme.bodyFontFamily,
            size: ptToHalfPoint(model.theme.bodyFontSizePt),
          }),
        ],
        spacing: paragraphSpacing(model),
      }),
    );
    return output;
  }

  if (block.source.rows.length > 0) {
    output.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: block.source.rows.map(
          (row) =>
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 35, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: row.key,
                          bold: true,
                          font: model.theme.bodyFontFamily,
                          size: ptToHalfPoint(model.theme.bodyFontSizePt),
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 65, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: row.value,
                          font: model.theme.bodyFontFamily,
                          size: ptToHalfPoint(model.theme.bodyFontSizePt),
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
        ),
      }),
    );
  } else if (block.source.text) {
    output.push(
      new Paragraph({
        children: [
          new TextRun({
            text: block.source.text,
            font: model.theme.bodyFontFamily,
            size: ptToHalfPoint(model.theme.bodyFontSizePt),
          }),
        ],
        spacing: paragraphSpacing(model),
      }),
    );
  }

  return output;
}

export function createStudentHandbookDocxDocument(model: StudentHandbookExportModel): Document {
  const children: Array<Paragraph | Table> = [];
  let listInstance = 1;

  model.sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) {
      children.push(new Paragraph({ pageBreakBefore: true }));
    }

    if (model.draft) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "DRAFT — NOT AN OFFICIAL PUBLISHED HANDBOOK",
              bold: true,
              color: "B42318",
              font: model.theme.bodyFontFamily,
              size: ptToHalfPoint(11),
            }),
          ],
          spacing: { after: ptToTwip(12) },
        }),
      );
    }

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({
            text: `${sectionIndex + 1}. ${section.title}`,
            bold: true,
            font: model.theme.bodyFontFamily,
            size: ptToHalfPoint(model.theme.heading1SizePt),
          }),
        ],
        spacing: { after: ptToTwip(12) },
      }),
    );

    if (section.blocks.length === 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "No content yet.",
              italics: true,
              font: model.theme.bodyFontFamily,
              size: ptToHalfPoint(model.theme.bodyFontSizePt),
            }),
          ],
        }),
      );
    }

    for (const block of section.blocks) {
      if (block.type === "NARRATIVE") {
        for (const documentBlock of block.document.content) {
          children.push(...documentBlockToDocx(documentBlock, model, listInstance));
          if (documentBlock.type === "bulletList" || documentBlock.type === "orderedList") listInstance += 1;
        }
      } else {
        children.push(...sourceBlockToDocx(block, model));
      }
    }
  });

  const header = model.theme.showHeader
    ? new Header({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `${model.title} · v${model.version}`,
                font: model.theme.bodyFontFamily,
                size: ptToHalfPoint(9),
                color: "667085",
              }),
            ],
          }),
        ],
      })
    : undefined;

  const footerChildren: Paragraph[] = [];
  if (model.theme.showFooter || model.theme.showPageNumbers) {
    footerChildren.push(
      new Paragraph({
        children: [
          ...(model.theme.showFooter
            ? [
                new TextRun({
                  text: "Data Science and Engineering",
                  font: model.theme.bodyFontFamily,
                  size: ptToHalfPoint(9),
                  color: "667085",
                }),
              ]
            : []),
          ...(model.theme.showFooter && model.theme.showPageNumbers
            ? [new TextRun({ text: " · " })]
            : []),
          ...(model.theme.showPageNumbers
            ? [
                new TextRun({
                  children: ["Page ", PageNumber.CURRENT],
                  font: model.theme.bodyFontFamily,
                  size: ptToHalfPoint(9),
                  color: "667085",
                }),
              ]
            : []),
        ],
        alignment: model.theme.showPageNumbers ? AlignmentType.RIGHT : AlignmentType.LEFT,
      }),
    );
  }
  const footer = footerChildren.length ? new Footer({ children: footerChildren }) : undefined;

  return new Document({
    creator: "DSE Program Management System",
    title: `${model.title} v${model.version}`,
    description: model.generatedLabel,
    numbering: {
      config: [
        {
          reference: NUMBERING_REFERENCE,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
        {
          reference: BULLET_REFERENCE,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: A4_WIDTH_TWIP, height: A4_HEIGHT_TWIP },
            margin: {
              top: mmToTwip(model.theme.marginsMm.top),
              bottom: mmToTwip(model.theme.marginsMm.bottom),
              left: mmToTwip(model.theme.marginsMm.left),
              right: mmToTwip(model.theme.marginsMm.right),
            },
          },
        },
        headers: header ? { default: header } : undefined,
        footers: footer ? { default: footer } : undefined,
        children,
      },
    ],
  });
}

export async function exportStudentHandbookDocx(model: StudentHandbookExportModel): Promise<void> {
  const blob = await Packer.toBlob(createStudentHandbookDocxDocument(model));
  downloadBlob(blob, `${model.filenameBase}.docx`);
}

export async function exportStudentHandbookPdf(
  model: StudentHandbookExportModel,
  previewRoot: HTMLElement,
): Promise<void> {
  const pages = Array.from(
    previewRoot.querySelectorAll<HTMLElement>("[data-student-handbook-export-page='true']"),
  );
  if (pages.length === 0) throw new Error("No handbook preview pages are available for PDF export.");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]!;
    const canvas = await html2canvas(page, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
    const image = canvas.toDataURL("image/png");
    if (index > 0) pdf.addPage("a4", "portrait");
    pdf.addImage(image, "PNG", 0, 0, 210, 297, undefined, "FAST");
  }

  pdf.save(`${model.filenameBase}.pdf`);
}
