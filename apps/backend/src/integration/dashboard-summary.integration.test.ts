import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import {
  DashboardSummarySchema,
  OFFERING_STATUSES,
  STUDENT_STATUSES,
  type DashboardSummary,
} from "@dse-pms/shared-types";
import { createApp } from "../core/app.ts";
import { signToken, type AuthUser, type Role } from "../core/auth/token.ts";
import { prisma } from "../core/db/prisma.ts";

const runIntegration = process.env.BACKEND_INTEGRATION_TESTS === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;
const TEST_SECRET =
  "issue-739-dashboard-summary-integration-secret-at-least-32-characters";

type HttpResult = {
  status: number;
  body: unknown;
  bytes: number;
  wallMs: number;
};

integrationDescribe("Dashboard compact summary", () => {
  let appServer: Server;
  let baseUrl = "";
  let admin: AuthUser;
  let coordinator: AuthUser;
  let secretary: AuthUser;
  let qaReviewer: AuthUser;
  let lecturer: AuthUser;
  let student: AuthUser;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = TEST_SECRET;

    [admin, coordinator, secretary, qaReviewer, lecturer, student] =
      await Promise.all([
        loadAuthUser("admin@dse.dev"),
        loadAuthUser("coordinator@dse.dev"),
        loadAuthUser("secretary@dse.dev"),
        loadAuthUser("qa@dse.dev"),
        loadAuthUser("lecturer@dse.dev"),
        loadAuthUser("student@dse.dev"),
      ]);

    const app: Express = createApp();
    appServer = app.listen(0, "127.0.0.1");
    await once(appServer, "listening");
    const address = appServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await closeServer(appServer);
    await prisma.$disconnect();
  });

  test("requires the same DSE programme-management roles as the Dashboard route", async () => {
    expect((await request("/api/dashboard/summary")).status).toBe(401);

    for (const user of [admin, coordinator, secretary]) {
      expect(
        (await request("/api/dashboard/summary", signToken(user))).status,
      ).toBe(200);
    }

    for (const user of [qaReviewer, lecturer, student]) {
      expect(
        (await request("/api/dashboard/summary", signToken(user))).status,
      ).toBe(403);
    }

    const otherProgrammeCoordinator: AuthUser = {
      ...coordinator,
      programmeRoles: [
        { role: "program_coordinator", programmeId: "other-programme" },
      ],
    };
    expect(
      (
        await request(
          "/api/dashboard/summary",
          signToken(otherProgrammeCoordinator),
        )
      ).status,
    ).toBe(403);
  });

  test("matches authoritative aggregate counts without exposing detail records", async () => {
    const response = await request("/api/dashboard/summary", signToken(admin));
    expect(response.status).toBe(200);
    const summary = DashboardSummarySchema.parse(response.body);

    expect(summary.students.status).toBe("ok");
    expect(summary.courses.status).toBe("ok");
    expect(summary.offerings.status).toBe("ok");
    expect(summary.lecturers.status).toBe("ok");

    const [studentRows, courseCount, offeringRows, enrollmentCount, lecturerCount] =
      await Promise.all([
        prisma.student.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.course.count(),
        prisma.offering.groupBy({
          by: ["status"],
          _count: { _all: true },
          _sum: { capacity: true },
        }),
        prisma.enrollment.count(),
        prisma.user.count({
          where: {
            roleAssignments: { some: { role: { slug: "lecturer" } } },
          },
        }),
      ]);

    if (
      summary.students.status !== "ok" ||
      summary.courses.status !== "ok" ||
      summary.offerings.status !== "ok" ||
      summary.lecturers.status !== "ok"
    ) {
      throw new Error("Seeded dashboard sources unexpectedly unavailable");
    }

    const studentCounts = new Map(
      studentRows.map((row) => [row.status, row._count._all]),
    );
    expect(summary.students.data.total).toBe(
      studentRows.reduce((sum, row) => sum + row._count._all, 0),
    );
    expect(summary.students.data.byStatus).toEqual(
      STUDENT_STATUSES.map((status) => ({
        status,
        count: studentCounts.get(status) ?? 0,
      })),
    );

    expect(summary.courses.data.total).toBe(courseCount);
    expect(summary.courses.data.specProgress).toHaveLength(courseCount);

    const offeringCounts = new Map(
      offeringRows.map((row) => [row.status, row._count._all]),
    );
    expect(summary.offerings.data.total).toBe(
      offeringRows.reduce((sum, row) => sum + row._count._all, 0),
    );
    expect(summary.offerings.data.byStatus).toEqual(
      OFFERING_STATUSES.map((status) => ({
        status,
        count: offeringCounts.get(status) ?? 0,
      })),
    );
    expect(summary.offerings.data.totalEnrolled).toBe(enrollmentCount);
    expect(summary.offerings.data.totalCapacity).toBe(
      offeringRows.reduce(
        (sum, row) => sum + (row._sum.capacity ?? 0),
        0,
      ),
    );
    expect(summary.lecturers.data.total).toBe(lecturerCount);

    const serialized = JSON.stringify(summary);
    for (const forbidden of [
      "profile",
      "email",
      "phone",
      "qualification",
      "meetings",
      "coLecturers",
      "incompleteSections",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("reduces the Dashboard cold-read request count from five to one and the seeded payload size", async () => {
    const token = signToken(admin);
    const legacyPaths = [
      "/api/students",
      "/api/courses",
      "/api/offerings",
      "/api/lecturers",
      "/api/courses/spec-progress",
    ];

    const legacyStarted = performance.now();
    const legacy = await Promise.all(
      legacyPaths.map((path) => request(path, token)),
    );
    const legacyWallMs = performance.now() - legacyStarted;
    for (const result of legacy) expect(result.status).toBe(200);

    const summaryResult = await request("/api/dashboard/summary", token);
    expect(summaryResult.status).toBe(200);
    const summary = DashboardSummarySchema.parse(
      summaryResult.body,
    ) as DashboardSummary;
    expect(summary.generatedAt).toBeTruthy();

    const legacyBytes = legacy.reduce((sum, result) => sum + result.bytes, 0);
    expect(summaryResult.bytes).toBeLessThan(legacyBytes);

    console.info(
      `[dashboard-perf] legacyRequests=5 legacyBytes=${legacyBytes} legacyWallMs=${legacyWallMs.toFixed(1)} summaryRequests=1 summaryBytes=${summaryResult.bytes} summaryWallMs=${summaryResult.wallMs.toFixed(1)}`,
    );
  });

  async function request(path: string, token?: string): Promise<HttpResult> {
    const headers = new Headers();
    if (token) headers.set("authorization", `Bearer ${token}`);
    const started = performance.now();
    const response = await fetch(`${baseUrl}${path}`, { headers });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
      bytes: new TextEncoder().encode(text).byteLength,
      wallMs: performance.now() - started,
    };
  }
});

async function loadAuthUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roleAssignments: { include: { role: true } } },
  });
  const roles = user.roleAssignments.map(
    (assignment) => assignment.role.slug as Role,
  );
  if (roles.length === 0) {
    throw new Error(`Seeded integration user ${email} has no roles`);
  }
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

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
