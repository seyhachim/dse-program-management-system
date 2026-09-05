import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";
import { signToken, type AuthUser, type Role } from "../core/auth/token.ts";

const runIntegration = process.env.BACKEND_INTEGRATION_TESTS === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;

const TEST_SECRET =
  "issue-857-course-spec-team-snapshot-integration-secret-at-least-32-characters";

type HttpResult = {
  status: number;
  body: unknown;
};

type LecturerFixture = {
  id: string;
  name: string;
  title: string | null;
  qualification: string | null;
  email: string;
  phone: string | null;
};

type CourseInfoResponse = {
  data?: {
    courseInfo?: {
      instructorName?: string;
      instructorTitle?: string;
      qualification?: string;
      email?: string;
      telephone?: string;
      otherLecturers?: string;
    };
  };
};

type ApprovedSpecVersionResponse = Array<{
  id: string;
  version: string;
  courseTeam?: {
    responsibilityMode: "LEAD_AND_CO" | "SHARED";
    leadLecturerId: string | null;
    lecturers: Array<{
      id: string;
      name: string;
      email: string;
      role: "RESPONSIBLE" | "CO_LECTURER" | "SHARED";
    }>;
  };
}>;

integrationDescribe("Course Spec Course Team snapshot", () => {
  let appServer: Server;
  let baseUrl = "";
  let coordinator: AuthUser;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = TEST_SECRET;

    coordinator = await loadAuthUser("coordinator@dse.dev");

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

  test("Lead + Co-Lecturers snapshots lead/co roles, follows lead changes, and handles shared/empty teams", async () => {
    const [lecturerA, lecturerB] = await Promise.all([
      createLecturerFixture("A"),
      createLecturerFixture("B"),
    ]);
    const course = await prisma.course.create({
      data: {
        code: `I857-${crypto.randomUUID().slice(0, 8)}`,
        title: "Issue 857 Course Team snapshot fixture",
        description: "Course Team Course Information snapshot regression fixture",
        credits: 3,
        courseType: "Core",
        totalSltHours: 120,
        programmeId: "dse",
      },
      select: { id: true },
    });

    try {
      const firstAssignment = await assignLeadTeam(
        course.id,
        [lecturerA.id, lecturerB.id],
        lecturerA.id,
      );
      expect(firstAssignment.status).toBe(200);
      const courseSpecId = (firstAssignment.body as { courseSpecId?: string })
        .courseSpecId;
      expect(courseSpecId).toBeTruthy();

      await expectSnapshot(courseSpecId!, lecturerA, lecturerB.name);
      await expectSpecApi(course.id, lecturerA, lecturerB.name);
      expect(
        (await prisma.course.findUniqueOrThrow({ where: { id: course.id } }))
          .lecturerId,
      ).toBe(lecturerA.id);

      const changedLead = await assignLeadTeam(
        course.id,
        [lecturerA.id, lecturerB.id],
        lecturerB.id,
      );
      expect(changedLead.status).toBe(200);
      await expectSnapshot(courseSpecId!, lecturerB, lecturerA.name);
      await expectSpecApi(course.id, lecturerB, lecturerA.name);
      expect(
        (await prisma.course.findUniqueOrThrow({ where: { id: course.id } }))
          .lecturerId,
      ).toBe(lecturerB.id);

      const shared = await request(
        `/api/courses/${course.id}/spec/responsible-lecturers`,
        {
          method: "PUT",
          token: signToken(coordinator),
          body: {
            lecturerIds: [lecturerA.id, lecturerB.id],
            responsibilityMode: "SHARED",
            leadLecturerId: null,
          },
        },
      );
      expect(shared.status).toBe(200);

      const sharedNames = [lecturerA.name, lecturerB.name]
        .sort((a, b) => a.localeCompare(b))
        .join(", ");
      const sharedSnapshot =
        await prisma.courseSpecCourseInfo.findUniqueOrThrow({
          where: { courseSpecId: courseSpecId! },
        });
      expect(sharedSnapshot).toMatchObject({
        instructorName: "",
        instructorTitle: "",
        qualification: "",
        email: "",
        telephone: "",
        otherLecturers: sharedNames,
      });
      expect(
        (await prisma.course.findUniqueOrThrow({ where: { id: course.id } }))
          .lecturerId,
      ).toBeNull();

      const cleared = await request(
        `/api/courses/${course.id}/spec/responsible-lecturers`,
        {
          method: "PUT",
          token: signToken(coordinator),
          body: {
            lecturerIds: [],
            responsibilityMode: "SHARED",
            leadLecturerId: null,
          },
        },
      );
      expect(cleared.status).toBe(200);
      const clearedSnapshot =
        await prisma.courseSpecCourseInfo.findUniqueOrThrow({
          where: { courseSpecId: courseSpecId! },
        });
      expect(clearedSnapshot).toMatchObject({
        instructorName: "",
        instructorTitle: "",
        qualification: "",
        email: "",
        telephone: "",
        otherLecturers: "",
      });
    } finally {
      await prisma.course.delete({ where: { id: course.id } });
      await deleteLecturerFixture(lecturerA.id);
      await deleteLecturerFixture(lecturerB.id);
    }
  });

  test("Approved version lookup keeps the exact historical team when a newer draft has another lead", async () => {
    const [lecturerA, lecturerB, lecturerC] = await Promise.all([
      createLecturerFixture("V1-A"),
      createLecturerFixture("V2-B"),
      createLecturerFixture("V2-C"),
    ]);
    const code = `I865-${crypto.randomUUID().slice(0, 8)}`;
    const title = "Issue 865 exact-version Course Team fixture";
    const course = await prisma.course.create({
      data: {
        code,
        title,
        description: "Approved CourseSpec team must not follow a newer draft",
        credits: 3,
        courseType: "Core",
        totalSltHours: 120,
        programmeId: "dse",
        lecturerId: lecturerB.id,
      },
      select: { id: true },
    });

    try {
      const approvedSpec = await prisma.courseSpec.create({
        data: {
          courseId: course.id,
          versionMajor: 1,
          versionMinor: 0,
          reviewStatus: "Approved",
          approvedAt: new Date(),
          courseInfo: {
            create: {
              programmeTitle: "Data Science and Engineering",
              courseTitle: title,
              courseCode: code,
              instructorName: lecturerA.name,
              instructorTitle: lecturerA.title ?? "",
              qualification: lecturerA.qualification ?? "",
              email: lecturerA.email,
              telephone: lecturerA.phone ?? "",
              otherLecturers: lecturerB.name,
            },
          },
        },
        select: { id: true },
      });
      await insertCourseSpecTeam(approvedSpec.id, [lecturerA.id, lecturerB.id]);

      const newerDraft = await prisma.courseSpec.create({
        data: {
          courseId: course.id,
          versionMajor: 2,
          versionMinor: 0,
          reviewStatus: "Draft",
          courseInfo: {
            create: {
              programmeTitle: "Data Science and Engineering",
              courseTitle: title,
              courseCode: code,
              instructorName: lecturerB.name,
              instructorTitle: lecturerB.title ?? "",
              qualification: lecturerB.qualification ?? "",
              email: lecturerB.email,
              telephone: lecturerB.phone ?? "",
              otherLecturers: lecturerC.name,
            },
          },
        },
        select: { id: true },
      });
      await insertCourseSpecTeam(newerDraft.id, [lecturerB.id, lecturerC.id]);

      const response = await request(
        `/api/courses/${course.id}/approved-spec-versions`,
        { token: signToken(coordinator) },
      );
      expect(response.status).toBe(200);
      const versions = response.body as ApprovedSpecVersionResponse;
      expect(versions).toHaveLength(1);
      expect(versions[0]?.id).toBe(approvedSpec.id);
      expect(versions[0]?.courseTeam).toEqual({
        responsibilityMode: "LEAD_AND_CO",
        leadLecturerId: lecturerA.id,
        lecturers: [
          {
            id: lecturerA.id,
            name: lecturerA.name,
            email: lecturerA.email,
            role: "RESPONSIBLE",
          },
          {
            id: lecturerB.id,
            name: lecturerB.name,
            email: lecturerB.email,
            role: "CO_LECTURER",
          },
        ].sort((a, b) => a.name.localeCompare(b.name)),
      });
    } finally {
      await prisma.course.delete({ where: { id: course.id } });
      await deleteLecturerFixture(lecturerA.id);
      await deleteLecturerFixture(lecturerB.id);
      await deleteLecturerFixture(lecturerC.id);
    }
  });

  async function assignLeadTeam(
    courseId: string,
    lecturerIds: string[],
    leadLecturerId: string,
  ): Promise<HttpResult> {
    return request(`/api/courses/${courseId}/spec/responsible-lecturers`, {
      method: "PUT",
      token: signToken(coordinator),
      body: {
        lecturerIds,
        responsibilityMode: "LEAD_AND_CO",
        leadLecturerId,
      },
    });
  }

  async function expectSnapshot(
    courseSpecId: string,
    lecturer: LecturerFixture,
    otherLecturers: string,
  ): Promise<void> {
    const snapshot = await prisma.courseSpecCourseInfo.findUniqueOrThrow({
      where: { courseSpecId },
    });
    expect(snapshot).toMatchObject({
      instructorName: lecturer.name,
      instructorTitle: lecturer.title ?? "",
      qualification: lecturer.qualification ?? "",
      email: lecturer.email,
      telephone: lecturer.phone ?? "",
      otherLecturers,
    });
  }

  async function expectSpecApi(
    courseId: string,
    lecturer: LecturerFixture,
    otherLecturers: string,
  ): Promise<void> {
    const response = await request(`/api/courses/${courseId}/spec`, {
      token: signToken(coordinator),
    });
    expect(response.status).toBe(200);
    const courseInfo = (response.body as CourseInfoResponse).data?.courseInfo;
    expect(courseInfo).toMatchObject({
      instructorName: lecturer.name,
      instructorTitle: lecturer.title ?? "",
      qualification: lecturer.qualification ?? "",
      email: lecturer.email,
      telephone: lecturer.phone ?? "",
      otherLecturers,
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

async function insertCourseSpecTeam(
  courseSpecId: string,
  lecturerIds: string[],
): Promise<void> {
  for (const lecturerId of lecturerIds) {
    await prisma.$executeRaw`
      INSERT INTO "CourseSpecResponsibleLecturer" ("courseSpecId", "lecturerId")
      VALUES (${courseSpecId}, ${lecturerId})
    `;
  }
}

async function createLecturerFixture(label: string): Promise<LecturerFixture> {
  const lecturerRole = await prisma.role.findUniqueOrThrow({
    where: { slug: "lecturer" },
  });
  const token = crypto.randomUUID().slice(0, 8);
  const lecturer = await prisma.user.create({
    data: {
      email: `issue857-${label.toLowerCase()}-${token}@dse.invalid`,
      name: `Issue 857 Lecturer ${label}`,
      title: label.includes("A") ? "Dr." : "Assoc. Prof.",
      qualification: label.includes("A") ? "PhD Data Science" : "PhD Software Engineering",
      phone: label.includes("A") ? "+855 10 857 001" : "+855 10 857 002",
    },
    select: {
      id: true,
      name: true,
      title: true,
      qualification: true,
      email: true,
      phone: true,
    },
  });
  await prisma.userRoleAssignment.create({
    data: {
      userId: lecturer.id,
      roleId: lecturerRole.id,
      programmeId: "dse",
    },
  });
  return lecturer;
}

async function deleteLecturerFixture(userId: string): Promise<void> {
  await prisma.userRoleAssignment.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

async function loadAuthUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roleAssignments: { include: { role: true } } },
  });
  const roles = user.roleAssignments.map((assignment) => assignment.role.slug as Role);
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
