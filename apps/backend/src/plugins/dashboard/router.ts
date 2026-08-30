import { Router } from "express";
import { DashboardSummarySchema } from "@dse-pms/shared-types";
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

  return router;
}
