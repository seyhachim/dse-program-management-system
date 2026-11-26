import { describe, expect, test } from "bun:test";
import { MAX_EVIDENCE_BYTES, parseEvidenceAttachment, publicAttachment, storeEvidenceFile, validateEvidenceFile } from "./assessment-evidence-storage.ts";
const pdf = Buffer.from("%PDF-1.4\nsynthetic fixture");
const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
const jpg = Buffer.from([255,216,255,0,0,0,0,0]);
describe("private assessment evidence files", () => {
  test("accepts only matching filename, MIME and signature", () => {
    expect(validateEvidenceFile("marked%20work.pdf", "application/pdf", pdf).filename).toBe("marked work.pdf");
    expect(validateEvidenceFile("work.png", "image/png", png).extension).toBe("png");
    expect(validateEvidenceFile("work.jpeg", "image/jpeg", jpg).extension).toBe("jpg");
    expect(() => validateEvidenceFile("work.pdf", "application/pdf", png)).toThrow();
    expect(() => validateEvidenceFile("work.png", "image/png", pdf)).toThrow();
    expect(() => validateEvidenceFile("work.svg", "image/svg+xml", pdf)).toThrow();
  });
  test("rejects unsafe filenames, missing bodies and oversized files", () => {
    for (const name of ["../work.pdf", "..%2Fwork.pdf", "a%00.pdf", "%", "a%5Cb.pdf", "x".repeat(181)+".pdf"])
      expect(() => validateEvidenceFile(name, "application/pdf", pdf)).toThrow();
    expect(() => validateEvidenceFile("work.pdf", "application/pdf", "not raw bytes")).toThrow();
    expect(() => validateEvidenceFile("work.pdf", "application/pdf", Buffer.alloc(MAX_EVIDENCE_BYTES + 1))).toThrow();
  });
  test("metadata projection never exposes storage path", () => {
    const attachment = { objectKey: "v1/12345678-1234-1234-1234-123456789012.pdf", filename: "sample.pdf", mimeType: "application/pdf", sizeBytes: 20, sha256: "a".repeat(64) };
    expect(parseEvidenceAttachment(attachment)).toEqual(attachment);
    expect(publicAttachment(attachment)).toEqual({ filename: "sample.pdf", mimeType: "application/pdf", sizeBytes: 20, sha256: "a".repeat(64) });
    expect(parseEvidenceAttachment({ ...attachment, objectKey: "../other.pdf" })).toBeNull();
    expect(parseEvidenceAttachment({ ...attachment, sizeBytes: MAX_EVIDENCE_BYTES + 1 })).toBeNull();
  });
  test("fails closed without explicit scanner and storage readiness", async () => {
    const original = process.env.ASSESSMENT_EVIDENCE_UPLOADS_ENABLED;
    try {
      process.env.ASSESSMENT_EVIDENCE_UPLOADS_ENABLED = "false";
      await expect(storeEvidenceFile(validateEvidenceFile("sample.pdf", "application/pdf", pdf))).rejects.toThrow("not configured");
    } finally {
      if (original === undefined) delete process.env.ASSESSMENT_EVIDENCE_UPLOADS_ENABLED;
      else process.env.ASSESSMENT_EVIDENCE_UPLOADS_ENABLED = original;
    }
  });
});
