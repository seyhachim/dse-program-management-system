import { Router } from "express";
import type { TelegramService } from "./service.ts";
import { telegramService } from "./service.ts";

export function createTelegramRouter(
  service: TelegramService = telegramService,
): Router {
  const router = Router();

  router.get("/config", (_req, res) => {
    res.json(service.publicConfig());
  });

  router.get("/health", (_req, res) => {
    res.json(service.health());
  });

  return router;
}
