import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { Express } from "express";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";
import {
  signToken,
  type AuthUser,
  type Role,
} from "../core/auth/token.ts";

const runIntegration = process.env.BACKEND_INTEGRATION_TESTS === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;

const TEST_SECRET = "issue-130-integration-secret-at-least-32-characters";

type SeededContext = {
  users: {
    lecturer: AuthUser;
    coLecturer: AuthUser;
    coordinator: AuthUser;
    secretary: AuthUser;
    qaReviewer: AuthUser;
    student: AuthUser;
  };
  courses: {
    cs101: { id: string };
    cs201: { id: string };
  };
  cs101SpecId: string;
};

type HttpResult = {
  status: number;
  body: unknown;
};

integrationDescribe("backend integration authorization boundaries", () => {
  let appServer: Server;
  let jwksServer: Server;
  let baseUrl = "";
  let context: SeededContext;
  let unprovisionedSupabaseToken = "";

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = TEST_SECRET;

    context = await loadSeededContext();

    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "issue-130-integration-key";
    publicJwk.alg = "RS256";
    publicJwk.use = "sig";

    jwksServer = createServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [publicJwk] }));
    });
    jwksServer.listen(0, "127.0.0.1");
    await once(jwksServer, "listening");
    const jwksAddress = jwksServer.address() as AddressInfo;
    process.env.SUPABASE_JWKS_URL = `http://127.0.0.1:${jwksAddress.port}/auth/v1/.well-known/jwks.json`;

    unprovisionedSupabaseToken = await new SignJWT({
      email: "issue-130-unprovisioned@dse.invalid",
    })
      .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
      .setSubject("issue-130-unprovisioned-auth-id")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const app: Express = createApp();
    appServer = app.listen(0, "127.0.0.1");
    await once(appServer, "listening");
    const appAddress = appServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${appAddress.port}`;
  });

  afterAll(async () => {
    process.env.AUTH_MODE = "dev";
    await Promise.all([
      closeServer(appServer),
      closeServer(jwksServer),
    ]);
    await prisma.$disconnect();
  });

  test("missing, invalid, and expired bearer tokens return 401", async () => {
    const missing = await request("/api/courses");
    expect(missing.status).toBe(401);
    expect(errorMessage(missing.body)).toContain("Authorization");

    const invalid = await request("/api/courses", {
      token: "not-a-valid-jwt",
    });
    expect(invalid.status).toBe(401);
    expect(errorMessage(invalid.body)).toContain("Invalid or expired token");

    const expiredToken = signToken(context.users.lecturer, -1);
    const expired = await request("/api/courses", { token: expiredToken });
    expect(expired.status).toBe(401);
    expect(errorMessage(expired.body)).toContain("Invalid or expired token");
  });

  test("a valid Supabase identity without a provisioned PMS account returns 403", async () => {
    process.env.AUTH_MODE = "supabase";
    try {
      const response = await request("/api/courses", {
        token: unprovisionedSupabaseToken,
      });
      expect(response.status).toBe(403);
      expect(errorMessage(response.body)).toContain("No account provisioned");
    } finally {
      process.env.AUTH_MODE = "dev";
    }
  });

  test("a lecturer cannot read or mutate another lecturer's restricted course", async () => {
    const lecturerToken = signToken(context.users.lecturer);

    const read = await request(`/api/courses/${context.courses.cs201.id}`, {
      token: lecturerToken,
    });
    expect(read.status).toBe(403);
    expect(errorMessage(read.body)).toContain("only access your own courses");

    const mutate = await request(
      `/api/courses/${context.courses.cs201.id}/spec/courseInfo`,
      {
        method: "PUT",
        token: lecturerToken,
        body: {},
      },
    );
    expect(mutate.status).toBe(403);
    expect(errorMessage(mutate.body)).toContain("only access your own courses");
  });

  test("assigned primary and co-lecturers can read the offered course", async () => {
    for (const actor of [context.users.lecturer, context.users.coLecturer]) {
      const response = await request(`/api/courses/${context.courses.cs101.id}`, {
        token: signToken(actor),
      });
      expect(response.status).toBe(200);
      expect((response.body as { id?: string }).id).toBe(context.courses.cs101.id);
    }
  });

  test("submitted and approved course specifications reject ordinary lecturer edits", async () => {
    const original = await prisma.courseSpec.findUniqueOrThrow({
      where: { id: context.cs101SpecId },
      select: { reviewStatus: true },
    });

    try {
      for (const reviewStatus of ["Submitted", "Approved"] as const) {
        await prisma.courseSpec.update({
          where: { id: context.cs101SpecId },
          data: { reviewStatus },
        });

        const response = await request(
          `/api/courses/${context.courses.cs101.id}/spec/courseInfo`,
          {
            method: "PUT",
            token: signToken(context.users.lecturer),
            body: {},
          },
        );
        expect(response.status).toBe(409);
        expect(errorMessage(response.body)).toContain("locked");
      }
    } finally {
      await prisma.courseSpec.update({
        where: { id: context.cs101SpecId },
        data: { reviewStatus: original.reviewStatus },
      });
    }
  });

  test("students cannot perform protected academic mutations", async () => {
    const response = await request("/api/courses", {
      method: "POST",
      token: signToken(context.users.student),
      body: {},
    });
    expect(response.status).toBe(403);
    expect(errorMessage(response.body)).toContain("courses:manage");
  });

  test("QA reviewers can read QA knowledge but cannot edit academic course content", async () => {
    const token = signToken(context.users.qaReviewer);

    const qaRead = await request("/api/qa/knowledge", { token });
    expect(qaRead.status).toBe(200);

    const academicWrite = await request(
      `/api/courses/${context.courses.cs101.id}/spec/courseInfo`,
      { method: "PUT", token, body: {} },
    );
    expect(academicWrite.status).toBe(403);
    expect(errorMessage(academicWrite.body)).toContain("courses:write");
  });

  test("programme secretaries cannot perform coordinator-only course decisions", async () => {
    const response = await request("/api/courses", {
      method: "POST",
      token: signToken(context.users.secretary),
      body: {},
    });
    expect(response.status).toBe(403);
    expect(errorMessage(response.body)).toContain("courses:manage");
  });

  test("programme coordinators retain programme-wide course access", async () => {
    const response = await request(`/api/courses/${context.courses.cs201.id}`, {
      token: signToken(context.users.coordinator),
    });
    expect(response.status).toBe(200);
    expect((response.body as { id?: string }).id).toBe(context.courses.cs201.id);
  });

  async function request(
    path: string,
    options: {
      method?: string;
      token?: string;
      body?: unknown;
    } = {},
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
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    };
  }
});

async function loadSeededContext(): Promise<SeededContext> {
  const [lecturer, coLecturer, coordinator, secretary, qaReviewer, student, cs101, cs201] =
    await Promise.all([
      loadAuthUser("lecturer@dse.dev"),
      loadAuthUser("hopper.lecturer@dse.dev"),
      loadAuthUser("coordinator@dse.dev"),
      loadAuthUser("secretary@dse.dev"),
      loadAuthUser("qa@dse.dev"),
      loadAuthUser("student@dse.dev"),
      prisma.course.findUniqueOrThrow({ where: { code: "CS101" }, select: { id: true } }),
      prisma.course.findUniqueOrThrow({ where: { code: "CS201" }, select: { id: true } }),
    ]);

  const cs101Spec = await prisma.courseSpec.findFirstOrThrow({
    where: { courseId: cs101.id },
    orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
    select: { id: true },
  });

  return {
    users: { lecturer, coLecturer, coordinator, secretary, qaReviewer, student },
    courses: { cs101, cs201 },
    cs101SpecId: cs101Spec.id,
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
