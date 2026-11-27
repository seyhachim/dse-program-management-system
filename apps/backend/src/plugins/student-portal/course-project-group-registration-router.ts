import { Router, type Response } from "express";
import { CourseProjectGroupActionInput, CourseProjectGroupPolicyInput, CourseProjectGroupReviewInput } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { courseProjectGroupRegistrationService as service } from "./course-project-group-registration.ts";
import { ProjectGroupPolicyError } from "./course-project-group-policy.ts";
import { PortalAccessError, PortalConflictError, PortalNotFoundError } from "./service.ts";

function handle(error: unknown, res: Response) {
  if (error instanceof PortalAccessError) return res.status(403).json({ error: error.message });
  if (error instanceof PortalNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof PortalConflictError || error instanceof ProjectGroupPolicyError) return res.status(409).json({ error: error.message });
  console.error("Course project group registration failed", error);
  return res.status(500).json({ error: "Could not complete group registration" });
}
export function createCourseProjectGroupRegistrationRouter(): Router {
  const router = Router();
  const student = "/courses/:offeringId/assessments/:assessmentItemId/project-groups";
  const manager = "/manage/offerings/:offeringId/assessments/:assessmentItemId/project-groups";
  router.get(student, requireAuth, requirePermission("student-portal:read"), async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { res.json(await service.get(req.params.offeringId!, req.params.assessmentItemId!, req.user!.id, false)); } catch (error) { handle(error, res); }
  });
  router.post(student, requireAuth, requirePermission("student-portal:read"), async (req, res) => {
    res.set("Cache-Control", "no-store");
    const parsed = CourseProjectGroupActionInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid group action" });
    try { res.json(await service.studentAction(req.params.offeringId!, req.params.assessmentItemId!, req.user!.id, parsed.data)); } catch (error) { handle(error, res); }
  });
  router.get(manager, requireAuth, requirePermission("courses:write"), async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { res.json(await service.get(req.params.offeringId!, req.params.assessmentItemId!, req.user!.id, true)); } catch (error) { handle(error, res); }
  });
  router.put(manager, requireAuth, requirePermission("courses:write"), async (req, res) => {
    res.set("Cache-Control", "no-store");
    const parsed = CourseProjectGroupPolicyInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid registration settings" });
    try { res.json(await service.configure(req.params.offeringId!, req.params.assessmentItemId!, req.user!.id, parsed.data)); } catch (error) { handle(error, res); }
  });
  router.post(manager, requireAuth, requirePermission("courses:write"), async (req, res) => {
    res.set("Cache-Control", "no-store");
    const parsed = CourseProjectGroupReviewInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid group review" });
    try { res.json(await service.review(req.params.offeringId!, req.params.assessmentItemId!, req.user!.id, parsed.data)); } catch (error) { handle(error, res); }
  });
  return router;
}
