import { Router } from "express";
import { StudentPortfolioProfileInput } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  PortalAccessError,
  PortalConflictError,
  PortalNotFoundError,
} from "./service.ts";
import { studentPortfolioProfileService } from "./portfolio-profile.ts";

function handlePortfolioError(error: unknown, res: import("express").Response) {
  if (error instanceof PortalNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof PortalConflictError) return res.status(409).json({ error: error.message });
  if (error instanceof PortalAccessError) return res.status(403).json({ error: error.message });
  console.error("Student portfolio request failed", error);
  return res.status(500).json({ error: "Could not complete the portfolio request" });
}

export function createStudentPortfolioRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", requirePermission("student-portal:read"), async (req, res) => {
    try {
      res.json(await studentPortfolioProfileService.get(req.user!.id));
    } catch (error) {
      handlePortfolioError(error, res);
    }
  });

  router.put("/", requirePermission("student-portal:read"), async (req, res) => {
    const parsed = StudentPortfolioProfileInput.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({
        error: "Invalid portfolio profile",
        details: parsed.error.flatten(),
      });
    }
    try {
      res.json(await studentPortfolioProfileService.update(req.user!.id, parsed.data));
    } catch (error) {
      handlePortfolioError(error, res);
    }
  });

  return router;
}
