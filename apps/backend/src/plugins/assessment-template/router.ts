import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  PROGRAMME_WIDE_ROLES,
  type Role,
} from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { registry } from "../../core/plugins/registry.ts";
import { assessmentTemplateService } from "./service.ts";

const AssessmentTemplateItemInput = z.object({
  assessmentId: z.string().min(1),
  assessmentCategory: z.enum(["continuous", "final"]).default("continuous"),
  topicNumbers: z
    .array(z.coerce.number().int().min(1).max(15))
    .default([])
    .transform((items) => [...new Set(items)].sort((a, b) => a - b)),
  physicalSltHours: z.coerce.number().min(0).max(1000).nullable().default(null),
  onlineSltHours: z.coerce.number().min(0).max(1000).nullable().default(null),
  independentSltHours: z.coerce.number().min(0).max(1000).nullable().default(null),
});

const AssessmentTemplateInput = z.object({
  items: z.array(AssessmentTemplateItemInput).default([]),
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

function hasProgrammeWideRole(roles: Role[]): boolean {
  return roles.some((role) => PROGRAMME_WIDE_ROLES.includes(role));
}

async function ensureCourseAccess(
  req: Request,
  res: Response,
  id: string,
): Promise<boolean> {
  if (hasProgrammeWideRole(req.user!.roles)) return true;

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
  if (hasProgrammeWideRole(req.user!.roles)) return true;

  const courses = registry.get<CoursesAccessService>("courses").service;
  const spec = await courses.getSpec(id);
  const reviewStatus = spec?.review?.status;
  if (
    reviewStatus &&
    reviewStatus !== "draft" &&
    reviewStatus !== "changesRequested"
  ) {
    res.status(409).json({
      error: "Course specification is locked while it is in the review workflow",
    });
    return false;
  }

  return true;
}

export function createAssessmentTemplateRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/:courseId",
    requirePermission("courses:read"),
    async (req, res) => {
      const id = courseId(req, res);
      if (!id) return;
      if (!(await ensureCourseAccess(req, res, id))) return;

      res.json({ items: await assessmentTemplateService.get(id) });
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

      const parsed = AssessmentTemplateInput.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid body",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        res.json({
          items: await assessmentTemplateService.save(id, parsed.data.items),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not save assessment template metadata";
        res.status(message === "Course specification not found" ? 404 : 400).json({ error: message });
      }
    },
  );

  return router;
}
