import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  MAX_PERMISSION_DOCUMENT_BYTES,
  PermissionDocumentValidationError,
  validatePermissionDocument,
} from "./permission-document-file.ts";

const pdf = Buffer.from("%PDF-1.7\nTest");
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);

describe("Student permission letter content validation", () => {
  test("accepts small PDF with Khmer/display filename without using it as storage path", () => {
    const result = validatePermissionDocument(encodeURIComponent("លិខិតអនុញ្ញាត.pdf"), "application/pdf", pdf);
    expect(result.extension).toBe("pdf");
    expect(result.filename).toContain("លិខិត");
  });
  test("accepts JPG and PNG only with matching header, MIME and suffix", () => {
    expect(validatePermissionDocument("letter.jpeg", "image/jpeg", jpg).extension).toBe("jpg");
    expect(validatePermissionDocument("letter.png", "image/png", png).extension).toBe("png");
  });
  test("rejects forged MIME, mismatched extension, paths and malformed headers", () => {
    expect(() => validatePermissionDocument("letter.jpg", "application/pdf", pdf)).toThrow(PermissionDocumentValidationError);
    expect(() => validatePermissionDocument("letter.pdf", "application/pdf", jpg)).toThrow();
    expect(() => validatePermissionDocument("..%2Fletter.pdf", "application/pdf", pdf)).toThrow();
    expect(() => validatePermissionDocument("%E0%ZZ", "application/pdf", pdf)).toThrow();
    expect(() => validatePermissionDocument("letter.html", "text/html", pdf)).toThrow();
    expect(() => validatePermissionDocument("letter.png", "image/png", pdf)).toThrow();
  });
  test("rejects empty, overly large and unparsed bodies", () => {
    expect(() => validatePermissionDocument("letter.pdf", "application/pdf", Buffer.alloc(0))).toThrow();
    expect(() => validatePermissionDocument("letter.pdf", "application/pdf", Buffer.alloc(MAX_PERMISSION_DOCUMENT_BYTES + 1))).toThrow();
    expect(() => validatePermissionDocument("letter.pdf", "application/pdf", "not a buffer")).toThrow();
  });
});

const routes = readFileSync(new URL("./permission-document-router.ts", import.meta.url), "utf8");
describe("Private permission document authorization constraints", () => {
  test("student upload checks exact active enrollment and canonical unresolved pending", () => {
    expect(routes).toContain("student.status !== \"Active\"");
    expect(routes).toContain("offeringId_studentId");
    expect(routes).toContain("p.\"resolvedAt\" IS NULL");
    expect(routes).toContain("requirePermission(\"student-portal:read\")");
  });
  test("staff downloads require scoped access and short-lived signed URLs", () => {
    expect(routes).toContain("hasAnyRoleInProgramme");
    expect(routes).toContain("scope.coLecturerIds.includes");
    expect(routes).toContain("createSignedUrl(doc.storagePath, 60");
    expect(routes).not.toContain("getPublicUrl(");
  });
  test("document route does not save or recheck attendance status", () => {
    expect(routes).not.toContain("attendanceService.save(");
    expect(routes).not.toContain("attendanceRecheckService.recheck(");
  });
});
