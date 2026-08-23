import { Router } from "express";
import {
  StudentPortfolioEvidenceCreateInput,
  StudentPortfolioEvidenceUpdateInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  PortalAccessError,
  PortalConflictError,
  PortalNotFoundError,
} from "./service.ts";
import { studentPortfolioEvidenceService } from "./portfolio-evidence.ts";

function handleEvidenceError(error: unknown, res: import("express").Response) {
  if (error instanceof PortalNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof PortalConflictError) return res.status(409).json({ error: error.message });
  if (error instanceof PortalAccessError) return res.status(403).json({ error: error.message });
  console.error("Student portfolio evidence request failed", error);
  return res.status(500).json({ error: "Could not complete the portfolio evidence request" });
}

export function createStudentPortfolioEvidenceRouter(): Router {
  const router = Router();
  router.use(requireAuth, requirePermission("student-portal:read"));

  router.get("/", async (req, res) => {
    try {
      res.json(await studentPortfolioEvidenceService.list(req.user!.id));
    } catch (error) {
      handleEvidenceError(error, res);
    }
  });

  router.get("/eligible-sources", async (req, res) => {
    try {
      res.json(await studentPortfolioEvidenceService.eligibleAssessmentSources(req.user!.id));
    } catch (error) {
      handleEvidenceError(error, res);
    }
  });

  router.post("/", async (req, res) => {
    const parsed = StudentPortfolioEvidenceCreateInput.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({
        error: "Invalid portfolio evidence",
        details: parsed.error.flatten(),
      });
    }
    try {
      res.status(201).json(await studentPortfolioEvidenceService.create(req.user!.id, parsed.data));
    } catch (error) {
      handleEvidenceError(error, res);
    }
  });

  router.put("/:evidenceId", async (req, res) => {
    const parsed = StudentPortfolioEvidenceUpdateInput.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({
        error: "Invalid portfolio evidence",
        details: parsed.error.flatten(),
      });
    }
    try {
      res.json(
        await studentPortfolioEvidenceService.update(
          req.user!.id,
          req.params.evidenceId!,
          parsed.data,
        ),
      );
    } catch (error) {
      handleEvidenceError(error, res);
    }
  });

  router.delete("/:evidenceId", async (req, res) => {
    try {
      await studentPortfolioEvidenceService.remove(req.user!.id, req.params.evidenceId!);
      res.status(204).end();
    } catch (error) {
      handleEvidenceError(error, res);
    }
  });

  return router;
}
