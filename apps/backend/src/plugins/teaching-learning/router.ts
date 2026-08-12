import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../core/auth/middleware.ts";
import { PROGRAMME_WIDE_ROLES } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { registry } from "../../core/plugins/registry.ts";
import { teachingLearningService } from "./service.ts";

const TeachingLearningInput = z.object({
  philosophyTags: z.array(z.string()).default([]),
  philosophyStatement: z.string().default(""),
  teachingMethodIds: z.array(z.string()).default([]),
  activeLearningStrategyIds: z.array(z.string()).default([]),
  independentLearningTypes: z.array(z.string()).default([]),
  resourceTypes: z.array(z.string()).default([]),
  technologyTypes: z.array(z.string()).default([]),
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
  if (req.user!.roles.some((role) => PROGRAMME_WIDE_ROLES.includes(role))) {
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
  if (req.user!.roles.some((role) => PROGRAMME_WIDE_ROLES.includes(role))) {
    return true;
  }

  const courses = registry.get<CoursesAccessService>("courses").service;
  const spec = await courses.getSpec(id);
  const reviewStatus = spec?.review?.status;

  if (reviewStatus && !["draft", "changesRequested"].includes(reviewStatus)) {
    res.status(409).json({
      error: "Course specification is locked while it is in the review workflow",
    });
    return false;
  }

  return true;
}

export function createTeachingLearningRouter(): Router {
  const router = Router();
  router.use(requireAuth);

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
