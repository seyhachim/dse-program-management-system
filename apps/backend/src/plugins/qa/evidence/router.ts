import { Router, type Response } from "express";
import {
  CreateQaEvidenceItemSchema,
  MapQaEvidenceSchema,
  QaEvidenceLibraryPageQuerySchema,
  QaEvidenceLibraryQuerySchema,
  UpdateQaEvidenceItemSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import { listMyQaRequirementAssignments } from "../assignments/service.ts";
import {
  InvalidQaEvidenceLibraryPageCursorError,
  QaEvidenceLibraryResourceNotFoundError,
  QaEvidenceLibraryScopeMismatchError,
  createQaEvidenceItem,
  listQaEvidenceLibrary,
  listQaEvidenceLibraryPage,
  mapQaEvidence,
  unmapQaEvidence,
} from "./library.ts";
import { updateQaEvidenceMetadata } from "./metadata.ts";

const QA_LIBRARY_ROLES = [
  "admin",
  "program_coordinator",
  "qa_reviewer",
  "qa_contributor",
] as const;
const QA_LIBRARY_MANAGER_ROLES = ["admin", "program_coordinator", "qa_reviewer"] as const;

function canAccessEvidenceLibrary(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(user, [...QA_LIBRARY_ROLES], programmeId);
}

async function canMapRequirement(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<boolean> {
  if (hasAnyRoleInProgramme(user, [...QA_LIBRARY_MANAGER_ROLES], programmeId)) return true;
  if (!hasAnyRoleInProgramme(user, ["qa_contributor"], programmeId)) return false;
  const assignments = await listMyQaRequirementAssignments(programmeId, cycleId, user.id);
  return assignments.some((assignment) => assignment.requirementCode === requirementCode);
}

function sendLibraryError(res: Response, error: unknown): void {
  if (error instanceof InvalidQaEvidenceLibraryPageCursorError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof QaEvidenceLibraryResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof QaEvidenceLibraryScopeMismatchError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the evidence-library operation" });
}

export function createQaEvidenceLibraryRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/evidence-library/page", requirePermission("qa:read"), async (req, res) => {
    const parsed = QaEvidenceLibraryPageQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid evidence-library page query", details: parsed.error.flatten() });
      return;
    }
    if (!canAccessEvidenceLibrary(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You do not have access to this programme evidence library" });
      return;
    }

    try {
      res.json(await listQaEvidenceLibraryPage(parsed.data));
    } catch (error) {
      sendLibraryError(res, error);
    }
  });

  router.get("/evidence-library", requirePermission("qa:read"), async (req, res) => {
    const parsed = QaEvidenceLibraryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid evidence-library query", details: parsed.error.flatten() });
      return;
    }
    if (!canAccessEvidenceLibrary(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You do not have access to this programme evidence library" });
      return;
    }

    try {
      res.json(await listQaEvidenceLibrary(parsed.data.programmeId));
    } catch (error) {
      sendLibraryError(res, error);
    }
  });

  router.post("/evidence-library", requirePermission("qa:contribute"), async (req, res) => {
    const parsed = CreateQaEvidenceItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid evidence item", details: parsed.error.flatten() });
      return;
    }
    if (!canAccessEvidenceLibrary(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot add evidence to this programme" });
      return;
    }

    try {
      res.status(201).json(await createQaEvidenceItem(parsed.data, req.user!.id));
    } catch (error) {
      sendLibraryError(res, error);
    }
  });

  router.put(
    "/evidence-library/:evidenceId",
    requirePermission("qa:manage"),
    async (req, res) => {
      const evidenceId = req.params.evidenceId;
      const parsed = UpdateQaEvidenceItemSchema.safeParse(req.body);
      if (!evidenceId || !parsed.success) {
        res.status(400).json({
          error: "Invalid evidence metadata",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!hasAnyRoleInProgramme(req.user!, ["admin", "program_coordinator"], parsed.data.programmeId)) {
        res.status(403).json({ error: "Only programme leadership can edit canonical evidence metadata" });
        return;
      }

      try {
        res.json(await updateQaEvidenceMetadata(evidenceId, parsed.data));
      } catch (error) {
        sendLibraryError(res, error);
      }
    },
  );

  router.put(
    "/cycles/:cycleId/evidence/:evidenceId/mapping",
    requirePermission("qa:contribute"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const evidenceId = req.params.evidenceId;
      const parsed = MapQaEvidenceSchema.safeParse(req.body);
      if (!cycleId || !evidenceId || !parsed.success) {
        res.status(400).json({
          error: "Invalid evidence mapping",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canAccessEvidenceLibrary(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot map evidence in this programme" });
        return;
      }
      if (!(await canMapRequirement(req.user!, parsed.data.programmeId, cycleId, parsed.data.requirementCode))) {
        res.status(403).json({ error: "QA Contributors can only map evidence to requirements assigned to them" });
        return;
      }

      try {
        res.json(await mapQaEvidence(cycleId, evidenceId, parsed.data, req.user!.id));
      } catch (error) {
        sendLibraryError(res, error);
      }
    },
  );

  router.delete(
    "/cycles/:cycleId/evidence/:evidenceId/mapping/:requirementCode",
    requirePermission("qa:contribute"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const evidenceId = req.params.evidenceId;
      const requirementCode = req.params.requirementCode;
      const parsed = QaEvidenceLibraryQuerySchema.safeParse(req.query);
      if (!cycleId || !evidenceId || !requirementCode || !/^\d\.\d$/.test(requirementCode) || !parsed.success) {
        res.status(400).json({
          error: "Invalid evidence unmapping request",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canAccessEvidenceLibrary(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot unmap evidence in this programme" });
        return;
      }
      if (!(await canMapRequirement(req.user!, parsed.data.programmeId, cycleId, requirementCode))) {
        res.status(403).json({ error: "QA Contributors can only unmap evidence from requirements assigned to them" });
        return;
      }

      try {
        await unmapQaEvidence(
          parsed.data.programmeId,
          cycleId,
          evidenceId,
          requirementCode,
        );
        res.status(204).end();
      } catch (error) {
        sendLibraryError(res, error);
      }
    },
  );

  return router;
}
