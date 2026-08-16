import { Router, type Response } from "express";
import {
  FinalizeQaSarDocumentSchema,
  QaSarDocumentQuerySchema,
  QaSarReleaseQuerySchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";
import {
  QaSarFinalizeError,
  buildQaSarDocument,
  finalizeQaSarDocument,
  getQaSarRelease,
  listQaSarReleases,
} from "./service.ts";

function canReadDocument(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(user, ["admin", "program_coordinator", "qa_reviewer"], programmeId);
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof QaSarResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof QaSarScopeMismatchError || error instanceof QaSarFinalizeError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the SAR document operation" });
}

export function createQaSarDocumentRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/cycles/:cycleId/sar-document",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaSarDocumentQuerySchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR document query", details: parsed.success ? undefined : parsed.error.flatten() });
        return;
      }
      if (!canReadDocument(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to programme-wide SAR preview" });
        return;
      }
      try {
        res.json(await buildQaSarDocument(parsed.data.programmeId, cycleId, parsed.data.mode));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/cycles/:cycleId/sar-document/finalize",
    requirePermission("qa:manage"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = FinalizeQaSarDocumentSchema.safeParse(req.body);
      if (!cycleId || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR finalization request", details: parsed.success ? undefined : parsed.error.flatten() });
        return;
      }
      if (!hasAnyRoleInProgramme(req.user!, ["admin", "program_coordinator"], parsed.data.programmeId)) {
        res.status(403).json({ error: "Only programme leadership can finalize an official SAR" });
        return;
      }
      try {
        res.status(201).json(
          await finalizeQaSarDocument(
            parsed.data.programmeId,
            cycleId,
            req.user!.id,
            parsed.data.title,
          ),
        );
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get(
    "/cycles/:cycleId/sar-releases",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaSarReleaseQuerySchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR release query" });
        return;
      }
      if (!canReadDocument(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to official SAR releases" });
        return;
      }
      try {
        res.json(await listQaSarReleases(parsed.data.programmeId, cycleId));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get(
    "/sar-releases/:releaseId",
    requirePermission("qa:read"),
    async (req, res) => {
      const releaseId = req.params.releaseId;
      const parsed = QaSarReleaseQuerySchema.safeParse(req.query);
      if (!releaseId || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR release request" });
        return;
      }
      if (!canReadDocument(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to official SAR releases" });
        return;
      }
      try {
        res.json(await getQaSarRelease(parsed.data.programmeId, releaseId));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  return router;
}
