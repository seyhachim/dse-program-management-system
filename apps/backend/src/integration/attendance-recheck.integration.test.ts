import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import { createApp } from "../core/app.ts";
import { signToken, type AuthUser, type Role } from "../core/auth/token.ts";
import { prisma } from "../core/db/prisma.ts";
import { attendanceService } from "../plugins/offerings/attendance-service.ts";

const runIntegration = process.env.BACKEND_INTEGRATION_TESTS === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;

const TEST_SECRET =
  "issue-1092-attendance-recheck-integration-secret-at-least-32-characters";

type HttpResult = {
  status: number;
  body: unknown;
};

integrationDescribe("Attendance individual recheck authorization", () => {
  let appServer: Server;
  let baseUrl = "";
  let lecturer: AuthUser;
  let outsider: AuthUser;
  let coordinator: AuthUser;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = TEST_SECRET;

    [lecturer, outsider, coordinator] = await Promise.all([
      loadAuthUser("lecturer@dse.dev"),
      loadAuthUser("knuth.lecturer@dse.dev"),
      loadAuthUser("coordinator@dse.dev"),
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

  test("only the assigned lecturer or programme-wide role can read/recheck a student", async () => {
    const fixture = await createFixture(lecturer.id);
    const date = "2026-09-13";
    try {
      await attendanceService.save(
        fixture.offeringId,
        date,
        {
          records: [
            {
              studentId: fixture.studentId,
              status: "Present",
              note: "Initial roll",
            },
          ],
        },
        lecturer.id,
      );

      const historyPath = `/api/offerings/${fixture.offeringId}/attendance/students/${fixture.studentId}/history`;
      const recheckPath = `/api/offerings/${fixture.offeringId}/attendance/${date}/recheck`;
      const recheckBody = {
        studentId: fixture.studentId,
        observation: { status: "Present", note: "Second roll" },
        final: { status: "Present", note: "Second roll confirmed" },
      };

      expect((await request(historyPath)).status).toBe(401);
      expect(
        (await request(historyPath, { token: signToken(outsider) })).status,
      ).toBe(403);
      expect(
        (
          await request(recheckPath, {
            method: "POST",
            token: signToken(outsider),
            body: recheckBody,
          })
        ).status,
      ).toBe(403);

      const lecturerHistory = await request(historyPath, {
        token: signToken(lecturer),
      });
      expect(lecturerHistory.status).toBe(200);
      expect(
        (lecturerHistory.body as { studentId: string }).studentId,
      ).toBe(fixture.studentId);

      const rechecked = await request(recheckPath, {
        method: "POST",
        token: signToken(lecturer),
        body: recheckBody,
      });
      expect(rechecked.status).toBe(200);
      const record = (
        rechecked.body as {
          records: Array<{
            studentId: string;
            checkpoints?: Array<{ checkNumber: number }>;
          }>;
        }
      ).records.find((row) => row.studentId === fixture.studentId);
      expect(record?.checkpoints?.map((checkpoint) => checkpoint.checkNumber)).toEqual([
        1,
        2,
      ]);

      const coordinatorHistory = await request(historyPath, {
        token: signToken(coordinator),
      });
      expect(coordinatorHistory.status).toBe(200);
    } finally {
      await deleteFixture(fixture);
    }
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

async function createFixture(lecturerId: string) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const course = await prisma.course.create({
    data: {
      code: `I1092-${suffix}`,
      title: `Issue 1092 attendance recheck ${suffix}`,
      description: "Authorization fixture for individual attendance recheck",
      credits: 3,
      courseType: "Core",
      totalSltHours: 120,
      programmeId: "dse",
    },
  });
  const offering = await prisma.offering.create({
    data: {
      courseId: course.id,
      lecturerId,
      term: `I1092-${suffix}`,
      sectionCode: "A",
      capacity: 30,
      status: "Active",
    },
  });
  const student = await prisma.student.create({
    data: {
      name: `Issue 1092 Student ${suffix}`,
      email: `issue1092-${suffix}@example.test`,
      studentId: `I1092-${suffix}`,
      status: "Active",
    },
  });
  await prisma.enrollment.create({
    data: { offeringId: offering.id, studentId: student.id },
  });
  return {
    courseId: course.id,
    offeringId: offering.id,
    studentId: student.id,
  };
}

async function deleteFixture(fixture: {
  courseId: string;
  offeringId: string;
  studentId: string;
}): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "pms_attendance"."AttendanceSession"
    WHERE "offeringId" = ${fixture.offeringId}
  `;
  await prisma.enrollment.deleteMany({ where: { offeringId: fixture.offeringId } });
  await prisma.offering.delete({ where: { id: fixture.offeringId } });
  await prisma.course.delete({ where: { id: fixture.courseId } });
  await prisma.student.delete({ where: { id: fixture.studentId } });
}

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
