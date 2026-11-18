import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";
import { signToken, type AuthUser, type Role } from "../core/auth/token.ts";
import { attendanceService } from "../plugins/offerings/attendance-service.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Isolated PostgreSQL plus ACTUAL local Supabase Storage API, not a mock.
 * The test refuses external/cloud storage endpoints and uses synthetic data.
 */
const describeCi = process.env.PERMISSION_REAL_STORAGE_TEST === "1" ? describe : describe.skip;
const DATE = "2026-11-18";
const DOCUMENT_BYTES = Buffer.from("%PDF-1.7\nSynthetic test document\n%%EOF\n");

type HttpResult = { status: number; body: any };
describeCi("private student permission letter HTTP workflow", () => {
  let server: Server;
  let storageClient: SupabaseClient;
  let baseUrl = "";
  let baseOffering = "";
  let courseId = "";
  let ownedStudentId = "";
  let otherStudentId = "";
  let otherUserId = "";
  let documentId = "";
  let lecturer: AuthUser;
  let student: AuthUser;
  let unrelatedLecturer: AuthUser;
  let coordinator: AuthUser;
  let otherStudent: AuthUser;
  const BUCKET = "student-leave-documents";
  let storagePath = "";

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    lecturer = await loadAuthUser("lecturer@dse.dev");
    student = await loadAuthUser("student@dse.dev");
    unrelatedLecturer = await loadAuthUser("hopper.lecturer@dse.dev");
    coordinator = await loadAuthUser("coordinator@dse.dev");

    const own = await prisma.student.findUniqueOrThrow({ where: { userId: student.id } });
    ownedStudentId = own.id;
    const external = await prisma.user.create({
      data: { name: "Synthetic second student", email: "permission-test-" + crypto.randomUUID() + "@example.test" },
    });
    otherUserId = external.id;
    const other = await prisma.student.create({ data: {
      name: "Synthetic second student",
      email: "permission-student-" + crypto.randomUUID() + "@example.test",
      studentId: "LETTER-" + crypto.randomUUID().slice(0, 8),
      userId: external.id, status: "Active",
    } });
    otherStudentId = other.id;
    otherStudent = {
      id: external.id, email: external.email, roles: ["student"],
      programmeRoles: [{ role: "student", programmeId: "dse" }],
    };

    const course = await prisma.course.create({ data: {
      code: "P-LETTER-" + crypto.randomUUID().slice(0, 8),
      title: "Synthetic Permission Evidence Test", programmeId: "dse",
    } });
    courseId = course.id;
    const offering = await prisma.offering.create({ data: {
      courseId, lecturerId: lecturer.id, term: "2026-27-test-" + crypto.randomUUID().slice(0, 8),
      sectionCode: "TEST", status: "Active",
      enrollments: { create: [{ studentId: ownedStudentId }, { studentId: otherStudentId }] },
    } });
    baseOffering = offering.id;

    const endpoint = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!endpoint || !key) throw new Error("Local Supabase Storage credentials missing");
    const url = new URL(endpoint);
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      throw new Error("Refusing to test permission documents on a hosted Storage project");
    }
    storageClient = createClient(endpoint, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: existing } = await storageClient.storage.getBucket(BUCKET);
    if (existing) throw new Error("Expected empty local Storage project");
    const { error: createError } = await storageClient.storage.createBucket(BUCKET, {
      public: false, fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
    });
    if (createError) throw createError;
    const { data: bucket, error: readError } = await storageClient.storage.getBucket(BUCKET);
    if (readError || !bucket || bucket.public) throw new Error("Test bucket must be private");

    server = createApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    if (storagePath) {
      const { error } = await storageClient.storage.from(BUCKET).remove([storagePath]);
      if (error) throw error;
    }
    if (documentId) {
      await prisma.$executeRaw`DELETE FROM "pms_attendance"."AttendancePermissionDocument" WHERE "id" = ${documentId}`;
    }
    if (baseOffering) await prisma.offering.delete({ where: { id: baseOffering } });
    if (courseId) await prisma.course.delete({ where: { id: courseId } });
    if (otherStudentId) await prisma.student.delete({ where: { id: otherStudentId } });
    if (otherUserId) await prisma.user.delete({ where: { id: otherUserId } });
    await close(server);
    if (storageClient) {
      const { error } = await storageClient.storage.deleteBucket(BUCKET);
      if (error) throw error;
    }
    await prisma.$disconnect();
  });

  async function api(path: string, actor: AuthUser | null, options: { method?: string; bytes?: Buffer; mime?: string; filename?: string } = {}): Promise<HttpResult> {
    const response = await fetch(baseUrl + path, {
      method: options.method ?? "GET",
      headers: {
        ...(actor ? { Authorization: "Bearer " + signToken(actor) } : {}),
        ...(options.bytes ? {
          "Content-Type": "application/octet-stream",
          "x-permission-mime": options.mime ?? "application/pdf",
          "x-permission-filename": encodeURIComponent(options.filename ?? "permission.pdf"),
        } : {}),
      },
      body: options.bytes ?? undefined,
    });
    const raw = await response.text();
    let parsed: any = raw;
    try { parsed = JSON.parse(raw); } catch { /* expected for Express' 413 HTML error */ }
    return { status: response.status, body: parsed };
  }
  async function storedCount(): Promise<number> {
    const { data, error } = await storageClient.storage.from(BUCKET).list(ownedStudentId, { limit: 100 });
    if (error) throw error;
    return data?.length ?? 0;
  }
  const base = () => "/api/offerings/" + baseOffering + "/attendance/" + DATE;
  const letter = () => base() + "/permission-letter";

  test("enrollment and existing lecturer Pending status are both required", async () => {
    expect((await api(letter(), null)).status).toBe(401);
    expect((await api(letter(), otherStudent)).status).toBe(200);
    expect((await api(letter(), student)).body).toBeNull();
    expect((await api(letter(), student, { method: "POST", bytes: DOCUMENT_BYTES })).status).toBe(409);
    expect(await storedCount()).toBe(0);

    const saved = await attendanceService.save(baseOffering, DATE, { records: [
      { studentId: ownedStudentId, status: null, permissionPending: true, note: "Awaiting letter" },
      { studentId: otherStudentId, status: "Present", permissionPending: false },
    ] }, lecturer.id);
    expect(saved.counts.PermissionPending).toBe(1);
  });

  test("bad data and another student cannot upload into someone else's pending slot", async () => {
    expect((await api(letter(), otherStudent, { method: "POST", bytes: DOCUMENT_BYTES })).status).toBe(409);
    expect((await api(letter(), student, { method: "POST", bytes: Buffer.from("FAKE-PDF") })).status).toBe(400);
    expect((await api(letter(), student, { method: "POST", bytes: DOCUMENT_BYTES, filename: "../permission.pdf" })).status).toBe(400);
    expect((await api(letter(), student, { method: "POST", bytes: DOCUMENT_BYTES, mime: "image/jpeg" })).status).toBe(400);
    expect(await storedCount()).toBe(0);
  });

  test("student submits one private document; cannot modify canonical attendance", async () => {
    const uploaded = await api(letter(), student, { method: "POST", bytes: DOCUMENT_BYTES });
    expect(uploaded.status).toBe(201);
    documentId = uploaded.body.id;
    expect(uploaded.body.filename).toBe("permission.pdf");
    expect(uploaded.body.storagePath).toBeUndefined();
    expect(await storedCount()).toBe(1);
    const persisted = await prisma.$queryRaw<Array<{ storagePath: string }>>`
      SELECT "storagePath" FROM "pms_attendance"."AttendancePermissionDocument" WHERE "id" = ${documentId}
    `;
    storagePath = persisted[0]?.storagePath ?? "";
    expect(storagePath).not.toBe("");
    const { data: downloaded, error: fileError } = await storageClient.storage.from(BUCKET).download(storagePath);
    expect(fileError).toBeNull();
    expect(Buffer.from(await downloaded!.arrayBuffer())).toEqual(DOCUMENT_BYTES);
    expect((await api(letter(), student)).body.id).toBe(documentId);
    expect((await api(letter(), otherStudent)).body).toBeNull();
    expect((await api(letter(), student, { method: "POST", bytes: DOCUMENT_BYTES })).status).toBe(409);

    const canonical = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT r."status" FROM "pms_attendance"."AttendanceRecord" r
      JOIN "pms_attendance"."AttendanceSession" s ON s."id"=r."sessionId"
      WHERE s."offeringId"=${baseOffering} AND r."studentId"=${ownedStudentId}
    `;
    expect(canonical).toHaveLength(0);
  });

  test("unrelated lecturers and other-programme reviewers are forbidden", async () => {
    const list = base() + "/permission-letters";
    expect((await api(list, unrelatedLecturer)).status).toBe(403);
    const crossProgramme: AuthUser = {
      ...coordinator, programmeRoles: [{ role: "program_coordinator" as Role, programmeId: "other-programme" }],
    };
    expect((await api(list, crossProgramme)).status).toBe(403);
    expect((await api(list, otherStudent)).status).toBe(403);
    expect((await api(list, null)).status).toBe(401);
    expect((await api(list, lecturer)).status).toBe(200);
  });

  test("assigned lecturer can request a short-lived signed private download", async () => {
    const download = base() + "/permission-letters/" + ownedStudentId + "/download";
    expect((await api(download, unrelatedLecturer)).status).toBe(403);
    const result = await api(download, lecturer);
    expect(result.status).toBe(200);
    expect(result.body.expiresInSeconds).toBe(60);
    expect(result.body.url).toContain("/storage/v1/object/sign/");
    const signed = await fetch(result.body.url);
    expect(signed.ok).toBe(true);
    expect(Buffer.from(await signed.arrayBuffer())).toEqual(DOCUMENT_BYTES);
    const publicUrl = storageClient.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
    const publicResponse = await fetch(publicUrl);
    expect(publicResponse.ok).toBe(false);
  });
});

async function loadAuthUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email }, include: { roleAssignments: { include: { role: true } } },
  });
  return { id: user.id, email: user.email,
    roles: user.roleAssignments.map(x => x.role.slug as Role),
    programmeRoles: user.roleAssignments.map(x => ({ role: x.role.slug as Role, programmeId: x.programmeId })),
  };
}
async function close(server?: Server) {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
