import { Router } from "express";
import { SetCourseSpecResponsibleLecturersInputSchema } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { CourseSpecLockedError } from "./spec-lock.ts";
import {
  getCourseSpecResponsibleLecturers,
  setCourseSpecResponsibleLecturers,
} from "./responsible-lecturers.ts";

export function createResponsibleLecturersRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // Assignment is programme administration, not an author privilege.
  router.get(
    "/:id/spec/responsible-lecturers",
    requirePermission("courses:manage"),
    async (req, res) => {
      const courseId = req.params.id;
      if (!courseId) {
        res.status(400).json({ error: "Course id is required" });
        return;
      }
      const result = await getCourseSpecResponsibleLecturers(courseId);
      if (!result) {
        res.status(404).json({ error: "Course not found" });
        return;
      }
      res.json(result);
    },
  );

  router.put(
    "/:id/spec/responsible-lecturers",
    requirePermission("courses:manage"),
    async (req, res) => {
      const courseId = req.params.id;
      if (!courseId) {
        res.status(400).json({ error: "Course id is required" });
        return;
      }
      const parsed = SetCourseSpecResponsibleLecturersInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid responsible lecturer assignment",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        res.json(await setCourseSpecResponsibleLecturers(courseId, parsed.data));
      } catch (error) {
        if (error instanceof CourseSpecLockedError) {
          res.status(409).json({ error: error.message });
          return;
        }
        const message = error instanceof Error ? error.message : "Could not assign responsible lecturers";
        res.status(message === "Course not found" ? 404 : 400).json({ error: message });
      }
    },
  );

  return router;
}
