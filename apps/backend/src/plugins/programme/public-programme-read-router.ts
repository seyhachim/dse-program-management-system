import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import {
  PublicProgrammeFaqQuerySchema,
  PublicProgrammeImportantDateQuerySchema,
} from "@dse-pms/shared-types";
import {
  PublicProgrammeReadNotFoundError,
  publicProgrammeReadService,
} from "./public-programme-read-service.ts";

function sendReadError(res: Response, error: unknown): void {
  if (error instanceof PublicProgrammeReadNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  console.error("Public programme read failed", error);
  res.status(500).json({ error: "Could not load public programme information" });
}

function etagFor(value: unknown): string {
  const digest = createHash("sha256").update(JSON.stringify(value)).digest("base64url");
  return `\"${digest}\"`;
}

function sendPublicJson(req: Request, res: Response, value: unknown): void {
  const etag = etagFor(value);
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  res.json(value);
}

function programmeId(req: Request, res: Response): string | null {
  const id = req.params.programmeId?.trim();
  if (!id) {
    res.status(400).json({ error: "Programme id is required" });
    return null;
  }
  return id;
}

export function createPublicProgrammeReadRouter(): Router {
  const router = Router();

  router.get("/programmes/:programmeId", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    try {
      sendPublicJson(req, res, await publicProgrammeReadService.getProgramme(id));
    } catch (error) {
      sendReadError(res, error);
    }
  });

  router.get("/programmes/:programmeId/faqs", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    const parsed = PublicProgrammeFaqQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid FAQ query" });
      return;
    }
    try {
      sendPublicJson(req, res, await publicProgrammeReadService.listFaqs(id, parsed.data));
    } catch (error) {
      sendReadError(res, error);
    }
  });

  router.get("/programmes/:programmeId/faqs/:slug", async (req, res) => {
    const id = programmeId(req, res);
    const slug = req.params.slug?.trim();
    if (!id) return;
    if (!slug) {
      res.status(400).json({ error: "FAQ slug is required" });
      return;
    }
    try {
      sendPublicJson(req, res, await publicProgrammeReadService.getFaqBySlug(id, slug));
    } catch (error) {
      sendReadError(res, error);
    }
  });

  router.get("/programmes/:programmeId/faq-categories", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    try {
      sendPublicJson(req, res, await publicProgrammeReadService.listFaqCategories(id));
    } catch (error) {
      sendReadError(res, error);
    }
  });

  router.get("/programmes/:programmeId/admission", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    try {
      sendPublicJson(req, res, await publicProgrammeReadService.getAdmission(id));
    } catch (error) {
      sendReadError(res, error);
    }
  });

  router.get("/programmes/:programmeId/fees-scholarships", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    try {
      sendPublicJson(req, res, await publicProgrammeReadService.getFeesScholarships(id));
    } catch (error) {
      sendReadError(res, error);
    }
  });

  router.get("/programmes/:programmeId/important-dates", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    const parsed = PublicProgrammeImportantDateQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid important-date query" });
      return;
    }
    try {
      sendPublicJson(req, res, await publicProgrammeReadService.listImportantDates(id, parsed.data));
    } catch (error) {
      sendReadError(res, error);
    }
  });

  router.get("/programmes/:programmeId/contact", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    try {
      sendPublicJson(req, res, await publicProgrammeReadService.getContact(id));
    } catch (error) {
      sendReadError(res, error);
    }
  });

  return router;
}
