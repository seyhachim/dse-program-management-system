import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { TeachingLearningProfile } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  PROGRAMME_WIDE_ROLES,
  type Role,
} from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { registry } from "../../core/plugins/registry.ts";
import { teachingLearningService } from "./service.ts";
import { weekProjectProgressService } from "./project-progress-service.ts";

export const TeachingLearningInput = TeachingLearningProfile.strict();

const WeekProjectProgressInput = z.object({
  weekId: z.string().min(1),
  milestone: z.string().default(""),
  expectedProgress: z.string().default(""),
  deliverable: z.string().default(""),
  status: z.enum(["planned", "in_progress", "completed"]).default("planned"),
});

type CoursesAccessService = {
  lecturerCanAccess(courseId: string, userId: string): Promise<boolean>;
  getSpec(courseId: string): Promise<{
    review?: { status?: string };
  } | null>;
};

function courseId(req: Request, res: Response): string | null {
  const id = req.params.courseId;
  if (!id) {
    res.status(400).json({ error: "courseId is required" });
    return null;
  }
  return id;
}

async function ensureCourseAccess(
  req: Request,
  res: Response,
  id: string,
): Promise<boolean> {
  if (hasProgrammeWideRole(req.user!.roles)) {
    return true;
  }

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Authenticated user is required" });
    return false;
  }

  const courses = registry.get<CoursesAccessService>("courses").service;
  if (!(await courses.lecturerCanAccess(id, userId))) {
    res.status(403).json({ error: "You can only access your own courses" });
    return false;
  }

  return true;
}

async function ensureEditable(
  req: Request,
  res: Response,
  id: string,
): Promise<boolean> {
  if (hasProgrammeWideRole(req.user!.roles)) {
    return true;
  }

  const courses = registry.get<CoursesAccessService>("courses").service;
  const spec = await courses.getSpec(id);
  const reviewStatus = spec?.review?.status;

  if (!isEditableReviewStatus(reviewStatus)) {
    res.status(409).json({
      error: "Course specification is locked while it is in the review workflow",
    });
    return false;
  }

  return true;
}

export function hasProgrammeWideRole(roles: Role[]): boolean {
  return roles.some((role) => PROGRAMME_WIDE_ROLES.includes(role));
}

export function isEditableReviewStatus(status?: string): boolean {
  return !status || status === "draft" || status === "changesRequested";
}

export function createTeachingLearningRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/:courseId/project-progress/:weekId",
    requirePermission("courses:read"),
    async (req, res) => {
      const id = courseId(req, res);
      if (!id) return;
      if (!(await ensureCourseAccess(req, res, id))) return;
      const weekId = req.params.weekId;
      if (!weekId) {
        res.status(400).json({ error: "weekId is required" });
        return;
      }

      res.json(await weekProjectProgressService.get(id, weekId));
    },
  );

  router.put(
    "/:courseId/project-progress/:weekId",
    requirePermission("courses:write"),
    async (req, res) => {
      const id = courseId(req, res);
      if (!id) return;
      if (!(await ensureCourseAccess(req, res, id))) return;
      if (!(await ensureEditable(req, res, id))) return;
      const weekId = req.params.weekId;
      if (!weekId) {
        res.status(400).json({ error: "weekId is required" });
        return;
      }

      const parsed = WeekProjectProgressInput.safeParse({
        ...req.body,
        weekId,
      });
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid body",
          details: parsed.error.flatten(),
        });
        return;
      }

      res.json(await weekProjectProgressService.save(id, parsed.data));
    },
  );

  router.get(
    "/:courseId",
    requirePermission("courses:read"),
    async (req, res) => {
      const id = courseId(req, res);
      if (!id) return;
      if (!(await ensureCourseAccess(req, res, id))) return;

      res.json(await teachingLearningService.get(id));
    },
  );

  router.put(
    "/:courseId",
    requirePermission("courses:write"),
    async (req, res) => {
      const id = courseId(req, res);
      if (!id) return;
      if (!(await ensureCourseAccess(req, res, id))) return;
      if (!(await ensureEditable(req, res, id))) return;

      const parsed = TeachingLearningInput.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid body",
          details: parsed.error.flatten(),
        });
        return;
      }

      res.json(await teachingLearningService.save(id, parsed.data));
    },
  );

  return router;
}
