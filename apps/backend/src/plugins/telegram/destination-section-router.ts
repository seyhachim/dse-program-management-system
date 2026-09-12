import { Router } from "express";
import { TelegramDestinationChatTypeSchema } from "@dse-pms/shared-types";
import { z } from "zod";
import { requireAuth } from "../../core/auth/middleware.ts";
import { telegramDestinationErrorStatus } from "./destination-service.ts";
import { telegramDestinationSectionService } from "./destination-section-service.ts";

const ProgrammeQuery = z.object({ programmeId: z.string().trim().min(1).optional() });
const ClassSectionDestinationCreateRequestSchema = z.object({
  programmeId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  audienceType: z.literal("CLASS_SECTION"),
  scopeId: z.string().trim().min(1),
  purpose: z.string().trim().max(500).optional(),
  chatType: TelegramDestinationChatTypeSchema.default("SUPERGROUP"),
}).strict();

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
    const parsed = ClassSectionDestinationCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
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
