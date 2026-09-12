import type { OpenTeachingSlotStudentAssignment } from "@dse-pms/shared-types";
import { Router } from "express";
import { registry } from "../../core/plugins/registry.ts";
import { requireTelegramSession } from "./session.ts";

type OpenTeachingSlotReadContract = {
  openTeachingSlots: {
    studentAssignments(userId: string): Promise<OpenTeachingSlotStudentAssignment[]>;
  };
};

export function createTelegramOpenTeachingSlotRouter(): Router {
  const router = Router();
  router.get("/mini/open-slot-assignments", requireTelegramSession, async (req, res) => {
    try {
      const offerings = registry.get<OpenTeachingSlotReadContract>("offerings").service;
      res.json(await offerings.openTeachingSlots.studentAssignments(req.telegramUser!.id));
    } catch (error) {
      const name = error instanceof Error ? error.constructor.name : "";
      if (name === "OpenTeachingSlotAuthorizationError") {
        res.status(403).json({ error: (error as Error).message });
        return;
      }
      console.error("Telegram open teaching slot schedule projection failed", error);
      res.status(500).json({ error: "Could not load confirmed additional classes" });
    }
  });
  return router;
}
