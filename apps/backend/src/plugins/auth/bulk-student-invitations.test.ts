import { describe, expect, test } from "bun:test";
import {
  bulkStudentInviteCandidate,
  runBulkStudentInvitationBatch,
  type BulkStudentInviteCandidate,
} from "./bulk-student-invitations.ts";
import { ProvisioningError } from "./service.ts";

const candidates: BulkStudentInviteCandidate[] = [
  { id: "student-a", name: "Student A", email: "a@example.edu" },
  { id: "student-b", name: "Student B", email: "b@example.edu" },
  { id: "student-c", name: "Student C", email: "c@example.edu" },
  { id: "student-d", name: "Student D", email: "d@example.edu" },
];

describe("bulk Student Portal invitations", () => {
  test("pre-filters to Active students with email and no linked portal User", () => {
    expect(bulkStudentInviteCandidate({
      id: "eligible",
      name: "Eligible Student",
      email: "eligible@example.edu",
      status: "Active",
      userId: null,
    })).toEqual({
      id: "eligible",
      name: "Eligible Student",
      email: "eligible@example.edu",
    });

    expect(bulkStudentInviteCandidate({
      id: "inactive",
      name: "Inactive Student",
      email: "inactive@example.edu",
      status: "Inactive",
      userId: null,
    })).toBeNull();
    expect(bulkStudentInviteCandidate({
      id: "missing-email",
      name: "Missing Email",
      email: null,
      status: "Active",
      userId: null,
    })).toBeNull();
    expect(bulkStudentInviteCandidate({
      id: "linked",
      name: "Linked Student",
      email: "linked@example.edu",
      status: "Active",
      userId: "11111111-1111-4111-8111-111111111111",
    })).toBeNull();
  });

  test("counts expected per-student provisioning failures and continues safely", async () => {
    const attempted: string[] = [];
    const result = await runBulkStudentInvitationBatch(candidates, async (candidate) => {
      attempted.push(candidate.id);
      if (candidate.id === "student-b") {
        throw new ProvisioningError("Provider rejected this invitation");
      }
    }, 2);

    expect(new Set(attempted)).toEqual(new Set(candidates.map((candidate) => candidate.id)));
    expect(result).toEqual({ invited: 3, failed: 1 });
  });

  test("never exceeds the configured invitation concurrency", async () => {
    let active = 0;
    let maxActive = 0;

    const result = await runBulkStudentInvitationBatch(candidates, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    }, 2);

    expect(result).toEqual({ invited: 4, failed: 0 });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  test("stops scheduling new invitations after an unexpected local failure", async () => {
    const attempted: string[] = [];

    await expect(runBulkStudentInvitationBatch(candidates, async (candidate) => {
      attempted.push(candidate.id);
      if (candidate.id === "student-b") throw new Error("database unavailable");
    }, 1)).rejects.toThrow("database unavailable");

    expect(attempted).toEqual(["student-a", "student-b"]);
  });
});
