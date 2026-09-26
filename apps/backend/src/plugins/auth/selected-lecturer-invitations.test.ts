import { describe, expect, test } from "bun:test";
import { ProvisioningError } from "./service.ts";
import { runSelectedLecturerInvitationBatch } from "./selected-lecturer-invitations.ts";

describe("selected lecturer invitations", () => {
  test("processes only explicitly selected lecturer ids", async () => {
    const selected = ["lecturer-b", "lecturer-d"];
    const attempted: string[] = [];

    const result = await runSelectedLecturerInvitationBatch(
      selected,
      async (lecturerId) => {
        attempted.push(lecturerId);
        return lecturerId === "lecturer-b" ? "invited" : "existing-account";
      },
      1,
    );

    expect(attempted).toEqual(selected);
    expect(result).toEqual({
      newlyInvited: 1,
      resent: 0,
      existingAccountSkipped: 1,
      missingLecturerSkipped: 0,
      failed: 0,
    });
  });

  test("counts mixed invitation outcomes without reprovisioning active accounts", async () => {
    const result = await runSelectedLecturerInvitationBatch(
      ["a", "b", "c", "d"],
      async (lecturerId) => {
        if (lecturerId === "a") return "invited";
        if (lecturerId === "b") return "resent";
        if (lecturerId === "c") return "existing-account";
        return "missing-lecturer";
      },
      2,
    );

    expect(result).toEqual({
      newlyInvited: 1,
      resent: 1,
      existingAccountSkipped: 1,
      missingLecturerSkipped: 1,
      failed: 0,
    });
  });

  test("counts expected provisioning failures and continues", async () => {
    const attempted: string[] = [];
    const result = await runSelectedLecturerInvitationBatch(
      ["a", "b", "c"],
      async (lecturerId) => {
        attempted.push(lecturerId);
        if (lecturerId === "b") throw new ProvisioningError("provider refused");
        return "invited";
      },
      1,
    );

    expect(attempted).toEqual(["a", "b", "c"]);
    expect(result).toEqual({
      newlyInvited: 2,
      resent: 0,
      existingAccountSkipped: 0,
      missingLecturerSkipped: 0,
      failed: 1,
    });
  });

  test("stops scheduling after unexpected local failures", async () => {
    const attempted: string[] = [];

    await expect(
      runSelectedLecturerInvitationBatch(
        ["a", "b", "c"],
        async (lecturerId) => {
          attempted.push(lecturerId);
          if (lecturerId === "b") throw new Error("database unavailable");
          return "invited";
        },
        1,
      ),
    ).rejects.toThrow("database unavailable");

    expect(attempted).toEqual(["a", "b"]);
  });

  test("never exceeds configured concurrency", async () => {
    let active = 0;
    let maxActive = 0;

    await runSelectedLecturerInvitationBatch(
      ["a", "b", "c", "d", "e"],
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Bun.sleep(5);
        active -= 1;
        return "invited";
      },
      2,
    );

    expect(maxActive).toBeLessThanOrEqual(2);
  });
});

test("selected lecturer route keeps the accounts:create permission boundary", async () => {
  const source = await Bun.file(new URL("./router.ts", import.meta.url)).text();
  const routeStart = source.indexOf('"/lecturers/invitations/selected"');
  expect(routeStart).toBeGreaterThan(-1);
  const routeSnippet = source.slice(routeStart, routeStart + 1000);
  expect(routeSnippet).toContain('requirePermission("accounts:create")');
  expect(routeSnippet).toContain("SelectedLecturerInvitationRequest.safeParse(req.body)");
});
