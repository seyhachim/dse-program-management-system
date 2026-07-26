import { Router } from "express";
import { CreateAccountInput } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { authService, ProvisioningError } from "./service.ts";

/**
 * Auth router:
 * - GET  /me       — the resolved caller (any authenticated user).
 * - POST /accounts — admin-only ("accounts:create"): invite a lecturer login and
 *   link/create the app User row.
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

  return router;
}
