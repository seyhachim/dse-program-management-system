import { telegramManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createTelegramRouter } from "./router.ts";
import { telegramService, type TelegramService } from "./service.ts";

export const telegramPlugin: BackendPlugin<TelegramService> = {
  manifest: telegramManifest,
  router: createTelegramRouter(),
  service: telegramService,
};
