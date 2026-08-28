import { Router, type Response } from "express";
import {
  QaSarBookQuerySchema,
  UpdateQaSarCriterionSelfRatingSchema,
  UpdateQaSarRequirementSelfRatingSchema,
  UpsertQaSarBookPart3AssociationSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, type AuthUser } from "../../../core/auth/token.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import {
  QaSarResourceNotFoundError,
  QaSarScopeMismatchError,
} from "../sar/service.ts";
import { canReadSarBook } from "./router.ts";
import {
  QaSarBookPart3ConflictError,
  QaSarBookPart3ValidationError,
  addQaSarBookPart3Association,
  deleteQaSarBookPart3Association,
  getQaSarBookPart3,
  updateQaSarCriterionSelfRating,
  updateQaSarRequirementSelfRating,
} from "./part3-service.ts";

export function canWriteQaSarBookPart3(user: AuthUser, programmeId: string): boolean {
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
    error instanceof QaSarBookPart3ConflictError
  ) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof QaSarBookPart3ValidationError) {
    res.status(422).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the SAR Part 3 operation" });
}

export function createQaSarBookPart3Router(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/cycles/:cycleId/sar-book/part3",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR Part 3 query" });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      try {
        res.json(await getQaSarBookPart3(parsed.data.programmeId, cycleId));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.put(
    "/cycles/:cycleId/sar-book/part3/requirements/:requirementCode/rating",
    requirePermission("qa:write"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const requirementCode = req.params.requirementCode;
      const parsed = UpdateQaSarRequirementSelfRatingSchema.safeParse(req.body);
      if (!cycleId || !requirementCode || !/^\d\.\d$/.test(requirementCode) || !parsed.success) {
        res.status(400).json({
          error: "Invalid requirement self-rating",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canWriteQaSarBookPart3(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot change Part 3 self-ratings for this programme" });
        return;
      }
      try {
        res.json(
          await updateQaSarRequirementSelfRating(
            cycleId,
            requirementCode,
            parsed.data,
            req.user!.id,
          ),
        );
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.put(
    "/cycles/:cycleId/sar-book/part3/criteria/:criterionCode/rating",
    requirePermission("qa:write"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const criterionCode = req.params.criterionCode;
      const parsed = UpdateQaSarCriterionSelfRatingSchema.safeParse(req.body);
      if (!cycleId || !criterionCode || !/^\d$/.test(criterionCode) || !parsed.success) {
        res.status(400).json({
          error: "Invalid criterion self-rating",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canWriteQaSarBookPart3(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot change Part 3 self-ratings for this programme" });
        return;
      }
      try {
        res.json(
          await updateQaSarCriterionSelfRating(
            cycleId,
            criterionCode,
            parsed.data,
            req.user!.id,
          ),
        );
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/cycles/:cycleId/sar-book/part3/associations",
    requirePermission("qa:write"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = UpsertQaSarBookPart3AssociationSchema.safeParse(req.body);
      if (!cycleId || !parsed.success) {
        res.status(400).json({
          error: "Invalid Part 3 narrative association",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canWriteQaSarBookPart3(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot manage Part 3 analysis links for this programme" });
        return;
      }
      try {
        res.status(201).json(
          await addQaSarBookPart3Association(cycleId, parsed.data, req.user!.id),
        );
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.delete(
    "/cycles/:cycleId/sar-book/part3/associations/:associationId",
    requirePermission("qa:write"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const associationId = req.params.associationId;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!cycleId || !associationId || !parsed.success) {
        res.status(400).json({ error: "Invalid Part 3 narrative association removal" });
        return;
      }
      if (!canWriteQaSarBookPart3(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot manage Part 3 analysis links for this programme" });
        return;
      }
      try {
        await deleteQaSarBookPart3Association(
          parsed.data.programmeId,
          cycleId,
          associationId,
        );
        res.status(204).end();
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  return router;
}
