import { Router, type Response } from "express";
import {
  CreateQaEvidenceExternalReferenceSchema,
  CreateQaEvidenceSnapshotSchema,
  QaEvidenceExternalReferenceQuerySchema,
  QaEvidenceSnapshotsQuerySchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import {
  QaEvidenceSharingResourceNotFoundError,
  QaEvidenceSharingScopeMismatchError,
  QaEvidenceSharingUnsupportedError,
  createQaEvidenceExternalReference,
  createQaEvidenceSnapshot,
  getQaEvidenceSnapshot,
  listQaEvidenceExternalReferences,
  listQaEvidenceSnapshots,
  revokeQaEvidenceExternalReference,
} from "./service.ts";

const QA_EVIDENCE_SHARING_ROLES = ["admin", "program_coordinator", "qa_reviewer"] as const;

function canManageExternalEvidence(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(user, [...QA_EVIDENCE_SHARING_ROLES], programmeId);
}

function sendSharingError(res: Response, error: unknown): void {
  if (error instanceof QaEvidenceSharingResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof QaEvidenceSharingScopeMismatchError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof QaEvidenceSharingUnsupportedError) {
    res.status(422).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the external evidence operation" });
}

export function createQaEvidenceSharingRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.post(
    "/evidence/:evidenceId/snapshots",
    requirePermission("qa:manage"),
    async (req, res) => {
      const evidenceId = req.params.evidenceId;
      const parsed = CreateQaEvidenceSnapshotSchema.safeParse(req.body);
      if (!evidenceId || !parsed.success) {
        res.status(400).json({
          error: "Invalid evidence snapshot request",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canManageExternalEvidence(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot capture external evidence for this programme" });
        return;
      }
      try {
        res.status(201).json(
          await createQaEvidenceSnapshot(
            parsed.data.programmeId,
            parsed.data.cycleId,
            evidenceId,
            req.user!.id,
          ),
        );
      } catch (error) {
        sendSharingError(res, error);
      }
    },
  );

  router.get(
    "/evidence/:evidenceId/snapshots",
    requirePermission("qa:read"),
    async (req, res) => {
      const evidenceId = req.params.evidenceId;
      const parsed = QaEvidenceSnapshotsQuerySchema.safeParse(req.query);
      if (!evidenceId || !parsed.success) {
        res.status(400).json({
          error: "Invalid evidence snapshot query",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canManageExternalEvidence(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot inspect external evidence for this programme" });
        return;
      }
      try {
        res.json(
          await listQaEvidenceSnapshots(
            parsed.data.programmeId,
            evidenceId,
            parsed.data.cycleId,
          ),
        );
      } catch (error) {
        sendSharingError(res, error);
      }
    },
  );

  router.get(
    "/evidence-snapshots/:snapshotId",
    requirePermission("qa:read"),
    async (req, res) => {
      const snapshotId = req.params.snapshotId;
      const parsed = QaEvidenceExternalReferenceQuerySchema.safeParse(req.query);
      if (!snapshotId || !parsed.success) {
        res.status(400).json({
          error: "Invalid evidence snapshot query",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canManageExternalEvidence(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot inspect external evidence for this programme" });
        return;
      }
      try {
        res.json(await getQaEvidenceSnapshot(parsed.data.programmeId, snapshotId));
      } catch (error) {
        sendSharingError(res, error);
      }
    },
  );

  router.post(
    "/evidence-snapshots/:snapshotId/external-references",
    requirePermission("qa:manage"),
    async (req, res) => {
      const snapshotId = req.params.snapshotId;
      const parsed = CreateQaEvidenceExternalReferenceSchema.safeParse(req.body);
      if (!snapshotId || !parsed.success) {
        res.status(400).json({
          error: "Invalid external evidence reference request",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canManageExternalEvidence(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot share external evidence for this programme" });
        return;
      }
      try {
        res.status(201).json(
          await createQaEvidenceExternalReference(snapshotId, parsed.data, req.user!.id),
        );
      } catch (error) {
        sendSharingError(res, error);
      }
    },
  );

  router.get(
    "/evidence-snapshots/:snapshotId/external-references",
    requirePermission("qa:read"),
    async (req, res) => {
      const snapshotId = req.params.snapshotId;
      const parsed = QaEvidenceExternalReferenceQuerySchema.safeParse(req.query);
      if (!snapshotId || !parsed.success) {
        res.status(400).json({
          error: "Invalid external evidence reference query",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canManageExternalEvidence(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot inspect external evidence links for this programme" });
        return;
      }
      try {
        res.json(await listQaEvidenceExternalReferences(parsed.data.programmeId, snapshotId));
      } catch (error) {
        sendSharingError(res, error);
      }
    },
  );

  router.post(
    "/evidence-references/:referenceId/revoke",
    requirePermission("qa:manage"),
    async (req, res) => {
      const referenceId = req.params.referenceId;
      const parsed = QaEvidenceExternalReferenceQuerySchema.safeParse(req.body);
      if (!referenceId || !parsed.success) {
        res.status(400).json({
          error: "Invalid external evidence revocation request",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canManageExternalEvidence(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot revoke external evidence for this programme" });
        return;
      }
      try {
        await revokeQaEvidenceExternalReference(parsed.data.programmeId, referenceId);
        res.status(204).end();
      } catch (error) {
        sendSharingError(res, error);
      }
    },
  );

  return router;
}
