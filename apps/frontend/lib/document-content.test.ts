import { describe, expect, test } from "bun:test";
import {
  DSE_DOCUMENT_PREFIX,
  documentContentToEditorHtml,
  documentContentToPlainText,
  legacyTextToDocumentContent,
  parseStoredDocumentContent,
  sanitizeDocumentContent,
  serializeDocumentContent,
  type DseDocumentContent,
} from "./document-content";

describe("DSE document content", () => {
  test("converts existing plain text into structured paragraphs", () => {
    const doc = legacyTextToDocumentContent("First paragraph.\n\nSecond paragraph.");
    expect(doc.content).toHaveLength(2);
    expect(documentContentToPlainText(doc)).toBe("First paragraph.\nSecond paragraph.");
  });

  test("round-trips structured content with formatting", () => {
    const doc: DseDocumentContent = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "heading",
          level: 2,
          align: "center",
          content: [{ type: "text", text: "Study Plan", marks: { bold: true } }],
        },
        {
          type: "paragraph",
          align: "justify",
          content: [
            { type: "text", text: "Read the " },
            { type: "text", text: "programme guide", marks: { italic: true, underline: true } },
            { type: "text", text: "." },
          ],
        },
      ],
    };

    const stored = serializeDocumentContent(doc);
    expect(stored.startsWith(DSE_DOCUMENT_PREFIX)).toBe(true);
    expect(parseStoredDocumentContent(stored)).toEqual(doc);
  });

  test("sanitizes unsupported nodes, marks, and dangerous links", () => {
    const sanitized = sanitizeDocumentContent({
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          align: "sideways",
          content: [
            {
              type: "text",
              text: "Safe",
              marks: { bold: true, script: true, link: "javascript:alert(1)" },
            },
          ],
        },
        { type: "script", content: [{ type: "text", text: "ignored" }] },
      ],
    });

    expect(sanitized.content).toHaveLength(1);
    expect(sanitized.content[0]).toEqual({
      type: "paragraph",
      align: undefined,
      content: [{ type: "text", text: "Safe", marks: { bold: true } }],
    });
  });

  test("falls back safely when prefixed structured content is malformed", () => {
    const doc = parseStoredDocumentContent(`${DSE_DOCUMENT_PREFIX}{bad json`);
    expect(documentContentToPlainText(doc)).toBe("");
  });

  test("renders only escaped semantic HTML for the editor surface", () => {
    const doc = legacyTextToDocumentContent('<img src=x onerror="bad">');
    const html = documentContentToEditorHtml(doc);
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});
