import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import type { AuthUser, Role } from "../core/auth/token.ts";
import { signToken } from "../core/auth/token.ts";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";

const runIntegration = process.env.BACKEND_INTEGRATION_TESTS === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;
const TEST_SECRET = "lecturer-portfolio-integration-secret-at-least-32-characters";

type HttpResult = { status: number; body: unknown };

type PortfolioItemResponse = {
  id: string;
  lecturerId: string;
  title: string;
  verificationStatus: "self_declared" | "verified" | "rejected";
  verificationEvents: Array<{ id: string; action: string }>;
};

integrationDescribe("lecturer portfolio authorization and audit boundaries", () => {
  let server: Server;
  let baseUrl = "";
  let lecturer: AuthUser;
  let coordinator: AuthUser;
  let student: AuthUser;
  let itemId = "";

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

  test("ownership, scoped review, append-only audit, edit reset, and AUN-QA provenance hold end to end", async () => {
    const lecturerToken = signToken(lecturer);

    const studentRead = await request("/api/lecturers/me/portfolio-items", {
      token: signToken(student),
    });
    expect(studentRead.status).toBe(403);
    expect(errorMessage(studentRead.body)).toContain("Lecturer role");

    const created = await request("/api/lecturers/me/portfolio-items", {
      method: "POST",
      token: lecturerToken,
      body: {
        kind: "publication",
        title: "Lecturer Portfolio Integration Publication",
        organization: "DSE",
        identifier: "10.0000/dse.integration",
        url: "https://example.edu/publication",
        tags: ["Data Science", "Data Science"],
      },
    });
    expect(created.status).toBe(201);
    const createdItem = created.body as PortfolioItemResponse;
    itemId = createdItem.id;
    expect(createdItem.lecturerId).toBe(lecturer.id);
    expect(createdItem.verificationStatus).toBe("self_declared");
    expect(createdItem.verificationEvents).toHaveLength(0);

    const ordinaryReview = await request(
      `/api/lecturers/${lecturer.id}/portfolio-items/${itemId}/review`,
      {
        method: "POST",
        token: lecturerToken,
        body: { action: "verified", note: "Lecturer cannot self-verify" },
      },
    );
    expect(ordinaryReview.status).toBe(403);

    const crossProgrammeCoordinator: AuthUser = {
      ...coordinator,
      programmeRoles: [{ role: "program_coordinator", programmeId: "other-programme" }],
    };
    const crossProgrammeReview = await request(
      `/api/lecturers/${lecturer.id}/portfolio-items/${itemId}/review`,
      {
        method: "POST",
        token: signToken(crossProgrammeCoordinator),
        body: { action: "verified", note: "Wrong programme" },
      },
    );
    expect(crossProgrammeReview.status).toBe(403);

    const verified = await request(
      `/api/lecturers/${lecturer.id}/portfolio-items/${itemId}/review`,
      {
        method: "POST",
        token: signToken(coordinator),
        body: { action: "verified", note: "Source checked in integration test" },
      },
    );
    expect(verified.status).toBe(200);
    const verifiedItem = verified.body as PortfolioItemResponse;
    expect(verifiedItem.verificationStatus).toBe("verified");
    expect(verifiedItem.verificationEvents.at(-1)?.action).toBe("verified");

    const deleteReviewed = await request(`/api/lecturers/me/portfolio-items/${itemId}`, {
      method: "DELETE",
      token: lecturerToken,
    });
    expect(deleteReviewed.status).toBe(409);
    expect(errorMessage(deleteReviewed.body)).toContain("verification history");

    const eventId = verifiedItem.verificationEvents.at(-1)!.id;
    await expectDatabaseRejection(() => prisma.$executeRaw`
      UPDATE lecturer_portfolio."LecturerPortfolioVerification"
      SET "note" = 'tampered'
      WHERE "id" = ${eventId}
    `);
    await expectDatabaseRejection(() => prisma.$executeRaw`
      DELETE FROM lecturer_portfolio."LecturerPortfolioVerification"
      WHERE "id" = ${eventId}
    `);

    const edited = await request(`/api/lecturers/me/portfolio-items/${itemId}`, {
      method: "PATCH",
      token: lecturerToken,
      body: { title: "Lecturer Portfolio Integration Publication — corrected" },
    });
    expect(edited.status).toBe(200);
    const editedItem = edited.body as PortfolioItemResponse;
    expect(editedItem.verificationStatus).toBe("self_declared");
    expect(editedItem.verificationEvents.map((event) => event.action)).toEqual([
      "verified",
      "reset",
    ]);

    const exportResult = await request("/api/lecturers/me/aun-qa-evidence", {
      token: lecturerToken,
    });
    expect(exportResult.status).toBe(200);
    const evidence = (exportResult.body as {
      evidence: Array<{ id: string; verification: string; sourceEntityId: string | null }>;
    }).evidence;
    expect(evidence.some((entry) =>
      entry.id.startsWith("offering:") && entry.verification === "authoritative_pms"
    )).toBe(true);
    expect(evidence.some((entry) =>
      entry.sourceEntityId === itemId && entry.verification === "self_declared"
    )).toBe(true);
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

async function expectDatabaseRejection(operation: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}
