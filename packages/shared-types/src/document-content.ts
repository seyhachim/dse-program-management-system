export const DSE_DOCUMENT_PREFIX = "DSE_DOC_V1:";

export type DseTextAlign = "left" | "center" | "right" | "justify";

export type DseTextMarks = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  link?: string;
};

export type DseTextNode = {
  type: "text";
  text: string;
  marks?: DseTextMarks;
};

export type DseParagraphNode = {
  type: "paragraph";
  align?: DseTextAlign;
  content: DseTextNode[];
};

export type DseHeadingNode = {
  type: "heading";
  level: 1 | 2 | 3;
  align?: DseTextAlign;
  content: DseTextNode[];
};

export type DseListNode = {
  type: "bulletList" | "orderedList";
  items: DseTextNode[][];
};

export type DseDocumentBlock = DseParagraphNode | DseHeadingNode | DseListNode;

export type DseDocumentContent = {
  type: "doc";
  version: 1;
  content: DseDocumentBlock[];
};

const MAX_BLOCKS = 500;
const MAX_LIST_ITEMS = 500;
const MAX_TEXT_LENGTH = 100_000;
const MAX_LINK_LENGTH = 2_048;

export const EMPTY_DSE_DOCUMENT: DseDocumentContent = {
  type: "doc",
  version: 1,
  content: [{ type: "paragraph", content: [] }],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeLink(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_LINK_LENGTH);
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed, "https://dse.invalid");
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return trimmed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function sanitizeMarks(value: unknown): DseTextMarks | undefined {
  if (!isRecord(value)) return undefined;
  const marks: DseTextMarks = {};
  if (value.bold === true) marks.bold = true;
  if (value.italic === true) marks.italic = true;
  if (value.underline === true) marks.underline = true;
  const link = sanitizeLink(value.link);
  if (link) marks.link = link;
  return Object.keys(marks).length > 0 ? marks : undefined;
}

function sanitizeTextNode(value: unknown, remaining: { chars: number }): DseTextNode | null {
  if (!isRecord(value) || value.type !== "text" || typeof value.text !== "string") return null;
  if (remaining.chars <= 0) return null;
  const text = value.text.slice(0, remaining.chars);
  remaining.chars -= text.length;
  return { type: "text", text, marks: sanitizeMarks(value.marks) };
}

function sanitizeTextNodes(value: unknown, remaining: { chars: number }): DseTextNode[] {
  if (!Array.isArray(value)) return [];
  const nodes: DseTextNode[] = [];
  for (const item of value) {
    const node = sanitizeTextNode(item, remaining);
    if (node) nodes.push(node);
    if (remaining.chars <= 0) break;
  }
  return nodes;
}

function sanitizeAlign(value: unknown): DseTextAlign | undefined {
  return value === "left" || value === "center" || value === "right" || value === "justify"
    ? value
    : undefined;
}

export function sanitizeDocumentContent(value: unknown): DseDocumentContent {
  if (!isRecord(value) || value.type !== "doc" || value.version !== 1 || !Array.isArray(value.content)) {
    return EMPTY_DSE_DOCUMENT;
  }

  const remaining = { chars: MAX_TEXT_LENGTH };
  const blocks: DseDocumentBlock[] = [];

  for (const rawBlock of value.content.slice(0, MAX_BLOCKS)) {
    if (!isRecord(rawBlock)) continue;

    if (rawBlock.type === "paragraph") {
      blocks.push({
        type: "paragraph",
        align: sanitizeAlign(rawBlock.align),
        content: sanitizeTextNodes(rawBlock.content, remaining),
      });
    } else if (rawBlock.type === "heading") {
      const level = rawBlock.level === 1 || rawBlock.level === 2 || rawBlock.level === 3 ? rawBlock.level : 2;
      blocks.push({
        type: "heading",
        level,
        align: sanitizeAlign(rawBlock.align),
        content: sanitizeTextNodes(rawBlock.content, remaining),
      });
    } else if (rawBlock.type === "bulletList" || rawBlock.type === "orderedList") {
      const items: DseTextNode[][] = [];
      if (Array.isArray(rawBlock.items)) {
        for (const rawItem of rawBlock.items.slice(0, MAX_LIST_ITEMS)) {
          items.push(sanitizeTextNodes(rawItem, remaining));
          if (remaining.chars <= 0) break;
        }
      }
      blocks.push({ type: rawBlock.type, items });
    }

    if (remaining.chars <= 0) break;
  }

  return {
    type: "doc",
    version: 1,
    content: blocks.length > 0 ? blocks : [{ type: "paragraph", content: [] }],
  };
}

export function legacyTextToDocumentContent(value: string): DseDocumentContent {
  const normalized = value.replace(/\r\n/g, "\n").slice(0, MAX_TEXT_LENGTH);
  if (!normalized.trim()) return EMPTY_DSE_DOCUMENT;

  const paragraphs = normalized.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  return {
    type: "doc",
    version: 1,
    content: paragraphs.map((paragraph) => ({
      type: "paragraph" as const,
      content: [{ type: "text" as const, text: paragraph.replace(/\n/g, " ") }],
    })),
  };
}

export function parseStoredDocumentContent(value: string | null | undefined): DseDocumentContent {
  if (!value) return EMPTY_DSE_DOCUMENT;
  if (!value.startsWith(DSE_DOCUMENT_PREFIX)) return legacyTextToDocumentContent(value);

  try {
    return sanitizeDocumentContent(JSON.parse(value.slice(DSE_DOCUMENT_PREFIX.length)));
  } catch {
    return EMPTY_DSE_DOCUMENT;
  }
}

export function serializeDocumentContent(value: DseDocumentContent): string {
  return `${DSE_DOCUMENT_PREFIX}${JSON.stringify(sanitizeDocumentContent(value))}`;
}

function textNodesToPlainText(nodes: DseTextNode[]): string {
  return nodes.map((node) => node.text).join("");
}

export function documentContentToPlainText(value: DseDocumentContent): string {
  const lines: string[] = [];
  for (const block of sanitizeDocumentContent(value).content) {
    if (block.type === "paragraph" || block.type === "heading") {
      lines.push(textNodesToPlainText(block.content));
    } else {
      for (const item of block.items) lines.push(textNodesToPlainText(item));
    }
  }
  return lines.join("\n").trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textNodeToHtml(node: DseTextNode): string {
  let html = escapeHtml(node.text);
  if (node.marks?.bold) html = `<strong>${html}</strong>`;
  if (node.marks?.italic) html = `<em>${html}</em>`;
  if (node.marks?.underline) html = `<u>${html}</u>`;
  if (node.marks?.link) {
    html = `<a href="${escapeHtml(node.marks.link)}" rel="noopener noreferrer">${html}</a>`;
  }
  return html;
}

function textNodesToHtml(nodes: DseTextNode[]): string {
  return nodes.map(textNodeToHtml).join("");
}

export function documentContentToEditorHtml(value: DseDocumentContent): string {
  return sanitizeDocumentContent(value).content
    .map((block) => {
      if (block.type === "paragraph") {
        const style = block.align ? ` style="text-align:${block.align}"` : "";
        return `<p${style}>${textNodesToHtml(block.content) || "<br>"}</p>`;
      }
      if (block.type === "heading") {
        const style = block.align ? ` style="text-align:${block.align}"` : "";
        return `<h${block.level}${style}>${textNodesToHtml(block.content) || "<br>"}</h${block.level}>`;
      }
      const tag = block.type === "orderedList" ? "ol" : "ul";
      return `<${tag}>${block.items.map((item) => `<li>${textNodesToHtml(item)}</li>`).join("")}</${tag}>`;
    })
    .join("");
}
