import { timingSafeEqual } from "node:crypto";
import { Router, type Response } from "express";
import { requireAuth } from "../../core/auth/middleware.ts";
import { getPmsTelegramConfig } from "./config.ts";
import {
  TelegramDestinationError,
  telegramDestinationErrorStatus,
  telegramDestinationService,
  type TelegramDestinationAudience,
  type TelegramDestinationChatType,
} from "./destination-service.ts";

const AUDIENCES = new Set<TelegramDestinationAudience>([
  "ALL_LECTURERS",
  "ALL_STUDENTS",
  "COHORT",
  "CUSTOM",
]);
const CHAT_TYPES = new Set<TelegramDestinationChatType>(["GROUP", "SUPERGROUP", "CHANNEL"]);

function sendDestinationError(res: Response, error: unknown) {
  const status = telegramDestinationErrorStatus(error);
  if (status) {
    return res.status(status).json({
      error: error instanceof TelegramDestinationError ? { code: error.code, message: error.message } : "Request denied",
    });
  }
  console.error("Telegram destination request failed", error);
  return res.status(500).json({ error: "Could not complete Telegram destination request" });
}

function safeSecretEqual(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function telegramChatType(value: unknown): TelegramDestinationChatType | null {
  if (value === "group") return "GROUP";
  if (value === "supergroup") return "SUPERGROUP";
  if (value === "channel") return "CHANNEL";
  return null;
}

type TelegramRegistrationUpdate = {
  message?: {
    text?: string;
    chat?: { id?: string | number; title?: string; type?: string };
  };
  channel_post?: {
    text?: string;
    chat?: { id?: string | number; title?: string; type?: string };
  };
};

export function createTelegramDestinationRouter(): Router {
  const router = Router();

  // Dedicated authenticated-PMS-bot webhook. Telegram chat membership never
  // authenticates a PMS actor; this endpoint only observes a one-time code.
  router.post("/pms/webhook", async (req, res) => {
    const config = getPmsTelegramConfig();
    if (!config.enabled || !config.webhookSecret) {
      return void res.status(503).json({ error: "PMS Telegram registration webhook is not configured" });
    }
    const supplied = req.header("x-telegram-bot-api-secret-token");
    if (!safeSecretEqual(supplied, config.webhookSecret)) {
      return void res.status(401).json({ error: "Invalid Telegram webhook secret" });
    }

    const update = req.body as TelegramRegistrationUpdate;
    const message = update.message ?? update.channel_post;
    const text = message?.text?.trim() ?? "";
    const match = text.match(/^\/pms_register(?:@\w+)?\s+([A-Za-z0-9_-]{20,80})$/);
    if (!match) return void res.status(200).json({ ok: true, ignored: true });

    const chat = message?.chat;
    const type = telegramChatType(chat?.type);
    if (!chat?.id || !type) return void res.status(400).json({ error: "Registration must be sent from a group, supergroup, or channel" });

    try {
      await telegramDestinationService.observeRegistration({
        code: match[1]!,
        chatId: String(chat.id),
        chatTitle: chat.title,
        chatType: type,
      });
      res.json({ ok: true, observed: true });
    } catch (error) {
      sendDestinationError(res, error);
    }
  });

  router.use("/destinations", requireAuth);

  router.get("/destinations", async (req, res) => {
    try {
      const programmeId = typeof req.query.programmeId === "string" ? req.query.programmeId : undefined;
      res.json(await telegramDestinationService.list(req.user!, programmeId));
    } catch (error) { sendDestinationError(res, error); }
  });

  router.get("/destinations/scopes/cohorts", async (req, res) => {
    try {
      const programmeId = typeof req.query.programmeId === "string" ? req.query.programmeId : undefined;
      res.json(await telegramDestinationService.listCohorts(req.user!, programmeId));
    } catch (error) { sendDestinationError(res, error); }
  });

  router.post("/destinations", async (req, res) => {
    const audienceType = req.body?.audienceType as TelegramDestinationAudience;
    const chatType = (req.body?.chatType ?? "SUPERGROUP") as TelegramDestinationChatType;
    if (typeof req.body?.name !== "string" || !AUDIENCES.has(audienceType) || !CHAT_TYPES.has(chatType)) {
      return void res.status(400).json({ error: "Invalid Telegram destination" });
    }
    try {
      res.status(201).json(await telegramDestinationService.create(req.user!, {
        programmeId: typeof req.body.programmeId === "string" ? req.body.programmeId : undefined,
        name: req.body.name,
        audienceType,
        scopeId: typeof req.body.scopeId === "string" ? req.body.scopeId : undefined,
        purpose: typeof req.body.purpose === "string" ? req.body.purpose : undefined,
        chatType,
      }));
    } catch (error) { sendDestinationError(res, error); }
  });

  router.patch("/destinations/:id", async (req, res) => {
    if (req.body?.name !== undefined && typeof req.body.name !== "string") return void res.status(400).json({ error: "Invalid destination name" });
    if (req.body?.purpose !== undefined && typeof req.body.purpose !== "string") return void res.status(400).json({ error: "Invalid destination purpose" });
    if (req.body?.enabled !== undefined && typeof req.body.enabled !== "boolean") return void res.status(400).json({ error: "Invalid destination state" });
    try {
      res.json(await telegramDestinationService.update(req.user!, req.params.id!, {
        name: req.body?.name,
        purpose: req.body?.purpose,
        enabled: req.body?.enabled,
      }));
    } catch (error) { sendDestinationError(res, error); }
  });

  router.post("/destinations/:id/registration", async (req, res) => {
    try { res.status(201).json(await telegramDestinationService.beginRegistration(req.user!, req.params.id!)); }
    catch (error) { sendDestinationError(res, error); }
  });

  router.get("/destinations/:id/registration", async (req, res) => {
    try { res.json(await telegramDestinationService.pendingRegistration(req.user!, req.params.id!)); }
    catch (error) { sendDestinationError(res, error); }
  });

  router.post("/destinations/:id/confirm", async (req, res) => {
    if (typeof req.body?.registrationId !== "string") return void res.status(400).json({ error: "Registration id is required" });
    try { res.json(await telegramDestinationService.confirmRegistration(req.user!, req.params.id!, req.body.registrationId)); }
    catch (error) { sendDestinationError(res, error); }
  });

  router.post("/destinations/:id/test", async (req, res) => {
    const config = getPmsTelegramConfig();
    if (!config.miniAppUrl) return void res.status(503).json({ error: "PMS Mini App URL is not configured" });
    try { res.json(await telegramDestinationService.test(req.user!, req.params.id!, config.miniAppUrl)); }
    catch (error) { sendDestinationError(res, error); }
  });

  router.get("/destinations/:id/deliveries", async (req, res) => {
    try { res.json({ deliveries: await telegramDestinationService.deliveries(req.user!, req.params.id!) }); }
    catch (error) { sendDestinationError(res, error); }
  });

  return router;
}
