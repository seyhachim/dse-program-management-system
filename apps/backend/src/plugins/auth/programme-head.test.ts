import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { AppointProgrammeHeadInput, EndProgrammeHeadInput } from "@dse-pms/shared-types";
import { createApp } from "../../core/app.ts";
import { type AuthUser, signToken } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { lecturerService, LecturerHeadAppointmentError } from "../lecturers/service.ts";
import { authService, ProgrammeRoleAssignmentError } from "./service.ts";
import { programmeHeadService } from "./programme-head-service.ts";

describe("Head of Program input validation", () => {
  test("requires an existing lecturer UUID and programme", () => {
    expect(AppointProgrammeHeadInput.safeParse({ programmeId: "dse", lecturerId: "wrong" }).success).toBe(false);
    expect(AppointProgrammeHeadInput.safeParse({ programmeId: "", lecturerId: crypto.randomUUID() }).success).toBe(false);
    expect(AppointProgrammeHeadInput.safeParse({ programmeId: "dse", lecturerId: crypto.randomUUID(), reference: "RUPP letter" }).success).toBe(true);
    expect(EndProgrammeHeadInput.safeParse({ programmeId: "" }).success).toBe(false);
  });
});

const dbDescribe = process.env.BACKEND_INTEGRATION_TESTS === "1" ? describe : describe.skip;

dbDescribe("Head of Program end-to-end authorization and history", () => {
  let server: Server | null = null;
  let baseUrl = "";
  let programmeId = "";
  let actorId = "";
  let lecturerAId = "";
  let lecturerBId = "";
  let lecturerAEmail = "";
  let lecturerBEmail = "";
  let adminToken = "";
  let lecturerToken = "";
  let coordinatorToken = "";
  let coordinatorRoleId = "";
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = "programme-head-test-secret-with-at-least-32-characters";

    const suffix = crypto.randomUUID().slice(0, 8);
    programmeId = `head-test-${suffix}`;
    const [adminRole, lecturerRole, coordinatorRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({ where: { slug: "admin" } }),
      prisma.role.findUniqueOrThrow({ where: { slug: "lecturer" } }),
      prisma.role.findUniqueOrThrow({ where: { slug: "program_coordinator" } }),
    ]);
    coordinatorRoleId = coordinatorRole.id;

    await prisma.programme.create({
      data: { id: programmeId, code: programmeId, name: "Head Test Programme" },
    });
    const actor = await prisma.user.create({
      data: { name: "Head Test Admin", email: `head-admin-${suffix}@example.invalid` },
    });
    actorId = actor.id;
    createdUserIds.push(actor.id);
    const lecturerA = await prisma.user.create({
      data: { name: "First Head Test Lecturer", email: `head-a-${suffix}@example.invalid`, authId: crypto.randomUUID() },
    });
    const lecturerB = await prisma.user.create({
      data: { name: "Second Head Test Lecturer", email: `head-b-${suffix}@example.invalid`, authId: crypto.randomUUID() },
    });
    lecturerAId = lecturerA.id;
    lecturerBId = lecturerB.id;
    lecturerAEmail = lecturerA.email;
    lecturerBEmail = lecturerB.email;
    createdUserIds.push(lecturerA.id, lecturerB.id);
    await prisma.userRoleAssignment.createMany({
      data: [
        { userId: actorId, roleId: adminRole.id, programmeId: null },
        { userId: lecturerAId, roleId: lecturerRole.id, programmeId },
        { userId: lecturerBId, roleId: lecturerRole.id, programmeId },
      ],
    });

    const admin: AuthUser = {
      id: actorId,
      email: actor.email,
      roles: ["admin"],
      programmeRoles: [{ role: "admin", programmeId: null }],
    };
    const lecturer: AuthUser = {
      id: lecturerAId,
      email: lecturerAEmail,
      roles: ["lecturer"],
      programmeRoles: [{ role: "lecturer", programmeId }],
    };
    const coordinator: AuthUser = {
      id: lecturerAId,
      email: lecturerAEmail,
      roles: ["program_coordinator"],
      programmeRoles: [{ role: "program_coordinator", programmeId }],
    };
    adminToken = signToken(admin);
    lecturerToken = signToken(lecturer);
    coordinatorToken = signToken(coordinator);
    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
    if (!programmeId) return;
    await prisma.programmeHeadAppointment.deleteMany({ where: { programmeId } });
    await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.programme.delete({ where: { id: programmeId } });
  });

  async function call(method: "GET" | "POST" | "DELETE", path: string, token?: string, body?: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() as any };
  }

  test("only Admin can appoint; replacement preserves lecturer roles and keeps history", async () => {
    const path = "/api/auth/programme-head";
    const query = `${path}?programmeId=${programmeId}`;
    const first = { programmeId, lecturerId: lecturerAId, reference: "Official letter 2026-01" };

    expect((await call("GET", query)).status).toBe(401);
    expect((await call("GET", query, lecturerToken)).status).toBe(200);
    expect((await call("POST", path, lecturerToken, first)).status).toBe(403);
    expect((await call("POST", path, coordinatorToken, first)).status).toBe(403);
    expect((await call("POST", path, adminToken, { programmeId, lecturerId: "bad" })).status).toBe(400);

    const appointed = await call("POST", path, adminToken, first);
    expect(appointed.status).toBe(201);
    expect(appointed.body.current.lecturerId).toBe(lecturerAId);
    expect(appointed.body.current.reference).toBe("Official letter 2026-01");
    expect(appointed.body.current.coordinatorGranted).toBe(true);
    expect(await prisma.userRoleAssignment.count({ where: { userId: lecturerAId, role: { slug: "lecturer" } } })).toBe(1);
    expect(await prisma.userRoleAssignment.count({ where: { userId: lecturerAId, role: { slug: "program_coordinator" }, programmeId } })).toBe(1);

    // The partial unique index prevents two simultaneous active Heads.
    await expect(Promise.resolve().then(() => prisma.programmeHeadAppointment.create({
      data: { programmeId, lecturerId: lecturerBId, appointedById: actorId },
    }))).rejects.toMatchObject({ code: "P2002" });

    // B had an independent coordinator grant: replacing Head should not revoke it later.
    await prisma.userRoleAssignment.create({
      data: { userId: lecturerBId, roleId: coordinatorRoleId, programmeId },
    });

    const replacement = await call("POST", path, adminToken, { programmeId, lecturerId: lecturerBId });
    expect(replacement.status).toBe(201);
    expect(replacement.body.current.lecturerId).toBe(lecturerBId);
    expect(replacement.body.current.coordinatorGranted).toBe(false);
    expect(replacement.body.history).toHaveLength(2);
    expect(replacement.body.history.filter((row: { endedAt: string | null }) => row.endedAt === null)).toHaveLength(1);
    expect(await prisma.userRoleAssignment.count({ where: { userId: lecturerAId, role: { slug: "program_coordinator" } } })).toBe(0);
    expect(await prisma.userRoleAssignment.count({ where: { userId: lecturerAId, role: { slug: "lecturer" } } })).toBe(1);
    expect(await prisma.userRoleAssignment.count({ where: { userId: lecturerBId, role: { slug: "lecturer" } } })).toBe(1);

    const repeat = await call("POST", path, adminToken, { programmeId, lecturerId: lecturerBId });
    expect(repeat.status).toBe(201);
    expect(repeat.body.history).toHaveLength(2);

    // Re-provisioning an active Head would strip other roles; it is blocked pre-Supabase.
    await expect(authService.createAccount({
      name: "Second Head Test Lecturer", email: lecturerBEmail, role: "lecturer",
    })).rejects.toBeInstanceOf(ProgrammeRoleAssignmentError);

    const ended = await call("DELETE", path, adminToken, { programmeId });
    expect(ended.status).toBe(200);
    expect(ended.body.current).toBeNull();
    expect(ended.body.history).toHaveLength(2);
    expect(ended.body.history[0].endedByName).toBe("Head Test Admin");
    expect(await prisma.userRoleAssignment.count({ where: { userId: lecturerBId, role: { slug: "program_coordinator" } } })).toBe(1);
    expect((await call("DELETE", path, adminToken, { programmeId })).status).toBe(409);

    // Historical appointment must not delete the auth login as a side-effect.
    await expect(lecturerService.remove(lecturerBId)).rejects.toBeInstanceOf(LecturerHeadAppointmentError);
    expect((await prisma.user.findUnique({ where: { id: lecturerBId } }))?.authId).not.toBeNull();
    expect((await programmeHeadService.overview(programmeId)).history).toHaveLength(2);
  });
});
