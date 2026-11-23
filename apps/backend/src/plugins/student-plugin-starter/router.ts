import { Router } from "express";
import {
  StudentPluginStarterQuery,
  StudentPluginStarterWelcome,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { canReadStudentPluginStarter } from "./authorization.ts";
import { studentPluginStarterService } from "./service.ts";

/**
 * This router is NOT mounted by core/app.ts. Enabling requires a separate
 * reviewed registration + permission-seed + frontend navigation decision.
 */
export function createStudentPluginStarterRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/welcome",
    requirePermission("student-plugin-starter:read"),
    (req, res) => {
      const query = StudentPluginStarterQuery.safeParse(req.query);
      if (!query.success) {
        res.status(400).json({ error: "Invalid query", details: query.error.flatten() });
        return;
      }
      if (!req.user || !canReadStudentPluginStarter(req.user, query.data.programmeId)) {
        res.status(403).json({ error: "Not allowed to access this programme" });
        return;
      }
      res.json(StudentPluginStarterWelcome.parse(studentPluginStarterService.welcome(query.data)));
    },
  );

  return router;
}
