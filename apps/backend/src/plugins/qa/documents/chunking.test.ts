import { expect, test } from "bun:test";
import { chunkQaDocument, qaDocumentContentHash } from "./chunking.ts";

const blocks = [
  {
    text: "A ".repeat(450) + "Important curriculum evidence. " + "B ".repeat(450),
    pageNumber: 3,
    sectionLabel: "Curriculum review",
  },
];

test("QA chunking is deterministic and preserves provenance", () => {
  const first = chunkQaDocument("doc-1", blocks, { maxChars: 400, overlapChars: 50 });
  const second = chunkQaDocument("doc-1", blocks, { maxChars: 400, overlapChars: 50 });

  expect(first.length).toBeGreaterThan(2);
  expect(first.map((chunk) => chunk.id)).toEqual(second.map((chunk) => chunk.id));
  expect(first.every((chunk) => chunk.pageNumber === 3)).toBe(true);
  expect(first.every((chunk) => chunk.sectionLabel === "Curriculum review")).toBe(true);
  expect(first.every((chunk) => chunk.endOffset >= chunk.startOffset)).toBe(true);
});

test("changing document text changes the content hash and affected chunk identity", () => {
  const originalHash = qaDocumentContentHash(blocks);
  const changed = [{ ...blocks[0]!, text: `${blocks[0]!.text} Additional evidence.` }];
  expect(qaDocumentContentHash(changed)).not.toBe(originalHash);

  const originalChunks = chunkQaDocument("doc-1", blocks, { maxChars: 400, overlapChars: 50 });
  const changedChunks = chunkQaDocument("doc-1", changed, { maxChars: 400, overlapChars: 50 });
  expect(changedChunks.at(-1)?.id).not.toBe(originalChunks.at(-1)?.id);
});

test("chunking validates overlap configuration", () => {
  expect(() => chunkQaDocument("doc-1", blocks, { maxChars: 100, overlapChars: 10 })).toThrow();
  expect(() => chunkQaDocument("doc-1", blocks, { maxChars: 400, overlapChars: 400 })).toThrow();
});
