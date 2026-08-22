import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import type { AuthUser, Role } from "../../core/auth/token.ts";
import { signToken } from "../../core/auth/token.ts";
import { createApp } from "../../core/app.ts";
import { prisma } from "../../core/db/prisma.ts";

const enabled = process.env.COHORT_PROGRESSION_DB_TESTS === "1";
const suite = enabled ? describe : describe.skip;
const TEST_SECRET = "issue-542-promotion-auth-secret-at-least-32-chars";
const COHORTS_API = "/api/students/cohorts";

suite("cohort promotion authorization", () => {
  let server: Server;
  let baseUrl = "";
  let users: Record<"admin" | "coordinator" | "secretary" | "lecturer" | "student", AuthUser>;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = TEST_SECRET;
    const [admin, coordinator, secretary, lecturer, student] = await Promise.all([
      loadAuthUser("admin@dse.dev"),
      loadAuthUser("coordinator@dse.dev"),
      loadAuthUser("secretary@dse.dev"),
      loadAuthUser("lecturer@dse.dev"),
      loadAuthUser("student@dse.dev"),
    ]);
    users = { admin, coordinator, secretary, lecturer, student };

    const app: Express = createApp();
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await prisma.$disconnect();
  });

  test("Admin and Programme Coordinator may reach apply while non-decision roles are denied", async () => {
    const cohortId = "00000000-0000-4000-8000-000000000542";
    const body = {
      sourceProgrammeYear: 1,
      targetProgrammeYear: 2,
      academicYear: "2026-2027",
      term: "Year end",
      periodStart: "2026-09-01",
      periodEnd: "2027-06-30",
      decisions: [{
        membershipId: "00000000-0000-4000-8000-000000000543",
        status: "Progressed",
        note: "Authorization probe",
      }],
    };

    for (const actor of [users.admin, users.coordinator]) {
      const response = await request(`${COHORTS_API}/${cohortId}/promotion/apply`, actor, body);
      expect(response.status).toBe(404);
      expect(response.error).toContain("Cohort not found");
    }

    for (const actor of [users.secretary, users.lecturer, users.student]) {
      const response = await request(`${COHORTS_API}/${cohortId}/promotion/apply`, actor, body);
      expect(response.status).toBe(403);
      expect(response.error).toContain("programme:write");
    }
  });

  async function request(path: string, actor: AuthUser, body: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${signToken(actor)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let error = "";
    if (text) {
      try {
        const json = JSON.parse(text) as { error?: unknown };
        error = json.error === undefined ? "" : String(json.error);
      } catch {
        error = text;
      }
    }
    return { status: response.status, error };
  }
});

async function loadAuthUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roleAssignments: { include: { role: true } } },
  });
  const roles = user.roleAssignments.map((assignment) => assignment.role.slug as Role);
  if (roles.length === 0) throw new Error(`Seeded user ${email} has no roles`);
  return {
    id: user.id,
    email: user.email,
    roles,
    programmeRoles: user.roleAssignments.map((assignment) => ({
      role: assignment.role.slug as Role,
      programmeId: assignment.programmeId,
    })),
  };
}
