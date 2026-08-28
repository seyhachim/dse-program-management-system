import { Router } from "express";
import { z } from "zod";
import {
  ChangePasswordInput,
  CreateAccountInput,
  ManageProgrammeRoleInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, type AuthUser } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  authService,
  ProgrammeRoleAssignmentError,
  ProvisioningError,
} from "./service.ts";
import { resendLecturerInvitation } from "./resend-invitation.ts";

const ProgrammeRoleListQuery = z.object({
  programmeId: z.string().trim().min(1),
});

const ProgrammeRoleDeleteRequest = z.object({
  userId: z.string().uuid(),
  programmeId: z.string().trim().min(1),
  role: z.literal("qa_contributor"),
});

const AccountUserIdParam = z.object({
  userId: z.string().uuid(),
});

function canManageProgrammeRoles(user: AuthUser, programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, ["admin", "program_coordinator"], programmeId);
}

/**
 * Auth router:
 * - GET    /me                                  — the resolved caller.
 * - POST   /accounts                            — admin-only account provisioning.
 * - POST   /accounts/:userId/resend-invitation — admin-only pending lecturer invite resend.
 * - POST   /accounts/:userId/temporary-password — admin-only active lecturer recovery.
 * - POST   /change-password                     — authenticated caller replaces own credential.
 * - GET/POST/DELETE /programme-roles            — scoped additive QA grants.
 */
export function createAuthRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/me", async (req, res) => {
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

  router.post(
    "/accounts/:userId/resend-invitation",
    requirePermission("accounts:create"),
    async (req, res) => {
      const parsed = AccountUserIdParam.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid lecturer account id" });
        return;
      }
      try {
        res.json(await resendLecturerInvitation(parsed.data.userId));
      } catch (err) {
        if (err instanceof ProvisioningError) {
          res.status(409).json({ error: err.message });
          return;
        }
        res.status(500).json({ error: "Could not resend invitation" });
      }
    },
  );

  router.post(
    "/accounts/:userId/temporary-password",
    requirePermission("accounts:create"),
    async (req, res) => {
      const parsed = AccountUserIdParam.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid lecturer account id" });
        return;
      }
      try {
        res.json(await authService.setTemporaryPassword(req.user!.id, parsed.data.userId));
      } catch (err) {
        if (err instanceof ProvisioningError) {
          res.status(409).json({ error: err.message });
          return;
        }
        res.status(500).json({ error: "Could not set temporary password" });
      }
    },
  );

  router.post("/change-password", async (req, res) => {
    const parsed = ChangePasswordInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid password", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await authService.changePassword(req.user!.id, parsed.data));
    } catch (err) {
      if (err instanceof ProvisioningError) {
        res.status(409).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "Could not change password" });
    }
  });

  router.get("/programme-roles", requirePermission("qa:manage"), async (req, res) => {
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

  router.post("/programme-roles", requirePermission("qa:manage"), async (req, res) => {
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

  router.delete("/programme-roles/:userId", requirePermission("qa:manage"), async (req, res) => {
    const parsed = ProgrammeRoleDeleteRequest.safeParse({
      userId: req.params.userId,
      programmeId: req.query.programmeId,
      role: req.query.role,
    });
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
