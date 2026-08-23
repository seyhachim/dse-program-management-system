import { Router } from "express";
import { studentPortfolioPublicService } from "./portfolio-public.ts";
import { PortalNotFoundError } from "./service.ts";

export function createStudentPortfolioPublicRouter(): Router {
  const router = Router();
  router.get("/:slug", async (req, res) => {
    try {
      // Prevent a CDN/browser from serving a previously public portfolio after unpublish.
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.json(await studentPortfolioPublicService.get(req.params.slug!));
    } catch (error) {
      if (error instanceof PortalNotFoundError) return void res.status(404).json({ error: error.message });
      console.error("Public student portfolio request failed", error);
      return void res.status(500).json({ error: "Could not load public portfolio" });
    }
  });
  return router;
}
