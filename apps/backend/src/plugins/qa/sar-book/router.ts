import { Router, type Response } from "express";
import {
  QaSarBookQuerySchema,
  SaveQaSarBookSectionSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";
import {
  getQaSarBookNarrativeSection,
  saveQaSarBookNarrativeSection,
} from "./narrative-service.ts";
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

export function canWriteSarBookNarrative(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(user, ["admin", "program_coordinator"], programmeId);
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof QaSarResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof QaSarScopeMismatchError) {
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
        const section = await getQaSarBookNarrativeSection(parsed.data.programmeId, cycleId, sectionKey);
        res.json({ ...section, editable: canWriteSarBookNarrative(req.user!, parsed.data.programmeId) });
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.put(
    "/cycles/:cycleId/sar-book/sections/:sectionKey",
    requirePermission("qa:manage"),
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
      if (!canWriteSarBookNarrative(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "Only programme leadership can edit shared SAR book sections" });
        return;
      }
      try {
        res.json(await saveQaSarBookNarrativeSection(cycleId, sectionKey, parsed.data, req.user!.id));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  return router;
}
