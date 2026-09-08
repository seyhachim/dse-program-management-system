import { Router } from "express";
import { telegramManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createTelegramDestinationRouter } from "./destination-router.ts";
import { telegramDestinationService } from "./destination-service.ts";
import { telegramNotificationService } from "./notification-service.ts";
import { createLocalizedPublicTelegramRouter } from "./public-bot/localized-router.ts";
import { createTelegramRouter } from "./router.ts";
import { telegramService } from "./service.ts";

export const telegramBackendService = {
  ...telegramService,
  notifications: telegramNotificationService,
  destinations: telegramDestinationService,
};

export type TelegramBackendService = typeof telegramBackendService;

const telegramRouter = Router();
telegramRouter.use("/public", createLocalizedPublicTelegramRouter());
telegramRouter.use(createTelegramDestinationRouter());
telegramRouter.use(createTelegramRouter());

export const telegramPlugin: BackendPlugin<TelegramBackendService> = {
  manifest: telegramManifest,
  router: telegramRouter,
  service: telegramBackendService,
};