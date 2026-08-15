import { Router } from "express";
import {
  CreateQaAnalysisReviewSchema,
  QaAnalysisReviewHistoryQuerySchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import { canAccessQaProgramme } from "../router.ts";
import {
  QaAnalysisReviewResourceNotFoundError,
  QaAnalysisReviewScopeMismatchError,
  createQaAnalysisReview,
  listQaAnalysisReviews,
} from "./service.ts";

export function createQaReviewRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/cycles/:cycleId/reviews",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaAnalysisReviewHistoryQuerySchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({
          error: "Invalid QA analysis review history query",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!req.user || !canAccessQaProgramme(req.user, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have QA access to this programme" });
        return;
      }

      try {
        res.json(await listQaAnalysisReviews(parsed.data.programmeId, cycleId));
      } catch (error) {
        if (error instanceof QaAnalysisReviewResourceNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof QaAnalysisReviewScopeMismatchError) {
          res.status(409).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: "Could not load QA analysis review history" });
      }
    },
  );

  router.post(
    "/analyses/:analysisId/reviews",
    requirePermission("qa:write"),
    async (req, res) => {
      const analysisId = req.params.analysisId;
      const parsed = CreateQaAnalysisReviewSchema.safeParse(req.body);
      if (!analysisId || !parsed.success) {
        res.status(400).json({
          error: "Invalid QA analysis review",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!req.user || !canAccessQaProgramme(req.user, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have QA access to this programme" });
        return;
      }

      try {
        res.status(201).json(
          await createQaAnalysisReview(analysisId, parsed.data, req.user.id),
        );
      } catch (error) {
        if (error instanceof QaAnalysisReviewResourceNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof QaAnalysisReviewScopeMismatchError) {
          res.status(409).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: "Could not save QA analysis review" });
      }
    },
  );

  return router;
}
