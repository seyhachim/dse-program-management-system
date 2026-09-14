import { expect, test } from "bun:test";
import { portalAccessPresentation } from "./student-portal-access-status.ts";

test("portal access badges use clear roster labels", () => {
  expect(portalAccessPresentation("not-invited").label).toBe("Not invited");
  expect(portalAccessPresentation("invitation-pending").label).toBe("Invitation pending");
  expect(portalAccessPresentation("active-account").label).toBe("Active account");
  expect(portalAccessPresentation("no-email").label).toBe("No email");
  expect(portalAccessPresentation("inactive-student").label).toBe("Inactive student");
  expect(portalAccessPresentation("needs-attention").label).toBe("Needs attention");
  expect(portalAccessPresentation("status-unavailable").label).toBe("Status unavailable");
});

test("pending and account states use distinct semantic tones", () => {
  expect(portalAccessPresentation("invitation-pending").tone).toBe("warning");
  expect(portalAccessPresentation("active-account").tone).toBe("success");
  expect(portalAccessPresentation("status-unavailable").tone).toBe("danger");
});
