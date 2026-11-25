import { Router, type Response } from "express";
import { z } from "zod";
import { TelegramInitDataVerifyRequestSchema, TelegramRegistrationReviewSchema, TelegramRegistrationStatusSchema, type TelegramRegistrationBootstrap, type TelegramRegistrationPlacement, type TelegramRegistrationStatus } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { requireAuth } from "../../core/auth/middleware.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { getPmsTelegramConfig } from "./config.ts";
import { telegramService } from "./service.ts";
import { listRegistrationRequests, registrationRosterCandidates, reviewRegistration, RegistrationReviewError } from "./student-registration-review.ts";

const ListQuery = z.object({ status: TelegramRegistrationStatusSchema.default("PENDING"), offset: z.coerce.number().int().min(0).max(10000).default(0) }).strict();
const SearchQuery = z.object({ search: z.string().trim().max(100).default("") }).strict();
function reviewError(res: Response, error: unknown) {
  if (error instanceof RegistrationReviewError) return void res.status(error.status).json({ error: error.message });
  // No applicant data or raw database error in logs or HTTP responses.
  res.status(409).json({ error: "Registration review could not be completed. Refresh and check for conflicts." });
}

export function createStudentRegistrationRouter(): Router {
  const router = Router();
  router.use("/registration", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.post("/registration/bootstrap", async (req, res) => {
    if (process.env.TELEGRAM_STUDENT_REGISTRATION_ENABLED !== "true") return void res.status(503).json({ error: "Registration is unavailable" });
    const parsed = TelegramInitDataVerifyRequestSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Open the official Telegram bot again" });
    try {
      const config = getPmsTelegramConfig();
      if (!config.enabled || !config.webhookSecret) return void res.status(503).json({ error: "Registration is unavailable" });
      const verified = await telegramService.verifyInitData(parsed.data.initData);
      const telegramId = verified.telegramUser.id;
      const requests = await prisma.$queryRaw<Array<{ status: TelegramRegistrationStatus }>>`
        SELECT "status" FROM "telegram_security"."StudentRegistrationRequest"
        WHERE "telegramUserId"=${telegramId} AND "programmeId"=${DEFAULT_PROGRAMME_ID}
      `;
      const links = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "telegram_security"."TelegramIdentity" WHERE "telegramUserId"=${telegramId}
      `;
      const consent = await prisma.$queryRaw<Array<{ state: string }>>`
        SELECT "state" FROM "telegram_security"."StudentRegistrationBotConsent"
        WHERE "telegramUserId"=${telegramId} AND "expiresAt">CURRENT_TIMESTAMP
          AND "state" IN ('SHARED','SKIPPED')
      `;
      const status = requests[0]?.status;
      const state: TelegramRegistrationBootstrap["state"] =
        status === "APPROVED" ? "APPROVED" : links.length ? "EXISTING_ACCOUNT" :
        status === "PENDING" || status === "REJECTED" ? status :
        consent.length ? "FORM" : status === "NEEDS_CORRECTION" ? status : "BOT_REQUIRED";
      const placements = state === "FORM" ? await prisma.$queryRaw<TelegramRegistrationPlacement[]>`
        SELECT c."id" AS "cohortId", c."code" AS "cohortCode", c."name" AS "cohortName",
          s."id" AS "sectionId", s."code" AS "sectionCode"
        FROM "StudentCohort" c JOIN "StudentCohortSection" s ON s."cohortId"=c."id"
        WHERE c."programmeId"=${DEFAULT_PROGRAMME_ID} AND c."status"='Active' AND s."active"=TRUE
        ORDER BY c."intakeYear" DESC, s."code" ASC
      ` : [];
      const result: TelegramRegistrationBootstrap = { verificationId: verified.verificationId, expiresAt: verified.expiresAt, state, placements };
      res.json(result);
    } catch {
      res.status(401).json({ error: "Could not verify registration. Close and reopen the form from the official bot." });
    }
  });
  router.get("/registration/staff/requests", requireAuth, async (req, res) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid filter" });
    try { res.json(await listRegistrationRequests(req.user!, parsed.data.status, parsed.data.offset)); }
    catch (error) { reviewError(res, error); }
  });
  router.get("/registration/staff/requests/:id/candidates", requireAuth, async (req, res) => {
    const parsed = SearchQuery.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid search" });
    try { res.json(await registrationRosterCandidates(req.user!, req.params.id!, parsed.data.search)); }
    catch (error) { reviewError(res, error); }
  });
  router.post("/registration/staff/requests/:id/review", requireAuth, async (req, res) => {
    if (process.env.TELEGRAM_STUDENT_REGISTRATION_ENABLED !== "true") return void res.status(503).json({ error: "Registration review is disabled" });
    const parsed = TelegramRegistrationReviewSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid review. Record the verification reason." });
    try { res.json(await reviewRegistration(req.user!, req.params.id!, parsed.data)); }
    catch (error) { reviewError(res, error); }
  });
  return router;
}
