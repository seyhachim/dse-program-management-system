import { Router } from "express";
import { DashboardSummarySchema, WeeklyTeachingReportSchema, WeeklyTeachingWeekQuerySchema } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { weeklyTeachingService } from "./weekly-teaching-service.ts";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  hasAnyRoleInProgramme,
  type Role,
} from "../../core/auth/token.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { dashboardService } from "./service.ts";

const DASHBOARD_ROLES: Role[] = [
  "admin",
  "program_coordinator",
  "program_secretary",
];

/**
 * The programme Dashboard is intentionally narrower than PROGRAMME_WIDE_ROLES:
 * QA reviewers have their own QA dashboard and lecturers/students have scoped
 * workspaces. Programme-scoped grants must match DSE; only global admin bypasses
 * the programme id through hasAnyRoleInProgramme.
 */
export function createDashboardRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/summary", async (req, res) => {
    if (
      !hasAnyRoleInProgramme(
        req.user!,
        DASHBOARD_ROLES,
        DEFAULT_PROGRAMME_ID,
      )
    ) {
      res.status(403).json({ error: "Dashboard access is not available for this account" });
      return;
    }

    try {
      const summary = await dashboardService.summary();
      res.json(DashboardSummarySchema.parse(summary));
    } catch {
      // Source-level failures are already represented in the summary contract.
      // This is only for unexpected contract/runtime failure and deliberately
      // avoids returning raw database or implementation error text.
      res.status(500).json({ error: "Dashboard summary is temporarily unavailable" });
    }
  });

  // Phase 1: intentionally narrower than the general Dashboard. Only a
  // global Admin or the currently appointed Head may inspect programme-wide
  // monitor evidence. A coordinator/secretary grant alone is NOT sufficient.
  router.get("/weekly-teaching", async (req, res) => {
    const isAdmin = hasAnyRoleInProgramme(req.user!, ["admin"], DEFAULT_PROGRAMME_ID);
    if (!isAdmin) {
      const appointment = await prisma.programmeHeadAppointment.findFirst({
        where: {
          programmeId: DEFAULT_PROGRAMME_ID,
          lecturerId: req.user!.id,
          endedAt: null,
        },
        select: { id: true },
      });
      if (!appointment) {
        res.status(403).json({ error: "Weekly teaching monitoring is limited to Admin and Head of Program" });
        return;
      }
    }
    const input = WeeklyTeachingWeekQuerySchema.safeParse(req.query);
    if (!input.success) {
      res.status(400).json({ error: "Invalid weekStart: choose a Monday in YYYY-MM-DD format" });
      return;
    }
    try {
      res.set("Cache-Control", "private, no-store");
      const report = await weeklyTeachingService.report(input.data.weekStart);
      res.json(WeeklyTeachingReportSchema.parse(report));
    } catch (error) {
      console.error("Weekly teaching monitor read failed", error instanceof Error ? error.message : "Unknown error");
      res.status(503).json({ error: "Weekly teaching report is temporarily unavailable" });
    }
  });

  return router;
}
