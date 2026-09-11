import { Router } from "express";
import { telegramManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createTelegramDestinationRouter } from "./destination-router.ts";
import { createTelegramDestinationSectionRouter } from "./destination-section-router.ts";
import { telegramDestinationService } from "./destination-service.ts";
import { telegramNotificationService } from "./notification-service.ts";
import { createTelegramOpenTeachingSlotRouter } from "./open-teaching-slot-router.ts";
import { openTeachingSlotNotificationService } from "./open-teaching-slot-notification-service.ts";
import { createEnhancedPublicTelegramRouter } from "./public-bot/ask-dse-enhanced-router.ts";
import { createTelegramRouter } from "./router.ts";
import { telegramService } from "./service.ts";

export const telegramBackendService = {
  ...telegramService,
  notifications: telegramNotificationService,
  openTeachingSlots: openTeachingSlotNotificationService,
  destinations: telegramDestinationService,
};

export type TelegramBackendService = typeof telegramBackendService;

const telegramRouter = Router();
telegramRouter.use("/public", createEnhancedPublicTelegramRouter());
telegramRouter.use(createTelegramDestinationSectionRouter());
telegramRouter.use(createTelegramDestinationRouter());
telegramRouter.use(createTelegramOpenTeachingSlotRouter());
telegramRouter.use(createTelegramRouter());

export const telegramPlugin: BackendPlugin<TelegramBackendService> = {
  manifest: telegramManifest,
  router: telegramRouter,
  service: telegramBackendService,
};
