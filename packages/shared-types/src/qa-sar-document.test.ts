import { expect, test } from "bun:test";
import {
  FinalizeQaSarDocumentSchema,
  QaSarDocumentModeSchema,
  QaSarDocumentQuerySchema,
} from "./qa-sar-document.ts";

test("SAR preview exposes only working and official modes", () => {
  expect(QaSarDocumentModeSchema.options).toEqual(["working", "official"]);
  expect(QaSarDocumentModeSchema.safeParse("latestDraft").success).toBe(false);
});

test("SAR document query defaults to working mode", () => {
  const parsed = QaSarDocumentQuerySchema.parse({ programmeId: "dse" });
  expect(parsed.mode).toBe("working");
});

test("official SAR finalization requires programme scope and allows a release title", () => {
  const parsed = FinalizeQaSarDocumentSchema.parse({
    programmeId: "dse",
    title: "DSE AUN-QA Self-Assessment Report 2026",
  });
  expect(parsed.programmeId).toBe("dse");
  expect(parsed.title).toContain("Self-Assessment Report");
});
