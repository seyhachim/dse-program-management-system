import { Router } from "express";
import { z } from "zod";
import { CreateAccountInput, ManageProgrammeRoleInput } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  authService,
  ProgrammeRoleAssignmentError,
  ProvisioningError,
} from "./service.ts";

const ProgrammeRoleListQuery = z.object({
  programmeId: z.string().trim().min(1),
});

function canManageProgrammeRoles(
  user: NonNullable<Express.Request["user"]>,
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(user, ["admin", "program_coordinator"], programmeId);
}

/**
 * Auth router:
 * - GET    /me               — the resolved caller (any authenticated user).
 * - POST   /accounts         — admin-only account provisioning.
 * - GET    /programme-roles  — programme leadership lists additive QA grants.
 * - POST   /programme-roles  — add an allowed programme role without replacing existing roles.
 * - DELETE /programme-roles  — remove only the requested additive programme role.
 */
export function createAuthRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/me", async (req, res) => {
    // requireAuth guarantees req.user is set.
    res.json(await authService.me(req.user!.id));
  });

  router.post("/accounts", requirePermission("accounts:create"), async (req, res) => {
    const parsed = CreateAccountInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(await authService.createAccount(parsed.data));
    } catch (err) {
      if (err instanceof ProvisioningError) {
        res.status(502).json({ error: err.message });
        return;
      }
      const code = (err as { code?: string }).code;
      if (code === "P2002") {
        res.status(409).json({ error: "An account with that email already exists" });
        return;
      }
      res.status(500).json({ error: "Could not create account" });
    }
  });

  router.get("/programme-roles", requirePermission("qa:write"), async (req, res) => {
    const parsed = ProgrammeRoleListQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid programme role query", details: parsed.error.flatten() });
      return;
    }
    if (!canManageProgrammeRoles(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot manage roles for this programme" });
      return;
    }
    res.json(await authService.listProgrammeRoleAssignments(parsed.data.programmeId));
  });

  router.post("/programme-roles", requirePermission("qa:write"), async (req, res) => {
    const parsed = ManageProgrammeRoleInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid programme role assignment", details: parsed.error.flatten() });
      return;
    }
    if (!canManageProgrammeRoles(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot manage roles for this programme" });
      return;
    }
    try {
      res.status(201).json(await authService.assignProgrammeRole(parsed.data));
    } catch (err) {
      if (err instanceof ProgrammeRoleAssignmentError) {
        res.status(409).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "Could not assign programme role" });
    }
  });

  router.delete("/programme-roles", requirePermission("qa:write"), async (req, res) => {
    const parsed = ManageProgrammeRoleInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid programme role removal", details: parsed.error.flatten() });
      return;
    }
    if (!canManageProgrammeRoles(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot manage roles for this programme" });
      return;
    }
    try {
      await authService.removeProgrammeRole(parsed.data);
      res.status(204).end();
    } catch (err) {
      if (err instanceof ProgrammeRoleAssignmentError) {
        res.status(409).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "Could not remove programme role" });
    }
  });

  return router;
}
