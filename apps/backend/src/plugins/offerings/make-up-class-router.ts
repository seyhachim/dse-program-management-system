import { Router } from "express";
import { AttendanceDateSchema, ProposeMakeUpClassSchema, ReviewMakeUpClassSchema } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  MakeUpClassConflictError, MakeUpClassForbiddenError, MakeUpClassNotFoundError,
  MakeUpClassValidationError, makeUpClassService,
} from "./make-up-class-service.ts";
import {
  TeachingSessionOccurrenceReferenceError, TeachingSessionOccurrenceValidationError,
} from "./class-delivery-service.ts";

export function createMakeUpClassRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/make-up/mine", async (req, res) => {
    try { res.json(await makeUpClassService.mine(req.user!)); }
    catch (error) { handleError(error, res); }
  });
  router.get("/make-up/review-queue", async (req, res) => {
    try { res.json(await makeUpClassService.reviewQueue(req.user!)); }
    catch (error) { handleError(error, res); }
  });
  router.get("/make-up/approved", async (req, res) => {
    const date = AttendanceDateSchema.safeParse(req.query.date);
    if (!date.success) { res.status(400).json({ error: "Invalid date" }); return; }
    try { res.json(await makeUpClassService.approvedForDate(req.user!, date.data)); }
    catch (error) { handleError(error, res); }
  });
  router.post("/make-up", async (req, res) => {
    const input = ProposeMakeUpClassSchema.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Invalid make-up request", details: input.error.flatten() }); return; }
    try { res.status(201).json(await makeUpClassService.propose(req.user!, input.data)); }
    catch (error) { handleError(error, res); }
  });
  router.post("/make-up/:id/review", async (req, res) => {
    const input = ReviewMakeUpClassSchema.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Invalid make-up decision", details: input.error.flatten() }); return; }
    try { res.json(await makeUpClassService.review(req.user!, req.params.id!, input.data)); }
    catch (error) { handleError(error, res); }
  });
  return router;
}

function handleError(error: unknown, res: import("express").Response): void {
  if (error instanceof MakeUpClassNotFoundError ||
      error instanceof TeachingSessionOccurrenceReferenceError) {
    res.status(404).json({ error: error.message }); return;
  }
  if (error instanceof MakeUpClassForbiddenError) { res.status(403).json({ error: error.message }); return; }
  if (error instanceof MakeUpClassConflictError) { res.status(409).json({ error: error.message }); return; }
  if (error instanceof MakeUpClassValidationError ||
      error instanceof TeachingSessionOccurrenceValidationError) {
    res.status(400).json({ error: error.message }); return;
  }
  console.error("Make-up class operation failed", error);
  res.status(500).json({ error: "Could not complete make-up class operation" });
}
