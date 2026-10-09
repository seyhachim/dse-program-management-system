import { Router } from "express";
import { z } from "zod";
import {
  GoogleApprovalError,
  approveGoogleIdentity,
  googlePilotBackendEnabled,
  recordGoogleLinkIntent,
  revokeGoogleIdentity,
} from "../../core/auth/google-approval-store.ts";

const PasswordProof = z.object({
  password: z.string().min(8).max(256),
  consent: z.literal(true),
}).strict();

// Evidence references must identify a restricted operator ticket, never a student
// name, raw student ID, email, access token, screenshot or password.
const ApprovalInput = z.object({
  targetUserId: z.string().uuid(),
  authUid: z.string().uuid(),
  googleIdentityId: z.string().trim().min(1).max(200),
  evidenceReference: z.string().trim().regex(/^[A-Za-z0-9/_-]{8,120}$/),
  reason: z.string().trim().min(8).max(500),
  adminPassword: z.string().min(8).max(256),
  studentRecordVerified: z.literal(true),
  directConsentVerified: z.literal(true),
  providerOwnershipVerified: z.literal(true),
}).strict();

function handleError(error: unknown, res: import("express").Response): void {
  if (error instanceof GoogleApprovalError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  // Do not log request bodies, passwords, tokens or identity IDs.
  res.status(503).json({ error: "Google approval service is temporarily unavailable" });
}

/** Mounted beneath the existing /api/auth requireAuth middleware. */
export function createGoogleApprovalRouter(): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    if (!googlePilotBackendEnabled()) return void res.status(403).json({ error: "Google approval pilot is disabled" });
    next();
  });

  router.post("/link-intent", async (req, res) => {
    const parsed = PasswordProof.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Fresh password and explicit consent required" });
    const password = parsed.data.password;
    // Remove credentials from Express's retained body as soon as parsed.
    if (req.body && typeof req.body === "object") delete req.body.password;
    try {
      res.status(201).json(await recordGoogleLinkIntent(req.user!, password));
    } catch (error) { handleError(error, res); }
  });

  router.post("/approve", async (req, res) => {
    const parsed = ApprovalInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid independent approval evidence or credentials" });
    const input = parsed.data;
    if (req.body && typeof req.body === "object") delete req.body.adminPassword;
    try {
      await approveGoogleIdentity(req.user!, input);
      res.status(201).json({ status: "approved" });
    } catch (error) { handleError(error, res); }
  });

  router.post("/revoke", async (req, res) => {
    const parsed = ApprovalInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid revocation evidence or credentials" });
    const input = parsed.data;
    if (req.body && typeof req.body === "object") delete req.body.adminPassword;
    try {
      await revokeGoogleIdentity(req.user!, input);
      res.status(201).json({ status: "revoked" });
    } catch (error) { handleError(error, res); }
  });

  return router;
}
