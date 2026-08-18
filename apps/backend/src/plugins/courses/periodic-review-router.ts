import { Router, type Request, type Response } from "express";
import {
  CourseSpecReviewDueQuerySchema,
  CreateCourseSpecPeriodicReviewSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { canCreateCourseSpecRevision } from "./revision-authorization.ts";
import { courseService } from "./service.ts";
import {
  CourseSpecPeriodicReviewError,
  courseSpecPeriodicReviewService,
} from "./periodic-review-service.ts";

function requiredParam(req: Request, res: Response, name: string): string | null {
  const value = req.params[name];
  if (!value || typeof value !== "string") {
    res.status(400).json({ error: `${name} is required` });
    return null;
  }
  return value;
}

async function governanceCourse(req: Request, res: Response, courseId: string) {
  const course = await courseService.getById(courseId);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return null;
  }
  if (!canCreateCourseSpecRevision(req.user!, course.programmeId)) {
    res.status(403).json({
      error: "Only programme academic leadership may manage periodic course specification reviews",
    });
    return null;
  }
  return course;
}

function sendPeriodicReviewError(res: Response, error: unknown) {
  if (error instanceof CourseSpecPeriodicReviewError) {
    const status =
      error.code === "COURSE_NOT_FOUND" || error.code === "REVIEWER_NOT_FOUND" ? 404 :
      error.code === "INVALID_REVIEW_DATE" ? 400 : 409;
    res.status(status).json({ error: error.message });
    return;
  }
  const code = (error as { code?: string }).code;
  if (code === "OPEN_REVISION_EXISTS" || code === "SOURCE_NOT_APPROVED") {
    res.status(409).json({ error: error instanceof Error ? error.message : "Periodic review conflict" });
    return;
  }
  res.status(500).json({ error: "Could not complete periodic course specification review" });
}

export function createCoursePeriodicReviewRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/spec-periodic-reviews/due",
    requirePermission("courses:review"),
    async (req, res) => {
      const parsed = CourseSpecReviewDueQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid periodic review due query", details: parsed.error.flatten() });
        return;
      }
      try {
        const rows = await courseSpecPeriodicReviewService.listDue({
          asOf: parsed.data.asOf ?? new Date(),
          includeFutureDays: parsed.data.includeFutureDays,
        });
        res.json(rows.filter((row) => canCreateCourseSpecRevision(req.user!, row.programmeId)));
      } catch (error) {
        sendPeriodicReviewError(res, error);
      }
    },
  );

  router.get(
    "/:id/spec/periodic-reviews",
    requirePermission("courses:review"),
    async (req, res) => {
      const courseId = requiredParam(req, res, "id");
      if (!courseId) return;
      if (!(await governanceCourse(req, res, courseId))) return;
      try {
        res.json(await courseSpecPeriodicReviewService.listForCourse(courseId));
      } catch (error) {
        sendPeriodicReviewError(res, error);
      }
    },
  );

  router.post(
    "/:id/spec/periodic-reviews",
    requirePermission("courses:review"),
    async (req, res) => {
      const courseId = requiredParam(req, res, "id");
      if (!courseId) return;
      if (!(await governanceCourse(req, res, courseId))) return;
      const reviewerId = req.user?.id;
      if (!reviewerId) {
        res.status(401).json({ error: "Authenticated user is required" });
        return;
      }
      const parsed = CreateCourseSpecPeriodicReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid periodic review", details: parsed.error.flatten() });
        return;
      }
      try {
        res.status(201).json(
          await courseSpecPeriodicReviewService.create(courseId, reviewerId, parsed.data),
        );
      } catch (error) {
        sendPeriodicReviewError(res, error);
      }
    },
  );

  return router;
}
