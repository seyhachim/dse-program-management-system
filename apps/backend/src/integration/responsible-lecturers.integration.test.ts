import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";
import { signToken, type AuthUser, type Role } from "../core/auth/token.ts";
import { courseSpecRevisionService } from "../plugins/courses/revision-service.ts";

const runIntegration = process.env.BACKEND_INTEGRATION_TESTS === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;

const TEST_SECRET = "issue-446-responsible-lecturer-integration-secret-at-least-32-characters";

type HttpResult = {
  status: number;
  body: unknown;
};

type ResponsibilityRow = {
  lecturerId: string;
};

integrationDescribe("Course Spec Responsible Lecturer integration", () => {
  let appServer: Server;
  let baseUrl = "";
  let coordinator: AuthUser;
  let lecturerA: AuthUser;
  let lecturerB: AuthUser;
  let outsider: AuthUser;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = TEST_SECRET;

    [coordinator, lecturerA, lecturerB, outsider] = await Promise.all([
      loadAuthUser("coordinator@dse.dev"),
      loadAuthUser("lecturer@dse.dev"),
      loadAuthUser("hopper.lecturer@dse.dev"),
      loadAuthUser("knuth.lecturer@dse.dev"),
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

  test("programme coordinator assigns multiple equal Responsible Lecturers", async () => {
    const course = await createCourse("ASSIGN");
    try {
      const response = await assignTeam(course.id, [lecturerA.id, lecturerB.id]);
      expect(response.status).toBe(200);

      const body = response.body as {
        courseSpecId?: string;
        academicVersion?: string;
        reviewStatus?: string;
        lecturers?: Array<{ id: string }>;
      };
      expect(body.courseSpecId).toBeTruthy();
      expect(body.academicVersion).toBe("1.0");
      expect(body.reviewStatus).toBe("Draft");
      expect(body.lecturers?.map((lecturer) => lecturer.id).sort()).toEqual(
        [lecturerA.id, lecturerB.id].sort(),
      );

      const rows = await responsibilityRows(body.courseSpecId!);
      expect(rows.map((row) => row.lecturerId).sort()).toEqual(
        [lecturerA.id, lecturerB.id].sort(),
      );
    } finally {
      await deleteCourse(course.id);
    }
  });

  test("Responsible Lecturers can access the Course Spec before any Offering exists", async () => {
    const course = await createCourse("PREOFFER");
    try {
      expect(await prisma.offering.count({ where: { courseId: course.id } })).toBe(0);
      expect((await assignTeam(course.id, [lecturerA.id, lecturerB.id])).status).toBe(200);

      for (const lecturer of [lecturerA, lecturerB]) {
        const response = await request(`/api/courses/${course.id}/spec`, {
          token: signToken(lecturer),
        });
        expect(response.status).toBe(200);

        const list = await request("/api/courses", { token: signToken(lecturer) });
        expect(list.status).toBe(200);
        expect(
          (list.body as Array<{ id: string }>).some((item) => item.id === course.id),
        ).toBe(true);
      }

      const blocked = await request(`/api/courses/${course.id}/spec`, {
        token: signToken(outsider),
      });
      expect(blocked.status).toBe(403);
    } finally {
      await deleteCourse(course.id);
    }
  });

  test("Responsible Lecturer membership is locked after Course Spec submission", async () => {
    const course = await createCourse("LOCK");
    try {
      const assigned = await assignTeam(course.id, [lecturerA.id, lecturerB.id]);
      expect(assigned.status).toBe(200);
      const courseSpecId = (assigned.body as { courseSpecId: string }).courseSpecId;

      await prisma.courseSpec.update({
        where: { id: courseSpecId },
        data: { reviewStatus: "Submitted", submittedAt: new Date() },
      });

      const locked = await assignTeam(course.id, [lecturerA.id]);
      expect(locked.status).toBe(409);
      expect(errorMessage(locked.body)).toContain("locked");

      const rows = await responsibilityRows(courseSpecId);
      expect(rows.map((row) => row.lecturerId).sort()).toEqual(
        [lecturerA.id, lecturerB.id].sort(),
      );
    } finally {
      await deleteCourse(course.id);
    }
  });

  test("a new academic revision inherits the exact Responsible Lecturer team", async () => {
    const course = await createCourse("INHERIT");
    try {
      const assigned = await assignTeam(course.id, [lecturerA.id, lecturerB.id]);
      expect(assigned.status).toBe(200);
      const sourceId = (assigned.body as { courseSpecId: string }).courseSpecId;

      await prisma.courseSpec.update({
        where: { id: sourceId },
        data: {
          reviewStatus: "Approved",
          approvedAt: new Date(),
        },
      });

      const revision = await courseSpecRevisionService.createCourseSpecRevision({
        courseId: course.id,
        revisionType: "Minor",
        triggers: ["Other"],
        reason: "Focused integration coverage for Responsible Lecturer inheritance.",
        changeSummary: "Create the next draft without changing the responsible team.",
        initiatedById: coordinator.id,
      });

      expect(revision.basedOnVersionId).toBe(sourceId);
      expect(revision.reviewStatus).toBe("Draft");

      const sourceRows = await responsibilityRows(sourceId);
      const revisionRows = await responsibilityRows(revision.id);
      expect(revisionRows.map((row) => row.lecturerId).sort()).toEqual(
        sourceRows.map((row) => row.lecturerId).sort(),
      );
      expect(revisionRows.map((row) => row.lecturerId).sort()).toEqual(
        [lecturerA.id, lecturerB.id].sort(),
      );
    } finally {
      await deleteCourse(course.id);
    }
  });

  async function assignTeam(courseId: string, lecturerIds: string[]): Promise<HttpResult> {
    return request(`/api/courses/${courseId}/spec/responsible-lecturers`, {
      method: "PUT",
      token: signToken(coordinator),
      body: { lecturerIds },
    });
  }

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

async function createCourse(label: string) {
  const token = crypto.randomUUID().slice(0, 8);
  return prisma.course.create({
    data: {
      code: `I446-${label}-${token}`,
      title: `Issue 446 ${label} integration fixture`,
      description: "Responsible Lecturer focused integration fixture",
      credits: 3,
      courseType: "Core",
      totalSltHours: 120,
      programmeId: "dse",
    },
    select: { id: true },
  });
}

async function deleteCourse(courseId: string): Promise<void> {
  await prisma.course.delete({ where: { id: courseId } });
}

async function responsibilityRows(courseSpecId: string): Promise<ResponsibilityRow[]> {
  return prisma.$queryRaw<ResponsibilityRow[]>`
    SELECT "lecturerId"
    FROM "CourseSpecResponsibleLecturer"
    WHERE "courseSpecId" = ${courseSpecId}
    ORDER BY "lecturerId"
  `;
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

function errorMessage(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    return String((body as { error: unknown }).error);
  }
  return "";
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
