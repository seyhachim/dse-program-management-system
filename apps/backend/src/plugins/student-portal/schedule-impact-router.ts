import { Router } from "express";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  StudentScheduleImpactAccessError,
  studentScheduleImpactProjectionService,
} from "./schedule-impact-service.ts";

export function createStudentScheduleImpactRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/schedule-impacts",
    requirePermission("student-portal:read"),
    async (req, res) => {
      try {
        res.json(await studentScheduleImpactProjectionService.list(req.user!.id));
      } catch (error) {
        if (error instanceof StudentScheduleImpactAccessError) {
          res.status(403).json({ error: error.message });
          return;
        }
        console.error("Student schedule impact request failed", error);
        res.status(500).json({ error: "Could not load schedule updates" });
      }
    },
  );

  return router;
}
