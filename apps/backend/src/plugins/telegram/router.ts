import { TelegramInitDataVerifyRequestSchema } from "@dse-pms/shared-types";
import { Router, type Response } from "express";
import { TelegramInitDataError } from "./init-data.ts";
import { TelegramInitDataReplayError } from "./replay-store.ts";
import {
  TelegramDisabledError,
  type TelegramService,
  telegramService,
} from "./service.ts";

function sendVerificationError(res: Response, error: unknown) {
  if (error instanceof TelegramDisabledError) {
    res.status(503).json({
      error: {
        code: "TELEGRAM_DISABLED",
        message: "Telegram Mini App integration is unavailable",
      },
    });
    return;
  }

  if (error instanceof TelegramInitDataReplayError) {
    res.status(409).json({
      error: {
        code: "INIT_DATA_REPLAYED",
        message: "This Telegram launch has already been verified",
      },
    });
    return;
  }

  if (error instanceof TelegramInitDataError) {
    const expired = error.code === "INIT_DATA_EXPIRED";
    res.status(401).json({
      error: {
        code: error.code,
        message: expired
          ? "Telegram launch data is no longer valid"
          : "Telegram launch data could not be verified",
      },
    });
    return;
  }

  res.status(500).json({ error: "Could not verify Telegram launch data" });
}

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

  router.post("/auth/verify", async (req, res) => {
    const parsed = TelegramInitDataVerifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_INIT_DATA",
          message: "A valid Telegram initData value is required",
        },
      });
      return;
    }

    try {
      res.json(await service.verifyInitData(parsed.data.initData));
    } catch (error) {
      sendVerificationError(res, error);
    }
  });

  return router;
}
