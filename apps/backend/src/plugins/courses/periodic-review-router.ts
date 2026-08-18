import { Router, type Request, type Response } from "express";
import {
  CreateCourseSpecPeriodicReviewSchema,
  ListDueCourseSpecReviewsQuerySchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { canCreateCourseSpecRevision } from "./revision-authorization.ts";
import { courseService } from "./service.ts";
import {
  CourseSpecPeriodicReviewError,
  courseSpecPeriodicReviewService,
} from "./periodic-review-service.ts";

function requiredParam(
  req: Request,
  res: Response,
  name: string,
): string | null {
  const value = req.params[name];
  if (!value || typeof value !== "string") {
    res.status(400).json({ error: `${name} is required` });
    return null;
  }
  return value;
}

function reviewErrorStatus(err: unknown): number {
  if (!(err instanceof CourseSpecPeriodicReviewError)) return 409;
  switch (err.code) {
    case "SOURCE_NOT_FOUND":
    case "REVIEWER_NOT_FOUND":
      return 404;
    case "FUTURE_REVIEW_DATE":
      return 400;
    case "SOURCE_NOT_APPROVED":
    case "SOURCE_NOT_CURRENT":
      return 409;
  }
}

export function createCourseSpecPeriodicReviewRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/periodic-reviews/due",
    requirePermission("courses:review"),
    async (req, res) => {
      const parsed = ListDueCourseSpecReviewsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid periodic-review query",
          details: parsed.error.flatten(),
        });
        return;
      }

      if (
        !hasAnyRoleInProgramme(
          req.user!,
          ["admin", "program_coordinator"],
          parsed.data.programmeId,
        )
      ) {
        res.status(403).json({
          error: "Only programme academic leadership may view the periodic-review queue",
        });
        return;
      }

      const asOf = parsed.data.asOf ?? new Date().toISOString().slice(0, 10);
      res.json(
        await courseSpecPeriodicReviewService.listDue(
          parsed.data.programmeId,
          asOf,
        ),
      );
    },
  );

  router.get(
    "/:id/spec/periodic-reviews",
    requirePermission("courses:read"),
    async (req, res) => {
      const courseId = requiredParam(req, res, "id");
      if (!courseId) return;
      const course = await courseService.getById(courseId);
      if (!course) {
        res.status(404).json({ error: "Course not found" });
        return;
      }

      if (
        !hasAnyRoleInProgramme(
          req.user!,
          ["admin", "program_coordinator", "program_secretary", "qa_reviewer"],
          course.programmeId,
        ) && !(await courseService.lecturerCanAccess(courseId, req.user!.id))
      ) {
        res.status(403).json({ error: "You cannot access this course" });
        return;
      }

      res.json(await courseSpecPeriodicReviewService.list(courseId));
    },
  );

  router.post(
    "/:id/spec/periodic-reviews",
    requirePermission("courses:review"),
    async (req, res) => {
      const courseId = requiredParam(req, res, "id");
      if (!courseId) return;
      const course = await courseService.getById(courseId);
      if (!course) {
        res.status(404).json({ error: "Course not found" });
        return;
      }
      if (!canCreateCourseSpecRevision(req.user!, course.programmeId)) {
        res.status(403).json({
          error: "Only programme academic leadership may record a periodic review",
        });
        return;
      }

      const parsed = CreateCourseSpecPeriodicReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid periodic review",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        res.status(201).json(
          await courseSpecPeriodicReviewService.create(
            courseId,
            req.user!.id,
            parsed.data,
          ),
        );
      } catch (err) {
        res.status(reviewErrorStatus(err)).json({
          error:
            err instanceof Error
              ? err.message
              : "Could not record course specification periodic review",
        });
      }
    },
  );

  return router;
}
