import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import type { AuthUser, Role } from "../core/auth/token.ts";
import { signToken } from "../core/auth/token.ts";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";

const runIntegration = process.env.BACKEND_INTEGRATION_TESTS === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;
const TEST_SECRET = "final-project-integration-secret-at-least-32-characters";

type HttpResult = { status: number; body: unknown };
type ProfileResponse = {
  id: string;
  lecturer: { id: string; name: string };
  capacity: number;
  currentLoad: number;
  availableSlots: number;
  acceptingStudents: boolean;
  isPublished: boolean;
  tracks: Array<{ title: string; ideas: Array<{ title: string }> }>;
};

integrationDescribe("final project supervisor discovery authorization", () => {
  let server: Server;
  let baseUrl = "";
  let lecturer: AuthUser;
  let coordinator: AuthUser;
  let student: AuthUser;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = TEST_SECRET;
    [lecturer, coordinator, student] = await Promise.all([
      loadAuthUser("lecturer@dse.dev"),
      loadAuthUser("coordinator@dse.dev"),
      loadAuthUser("student@dse.dev"),
    ]);

    const app: Express = createApp();
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await prisma.$disconnect();
  });

  test("lecturer ownership, publication boundary, programme scope, and audit immutability hold end to end", async () => {
    const studentWrite = await request("/api/final-project/me", {
      method: "PUT",
      token: signToken(student),
      body: supervisorInput(true),
    });
    expect(studentWrite.status).toBe(403);

    const crossProgrammeLecturer: AuthUser = {
      ...lecturer,
      programmeRoles: [{ role: "lecturer", programmeId: "other-programme" }],
    };
    const crossProgrammeWrite = await request("/api/final-project/me", {
      method: "PUT",
      token: signToken(crossProgrammeLecturer),
      body: supervisorInput(true),
    });
    expect(crossProgrammeWrite.status).toBe(403);

    const saved = await request("/api/final-project/me", {
      method: "PUT",
      token: signToken(lecturer),
      body: supervisorInput(true),
    });
    expect(saved.status).toBe(200);
    const profile = saved.body as ProfileResponse;
    expect(profile.lecturer.id).toBe(lecturer.id);
    expect(profile.isPublished).toBe(true);
    expect(profile.capacity).toBe(3);
    expect(profile.availableSlots).toBe(3);
    expect(profile.tracks[0]?.title).toBe("AI for Agriculture");

    const discovery = await request("/api/final-project/discovery", {
      token: signToken(student),
    });
    expect(discovery.status).toBe(200);
    const published = discovery.body as ProfileResponse[];
    expect(published.some((entry) => entry.lecturer.id === lecturer.id)).toBe(true);

    const hidden = await request("/api/final-project/me", {
      method: "PUT",
      token: signToken(lecturer),
      body: supervisorInput(false),
    });
    expect(hidden.status).toBe(200);
    const discoveryAfterUnpublish = await request("/api/final-project/discovery", {
      token: signToken(student),
    });
    expect((discoveryAfterUnpublish.body as ProfileResponse[]).some(
      (entry) => entry.lecturer.id === lecturer.id,
    )).toBe(false);

    const studentOverview = await request("/api/final-project/overview", {
      token: signToken(student),
    });
    expect(studentOverview.status).toBe(403);

    const crossProgrammeCoordinator: AuthUser = {
      ...coordinator,
      programmeRoles: [{ role: "program_coordinator", programmeId: "other-programme" }],
    };
    const wrongProgrammeOverview = await request("/api/final-project/overview", {
      token: signToken(crossProgrammeCoordinator),
    });
    expect(wrongProgrammeOverview.status).toBe(403);

    const overview = await request("/api/final-project/overview", {
      token: signToken(coordinator),
    });
    expect(overview.status).toBe(200);
    expect((overview.body as { totalSupervisors: number }).totalSupervisors).toBeGreaterThanOrEqual(1);

    const audit = await prisma.finalProjectSupervisorProfileAudit.findFirstOrThrow({
      where: { actorId: lecturer.id },
      orderBy: { createdAt: "desc" },
    });
    await expectDatabaseRejection(() => prisma.$executeRaw`
      UPDATE "FinalProjectSupervisorProfileAudit"
      SET "action" = 'Tampered'
      WHERE "id" = ${audit.id}::uuid
    `);
    await expectDatabaseRejection(() => prisma.$executeRaw`
      DELETE FROM "FinalProjectSupervisorProfileAudit"
      WHERE "id" = ${audit.id}::uuid
    `);
  });

  async function request(
    path: string,
    options: { method?: string; token?: string; body?: unknown } = {},
  ): Promise<HttpResult> {
    const headers = new Headers();
    if (options.token) headers.set("authorization", `Bearer ${options.token}`);
    if (options.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
});

function supervisorInput(isPublished: boolean) {
  return {
    statement: "Applied AI supervision with regular check-ins and direct feedback.",
    capacity: 3,
    acceptingStudents: true,
    isPublished,
    tracks: [
      {
        title: "AI for Agriculture",
        description: "Machine learning and data systems for agricultural problems.",
        ideas: [
          {
            title: "Crop condition monitoring",
            summary: "Combine environmental and plant observations for useful predictions.",
            skills: ["Python", "Machine Learning"],
          },
        ],
      },
    ],
  };
}

async function loadAuthUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roleAssignments: { include: { role: true } } },
  });
  const roles = user.roleAssignments.map((assignment) => assignment.role.slug as Role);
  if (roles.length === 0) throw new Error(`Seeded integration user ${email} has no roles`);
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

async function expectDatabaseRejection(operation: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}
