import { Router } from "express";
import {
  CreateStudentInput,
  ListStudentsPageQuery,
  ListStudentsQuery,
  SetStudentStatusInput,
  UpdateStudentInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  InvalidStudentPageCursorError,
  studentService,
} from "./service.ts";
import { createStudentCohortRouter } from "./cohort-router.ts";

/**
 * Students REST router. Every route requires authentication; writes require the
 * `students:write` permission, reads require `students:read`. Bodies/queries are
 * validated with the shared Zod schemas so the wire contract is enforced at runtime.
 */
export function createStudentRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  router.use("/cohorts", createStudentCohortRouter());

  // GET /api/students?search=&activeOnly=
  // Kept for compatibility with existing non-interactive/cross-plugin callers.
  router.get("/", requirePermission("students:read"), async (req, res) => {
    const parsed = ListStudentsQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const students = await studentService.list(parsed.data);
    res.json(students);
  });

  // GET /api/students/page?search=&activeOnly=&cursor=&limit=
  // Interactive roster reads use this bounded, deterministic cursor contract.
  router.get("/page", requirePermission("students:read"), async (req, res) => {
    const parsed = ListStudentsPageQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await studentService.listPage(parsed.data));
    } catch (error) {
      if (error instanceof InvalidStudentPageCursorError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  // GET /api/students/:id
  router.get("/:id", requirePermission("students:read"), async (req, res) => {
    const student = await studentService.getById(req.params.id!);
    if (!student) {
      res.status(404).json({ error: "Student not found" });
      return;
    }
    res.json(student);
  });

  // POST /api/students
  router.post("/", requirePermission("students:write"), async (req, res) => {
    const parsed = CreateStudentInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      const created = await studentService.create(parsed.data);
      res.status(201).json(created);
    } catch (err) {
      res.status(409).json({ error: uniqueError(err) ?? "Could not create student" });
    }
  });

  // PATCH /api/students/:id
  router.patch("/:id", requirePermission("students:write"), async (req, res) => {
    const parsed = UpdateStudentInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      const updated = await studentService.update(req.params.id!, parsed.data);
      res.json(updated);
    } catch (err) {
      res.status(notFound(err) ? 404 : 409).json({
        error: notFound(err) ? "Student not found" : (uniqueError(err) ?? "Could not update"),
      });
    }
  });

  // PATCH /api/students/:id/status
  router.patch("/:id/status", requirePermission("students:write"), async (req, res) => {
    const parsed = SetStudentStatusInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      const updated = await studentService.setStatus(req.params.id!, parsed.data.status);
      res.json(updated);
    } catch {
      res.status(404).json({ error: "Student not found" });
    }
  });

  // DELETE /api/students/:id
  router.delete("/:id", requirePermission("students:write"), async (req, res) => {
    try {
      await studentService.remove(req.params.id!);
      res.status(204).end();
    } catch {
      res.status(404).json({ error: "Student not found" });
    }
  });

  return router;
}

/** Prisma P2025 = record not found. */
function notFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2025";
}

/** Prisma P2002 = unique constraint violation → friendly message. */
function uniqueError(err: unknown): string | null {
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
    const target = (err as { meta?: { target?: string[] } }).meta?.target?.join(", ") ?? "field";
    return `A student with that ${target} already exists`;
  }
  return null;
}
