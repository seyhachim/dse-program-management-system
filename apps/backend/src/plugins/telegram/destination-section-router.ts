import { Router } from "express";
import { CreateTelegramDestinationInput } from "@dse-pms/shared-types";
import { z } from "zod";
import { requireAuth } from "../../core/auth/middleware.ts";
import { telegramDestinationErrorStatus } from "./destination-service.ts";
import { telegramDestinationSectionService } from "./destination-section-service.ts";

const ProgrammeQuery = z.object({ programmeId: z.string().trim().min(1).optional() });

export function createTelegramDestinationSectionRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/destinations/scopes/sections", async (req, res) => {
    const parsed = ProgrammeQuery.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    try {
      res.json(await telegramDestinationSectionService.listSections(req.user!, parsed.data.programmeId));
    } catch (error) {
      const status = telegramDestinationErrorStatus(error);
      if (status) return void res.status(status).json({ error: (error as Error).message });
      throw error;
    }
  });

  router.post("/destinations/class-section", async (req, res) => {
    const parsed = CreateTelegramDestinationInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    if (parsed.data.audienceType !== "CLASS_SECTION") {
      return void res.status(400).json({ error: "This endpoint only creates CLASS_SECTION destinations" });
    }
    try {
      res.status(201).json(await telegramDestinationSectionService.create(req.user!, parsed.data));
    } catch (error) {
      const status = telegramDestinationErrorStatus(error);
      if (status) return void res.status(status).json({ error: (error as Error).message });
      throw error;
    }
  });

  return router;
}
