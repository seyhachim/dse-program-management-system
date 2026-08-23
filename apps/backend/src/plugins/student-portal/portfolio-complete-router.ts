import { Router } from "express";
import {
  StudentPortfolioProfessionalLinkInput,
  StudentPortfolioSoftSkillMappingInput,
  StudentPortfolioSupervisorRelationshipInput,
  StudentPortfolioVerificationDecisionInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { PortalAccessError, PortalConflictError, PortalNotFoundError } from "./service.ts";
import { studentPortfolioLinksService } from "./portfolio-links.ts";
import { studentPortfolioSoftSkillService } from "./portfolio-soft-skills.ts";
import { studentPortfolioCompetencyService } from "./portfolio-competencies.ts";
import { studentPortfolioOverviewService } from "./portfolio-overview.ts";
import { studentPortfolioVerificationService } from "./portfolio-verification.ts";

function handle(error: unknown, res: import("express").Response) {
  if (error instanceof PortalNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof PortalConflictError) return res.status(409).json({ error: error.message });
  if (error instanceof PortalAccessError) return res.status(403).json({ error: error.message });
  console.error("Student portfolio request failed", error);
  return res.status(500).json({ error: "Could not complete the portfolio request" });
}

function invalid(res: import("express").Response, message: string, parsed: { error: { flatten(): unknown } }) {
  return res.status(400).json({ error: message, details: parsed.error.flatten() });
}

export function createStudentPortfolioCompleteRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/overview", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json(await studentPortfolioOverviewService.get(req.user!.id)); } catch (error) { handle(error, res); }
  });

  router.get("/links", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json(await studentPortfolioLinksService.list(req.user!.id)); } catch (error) { handle(error, res); }
  });
  router.post("/links", requirePermission("student-portal:read"), async (req, res) => {
    const parsed = StudentPortfolioProfessionalLinkInput.safeParse(req.body);
    if (!parsed.success) return void invalid(res, "Invalid professional link", parsed);
    try { res.status(201).json(await studentPortfolioLinksService.create(req.user!.id, parsed.data)); } catch (error) { handle(error, res); }
  });
  router.put("/links/:linkId", requirePermission("student-portal:read"), async (req, res) => {
    const parsed = StudentPortfolioProfessionalLinkInput.safeParse(req.body);
    if (!parsed.success) return void invalid(res, "Invalid professional link", parsed);
    try { res.json(await studentPortfolioLinksService.update(req.user!.id, req.params.linkId!, parsed.data)); } catch (error) { handle(error, res); }
  });
  router.delete("/links/:linkId", requirePermission("student-portal:read"), async (req, res) => {
    try { await studentPortfolioLinksService.remove(req.user!.id, req.params.linkId!); res.status(204).end(); } catch (error) { handle(error, res); }
  });

  router.get("/soft-skills", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json(await studentPortfolioSoftSkillService.list(req.user!.id)); } catch (error) { handle(error, res); }
  });
  router.get("/evidence/:evidenceId/soft-skills", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json({ skillCodes: await studentPortfolioSoftSkillService.evidenceMapping(req.user!.id, req.params.evidenceId!) }); } catch (error) { handle(error, res); }
  });
  router.put("/evidence/:evidenceId/soft-skills", requirePermission("student-portal:read"), async (req, res) => {
    const parsed = StudentPortfolioSoftSkillMappingInput.safeParse(req.body);
    if (!parsed.success) return void invalid(res, "Invalid soft-skill mapping", parsed);
    try { res.json(await studentPortfolioSoftSkillService.updateEvidenceMapping(req.user!.id, req.params.evidenceId!, parsed.data)); } catch (error) { handle(error, res); }
  });

  router.get("/competencies", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json(await studentPortfolioCompetencyService.list(req.user!.id)); } catch (error) { handle(error, res); }
  });

  router.get("/evidence/:evidenceId/verification", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json(await studentPortfolioVerificationService.history(req.user!.id, req.params.evidenceId!)); } catch (error) { handle(error, res); }
  });

  // Staff verification deliberately does not use student-portal:read: verification
  // authority is derived from the exact Offering/co-lecturer or approved supervisor relationship.
  router.post("/evidence/:evidenceId/verification", async (req, res) => {
    const parsed = StudentPortfolioVerificationDecisionInput.safeParse(req.body);
    if (!parsed.success) return void invalid(res, "Invalid verification decision", parsed);
    try { res.json(await studentPortfolioVerificationService.decide(req.user!, req.params.evidenceId!, parsed.data)); } catch (error) { handle(error, res); }
  });

  router.post("/supervisors/approve", async (req, res) => {
    const parsed = StudentPortfolioSupervisorRelationshipInput.safeParse(req.body);
    if (!parsed.success) return void invalid(res, "Invalid supervisor relationship", parsed);
    try { res.status(201).json(await studentPortfolioVerificationService.approveSupervisor(req.user!, parsed.data)); } catch (error) { handle(error, res); }
  });

  return router;
}
