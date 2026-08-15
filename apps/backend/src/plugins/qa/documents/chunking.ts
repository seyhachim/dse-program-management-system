import { createHash } from "node:crypto";
import type { z } from "zod";
import type { QaDocumentBlockSchema } from "@dse-pms/shared-types";

type QaDocumentBlock = z.infer<typeof QaDocumentBlockSchema>;

export interface QaDocumentChunkDraft {
  id: string;
  chunkIndex: number;
  pageNumber: number | null;
  sectionLabel: string;
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface QaChunkingOptions {
  maxChars: number;
  overlapChars: number;
}

export const DEFAULT_QA_CHUNKING: QaChunkingOptions = {
  maxChars: 1200,
  overlapChars: 150,
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function qaDocumentContentHash(blocks: QaDocumentBlock[]): string {
  return sha256(
    blocks
      .map((block) => `${block.pageNumber ?? ""}\u0000${block.sectionLabel}\u0000${block.text}`)
      .join("\u0001"),
  );
}

function pickEnd(text: string, start: number, maxChars: number): number {
  const hardEnd = Math.min(text.length, start + maxChars);
  if (hardEnd >= text.length) return text.length;

  const minimumUsefulEnd = start + Math.floor(maxChars * 0.6);
  for (let index = hardEnd; index >= minimumUsefulEnd; index -= 1) {
    if (/\s/.test(text[index] ?? "")) return index;
  }
  return hardEnd;
}

export function chunkQaDocument(
  documentId: string,
  blocks: QaDocumentBlock[],
  options: QaChunkingOptions = DEFAULT_QA_CHUNKING,
): QaDocumentChunkDraft[] {
  if (options.maxChars < 200) throw new Error("QA chunk maxChars must be at least 200");
  if (options.overlapChars < 0 || options.overlapChars >= options.maxChars) {
    throw new Error("QA chunk overlap must be non-negative and smaller than maxChars");
  }

  const chunks: QaDocumentChunkDraft[] = [];
  for (const block of blocks) {
    let start = 0;
    while (start < block.text.length) {
      while (start < block.text.length && /\s/.test(block.text[start] ?? "")) start += 1;
      if (start >= block.text.length) break;

      const end = pickEnd(block.text, start, options.maxChars);
      const text = block.text.slice(start, end).trim();
      if (text.length > 0) {
        const chunkIndex = chunks.length;
        const digest = sha256(
          `${block.pageNumber ?? ""}\u0000${block.sectionLabel}\u0000${start}\u0000${end}\u0000${text}`,
        ).slice(0, 16);
        chunks.push({
          id: `${documentId}:chunk:${chunkIndex}:${digest}`,
          chunkIndex,
          pageNumber: block.pageNumber ?? null,
          sectionLabel: block.sectionLabel,
          startOffset: start,
          endOffset: end,
          text,
        });
      }

      if (end >= block.text.length) break;
      const next = Math.max(start + 1, end - options.overlapChars);
      start = next;
    }
  }
  return chunks;
}
