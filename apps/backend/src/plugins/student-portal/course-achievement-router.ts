import { Router } from "express";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  CourseAchievementAccessError,
  courseAchievementService,
} from "./course-achievement-service.ts";

export function createCourseAchievementRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/course-achievements",
    requirePermission("student-portal:read"),
    async (req, res) => {
      try {
        res.json(await courseAchievementService.list(req.user!.id));
      } catch (error) {
        if (error instanceof CourseAchievementAccessError) {
          res.status(403).json({ error: error.message });
          return;
        }
        console.error("Student course achievement request failed", error);
        res.status(500).json({ error: "Could not load course achievements" });
      }
    },
  );

  return router;
}
