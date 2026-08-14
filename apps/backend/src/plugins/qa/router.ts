import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  CreateQaCycleSchema,
  CreateQaEvidenceSchema,
  QaEvidenceAnalysisHistoryQuerySchema,
  QaEvidenceCandidatesQuerySchema,
  UpsertQaSelfAssessmentSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, type AuthUser } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  QaAnalysisResourceNotFoundError,
  QaAnalysisScopeMismatchError,
  listQaEvidenceAnalyses,
} from "./analysis/service.ts";
import {
  QaEvidenceCandidateResourceNotFoundError,
  getQaEvidenceCandidates,
} from "./evidence/service.ts";
import {
  QaResourceNotFoundError,
  QaScopeMismatchError,
  qaService,
} from "./service.ts";

const DashboardQuery = z.object({
  programmeId: z.string().trim().min(1),
  cycleId: z.string().uuid().optional(),
});

const QaRoles = ["admin", "program_coordinator", "qa_reviewer"] as const;

export function canAccessQaProgramme(user: AuthUser, programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, [...QaRoles], programmeId);
}

function ensureProgrammeScope(
  req: Request,
  res: Response,
  programmeId: string,
): boolean {
  if (!req.user || !canAccessQaProgramme(req.user, programmeId)) {
    res.status(403).json({ error: "You do not have QA access to this programme" });
    return false;
  }
  return true;
}

function sendDomainError(res: Response, error: unknown): void {
  if (
    error instanceof QaResourceNotFoundError ||
    error instanceof QaAnalysisResourceNotFoundError
  ) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (
    error instanceof QaScopeMismatchError ||
    error instanceof QaAnalysisScopeMismatchError
  ) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the QA operation" });
}

export function createQaRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/knowledge", requirePermission("qa:read"), async (_req, res) => {
    try {
      res.json(await qaService.getKnowledge());
    } catch (error) {
      sendDomainError(res, error);
    }
  });

  router.get("/evidence-candidates", requirePermission("qa:read"), async (req, res) => {
    const parsed = QaEvidenceCandidatesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid QA evidence candidate query",
        details: parsed.error.flatten(),
      });
      return;
    }
    if (!ensureProgrammeScope(req, res, parsed.data.programmeId)) return;

    try {
      res.json(
        await getQaEvidenceCandidates(
          parsed.data.programmeId,
          parsed.data.expectedEvidenceId,
        ),
      );
    } catch (error) {
      if (error instanceof QaEvidenceCandidateResourceNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      sendDomainError(res, error);
    }
  });

  router.get("/cycles/:cycleId/analyses", requirePermission("qa:read"), async (req, res) => {
    const cycleId = req.params.cycleId;
    const parsed = QaEvidenceAnalysisHistoryQuerySchema.safeParse(req.query);
    if (!cycleId || !parsed.success) {
      res.status(400).json({
        error: "Invalid QA analysis history query",
        details: parsed.success ? undefined : parsed.error.flatten(),
      });
      return;
    }
    if (!ensureProgrammeScope(req, res, parsed.data.programmeId)) return;

    try {
      res.json(
        await listQaEvidenceAnalyses(
          parsed.data.programmeId,
          cycleId,
          parsed.data.requirementCode,
        ),
      );
    } catch (error) {
      sendDomainError(res, error);
    }
  });

  router.get("/dashboard", requirePermission("qa:read"), async (req, res) => {
    const parsed = DashboardQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid QA dashboard query", details: parsed.error.flatten() });
      return;
    }
    if (!ensureProgrammeScope(req, res, parsed.data.programmeId)) return;

    try {
      res.json(await qaService.getDashboard(parsed.data.programmeId, parsed.data.cycleId));
    } catch (error) {
      sendDomainError(res, error);
    }
  });

  router.post("/cycles", requirePermission("qa:write"), async (req, res) => {
    const parsed = CreateQaCycleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid QA assessment cycle", details: parsed.error.flatten() });
      return;
    }
    if (!ensureProgrammeScope(req, res, parsed.data.programmeId)) return;

    try {
      res.status(201).json(await qaService.createCycle(parsed.data, req.user!.id));
    } catch (error) {
      sendDomainError(res, error);
    }
  });

  router.post(
    "/cycles/:cycleId/evidence",
    requirePermission("qa:write"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = CreateQaEvidenceSchema.safeParse(req.body);
      if (!cycleId || !parsed.success) {
        res.status(400).json({
          error: "Invalid QA evidence",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!ensureProgrammeScope(req, res, parsed.data.programmeId)) return;

      try {
        res.status(201).json(
          await qaService.createEvidence(cycleId, parsed.data, req.user!.id),
        );
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  router.put(
    "/cycles/:cycleId/requirements/:requirementCode/self-assessment",
    requirePermission("qa:write"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const requirementCode = req.params.requirementCode;
      const parsed = UpsertQaSelfAssessmentSchema.safeParse(req.body);
      if (!cycleId || !requirementCode || !/^\d\.\d$/.test(requirementCode) || !parsed.success) {
        res.status(400).json({
          error: "Invalid QA self-assessment",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!ensureProgrammeScope(req, res, parsed.data.programmeId)) return;

      try {
        res.json(
          await qaService.upsertSelfAssessment(
            cycleId,
            requirementCode,
            parsed.data,
            req.user!.id,
          ),
        );
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  return router;
}
