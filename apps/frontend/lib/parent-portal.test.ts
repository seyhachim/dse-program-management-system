import { describe, expect, test } from "bun:test";
import { academicStatusLabel, guardianScopeLabel, relationshipLabel } from "./parent-portal";

describe("parent portal presentation helpers", () => {
  test("uses parent-facing labels for relationship types", () => {
    expect(relationshipLabel("MOTHER")).toBe("Mother");
    expect(relationshipLabel("FATHER")).toBe("Father");
    expect(relationshipLabel("LEGAL_GUARDIAN")).toBe("Legal guardian");
    expect(relationshipLabel("OTHER_AUTHORIZED_GUARDIAN")).toBe("Authorized guardian");
  });

  test("uses non-internal labels for all guardian access scopes", () => {
    expect(guardianScopeLabel("attendance")).toBe("Attendance");
    expect(guardianScopeLabel("academic_status")).toBe("Academic status");
    expect(guardianScopeLabel("official_results")).toBe("Official results");
    expect(guardianScopeLabel("announcements")).toBe("Programme notices");
    expect(guardianScopeLabel("academic_calendar")).toBe("Academic calendar");
    expect(guardianScopeLabel("support_cases")).toBe("Student support");
    expect(guardianScopeLabel("meeting_requests")).toBe("Meeting requests");
    expect(guardianScopeLabel("parent_feedback")).toBe("Parent feedback");
  });

  test("uses parent-facing academic progress labels", () => {
    expect(academicStatusLabel("ON_TRACK")).toBe("On track");
    expect(academicStatusLabel("NEEDS_ATTENTION")).toBe("Needs attention");
    expect(academicStatusLabel("UNAVAILABLE")).toBe("Not available yet");
  });
});
