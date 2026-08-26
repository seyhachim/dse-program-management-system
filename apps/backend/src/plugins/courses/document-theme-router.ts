import { Router, type Request, type Response } from "express";
import { UpdateCourseSpecDocumentThemeSchema } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  hasAnyRoleInProgramme,
  type Role,
} from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { CourseSpecLockedError } from "./spec-lock.ts";
import { courseService } from "./service.ts";
import { responsibleLecturerCanAccess } from "./responsible-lecturers.ts";
import {
  CourseSpecThemeIntegrityError,
  CourseSpecThemeNotFoundError,
  getCourseSpecDocumentTheme,
  updateCourseSpecDocumentTheme,
  updateProgrammeCourseSpecDocumentTheme,
} from "./document-theme-service.ts";

const GOVERNANCE_ROLES: Role[] = ["admin", "program_coordinator"];

function getCourseSpecId(req: Request): string | undefined {
  const value = req.query.courseSpecId;
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * Document presentation is part of the same academic Course Spec record.
 * Responsible-Lecturer-only assignments must therefore receive the exact same
 * saved version theme as Offering-based lecturers and governance users.
 *
 * `courseService.lecturerCanAccess` is extended by the courses plugin at runtime,
 * but the explicit responsible check keeps this router correct in isolation too
 * (including focused integration tests and future mount-order refactors).
 */
export async function lecturerCanReadCourseSpecTheme(
  courseId: string,
  lecturerId: string,
): Promise<boolean> {
  return (
    (await responsibleLecturerCanAccess(courseId, lecturerId)) ||
    (await courseService.lecturerCanAccess(courseId, lecturerId))
  );
}

async function ensureThemeAccess(
  req: Request,
  res: Response,
  courseId: string,
): Promise<{ programmeId: string; governance: boolean } | null> {
  const course = await courseService.getById(courseId);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return null;
  }
  const governance = hasAnyRoleInProgramme(
    req.user!,
    GOVERNANCE_ROLES,
    course.programmeId,
  );
  if (
    !governance &&
    !(await lecturerCanReadCourseSpecTheme(courseId, req.user!.id))
  ) {
    res.status(403).json({ error: "You can only access your own courses" });
    return null;
  }
  return { programmeId: course.programmeId, governance };
}

function sendThemeError(res: Response, error: unknown): void {
  if (error instanceof CourseSpecThemeNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof CourseSpecLockedError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof CourseSpecThemeIntegrityError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not manage Course Specification document style" });
}

export function createCourseSpecDocumentThemeRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/:id/spec/document-theme",
    requirePermission("courses:read"),
    async (req, res) => {
      const courseId = req.params.id;
      if (!courseId) {
        res.status(400).json({ error: "Course id is required" });
        return;
      }
      if (!(await ensureThemeAccess(req, res, courseId))) return;
      try {
        res.json(
          await getCourseSpecDocumentTheme(courseId, getCourseSpecId(req)),
        );
      } catch (error) {
        sendThemeError(res, error);
      }
    },
  );

  router.put(
    "/:id/spec/document-theme",
    requirePermission("courses:review"),
    async (req, res) => {
      const courseId = req.params.id;
      if (!courseId) {
        res.status(400).json({ error: "Course id is required" });
        return;
      }
      const access = await ensureThemeAccess(req, res, courseId);
      if (!access) return;
      if (!access.governance) {
        res.status(403).json({
          error: "Only Admin or Programme Coordinator can change document style",
        });
        return;
      }
      const parsed = UpdateCourseSpecDocumentThemeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid Course Specification document style",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        res.json(
          await updateCourseSpecDocumentTheme(
            courseId,
            parsed.data,
            req.user!.id,
            getCourseSpecId(req),
          ),
        );
      } catch (error) {
        sendThemeError(res, error);
      }
    },
  );

  router.put(
    "/:id/spec/document-theme/programme-default",
    requirePermission("courses:review"),
    async (req, res) => {
      const courseId = req.params.id;
      if (!courseId) {
        res.status(400).json({ error: "Course id is required" });
        return;
      }
      const access = await ensureThemeAccess(req, res, courseId);
      if (!access) return;
      if (!access.governance) {
        res.status(403).json({
          error: "Only Admin or Programme Coordinator can change the programme document style",
        });
        return;
      }
      const parsed = UpdateCourseSpecDocumentThemeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid Course Specification document style",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        res.json(
          await updateProgrammeCourseSpecDocumentTheme(
            courseId,
            parsed.data,
            req.user!.id,
          ),
        );
      } catch (error) {
        sendThemeError(res, error);
      }
    },
  );

  return router;
}
