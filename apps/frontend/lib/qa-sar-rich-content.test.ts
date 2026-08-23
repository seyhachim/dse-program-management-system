import { describe, expect, test } from "bun:test";
import type { QaSarDocument } from "@dse-pms/shared-types";
import { documentContentToPlainText } from "@/lib/document-content";
import {
  qaSarDocumentToEditorBlocks,
  qaSarEditorBlocksToDocument,
} from "./qa-sar-rich-content";

describe("QA SAR rich content adapter", () => {
  test("converts consecutive legacy narrative into one shared editor segment", () => {
    const legacy: QaSarDocument = {
      version: 1,
      blocks: [
        { id: "p1", type: "paragraph", text: "The programme reviews outcomes annually." },
        { id: "h1", type: "heading", level: 2, text: "Results" },
        { id: "b1", type: "bullet", text: "Graduate survey" },
        { id: "b2", type: "bullet", text: "Employer feedback" },
      ],
    };

    const editor = qaSarDocumentToEditorBlocks(legacy);
    expect(editor).toHaveLength(1);
    expect(editor[0]?.type).toBe("richText");
    if (editor[0]?.type !== "richText") throw new Error("expected rich text");
    expect(documentContentToPlainText(editor[0].document)).toContain("The programme reviews outcomes annually.");
    expect(editor[0].document.content.map((block) => block.type)).toEqual([
      "paragraph",
      "heading",
      "bulletList",
    ]);
  });

  test("preserves evidence and PMS extension ordering around narrative segments", () => {
    const legacy: QaSarDocument = {
      version: 1,
      blocks: [
        { id: "p1", type: "paragraph", text: "Claim before evidence." },
        { id: "e1", type: "evidenceReference", evidenceId: "evidence-1", label: "Graduate Survey" },
        { id: "p2", type: "paragraph", text: "Interpretation after evidence." },
        { id: "d1", type: "pmsData", source: "cloAttainment", label: "CLO attainment summary" },
      ],
    };

    const editor = qaSarDocumentToEditorBlocks(legacy);
    expect(editor.map((block) => block.type)).toEqual([
      "richText",
      "evidenceReference",
      "richText",
      "pmsData",
    ]);

    const saved = qaSarEditorBlocksToDocument(editor);
    expect(saved.blocks.map((block) => block.type)).toEqual([
      "richText",
      "evidenceReference",
      "richText",
      "pmsData",
    ]);
    expect(saved.blocks[1]).toEqual(legacy.blocks[1]);
    expect(saved.blocks[3]).toEqual(legacy.blocks[3]);
  });

  test("round trips existing rich text without downgrading formatting", () => {
    const first = qaSarEditorBlocksToDocument([
      {
        id: "rich-1",
        type: "richText",
        document: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              align: "justify",
              content: [{ type: "text", text: "Evidence-based narrative", marks: { bold: true } }],
            },
          ],
        },
      },
    ]);

    const second = qaSarDocumentToEditorBlocks(first);
    expect(second[0]?.type).toBe("richText");
    if (second[0]?.type !== "richText") throw new Error("expected rich text");
    expect(second[0].document.content[0]).toEqual({
      type: "paragraph",
      align: "justify",
      content: [{ type: "text", text: "Evidence-based narrative", marks: { bold: true } }],
    });
  });
});
