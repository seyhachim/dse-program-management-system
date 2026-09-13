import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./student-weekly-notes-source-service.ts", import.meta.url),
  "utf8",
);

describe("student weekly notes source privacy", () => {
  test("selects delivery facts without private monitor or leave data", () => {
    expect(source).toContain('delivery."classOccurred"');
    expect(source).toContain('delivery."actualTopic"');
    expect(source).toContain('delivery."learningSummary"');
    expect(source).toContain('lecturer."name"');
    expect(source).not.toContain('delivery."note"');
    expect(source).not.toContain("TeachingLeaveRequest");
    expect(source).not.toContain("AuditEvent");
  });
});
