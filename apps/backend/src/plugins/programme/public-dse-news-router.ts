import { Router } from "express";
import { z } from "zod";
import { publicDseNewsService, PublicNewsNotFoundError } from "./public-dse-news-service.ts";

/**
 * Public DSE website API. This router is deliberately mounted before requireAuth.
 * The service uses a strict published + public-approved projection; never a
 * Student Portal DTO or course activity / participant endpoint.
 */
export function createPublicDseNewsRouter(): Router {
  const router = Router();
  router.get("/programmes/:programmeId/news", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const programmeId = req.params.programmeId ?? "";
    if (programmeId !== "dse") return void res.status(404).json({ error: "Programme not found" });
    try { res.json(await publicDseNewsService.list(programmeId)); }
    catch (error) {
      console.error("Public DSE News list failed", error);
      res.status(503).json({ error: "Programme news is temporarily unavailable" });
    }
  });
  router.get("/programmes/:programmeId/news/:id", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = req.params.id ?? "";
    if (req.params.programmeId !== "dse" || !z.string().uuid().safeParse(id).success) {
      return void res.status(404).json({ error: "Article not found" });
    }
    try { res.json(await publicDseNewsService.get("dse", id)); }
    catch (error) {
      if (error instanceof PublicNewsNotFoundError) return void res.status(404).json({ error: "Article not found" });
      console.error("Public DSE News article failed", error);
      res.status(503).json({ error: "Programme article is temporarily unavailable" });
    }
  });
  return router;
}
