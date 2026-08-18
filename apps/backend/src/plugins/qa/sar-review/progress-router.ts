import { Router } from "express";
import { QaSarReviewQuerySchema } from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";
import { listQaSarProgress } from "./progress.ts";

export function createQaSarProgressRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/cycles/:cycleId/sar-progress",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaSarReviewQuerySchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR progress query" });
        return;
      }
      if (!hasAnyRoleInProgramme(req.user!, ["admin", "program_coordinator", "qa_reviewer"], parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to programme-wide SAR progress" });
        return;
      }
      try {
        res.json(await listQaSarProgress(parsed.data.programmeId, cycleId));
      } catch (error) {
        if (error instanceof QaSarResourceNotFoundError) {
          res.status(404).json({ error: error.message });
        } else if (error instanceof QaSarScopeMismatchError) {
          res.status(409).json({ error: error.message });
        } else {
          res.status(500).json({ error: "Could not load SAR progress" });
        }
      }
    },
  );

  return router;
}
