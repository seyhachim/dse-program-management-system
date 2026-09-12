import { Router } from "express";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { PortalAccessError, PortalNotFoundError } from "./service.ts";
import { studentPortalAttendanceService } from "./student-attendance-service.ts";

export function createStudentAttendanceRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/courses/:offeringId/attendance",
    requirePermission("student-portal:read"),
    async (req, res) => {
      try {
        res.json(
          await studentPortalAttendanceService.forCourse(
            req.user!.id,
            req.params.offeringId!,
          ),
        );
      } catch (error) {
        if (error instanceof PortalNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof PortalAccessError) {
          res.status(403).json({ error: error.message });
          return;
        }
        console.error("Student attendance request failed", error);
        res.status(500).json({ error: "Could not load attendance" });
      }
    },
  );

  return router;
}
