import { Router, type Request, type Response } from "express";
import {
  CreateCourseInput,
  ListCoursesQuery,
  SPEC_SECTION_SCHEMAS,
  UpdateCourseInput,
  type SpecSectionId,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { PROGRAMME_WIDE_ROLES } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { courseService, ReferenceError } from "./service.ts";

/**
 * A lecturer may only see/edit courses they're assigned to; programme-wide
 * roles (admin and friends — see `PROGRAMME_WIDE_ROLES`) may access any.
 * Returns true when the caller may proceed; otherwise writes the 403/404 response
 * and returns false. `requireAuth` has already run, so `req.user` is set.
 */
async function ensureCourseAccess(req: Request, res: Response, courseId: string): Promise<boolean> {
  if (req.user!.roles.some((r) => PROGRAMME_WIDE_ROLES.includes(r))) return true;
  const course = await courseService.getById(courseId);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return false;
  }
  // A lecturer may access a course they own or teach an offering of.
  if (!(await courseService.lecturerCanAccess(courseId, req.user!.id))) {
    res.status(403).json({ error: "You can only access your own courses" });
    return false;
  }
  return true;
}

export function createCourseRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", requirePermission("courses:read"), async (req, res) => {
    const parsed = ListCoursesQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    // Lecturers/students only ever see the courses assigned to them.
    const ownerScope = req.user!.roles.some((r) => PROGRAMME_WIDE_ROLES.includes(r)) ? undefined : req.user!.id;
    res.json(await courseService.list(parsed.data, ownerScope));
  });

  // Static route registered before "/:id" so "spec-progress" isn't swallowed as a course id.
  router.get("/spec-progress", requirePermission("courses:read"), async (req, res) => {
    const ownerScope = req.user!.roles.some((r) => PROGRAMME_WIDE_ROLES.includes(r)) ? undefined : req.user!.id;
    res.json(await courseService.listSpecProgress(ownerScope));
  });

  router.get("/:id", requirePermission("courses:read"), async (req, res) => {
    if (!(await ensureCourseAccess(req, res, req.params.id!))) return;
    const course = await courseService.getDetailed(req.params.id!);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json(course);
  });

  // Creating/deleting/directly-editing a course record (code, credits, lecturer
  // assignment, ...) is curriculum-admin work, not something a lecturer does.
  router.post("/", requirePermission("courses:manage"), async (req, res) => {
    const parsed = CreateCourseInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(await courseService.create(parsed.data));
    } catch (err) {
      res.status(errStatus(err)).json({ error: errMessage(err, "code") ?? "Could not create course" });
    }
  });

  router.patch("/:id", requirePermission("courses:manage"), async (req, res) => {
    const parsed = UpdateCourseInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await courseService.update(req.params.id!, parsed.data));
    } catch (err) {
      res.status(errStatus(err)).json({ error: errMessage(err, "code") ?? "Could not update course" });
    }
  });

  router.delete("/:id", requirePermission("courses:manage"), async (req, res) => {
    try {
      await courseService.remove(req.params.id!);
      res.status(204).end();
    } catch {
      res.status(404).json({ error: "Course not found" });
    }
  });

  /* -------------------------------------------------- Course Specification */

  router.get("/:id/spec", requirePermission("courses:read"), async (req, res) => {
    if (!(await ensureCourseAccess(req, res, req.params.id!))) return;
    const spec = await courseService.getSpec(req.params.id!);
    if (!spec) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json(spec);
  });

  router.post("/:id/spec/submit", requirePermission("courses:write"), async (req, res) => {
    if (!(await ensureCourseAccess(req, res, req.params.id!))) return;
    const note = typeof req.body?.note === "string" ? req.body.note : "";
    try {
      res.json(await courseService.submitSpec(req.params.id!, req.user!.id, note));
    } catch (err) {
      res.status(errStatus(err)).json({ error: errMessage(err, "") ?? "Could not submit course specification" });
    }
  });

  router.put("/:id/spec/:sectionId", requirePermission("courses:write"), async (req, res) => {
    // A lecturer may only fill in the spec for a course they're assigned to;
    // admins can edit any course's spec.
    if (!(await ensureCourseAccess(req, res, req.params.id!))) return;

    const sectionId = req.params.sectionId as SpecSectionId;
    const schema = SPEC_SECTION_SCHEMAS[sectionId];
    if (!schema) {
      res.status(400).json({ error: `Section "${sectionId}" cannot be saved yet` });
      return;
    }
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await courseService.saveSection(req.params.id!, sectionId, parsed.data));
    } catch (err) {
      res.status(errStatus(err)).json({ error: errMessage(err, "code") ?? "Could not save section" });
    }
  });

  return router;
}

/** Map service/Prisma errors to HTTP status. */
function errStatus(err: unknown): number {
  if (err instanceof ReferenceError) return 400;
  const code = (err as { code?: string }).code;
  if (code === "P2002") return 409;
  if (code === "P2025") return 404;
  return 409;
}

function errMessage(err: unknown, uniqueField: string): string | null {
  if (err instanceof ReferenceError) return err.message;
  const code = (err as { code?: string }).code;
  if (code === "P2002") return `A course with that ${uniqueField} already exists`;
  if (code === "P2025") return "Course not found";
  return null;
}
