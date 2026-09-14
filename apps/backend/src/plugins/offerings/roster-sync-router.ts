import { CanonicalRosterSyncInput } from "@dse-pms/shared-types";
import { Router } from "express";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, type Role } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  rosterSyncService,
  RosterSyncBlockedError,
  RosterSyncReferenceError,
} from "./roster-sync-service.ts";

const ROSTER_SYNC_ROLES: Role[] = ["admin", "program_coordinator", "program_secretary"];

export function createRosterSyncRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.post("/roster-sync/preview", requirePermission("offerings:manage"), async (req, res) => {
    const parsed = CanonicalRosterSyncInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid roster synchronization request", details: parsed.error.flatten() });
      return;
    }
    try {
      const preview = await rosterSyncService.preview(parsed.data);
      if (!hasAnyRoleInProgramme(req.user!, ROSTER_SYNC_ROLES, preview.sourceSection.programmeId)) {
        res.status(403).json({ error: "Only programme roster managers can synchronize class rosters" });
        return;
      }
      res.json(preview);
    } catch (error) {
      handleRosterSyncError(error, res);
    }
  });

  router.post("/roster-sync/apply", requirePermission("offerings:manage"), async (req, res) => {
    const parsed = CanonicalRosterSyncInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid roster synchronization request", details: parsed.error.flatten() });
      return;
    }
    try {
      const preview = await rosterSyncService.preview(parsed.data);
      if (!hasAnyRoleInProgramme(req.user!, ROSTER_SYNC_ROLES, preview.sourceSection.programmeId)) {
        res.status(403).json({ error: "Only programme roster managers can synchronize class rosters" });
        return;
      }
      res.json(await rosterSyncService.apply(parsed.data));
    } catch (error) {
      handleRosterSyncError(error, res);
    }
  });

  return router;
}

function handleRosterSyncError(error: unknown, res: import("express").Response): void {
  if (error instanceof RosterSyncReferenceError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof RosterSyncBlockedError) {
    res.status(409).json({ error: error.message, preview: error.preview });
    return;
  }
  console.error("Roster synchronization failed", error);
  res.status(500).json({ error: "Could not synchronize class rosters" });
}
