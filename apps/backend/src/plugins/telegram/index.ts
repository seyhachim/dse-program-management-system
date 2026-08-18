import { telegramManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { telegramNotificationService } from "./notification-service.ts";
import { createTelegramRouter } from "./router.ts";
import { telegramService } from "./service.ts";

export const telegramBackendService = {
  ...telegramService,
  notifications: telegramNotificationService,
};

export type TelegramBackendService = typeof telegramBackendService;

export const telegramPlugin: BackendPlugin<TelegramBackendService> = {
  manifest: telegramManifest,
  router: createTelegramRouter(),
  service: telegramBackendService,
};
