import { Router } from "express";
import { QaSarBookQuerySchema } from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";
import { canReadSarBook } from "./router.ts";
import { getQaSarBookPart2 } from "./part2-service.ts";

export function createQaSarBookPart2Router(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/cycles/:cycleId/sar-book/part2",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({
          error: "Invalid SAR Part 2 query",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }

      try {
        res.json(await getQaSarBookPart2(parsed.data.programmeId, cycleId));
      } catch (error) {
        if (error instanceof QaSarResourceNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof QaSarScopeMismatchError) {
          res.status(409).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: "Could not assemble SAR Part 2" });
      }
    },
  );

  return router;
}
