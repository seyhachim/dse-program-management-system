import {
  AttendanceDateSchema,
  CourseFeedbackInput,
  SaveAttendanceInput,
  TelegramInitDataVerifyRequestSchema,
  TelegramLinkRequestSchema,
} from "@dse-pms/shared-types";
import { Router, type Response } from "express";
import { requireAuth } from "../../core/auth/middleware.ts";
import { resolveTelegramDeepLink } from "./deep-link.ts";
import { TelegramInitDataError } from "./init-data.ts";
import { TelegramLinkError, telegramIdentityStore } from "./identity-store.ts";
import { telegramMiniAppService, telegramMiniErrorStatus } from "./mini-app-service.ts";
import { telegramNotificationService } from "./notification-service.ts";
import { TelegramInitDataReplayError } from "./replay-store.ts";
import {
  issueTelegramSession,
  requireTelegramSession,
  resolveTelegramSession,
} from "./session.ts";
import {
  TelegramDisabledError,
  type TelegramService,
  telegramService,
} from "./service.ts";

function sendVerificationError(res: Response, error: unknown) {
  if (error instanceof TelegramDisabledError) {
    res.status(503).json({ error: { code: "TELEGRAM_DISABLED", message: "Telegram Mini App integration is unavailable" } });
    return;
  }
  if (error instanceof TelegramInitDataReplayError) {
    res.status(409).json({ error: { code: "INIT_DATA_REPLAYED", message: "This Telegram launch has already been verified" } });
    return;
  }
  if (error instanceof TelegramInitDataError) {
    const expired = error.code === "INIT_DATA_EXPIRED";
    res.status(401).json({
      error: {
        code: error.code,
        message: expired ? "Telegram launch data is no longer valid" : "Telegram launch data could not be verified",
      },
    });
    return;
  }
  res.status(500).json({ error: "Could not verify Telegram launch data" });
}

function sendMiniAppError(res: Response, error: unknown) {
  if (error instanceof TelegramLinkError) {
    const status = error.code === "TELEGRAM_LINK_CONFLICT" ? 409 : error.code === "INIT_DATA_EXPIRED" ? 401 : 400;
    return res.status(status).json({ error: { code: error.code, message: error.message } });
  }
  const miniStatus = telegramMiniErrorStatus(error);
  if (miniStatus) return res.status(miniStatus).json({ error: error instanceof Error ? error.message : "Request denied" });
  const name = error instanceof Error ? error.constructor.name : "";
  if (name === "PortalNotFoundError") return res.status(404).json({ error: (error as Error).message });
  if (name === "PortalConflictError") return res.status(409).json({ error: (error as Error).message });
  if (name === "PortalAccessError") return res.status(403).json({ error: (error as Error).message });
  console.error("Telegram Mini App request failed", error);
  return res.status(500).json({ error: "Could not complete the Telegram Mini App request" });
}

export function createTelegramRouter(service: TelegramService = telegramService): Router {
  const router = Router();

  router.get("/config", (_req, res) => res.json(service.publicConfig()));
  router.get("/health", (_req, res) => res.json(service.health()));

  router.post("/auth/verify", async (req, res) => {
    const parsed = TelegramInitDataVerifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_INIT_DATA", message: "A valid Telegram initData value is required" } });
      return;
    }
    try {
      const result = await service.verifyInitData(parsed.data.initData);
      if (service !== telegramService) return void res.json(result);
      const identity = await telegramIdentityStore.findActiveByTelegramUserId(result.telegramUser.id);
      if (!identity) return void res.json({ ...result, linked: false });
      await telegramIdentityStore.markVerified(identity, result.telegramUser.username);
      const session = issueTelegramSession(identity);
      const user = await resolveTelegramSession(session.token);
      res.json({
        ...result,
        linked: true,
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt.toISOString(),
        roles: user.roles,
      });
    } catch (error) {
      sendVerificationError(res, error);
    }
  });

  router.get("/account", requireAuth, async (req, res) => {
    try {
      const identity = await telegramIdentityStore.findByUserId(req.user!.id);
      if (!identity || identity.revokedAt) return void res.json({ linked: false });
      res.json({
        linked: true,
        telegramUserId: identity.telegramUserId,
        telegramUsername: identity.telegramUsername ?? undefined,
        linkedAt: identity.linkedAt.toISOString(),
        lastVerifiedAt: identity.lastVerifiedAt?.toISOString(),
      });
    } catch (error) { sendMiniAppError(res, error); }
  });

  router.post("/account/link", requireAuth, async (req, res) => {
    const parsed = TelegramLinkRequestSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid Telegram verification" });
    try {
      const identity = await telegramIdentityStore.link(req.user!.id, parsed.data.verificationId);
      res.status(201).json({
        linked: true,
        telegramUserId: identity.telegramUserId,
        linkedAt: identity.linkedAt.toISOString(),
        lastVerifiedAt: identity.lastVerifiedAt?.toISOString(),
      });
    } catch (error) { sendMiniAppError(res, error); }
  });

  router.delete("/account", requireAuth, async (req, res) => {
    try { await telegramIdentityStore.revoke(req.user!.id); res.status(204).end(); } catch (error) { sendMiniAppError(res, error); }
  });

  router.use("/mini", requireTelegramSession);

  router.get("/mini/home", async (req, res) => {
    try { res.json(await telegramMiniAppService.home(req.telegramUser!)); } catch (error) { sendMiniAppError(res, error); }
  });
  router.get("/mini/schedule", async (req, res) => {
    try { res.json({ courses: await telegramMiniAppService.courses(req.telegramUser!) }); } catch (error) { sendMiniAppError(res, error); }
  });
  router.get("/mini/classes/:offeringId", async (req, res) => {
    try { res.json(await telegramMiniAppService.course(req.telegramUser!, req.params.offeringId!)); } catch (error) { sendMiniAppError(res, error); }
  });
  router.get("/mini/announcements", async (req, res) => {
    try { res.json(await telegramMiniAppService.announcements(req.telegramUser!)); } catch (error) { sendMiniAppError(res, error); }
  });
  router.get("/mini/results", async (req, res) => {
    try { res.json(await telegramMiniAppService.results(req.telegramUser!, typeof req.query.offeringId === "string" ? req.query.offeringId : undefined)); } catch (error) { sendMiniAppError(res, error); }
  });
  router.get("/mini/surveys", async (req, res) => {
    try { res.json(await telegramMiniAppService.surveys(req.telegramUser!)); } catch (error) { sendMiniAppError(res, error); }
  });
  router.post("/mini/surveys/:offeringId", async (req, res) => {
    const parsed = CourseFeedbackInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid feedback", details: parsed.error.flatten() });
    try { res.status(201).json(await telegramMiniAppService.submitSurvey(req.telegramUser!, req.params.offeringId!, parsed.data)); } catch (error) { sendMiniAppError(res, error); }
  });
  router.get("/mini/attendance/:offeringId/:date", async (req, res) => {
    const date = AttendanceDateSchema.safeParse(req.params.date);
    if (!date.success) return void res.status(400).json({ error: "Invalid attendance date" });
    try { res.json(await telegramMiniAppService.attendance(req.telegramUser!, req.params.offeringId!, date.data)); } catch (error) { sendMiniAppError(res, error); }
  });
  router.put("/mini/attendance/:offeringId/:date", async (req, res) => {
    const date = AttendanceDateSchema.safeParse(req.params.date);
    const body = SaveAttendanceInput.safeParse(req.body);
    if (!date.success || !body.success) return void res.status(400).json({ error: "Invalid attendance data" });
    try { res.json(await telegramMiniAppService.saveAttendance(req.telegramUser!, req.params.offeringId!, date.data, body.data)); } catch (error) { sendMiniAppError(res, error); }
  });

  router.post("/mini/deep-links/resolve", (req, res) => {
    if (typeof req.body?.token !== "string") return void res.status(400).json({ error: "Deep-link token is required" });
    try { res.json({ path: resolveTelegramDeepLink(req.body.token) }); } catch { res.status(401).json({ error: "Deep link is invalid or expired" }); }
  });

  router.get("/mini/notification-preferences", async (req, res) => {
    try { res.json(await telegramNotificationService.preferences(req.telegramUser!.identity.id)); } catch (error) { sendMiniAppError(res, error); }
  });
  router.put("/mini/notification-preferences", async (req, res) => {
    if (typeof req.body?.announcementsEnabled !== "boolean") return void res.status(400).json({ error: "Invalid notification preferences" });
    try {
      res.json(await telegramNotificationService.setPreferences(req.telegramUser!.identity.id, req.body.announcementsEnabled));
    } catch (error) { sendMiniAppError(res, error); }
  });

  return router;
}
