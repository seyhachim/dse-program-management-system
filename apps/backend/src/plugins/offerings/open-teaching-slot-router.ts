import { Router } from "express";
import {
  ReviewOpenTeachingSlotClaimSchema,
  SubmitOpenTeachingSlotClaimSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  OpenTeachingSlotAuthorizationError,
  OpenTeachingSlotConflictError,
  OpenTeachingSlotNotFoundError,
  OpenTeachingSlotValidationError,
  openTeachingSlotService,
} from "./open-teaching-slot-service.ts";

export function createOpenTeachingSlotRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/open-teaching-slots", async (req, res) => {
    try {
      res.json(await openTeachingSlotService.board(req.user!));
    } catch (error) {
      handleOpenSlotError(error, res);
    }
  });

  router.get("/open-teaching-slots/claims/mine", async (req, res) => {
    try {
      res.json(await openTeachingSlotService.mine(req.user!));
    } catch (error) {
      handleOpenSlotError(error, res);
    }
  });

  router.get("/open-teaching-slots/review-queue", async (req, res) => {
    try {
      res.json(await openTeachingSlotService.reviewQueue(req.user!));
    } catch (error) {
      handleOpenSlotError(error, res);
    }
  });

  router.post("/open-teaching-slots/:slotId/claims", async (req, res) => {
    const parsed = SubmitOpenTeachingSlotClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid open teaching slot claim", details: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(await openTeachingSlotService.claim(req.user!, req.params.slotId!, parsed.data));
    } catch (error) {
      handleOpenSlotError(error, res);
    }
  });

  router.post("/open-teaching-slots/claims/:claimId/withdraw", async (req, res) => {
    try {
      res.json(await openTeachingSlotService.withdraw(req.user!, req.params.claimId!));
    } catch (error) {
      handleOpenSlotError(error, res);
    }
  });

  router.post("/open-teaching-slots/claims/:claimId/review", async (req, res) => {
    const parsed = ReviewOpenTeachingSlotClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid open teaching slot review", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await openTeachingSlotService.review(req.user!, req.params.claimId!, parsed.data));
    } catch (error) {
      handleOpenSlotError(error, res);
    }
  });

  return router;
}

function handleOpenSlotError(error: unknown, res: import("express").Response): void {
  if (error instanceof OpenTeachingSlotNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof OpenTeachingSlotAuthorizationError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (error instanceof OpenTeachingSlotConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof OpenTeachingSlotValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error("Open teaching slot request failed", error);
  res.status(500).json({ error: "Could not complete the open teaching slot request" });
}
