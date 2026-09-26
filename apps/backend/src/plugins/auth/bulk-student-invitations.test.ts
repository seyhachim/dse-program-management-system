import { describe, expect, test } from "bun:test";
import {
  runBulkStudentPortalAccessBatch,
  studentPortalAccessPlan,
  type BulkStudentPortalAccessOutcome,
} from "./bulk-student-invitations.ts";
import { ProvisioningError } from "./service.ts";

const studentIds = ["student-a", "student-b", "student-c", "student-d", "student-e"];

describe("bulk Student Portal access", () => {
  test("plans first invite, linked refresh, and ineligible skips safely", () => {
    expect(studentPortalAccessPlan({
      id: "new",
      name: "New Student",
      email: "new@example.edu",
      status: "Active",
      userId: null,
    })).toBe("invite");

    expect(studentPortalAccessPlan({
      id: "linked",
      name: "Linked Student",
      email: "linked@example.edu",
      status: "Active",
      userId: "11111111-1111-4111-8111-111111111111",
    })).toBe("refresh");

    expect(studentPortalAccessPlan({
      id: "inactive",
      name: "Inactive Student",
      email: "inactive@example.edu",
      status: "Inactive",
      userId: null,
    })).toBe("ineligible");

    expect(studentPortalAccessPlan({
      id: "missing-email",
      name: "Missing Email",
      email: null,
      status: "Active",
      userId: null,
    })).toBe("ineligible");
  });

  test("counts new invites, pending resends, existing accounts, skips, and failures", async () => {
    const outcomes = new Map<string, BulkStudentPortalAccessOutcome>([
      ["student-a", "invited"],
      ["student-b", "resent"],
      ["student-c", "existing-account"],
      ["student-d", "ineligible"],
    ]);

    const result = await runBulkStudentPortalAccessBatch(studentIds, async (studentId) => {
      if (studentId === "student-e") {
        throw new ProvisioningError("Provider rejected this invitation");
      }
      return outcomes.get(studentId)!;
    }, 2);

    expect(result).toEqual({
      newlyInvited: 1,
      resent: 1,
      existingAccountSkipped: 1,
      ineligibleSkipped: 1,
      failed: 1,
    });
  });

  test("processes only the explicitly selected student ids", async () => {
    const selected = ["student-b", "student-d"];
    const attempted: string[] = [];
    const result = await runBulkStudentPortalAccessBatch(selected, async (studentId) => {
      attempted.push(studentId);
      return studentId === "student-b" ? "invited" : "existing-account";
    }, 1);

    expect(attempted).toEqual(selected);
    expect(result).toEqual({
      newlyInvited: 1,
      resent: 0,
      existingAccountSkipped: 1,
      ineligibleSkipped: 0,
      failed: 0,
    });
  });

  test("never exceeds the configured portal-delivery concurrency", async () => {
    let active = 0;
    let maxActive = 0;

    const result = await runBulkStudentPortalAccessBatch(studentIds, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return "invited";
    }, 2);

    expect(result).toEqual({
      newlyInvited: studentIds.length,
      resent: 0,
      existingAccountSkipped: 0,
      ineligibleSkipped: 0,
      failed: 0,
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  test("stops scheduling new students after an unexpected local failure", async () => {
    const attempted: string[] = [];

    await expect(runBulkStudentPortalAccessBatch(studentIds, async (studentId) => {
      attempted.push(studentId);
      if (studentId === "student-b") throw new Error("database unavailable");
      return "invited";
    }, 1)).rejects.toThrow("database unavailable");

    expect(attempted).toEqual(["student-a", "student-b"]);
  });
});

test("selected-invitation route keeps the accounts:create permission boundary", async () => {
  const source = await Bun.file(new URL("./router.ts", import.meta.url)).text();
  const routeStart = source.indexOf('"/students/invitations/selected"');
  expect(routeStart).toBeGreaterThan(-1);
  const routeSnippet = source.slice(routeStart, routeStart + 800);
  expect(routeSnippet).toContain('requirePermission("accounts:create")');
  expect(routeSnippet).toContain("SelectedStudentPortalAccessRequest.safeParse(req.body)");
});
