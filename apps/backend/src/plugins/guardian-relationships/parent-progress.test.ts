import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("guardian parent progress boundary", () => {
  test("rechecks active relationship and requested scope on every projection", () => {
    const source = readFileSync(new URL("./parent-progress-service.ts", import.meta.url), "utf8");
    expect(source).toContain("guardianRelationshipService.listMine(guardianUserId)");
    expect(source).toContain("item.relationshipId === relationshipId");
    expect(source).toContain("relationship.accessScopes.includes(scope)");
    expect(source).toContain('"FORBIDDEN"');
  });

  test("uses plugin registry for canonical attendance and academic sources", () => {
    const source = readFileSync(new URL("./parent-progress-service.ts", import.meta.url), "utf8");
    expect(source).toContain('registry.get<OfferingsProjectionContract>("offerings")');
    expect(source).toContain('registry.get<StudentPortalProjectionContract>("student-portal")');
    expect(source).toContain('relationship.accessScopes.includes("official_results")');
  });

  test("batches parent attendance health across offerings", () => {
    const source = readFileSync(new URL("./parent-progress-service.ts", import.meta.url), "utf8");
    expect(source).toContain("healthForStudentOfferings(");
    expect(source).not.toContain("healthForStudent(studentId: string, offeringId: string)");
    expect(source).not.toContain("Promise.all(enrollments.map");
  });

  test("API routes validate strict parent-safe DTOs", () => {
    const source = readFileSync(new URL("./router.ts", import.meta.url), "utf8");
    expect(source).toContain("ParentAttendanceSummarySchema.parse(projection)");
    expect(source).toContain("ParentAcademicProgressSummarySchema.parse(projection)");
    expect(source).toContain("/me/relationships/:relationshipId/attendance");
    expect(source).toContain("/me/relationships/:relationshipId/academic-progress");
  });
});
