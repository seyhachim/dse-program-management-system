import { Router } from "express";
import {
  CourseFeedbackInput,
  FinalizeAssessmentResultsInput,
  PublishAnnouncementInput,
  PublishAssessmentResultsInput,
  SaveAssessmentResultInput,
  SaveAssessmentCriterionScoresInput,
  SetAssessmentDeadlineInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { PROGRAMME_WIDE_ROLES, type Role } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { resultsLifecycleService } from "./results-lifecycle.ts";
import {
  PortalAccessError,
  PortalConflictError,
  PortalNotFoundError,
  studentPortalService,
} from "./service.ts";

function programmeWide(roles: Role[]): boolean {
  return roles.some((role) => PROGRAMME_WIDE_ROLES.includes(role));
}

function handleError(error: unknown, res: import("express").Response) {
  if (error instanceof PortalNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof PortalConflictError) return res.status(409).json({ error: error.message });
  if (error instanceof PortalAccessError) return res.status(403).json({ error: error.message });
  console.error("Student portal request failed", error);
  return res.status(500).json({ error: "Could not complete the portal request" });
}

export function createStudentPortalRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/home", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json(await studentPortalService.home(req.user!.id)); } catch (error) { handleError(error, res); }
  });
  router.get("/courses", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json(await studentPortalService.courses(req.user!.id)); } catch (error) { handleError(error, res); }
  });
  router.get("/courses/:offeringId", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json(await studentPortalService.course(req.user!.id, req.params.offeringId!)); } catch (error) { handleError(error, res); }
  });
  router.get("/announcements", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json(await studentPortalService.announcements(req.user!.id)); } catch (error) { handleError(error, res); }
  });
  router.post("/courses/:offeringId/feedback", requirePermission("student-portal:feedback"), async (req, res) => {
    const parsed = CourseFeedbackInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid feedback", details: parsed.error.flatten() });
    try { res.status(201).json(await studentPortalService.submitFeedback(req.user!.id, req.params.offeringId!, parsed.data)); } catch (error) { handleError(error, res); }
  });

  router.get("/manage/offerings", requirePermission("courses:write"), async (req, res) => {
    try { res.json(await studentPortalService.deliveryOfferings(req.user!.id, programmeWide(req.user!.roles))); } catch (error) { handleError(error, res); }
  });
  router.get("/manage/results/review/:offeringId", requirePermission("courses:write"), async (req, res) => {
    try { res.json(await resultsLifecycleService.review(req.user!.id, programmeWide(req.user!.roles), req.params.offeringId!)); } catch (error) { handleError(error, res); }
  });
  router.post("/manage/announcements", requirePermission("courses:write"), async (req, res) => {
    const parsed = PublishAnnouncementInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid announcement", details: parsed.error.flatten() });
    try { res.status(201).json(await studentPortalService.publishAnnouncement(req.user!.id, programmeWide(req.user!.roles), parsed.data)); } catch (error) { handleError(error, res); }
  });
  router.put("/manage/results", requirePermission("courses:write"), async (req, res) => {
    const parsed = SaveAssessmentResultInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid result", details: parsed.error.flatten() });
    try { res.json(await resultsLifecycleService.saveDraft(req.user!.id, programmeWide(req.user!.roles), parsed.data)); } catch (error) { handleError(error, res); }
  });
  router.put("/manage/results/criteria", requirePermission("courses:write"), async (req, res) => {
    const parsed = SaveAssessmentCriterionScoresInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid criterion scores", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await resultsLifecycleService.saveCriterionScores(
        req.user!.id,
        programmeWide(req.user!.roles),
        parsed.data,
      ));
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post("/manage/results/publish", requirePermission("courses:write"), async (req, res) => {
    const parsed = PublishAssessmentResultsInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid publication request", details: parsed.error.flatten() });
    try { res.json(await resultsLifecycleService.publishAssessment(req.user!.id, programmeWide(req.user!.roles), parsed.data)); } catch (error) { handleError(error, res); }
  });
  router.post("/manage/results/finalize", requirePermission("courses:write"), async (req, res) => {
    const parsed = FinalizeAssessmentResultsInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid finalization request", details: parsed.error.flatten() });
    try { res.json(await resultsLifecycleService.finalizeAssessment(req.user!.id, programmeWide(req.user!.roles), parsed.data)); } catch (error) { handleError(error, res); }
  });
  router.put("/manage/deadlines", requirePermission("courses:write"), async (req, res) => {
    const parsed = SetAssessmentDeadlineInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid deadline", details: parsed.error.flatten() });
    try { res.json(await studentPortalService.setDeadline(req.user!.id, programmeWide(req.user!.roles), parsed.data)); } catch (error) { handleError(error, res); }
  });

  return router;
}
