import { expect, test } from "bun:test";
import {
  canRepairPortalAccess,
  matchesPortalAccessFilter,
  PORTAL_ACCESS_FILTER_OPTIONS,
  portalAccessPresentation,
  resolvePortalAccessStatus,
} from "./student-portal-access-status.ts";

test("portal access badges use clear roster labels", () => {
  expect(portalAccessPresentation("not-invited").label).toBe("Not invited");
  expect(portalAccessPresentation("invitation-pending").label).toBe("Invitation pending");
  expect(portalAccessPresentation("invitation-expired").label).toBe("Invitation expired");
  expect(portalAccessPresentation("active-account").label).toBe("Active account");
  expect(portalAccessPresentation("no-email").label).toBe("No email");
  expect(portalAccessPresentation("inactive-student").label).toBe("Inactive student");
  expect(portalAccessPresentation("needs-attention").label).toBe("Needs attention");
  expect(portalAccessPresentation("status-unavailable").label).toBe("Status unavailable");
});

test("pending and account states use distinct semantic tones", () => {
  expect(portalAccessPresentation("invitation-pending").tone).toBe("warning");
  expect(portalAccessPresentation("invitation-expired").tone).toBe("danger");
  expect(portalAccessPresentation("active-account").tone).toBe("success");
  expect(portalAccessPresentation("status-unavailable").tone).toBe("danger");
});

test("portal repair is offered only for needs-attention", () => {
  expect(canRepairPortalAccess("needs-attention")).toBe(true);
  expect(canRepairPortalAccess("not-invited")).toBe(false);
  expect(canRepairPortalAccess("invitation-pending")).toBe(false);
  expect(canRepairPortalAccess("invitation-expired")).toBe(false);
  expect(canRepairPortalAccess("active-account")).toBe(false);
  expect(canRepairPortalAccess("no-email")).toBe(false);
  expect(canRepairPortalAccess("inactive-student")).toBe(false);
  expect(canRepairPortalAccess("status-unavailable")).toBe(false);
  expect(canRepairPortalAccess(undefined)).toBe(false);
});

test("portal access filter exposes all live states with clear labels", () => {
  expect(PORTAL_ACCESS_FILTER_OPTIONS).toEqual([
    { value: "all", label: "All portal access" },
    { value: "not-invited", label: "Not invited" },
    { value: "invitation-pending", label: "Invitation pending" },
    { value: "invitation-expired", label: "Invitation expired" },
    { value: "active-account", label: "Active account" },
    { value: "no-email", label: "No email" },
    { value: "inactive-student", label: "Inactive student" },
    { value: "needs-attention", label: "Needs attention" },
    { value: "status-unavailable", label: "Status unavailable" },
  ]);
});

test("portal access filter matches exact status without guessing unknown state", () => {
  expect(matchesPortalAccessFilter("active-account", "all")).toBe(true);
  expect(matchesPortalAccessFilter(undefined, "all")).toBe(true);

  expect(matchesPortalAccessFilter("not-invited", "not-invited")).toBe(true);
  expect(matchesPortalAccessFilter("active-account", "not-invited")).toBe(false);

  expect(matchesPortalAccessFilter("invitation-expired", "invitation-expired")).toBe(true);
  expect(matchesPortalAccessFilter("invitation-pending", "invitation-expired")).toBe(false);

  expect(matchesPortalAccessFilter(undefined, "active-account")).toBe(false);
  expect(matchesPortalAccessFilter("status-unavailable", "status-unavailable")).toBe(true);
});

test("portal access status query failure overrides stale cached state", () => {
  expect(resolvePortalAccessStatus("not-invited", true)).toBe("status-unavailable");
  expect(resolvePortalAccessStatus("active-account", true)).toBe("status-unavailable");
  expect(resolvePortalAccessStatus("active-account", false)).toBe("active-account");
  expect(resolvePortalAccessStatus(undefined, false)).toBeUndefined();
});
