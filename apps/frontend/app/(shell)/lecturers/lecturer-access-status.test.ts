import { expect, test } from "bun:test";
import { lecturerAccessPresentation } from "./lecturer-access-status.ts";

test("lecturer access badges use explicit onboarding states", () => {
  expect(lecturerAccessPresentation("no-access").label).toBe("No access");
  expect(lecturerAccessPresentation("invitation-pending").label).toBe("Invitation pending");
  expect(lecturerAccessPresentation("active-account").label).toBe("Active account");
  expect(lecturerAccessPresentation("needs-attention").label).toBe("Needs attention");
  expect(lecturerAccessPresentation("status-unavailable").label).toBe("Status unavailable");
});

test("pending, active, and fail-closed states use distinct tones", () => {
  expect(lecturerAccessPresentation("invitation-pending").tone).toBe("warning");
  expect(lecturerAccessPresentation("active-account").tone).toBe("success");
  expect(lecturerAccessPresentation("needs-attention").tone).toBe("danger");
  expect(lecturerAccessPresentation("status-unavailable").tone).toBe("danger");
});
