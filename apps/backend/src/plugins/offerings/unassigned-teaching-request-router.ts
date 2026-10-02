import { Router } from "express";
import {
  ReviewUnassignedTeachingRequestSchema,
  SubmitUnassignedTeachingRequestSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  UnassignedTeachingAuthorizationError,
  UnassignedTeachingConflictError,
  UnassignedTeachingNotFoundError,
  UnassignedTeachingValidationError,
  unassignedTeachingRequestService,
} from "./unassigned-teaching-request-service.ts";

export function createUnassignedTeachingRequestRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/unassigned-teaching/available", async (req, res) => {
    try {
      res.json(await unassignedTeachingRequestService.available(req.user!));
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get("/unassigned-teaching/requests/mine", async (req, res) => {
    try {
      res.json(await unassignedTeachingRequestService.mine(req.user!));
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get("/unassigned-teaching/review-queue", async (req, res) => {
    try {
      res.json(await unassignedTeachingRequestService.reviewQueue(req.user!));
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post("/unassigned-teaching/requests", async (req, res) => {
    const parsed = SubmitUnassignedTeachingRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid teaching assignment request", details: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(await unassignedTeachingRequestService.submit(req.user!, parsed.data.meetingId));
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get("/unassigned-teaching/requests/:requestId/review", async (req, res) => {
    try {
      res.json(await unassignedTeachingRequestService.getForReview(req.user!, req.params.requestId!));
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post("/unassigned-teaching/requests/:requestId/review", async (req, res) => {
    const parsed = ReviewUnassignedTeachingRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid teaching assignment review", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await unassignedTeachingRequestService.review(req.user!, req.params.requestId!, parsed.data));
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}

function handleError(error: unknown, res: import("express").Response): void {
  if (error instanceof UnassignedTeachingNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof UnassignedTeachingAuthorizationError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (error instanceof UnassignedTeachingConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof UnassignedTeachingValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error("Unassigned teaching request failed", error);
  res.status(500).json({ error: "Could not complete the teaching assignment request" });
}
