import { Router } from "express";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  OpenSlotAssignmentAccessError,
  openSlotAssignmentProjectionService,
} from "./open-slot-assignment-service.ts";

export function createOpenSlotAssignmentRouter(): Router {
  const router = Router();
  router.use(requireAuth);
  router.get(
    "/open-slot-assignments",
    requirePermission("student-portal:read"),
    async (req, res) => {
      try {
        res.json(await openSlotAssignmentProjectionService.list(req.user!.id));
      } catch (error) {
        if (error instanceof OpenSlotAssignmentAccessError) {
          res.status(403).json({ error: error.message });
          return;
        }
        console.error("Student open-slot assignment request failed", error);
        res.status(500).json({ error: "Could not load additional confirmed classes" });
      }
    },
  );
  return router;
}
