import express, { Router, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AttendanceDateSchema } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, type Role } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { offeringService } from "./service.ts";
import { PERMISSION_DOCUMENT_BUCKET, PermissionDocumentValidationError, validatePermissionDocument } from "./permission-document-file.ts";

type Row = {
  id: string; studentId: string; originalName: string; mimeType: string;
  sizeBytes: number; storagePath: string; submittedAt: Date;
};
type Pending = { id: string };
const STAFF_ROLES: Role[] = ["admin", "program_coordinator"];
let client: SupabaseClient | null = null;

class WorkflowError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function storageAdmin(): SupabaseClient {
  if (client) return client;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Private document storage is unavailable");
  }
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
function attendanceDate(req: Request): Date {
  const value = AttendanceDateSchema.safeParse(req.params.date);
  if (!value.success) throw new WorkflowError(400, "Invalid attendance date");
  return new Date(value.data + "T00:00:00.000Z");
}
function view(row: Row) {
  return { id: row.id, studentId: row.studentId, filename: row.originalName,
    mimeType: row.mimeType, sizeBytes: row.sizeBytes, submittedAt: row.submittedAt.toISOString() };
}
async function studentForRequest(req: Request): Promise<string> {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id }, select: { id: true, status: true, email: true },
  });
  if (!student || student.status !== "Active" || !student.email) {
    throw new WorkflowError(403, "Active student portal access required");
  }
  const enrollment = await prisma.enrollment.findUnique({
    where: { offeringId_studentId: { offeringId: req.params.id!, studentId: student.id } },
    select: { id: true },
  });
  if (!enrollment) throw new WorkflowError(404, "Permission record not found");
  return student.id;
}
async function requireStaffScope(req: Request): Promise<void> {
  const scope = await offeringService.accessScope(req.params.id!);
  if (!scope) throw new WorkflowError(404, "Offering not found");
  if (scope.lecturerId === req.user!.id || scope.coLecturerIds.includes(req.user!.id) ||
    hasAnyRoleInProgramme(req.user!, STAFF_ROLES, scope.programmeId)) return;
  throw new WorkflowError(403, "You cannot review this course's permission documents");
}
async function getActivePending(offeringId: string, date: Date, studentId: string): Promise<Pending | null> {
  const rows = await prisma.$queryRaw<Pending[]>`
    SELECT p."id" FROM "pms_attendance"."AttendancePermissionPending" p
    JOIN "pms_attendance"."AttendanceSession" s ON s."id" = p."sessionId"
    WHERE s."offeringId" = ${offeringId} AND s."sessionDate" = ${date}
      AND p."studentId" = ${studentId} AND p."resolvedAt" IS NULL LIMIT 1
  `;
  return rows[0] ?? null;
}
async function getDocument(offeringId: string, date: Date, studentId: string): Promise<Row | null> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT d."id",d."studentId",d."originalName",d."mimeType",d."sizeBytes",d."storagePath",d."submittedAt"
    FROM "pms_attendance"."AttendancePermissionDocument" d
    JOIN "pms_attendance"."AttendancePermissionPending" p ON p."id" = d."permissionPendingId"
    JOIN "pms_attendance"."AttendanceSession" s ON s."id" = p."sessionId"
    WHERE s."offeringId" = ${offeringId} AND s."sessionDate" = ${date}
      AND d."studentId" = ${studentId}
    ORDER BY d."submittedAt" DESC LIMIT 1
  `;
  return rows[0] ?? null;
}
function failure(error: unknown, res: Response) {
  if (error instanceof WorkflowError || error instanceof PermissionDocumentValidationError) {
    res.status(error.status).json({ error: error.message });
  } else {
    console.error("Permission letter operation failed", error instanceof Error ? error.name : "unknown");
    res.status(500).json({ error: "Permission document service unavailable" });
  }
}

/** Backend-only private storage. A student must already have an unresolved canonical Pending mark. */
export function createPermissionDocumentRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/:id/attendance/:date/permission-letter", requirePermission("student-portal:read"),
    async (req, res) => {
      try {
        const studentId = await studentForRequest(req);
        const row = await getDocument(req.params.id!, attendanceDate(req), studentId);
        res.json(row ? view(row) : null);
      } catch (error) { failure(error, res); }
    });

  router.post("/:id/attendance/:date/permission-letter", requirePermission("student-portal:read"),
    express.raw({ type: "application/octet-stream", limit: "5mb" }),
    async (req, res) => {
      try {
        const studentId = await studentForRequest(req);
        const date = attendanceDate(req);
        const file = validatePermissionDocument(
          req.header("x-permission-filename"), req.header("x-permission-mime"), req.body,
        );
        const pending = await getActivePending(req.params.id!, date, studentId);
        if (!pending) throw new WorkflowError(409, "Your lecturer must first mark Permission Pending");
        if (await getDocument(req.params.id!, date, studentId)) {
          throw new WorkflowError(409, "A permission letter has already been submitted");
        }
        const id = crypto.randomUUID();
        const path = studentId + "/" + pending.id + "/" + id + "." + file.extension;
        const storage = storageAdmin().storage.from(PERMISSION_DOCUMENT_BUCKET);
        const stored = await storage.upload(path, file.bytes, {
          upsert: false, contentType: file.contentType, cacheControl: "0",
        });
        if (stored.error) throw new Error("Private upload failed");
        try {
          // Insert only while the original pending record is still unresolved.
          const inserted = await prisma.$queryRaw<Row[]>`
            INSERT INTO "pms_attendance"."AttendancePermissionDocument"
              ("id","permissionPendingId","studentId","submittedById",
               "storagePath","originalName","mimeType","sizeBytes")
            SELECT ${id}, p."id", ${studentId}, ${req.user!.id},
              ${path}, ${file.filename}, ${file.contentType}, ${file.bytes.length}
            FROM "pms_attendance"."AttendancePermissionPending" p
            JOIN "pms_attendance"."AttendanceSession" s ON s."id" = p."sessionId"
            WHERE p."id" = ${pending.id} AND p."resolvedAt" IS NULL
              AND p."studentId" = ${studentId}
              AND s."offeringId" = ${req.params.id!} AND s."sessionDate" = ${date}
            ON CONFLICT ("permissionPendingId") DO NOTHING
            RETURNING "id","studentId","originalName","mimeType","sizeBytes","storagePath","submittedAt"
          `;
          if (!inserted[0]) throw new WorkflowError(409, "Permission status changed; refresh the attendance page");
          res.status(201).json(view(inserted[0]));
        } catch (error) {
          const cleanup = await storage.remove([path]);
          if (cleanup.error) console.error("Private orphan cleanup failed", cleanup.error.name);
          throw error;
        }
      } catch (error) { failure(error, res); }
    });

  router.get("/:id/attendance/:date/permission-letters", requirePermission("offerings:read"),
    async (req, res) => {
      try {
        await requireStaffScope(req);
        const date = attendanceDate(req);
        const rows = await prisma.$queryRaw<Row[]>`
          SELECT d."id",d."studentId",d."originalName",d."mimeType",d."sizeBytes",d."storagePath",d."submittedAt"
          FROM "pms_attendance"."AttendancePermissionDocument" d
          JOIN "pms_attendance"."AttendancePermissionPending" p ON p."id" = d."permissionPendingId"
          JOIN "pms_attendance"."AttendanceSession" s ON s."id" = p."sessionId"
          WHERE s."offeringId" = ${req.params.id!} AND s."sessionDate" = ${date}
          ORDER BY d."submittedAt" DESC
        `;
        res.json(rows.map(view));
      } catch (error) { failure(error, res); }
    });

  router.get("/:id/attendance/:date/permission-letters/:studentId/download", requirePermission("offerings:read"),
    async (req, res) => {
      try {
        await requireStaffScope(req);
        const doc = await getDocument(req.params.id!, attendanceDate(req), req.params.studentId!);
        if (!doc) throw new WorkflowError(404, "Permission document not found");
        const { data, error } = await storageAdmin().storage.from(PERMISSION_DOCUMENT_BUCKET)
          .createSignedUrl(doc.storagePath, 60, { download: doc.originalName });
        if (error || !data) throw new Error("Private signed download failed");
        res.json({ url: data.signedUrl, expiresInSeconds: 60 });
      } catch (error) { failure(error, res); }
    });
  return router;
}
