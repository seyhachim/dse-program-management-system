import { Router, type Response } from "express";
import {
  FinalizeQaSarBookReleaseSchema,
  QaSarBookDocumentQuerySchema,
  QaSarBookQuerySchema,
  QaSarBookReleaseQuerySchema,
  SaveQaSarBookSectionSchema,
  UpsertQaSarBookSectionAssignmentSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { requirePermission, roleHasPermission } from "../../../core/permissions/index.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";
import {
  QaSarBookRevisionConflictError,
  QaSarBookSectionAssigneeError,
  deleteQaSarBookSectionAssignment,
  getActiveQaSarBookSectionAssignment,
  getQaSarBookNarrativeSection,
  listQaSarBookSectionAssignments,
  listQaSarBookSectionRevisions,
  saveQaSarBookNarrativeSection,
  upsertQaSarBookSectionAssignment,
} from "./narrative-service.ts";
import {
  QaSarBookReleaseNotReadyError,
  buildQaSarBookDocument,
  finalizeQaSarBookRelease,
  getQaSarBookRelease,
  listQaSarBookReleases,
} from "./release-service.ts";
import { getQaSarBook } from "./service.ts";

export function canReadSarBook(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(
    user,
    ["admin", "program_coordinator", "qa_reviewer", "qa_contributor"],
    programmeId,
  );
}

export function canManageSarBook(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(user, ["admin", "program_coordinator"], programmeId);
}

export function canWriteSarBookNarrative(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
  assignedUserId: string | null,
): boolean {
  if (canManageSarBook(user, programmeId)) return true;
  return (
    assignedUserId === user.id &&
    hasAnyRoleInProgramme(user, ["qa_contributor"], programmeId)
  );
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof QaSarResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (
    error instanceof QaSarScopeMismatchError ||
    error instanceof QaSarBookRevisionConflictError ||
    error instanceof QaSarBookSectionAssigneeError ||
    error instanceof QaSarBookReleaseNotReadyError
  ) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the SAR book operation" });
}

export function createQaSarBookRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/cycles/:cycleId/sar-book",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({
          error: "Invalid SAR book query",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }

      try {
        res.json(await getQaSarBook(parsed.data.programmeId, cycleId));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get(
    "/cycles/:cycleId/sar-book/document",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaSarBookDocumentQuerySchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({
          error: "Invalid SAR book document query",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      try {
        res.json(await buildQaSarBookDocument(parsed.data.programmeId, cycleId, parsed.data.mode));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get(
    "/cycles/:cycleId/sar-book/releases",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaSarBookReleaseQuerySchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR book release query" });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      try {
        res.json(await listQaSarBookReleases(parsed.data.programmeId, cycleId));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get(
    "/cycles/:cycleId/sar-book/releases/:releaseId",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const releaseId = req.params.releaseId;
      const parsed = QaSarBookReleaseQuerySchema.safeParse(req.query);
      if (!cycleId || !releaseId || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR book release query" });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      try {
        res.json(await getQaSarBookRelease(parsed.data.programmeId, cycleId, releaseId));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/cycles/:cycleId/sar-book/releases",
    requirePermission("qa:manage"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = FinalizeQaSarBookReleaseSchema.safeParse(req.body);
      if (!cycleId || !parsed.success) {
        res.status(400).json({
          error: "Invalid SAR book release request",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canManageSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot finalize SAR book releases for this programme" });
        return;
      }
      try {
        res.status(201).json(
          await finalizeQaSarBookRelease(
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
    "/cycles/:cycleId/sar-book/assignments",
    requirePermission("qa:manage"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR book assignment query" });
        return;
      }
      if (!canManageSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot manage SAR book assignments for this programme" });
        return;
      }
      try {
        res.json(await listQaSarBookSectionAssignments(parsed.data.programmeId, cycleId));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get(
    "/cycles/:cycleId/sar-book/sections/:sectionKey",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const sectionKey = req.params.sectionKey;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!cycleId || !sectionKey || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR book section query" });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      try {
        const section = await getQaSarBookNarrativeSection(
          parsed.data.programmeId,
          cycleId,
          sectionKey,
        );
        res.json({
          ...section,
          editable: canWriteSarBookNarrative(
            req.user!,
            parsed.data.programmeId,
            section.assignment?.assignee.id ?? null,
          ),
        });
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get(
    "/cycles/:cycleId/sar-book/sections/:sectionKey/revisions",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const sectionKey = req.params.sectionKey;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!cycleId || !sectionKey || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR book revision query" });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      try {
        res.json(
          await listQaSarBookSectionRevisions(
            parsed.data.programmeId,
            cycleId,
            sectionKey,
          ),
        );
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.put(
    "/cycles/:cycleId/sar-book/sections/:sectionKey",
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const sectionKey = req.params.sectionKey;
      const parsed = SaveQaSarBookSectionSchema.safeParse(req.body);
      if (!cycleId || !sectionKey || !parsed.success) {
        res.status(400).json({
          error: "Invalid SAR book section",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canReadSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have access to this programme SAR book" });
        return;
      }
      const hasWritePermission =
        (await roleHasPermission(req.user!.roles, "qa:manage")) ||
        (await roleHasPermission(req.user!.roles, "qa:contribute"));
      if (!hasWritePermission) {
        res.status(403).json({ error: "Missing permission to edit SAR book content" });
        return;
      }
      try {
        const assignment = await getActiveQaSarBookSectionAssignment(
          parsed.data.programmeId,
          cycleId,
          sectionKey,
        );
        if (
          !canWriteSarBookNarrative(
            req.user!,
            parsed.data.programmeId,
            assignment?.assignee.id ?? null,
          )
        ) {
          res.status(403).json({
            error: "You can edit only shared SAR book sections assigned to you",
          });
          return;
        }
        res.json(
          await saveQaSarBookNarrativeSection(
            cycleId,
            sectionKey,
            parsed.data,
            req.user!.id,
          ),
        );
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.put(
    "/cycles/:cycleId/sar-book/sections/:sectionKey/assignment",
    requirePermission("qa:manage"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const sectionKey = req.params.sectionKey;
      const parsed = UpsertQaSarBookSectionAssignmentSchema.safeParse(req.body);
      if (!cycleId || !sectionKey || !parsed.success) {
        res.status(400).json({
          error: "Invalid SAR book section assignment",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!canManageSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot manage SAR book assignments for this programme" });
        return;
      }
      try {
        res.json(
          await upsertQaSarBookSectionAssignment(
            cycleId,
            sectionKey,
            parsed.data,
            req.user!.id,
          ),
        );
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.delete(
    "/cycles/:cycleId/sar-book/sections/:sectionKey/assignment",
    requirePermission("qa:manage"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const sectionKey = req.params.sectionKey;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (!cycleId || !sectionKey || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR book assignment removal" });
        return;
      }
      if (!canManageSarBook(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot manage SAR book assignments for this programme" });
        return;
      }
      try {
        await deleteQaSarBookSectionAssignment(
          parsed.data.programmeId,
          cycleId,
          sectionKey,
        );
        res.status(204).end();
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  return router;
}