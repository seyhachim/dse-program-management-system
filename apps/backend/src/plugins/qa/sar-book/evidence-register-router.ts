import { Router, type Response } from "express";
import {
  AddQaSarBookSectionEvidenceReferenceSchema,
  QaSarBookEvidenceRegisterQuerySchema,
  QaSarBookQuerySchema,
  UpdateQaSarBookEvidencePresentationSchema,
  UpdateQaSarBookTerminologySchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { requirePermission, roleHasPermission } from "../../../core/permissions/index.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";
import {
  QaSarBookEvidenceReferenceConflictError,
  addQaSarBookSectionEvidenceReference,
  deleteQaSarBookSectionEvidenceReference,
  getQaSarBookEvidenceRegister,
  getQaSarBookSectionEvidenceReferenceContext,
  getQaSarBookTerminology,
  listQaSarBookSectionEvidenceReferences,
  updateQaSarBookEvidencePresentation,
  updateQaSarBookTerminology,
} from "./evidence-register-service.ts";
import { getActiveQaSarBookSectionAssignment } from "./narrative-service.ts";
import { canManageSarBook, canReadSarBook, canWriteSarBookNarrative } from "./router.ts";

function sendError(res: Response, error: unknown): void {
  if (error instanceof QaSarResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof QaSarScopeMismatchError || error instanceof QaSarBookEvidenceReferenceConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the SAR book evidence operation" });
}

async function canWriteSectionEvidence(
  user: NonNullable<Express.Request["user"]>,
  programmeId: string,
  cycleId: string,
  sectionKey: string,
): Promise<boolean> {
  const hasPermission =
    (await roleHasPermission(user.roles, "qa:manage")) ||
    (await roleHasPermission(user.roles, "qa:contribute"));
  if (!hasPermission) return false;
  const assignment = await getActiveQaSarBookSectionAssignment(programmeId, cycleId, sectionKey);
  return canWriteSarBookNarrative(user, programmeId, assignment?.assignee.id ?? null);
}

export function createQaSarBookEvidenceRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/cycles/:cycleId/sar-book/evidence-register",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaSarBookEvidenceRegisterQuerySchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR book evidence-register query" });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      try {
        res.json(await getQaSarBookEvidenceRegister(parsed.data.programmeId, cycleId, parsed.data.mode));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get(
    "/sar-book/terminology",
    requirePermission("qa:read"),
    async (req, res) => {
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid SAR book terminology query" });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      try {
        res.json(await getQaSarBookTerminology(parsed.data.programmeId));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.put(
    "/sar-book/terminology",
    requirePermission("qa:manage"),
    async (req, res) => {
      const parsed = UpdateQaSarBookTerminologySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid SAR book terminology", details: parsed.error.flatten() });
        return;
      }
      if (!canManageSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "Only programme leadership can manage SAR terminology" });
        return;
      }
      try {
        res.json(await updateQaSarBookTerminology(parsed.data, req.user!.id));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get(
    "/cycles/:cycleId/sar-book/sections/:sectionKey/evidence-references",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const sectionKey = req.params.sectionKey;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!cycleId || !sectionKey || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR section evidence-reference query" });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      try {
        res.json(await listQaSarBookSectionEvidenceReferences(parsed.data.programmeId, cycleId, sectionKey));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/cycles/:cycleId/sar-book/sections/:sectionKey/evidence-references",
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const sectionKey = req.params.sectionKey;
      const parsed = AddQaSarBookSectionEvidenceReferenceSchema.safeParse(req.body);
      if (!cycleId || !sectionKey || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR section evidence reference", details: parsed.success ? undefined : parsed.error.flatten() });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      try {
        if (!(await canWriteSectionEvidence(req.user!, parsed.data.programmeId, cycleId, sectionKey))) {
          res.status(403).json({ error: "You can link evidence only to SAR sections you may edit" });
          return;
        }
        res.status(201).json(await addQaSarBookSectionEvidenceReference(cycleId, sectionKey, parsed.data, req.user!.id));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.delete(
    "/cycles/:cycleId/sar-book/evidence-references/:referenceId",
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const referenceId = req.params.referenceId;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!cycleId || !referenceId || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR section evidence-reference removal" });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      try {
        const context = await getQaSarBookSectionEvidenceReferenceContext(parsed.data.programmeId, cycleId, referenceId);
        if (!context) {
          res.status(404).json({ error: "SAR evidence reference not found" });
          return;
        }
        if (!(await canWriteSectionEvidence(req.user!, parsed.data.programmeId, cycleId, context.sectionKey))) {
          res.status(403).json({ error: "You can remove evidence only from SAR sections you may edit" });
          return;
        }
        await deleteQaSarBookSectionEvidenceReference(parsed.data.programmeId, cycleId, referenceId);
        res.status(204).end();
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.put(
    "/cycles/:cycleId/sar-book/evidence/:evidenceId/presentation",
    requirePermission("qa:manage"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const evidenceId = req.params.evidenceId;
      const parsed = UpdateQaSarBookEvidencePresentationSchema.safeParse(req.body);
      if (!cycleId || !evidenceId || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR evidence presentation", details: parsed.success ? undefined : parsed.error.flatten() });
        return;
      }
      if (!canManageSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "Only programme leadership can manage SAR evidence presentation" });
        return;
      }
      try {
        await updateQaSarBookEvidencePresentation(cycleId, evidenceId, parsed.data, req.user!.id);
        res.status(204).end();
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  return router;
}
