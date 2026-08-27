import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import {
  PublicProgrammeFaqQuerySchema,
  PublicProgrammeImportantDateQuerySchema,
  PublicProgrammeLocaleQuerySchema,
  PublicAcademicCalendarQuerySchema,
} from "@dse-pms/shared-types";
import {
  getPublicAbuseProtectionConfig,
  publicAbuseRateLimiter,
} from "../../core/security/public-abuse-protection.ts";
import { AcademicCalendarConflictError, academicCalendarService } from "./academic-calendar-service.ts";
import {
  PublicCurriculumConflictError,
  PublicCurriculumNotFoundError,
  publicCurriculumReadService,
} from "./public-curriculum-read-service.ts";
import {
  PublicProgrammeReadNotFoundError,
  publicProgrammeReadService,
} from "./public-programme-read-service.ts";
import { publicProgrammeSearchService } from "./public-programme-search-service.ts";

function sendReadError(res: Response, error: unknown): void {
  if (
    error instanceof PublicProgrammeReadNotFoundError ||
    error instanceof PublicCurriculumNotFoundError
  ) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof PublicCurriculumConflictError || error instanceof AcademicCalendarConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  console.error("Public programme read failed", error);
  res
    .status(500)
    .json({ error: "Could not load public programme information" });
}

function etagFor(value: unknown): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(value))
    .digest("base64url");
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

function localeFromQuery(req: Request, res: Response): "en" | "km" | null {
  const parsed = PublicProgrammeLocaleQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid locale; expected en or km" });
    return null;
  }
  return parsed.data.locale ?? "en";
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
  const abuseConfig = getPublicAbuseProtectionConfig();

  router.get("/programmes/:programmeId", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    try {
      const locale = localeFromQuery(req, res);
      if (!locale) return;
      sendPublicJson(
        req,
        res,
        await publicProgrammeReadService.getProgramme(id, locale),
      );
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
      sendPublicJson(
        req,
        res,
        await publicProgrammeReadService.listFaqs(id, parsed.data),
      );
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
      const locale = localeFromQuery(req, res);
      if (!locale) return;
      sendPublicJson(
        req,
        res,
        await publicProgrammeReadService.getFaqBySlug(id, slug, locale),
      );
    } catch (error) {
      sendReadError(res, error);
    }
  });

  router.get("/programmes/:programmeId/faq-categories", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    try {
      sendPublicJson(
        req,
        res,
        await publicProgrammeReadService.listFaqCategories(id),
      );
    } catch (error) {
      sendReadError(res, error);
    }
  });

  router.get("/programmes/:programmeId/search", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    const question = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!question || question.length > 500) {
      res
        .status(400)
        .json({ error: "Search requires q with 1..500 characters" });
      return;
    }

    const admission = publicAbuseRateLimiter.check(
      `public-search:${id}`,
      abuseConfig.publicSearchMax,
      abuseConfig.publicSearchWindowMs,
    );
    if (!admission.allowed) {
      res.setHeader("Retry-After", String(admission.retryAfterSeconds));
      res
        .status(429)
        .json({
          error: "Too many public search requests. Please try again shortly.",
        });
      return;
    }

    try {
      const locale = localeFromQuery(req, res);
      if (!locale) return;
      sendPublicJson(
        req,
        res,
        await publicProgrammeSearchService.search(id, question, locale),
      );
    } catch (error) {
      sendReadError(res, error);
    }
  });

  router.get("/programmes/:programmeId/admission", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    try {
      const locale = localeFromQuery(req, res);
      if (!locale) return;
      sendPublicJson(
        req,
        res,
        await publicProgrammeReadService.getAdmission(id, locale),
      );
    } catch (error) {
      sendReadError(res, error);
    }
  });

  router.get("/programmes/:programmeId/fees-scholarships", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    try {
      const locale = localeFromQuery(req, res);
      if (!locale) return;
      sendPublicJson(
        req,
        res,
        await publicProgrammeReadService.getFeesScholarships(id, locale),
      );
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
      sendPublicJson(
        req,
        res,
        await publicProgrammeReadService.listImportantDates(id, parsed.data),
      );
    } catch (error) {
      sendReadError(res, error);
    }
  });

  router.get("/programmes/:programmeId/academic-calendar", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    const parsed = PublicAcademicCalendarQuerySchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: "Academic calendar requires studyYear=1..4" }); return; }
    try { sendPublicJson(req, res, await academicCalendarService.publishedProjection(id, parsed.data.studyYear, parsed.data.academicYear)); } catch (error) { sendReadError(res, error); }
  });

  router.get("/programmes/:programmeId/contact", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    try {
      const locale = localeFromQuery(req, res);
      if (!locale) return;
      sendPublicJson(
        req,
        res,
        await publicProgrammeReadService.getContact(id, locale),
      );
    } catch (error) {
      sendReadError(res, error);
    }
  });

  router.get(
    "/programmes/:programmeId/curriculum/courses",
    async (req, res) => {
      const id = programmeId(req, res);
      if (!id) return;
      try {
        sendPublicJson(
          req,
          res,
          await publicCurriculumReadService.listCourses(id),
        );
      } catch (error) {
        sendReadError(res, error);
      }
    },
  );

  router.get(
    "/programmes/:programmeId/curriculum/courses/:query",
    async (req, res) => {
      const id = programmeId(req, res);
      const query = req.params.query?.trim();
      if (!id) return;
      if (!query) {
        res.status(400).json({ error: "Course query is required" });
        return;
      }
      try {
        sendPublicJson(
          req,
          res,
          await publicCurriculumReadService.getCourse(id, query),
        );
      } catch (error) {
        sendReadError(res, error);
      }
    },
  );

  router.get(
    "/programmes/:programmeId/curriculum/study-plan",
    async (req, res) => {
      const id = programmeId(req, res);
      if (!id) return;
      const yearLevel = Number(req.query.year);
      const semesterRaw = String(req.query.semester ?? "").toLocaleLowerCase();
      const semester =
        semesterRaw === "1" || semesterRaw === "first"
          ? "First"
          : semesterRaw === "2" || semesterRaw === "second"
            ? "Second"
            : null;
      if (!Number.isInteger(yearLevel) || !semester) {
        res
          .status(400)
          .json({ error: "Study plan requires year=1..4 and semester=1|2" });
        return;
      }
      try {
        sendPublicJson(
          req,
          res,
          await publicCurriculumReadService.getStudyPlan(
            id,
            yearLevel,
            semester,
          ),
        );
      } catch (error) {
        sendReadError(res, error);
      }
    },
  );

  router.get("/programmes/:programmeId/curriculum/totals", async (req, res) => {
    const id = programmeId(req, res);
    if (!id) return;
    try {
      sendPublicJson(req, res, await publicCurriculumReadService.getTotals(id));
    } catch (error) {
      sendReadError(res, error);
    }
  });

  return router;
}
