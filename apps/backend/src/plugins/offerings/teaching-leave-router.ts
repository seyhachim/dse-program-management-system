import { Router } from "express";
import {
  ReviseTeachingLeaveRequestSchema,
  ReviewTeachingLeaveRequestSchema,
  SubmitTeachingLeaveRequestSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  TeachingLeaveAuthorizationError,
  TeachingLeaveConflictError,
  TeachingLeaveNotFoundError,
  TeachingLeaveValidationError,
  teachingLeaveService,
} from "./teaching-leave-service.ts";
import {
  TeachingSessionOccurrenceReferenceError,
  TeachingSessionOccurrenceValidationError,
} from "./class-delivery-service.ts";

export function createTeachingLeaveRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.post("/teaching-leave/requests", async (req, res) => {
    const parsed = SubmitTeachingLeaveRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid teaching leave request", details: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(await teachingLeaveService.submit(req.user!, parsed.data));
    } catch (error) {
      handleTeachingLeaveError(error, res);
    }
  });

  router.get("/teaching-leave/requests/mine", async (req, res) => {
    try {
      res.json(await teachingLeaveService.mine(req.user!));
    } catch (error) {
      handleTeachingLeaveError(error, res);
    }
  });

  router.get("/teaching-leave/review-queue", async (req, res) => {
    try {
      res.json(await teachingLeaveService.reviewQueue(req.user!));
    } catch (error) {
      handleTeachingLeaveError(error, res);
    }
  });

  router.get("/teaching-leave/requests/:requestId", async (req, res) => {
    try {
      res.json(await teachingLeaveService.get(req.user!, req.params.requestId!));
    } catch (error) {
      handleTeachingLeaveError(error, res);
    }
  });

  router.post("/teaching-leave/requests/:requestId/resubmit", async (req, res) => {
    const parsed = ReviseTeachingLeaveRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid teaching leave revision", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await teachingLeaveService.revise(req.user!, req.params.requestId!, parsed.data));
    } catch (error) {
      handleTeachingLeaveError(error, res);
    }
  });

  router.post("/teaching-leave/requests/:requestId/review", async (req, res) => {
    const parsed = ReviewTeachingLeaveRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid teaching leave review", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await teachingLeaveService.review(req.user!, req.params.requestId!, parsed.data));
    } catch (error) {
      handleTeachingLeaveError(error, res);
    }
  });

  return router;
}

function handleTeachingLeaveError(error: unknown, res: import("express").Response): void {
  if (
    error instanceof TeachingLeaveNotFoundError ||
    error instanceof TeachingSessionOccurrenceReferenceError
  ) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof TeachingLeaveAuthorizationError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (error instanceof TeachingLeaveConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (
    error instanceof TeachingLeaveValidationError ||
    error instanceof TeachingSessionOccurrenceValidationError
  ) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error("Teaching leave request failed", error);
  res.status(500).json({ error: "Could not complete the teaching leave request" });
}
