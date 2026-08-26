import { Router } from "express";
import { QaSarBookQuerySchema } from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";
import { canReadSarBook } from "./router.ts";
import { getQaSarRequirementSourceContext } from "./source-context-service.ts";

export function createQaSarSourceContextRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/cycles/:cycleId/sar-book/requirements/:requirementCode/source-context",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const requirementCode = req.params.requirementCode;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!cycleId || !requirementCode || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR requirement source-context query" });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR context" });
        return;
      }
      try {
        res.json(
          await getQaSarRequirementSourceContext(
            parsed.data.programmeId,
            cycleId,
            requirementCode,
          ),
        );
      } catch (error) {
        if (error instanceof QaSarResourceNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof QaSarScopeMismatchError) {
          res.status(409).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: "Could not load SAR PMS source context" });
      }
    },
  );

  return router;
}
