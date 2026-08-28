import { Router, type Response } from "express";
import {
  CreateQaSarBookSectionReviewSchema,
  QaSarBookQuerySchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import {
  QaSarResourceNotFoundError,
  QaSarScopeMismatchError,
} from "../sar/service.ts";
import { canReadSarBook } from "./router.ts";
import { getQaSarBookReviewReadinessWithPart3 } from "./part3-readiness-service.ts";
import {
  QaSarBookReviewConflictError,
  createQaSarBookSectionReview,
  listQaSarBookSectionReviews,
} from "./review-service.ts";

export function canReviewSarBook(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(
    user,
    ["admin", "program_coordinator", "qa_reviewer"],
    programmeId,
  );
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof QaSarResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (
    error instanceof QaSarScopeMismatchError ||
    error instanceof QaSarBookReviewConflictError
  ) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the SAR book review operation" });
}

export function createQaSarBookReviewRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/cycles/:cycleId/sar-book/review-readiness",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR book review query" });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      try {
        res.json(
          await getQaSarBookReviewReadinessWithPart3(
            parsed.data.programmeId,
            cycleId,
          ),
        );
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get(
    "/cycles/:cycleId/sar-book/sections/:sectionKey/reviews",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const sectionKey = req.params.sectionKey;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!cycleId || !sectionKey || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR book section review history query" });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      try {
        res.json(await listQaSarBookSectionReviews(parsed.data.programmeId, cycleId, sectionKey));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/cycles/:cycleId/sar-book/sections/:sectionKey/reviews",
    requirePermission("qa:review"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const sectionKey = req.params.sectionKey;
      const parsed = CreateQaSarBookSectionReviewSchema.safeParse(req.body);
      if (!cycleId || !sectionKey || !parsed.success) {
        res.status(400).json({
          error: "Invalid SAR book section review",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canReviewSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have SAR reviewer access to this programme" });
        return;
      }
      try {
        res.status(201).json(
          await createQaSarBookSectionReview(
            cycleId,
            sectionKey,
            parsed.data,
            req.user!.id,
          ),
        );
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  return router;
}
