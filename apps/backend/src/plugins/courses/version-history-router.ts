import { Router, type Request, type Response } from "express";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, PROGRAMME_WIDE_ROLES } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { courseService } from "./service.ts";
import { courseSpecVersionHistoryService } from "./version-history-service.ts";

function param(req: Request, res: Response, name: string): string | null {
  const value = req.params[name];
  if (!value || typeof value !== "string") {
    res.status(400).json({ error: `${name} is required` });
    return null;
  }
  return value;
}

async function canReadCourse(req: Request, res: Response, courseId: string) {
  const course = await courseService.getById(courseId);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return false;
  }
  if (hasAnyRoleInProgramme(req.user!, PROGRAMME_WIDE_ROLES, course.programmeId)) return true;
  if (!req.user?.id) {
    res.status(401).json({ error: "Authenticated user is required" });
    return false;
  }
  if (!(await courseService.lecturerCanAccess(courseId, req.user.id))) {
    res.status(403).json({ error: "You can only access your own courses" });
    return false;
  }
  return true;
}

export function createCourseSpecVersionHistoryRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/:id/spec/versions", requirePermission("courses:read"), async (req, res) => {
    const courseId = param(req, res, "id");
    if (!courseId || !(await canReadCourse(req, res, courseId))) return;
    res.json(await courseSpecVersionHistoryService.history(courseId));
  });

  router.get("/:id/spec/versions/:versionId", requirePermission("courses:read"), async (req, res) => {
    const courseId = param(req, res, "id");
    const versionId = param(req, res, "versionId");
    if (!courseId || !versionId || !(await canReadCourse(req, res, courseId))) return;
    const version = await courseSpecVersionHistoryService.exactVersion(courseId, versionId);
    if (!version) {
      res.status(404).json({ error: "Course specification version not found" });
      return;
    }
    res.json(version);
  });

  router.get("/:id/spec/versions/:fromVersionId/compare/:toVersionId", requirePermission("courses:read"), async (req, res) => {
    const courseId = param(req, res, "id");
    const fromVersionId = param(req, res, "fromVersionId");
    const toVersionId = param(req, res, "toVersionId");
    if (!courseId || !fromVersionId || !toVersionId || !(await canReadCourse(req, res, courseId))) return;
    const comparison = await courseSpecVersionHistoryService.compare(courseId, fromVersionId, toVersionId);
    if (!comparison) {
      res.status(404).json({ error: "Course specification version not found" });
      return;
    }
    res.json(comparison);
  });

  return router;
}
