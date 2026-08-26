import type { QaSarBlock, QaSarDocument } from "@dse-pms/shared-types";
import {
  EMPTY_DSE_DOCUMENT,
  parseStoredDocumentContent,
  sanitizeDocumentContent,
  serializeDocumentContent,
  type DseDocumentBlock,
  type DseDocumentContent,
} from "@/lib/document-content";

export type QaSarEditorBlock =
  | { id: string; type: "richText"; document: DseDocumentContent }
  | Extract<QaSarBlock, { type: "evidenceReference" | "pmsData" }>;

function textNode(text: string) {
  return { type: "text" as const, text };
}

function appendLegacyBlock(target: DseDocumentBlock[], block: Exclude<QaSarBlock, { type: "richText" | "evidenceReference" | "pmsData" }>) {
  if (block.type === "paragraph") {
    target.push({ type: "paragraph", content: block.text ? [textNode(block.text)] : [] });
    return;
  }
  if (block.type === "heading") {
    target.push({ type: "heading", level: block.level, content: block.text ? [textNode(block.text)] : [] });
    return;
  }

  const previous = target.at(-1);
  if (previous?.type === "bulletList") {
    previous.items.push(block.text ? [textNode(block.text)] : []);
  } else {
    target.push({ type: "bulletList", items: [block.text ? [textNode(block.text)] : []] });
  }
}

export function qaSarDocumentToEditorBlocks(document: QaSarDocument): QaSarEditorBlock[] {
  const result: QaSarEditorBlock[] = [];
  let narrative: DseDocumentBlock[] = [];
  let narrativeId: string | null = null;

  const flushNarrative = () => {
    if (!narrativeId && narrative.length === 0) return;
    result.push({
      id: narrativeId ?? crypto.randomUUID(),
      type: "richText",
      document: sanitizeDocumentContent({
        type: "doc",
        version: 1,
        content: narrative.length ? narrative : EMPTY_DSE_DOCUMENT.content,
      }),
    });
    narrative = [];
    narrativeId = null;
  };

  for (const block of document.blocks) {
    if (block.type === "evidenceReference" || block.type === "pmsData") {
      flushNarrative();
      result.push(block);
      continue;
    }

    narrativeId ??= block.id;
    if (block.type === "richText") {
      narrative.push(...parseStoredDocumentContent(block.content).content);
    } else {
      appendLegacyBlock(narrative, block);
    }
  }
  flushNarrative();

  return result.length
    ? result
    : [{ id: crypto.randomUUID(), type: "richText", document: EMPTY_DSE_DOCUMENT }];
}

export function qaSarEditorBlocksToDocument(blocks: QaSarEditorBlock[]): QaSarDocument {
  return {
    version: 1,
    blocks: blocks.map((block): QaSarBlock =>
      block.type === "richText"
        ? { id: block.id, type: "richText", content: serializeDocumentContent(block.document) }
        : block,
    ),
  };
}

export function newQaSarRichTextBlock(): QaSarEditorBlock {
  return { id: crypto.randomUUID(), type: "richText", document: EMPTY_DSE_DOCUMENT };
}
