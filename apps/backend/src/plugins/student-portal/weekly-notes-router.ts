import { Router } from "express";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { PortalAccessError, PortalNotFoundError } from "./service.ts";
import { studentPortalWeeklyNotesService } from "./weekly-notes-service.ts";

export function createStudentWeeklyNotesRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/courses/:offeringId/weekly-notes",
    requirePermission("student-portal:read"),
    async (req, res) => {
      try {
        res.json(
          await studentPortalWeeklyNotesService.forCourse(
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
        console.error("Student weekly notes request failed", error);
        res.status(500).json({ error: "Could not load weekly notes" });
      }
    },
  );

  return router;
}
