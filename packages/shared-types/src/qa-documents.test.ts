import { expect, test } from "bun:test";
import {
  CreateQaDocumentSchema,
  QaDocumentListQuerySchema,
  QaDocumentTypeSchema,
} from "./index.ts";

const base = {
  programmeId: "dse",
  title: "Curriculum Review Minutes 2026",
  documentType: "minutes" as const,
  sourceUrl: "https://example.edu/qa/minutes",
  sourceRef: "QA-MIN-2026-01",
  version: "1",
  reportingStart: new Date("2026-01-01T00:00:00Z"),
  reportingEnd: new Date("2026-12-31T00:00:00Z"),
  blocks: [{ text: "Industry representatives reviewed the curriculum and recommended updates." }],
};

test("QA document types cover the pilot institutional evidence categories", () => {
  expect(QaDocumentTypeSchema.options).toContain("policy");
  expect(QaDocumentTypeSchema.options).toContain("minutes");
  expect(QaDocumentTypeSchema.options).toContain("survey");
  expect(QaDocumentTypeSchema.options).toContain("report");
  expect(QaDocumentTypeSchema.options).toContain("staffDocument");
});

test("QA document input preserves reporting context and source metadata", () => {
  expect(CreateQaDocumentSchema.safeParse(base).success).toBe(true);
  expect(
    CreateQaDocumentSchema.safeParse({
      ...base,
      reportingStart: new Date("2026-12-31T00:00:00Z"),
      reportingEnd: new Date("2026-01-01T00:00:00Z"),
    }).success,
  ).toBe(false);
});

test("QA document ingestion rejects empty and excessively large content", () => {
  expect(CreateQaDocumentSchema.safeParse({ ...base, blocks: [] }).success).toBe(false);
  expect(
    CreateQaDocumentSchema.safeParse({
      ...base,
      blocks: Array.from({ length: 60 }, () => ({ text: "x".repeat(100_000) })),
    }).success,
  ).toBe(false);
});

test("QA document list query remains programme-scoped", () => {
  expect(QaDocumentListQuerySchema.safeParse({ programmeId: "dse" }).success).toBe(true);
  expect(QaDocumentListQuerySchema.safeParse({ documentType: "policy" }).success).toBe(false);
});
