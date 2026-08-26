import { Router } from "express";
import { QaSarBookQuerySchema } from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import {
  QaSarResourceNotFoundError,
  QaSarScopeMismatchError,
  isSarRequirementAssignedToUser,
} from "../sar/service.ts";
import { getQaSarRequirementSourceContext } from "./source-context-service.ts";

export async function canReadSarSourceContext(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<boolean> {
  if (
    hasAnyRoleInProgramme(
      user,
      ["admin", "program_coordinator", "qa_reviewer"],
      programmeId,
    )
  ) {
    return true;
  }
  if (!hasAnyRoleInProgramme(user, ["qa_contributor"], programmeId)) return false;
  return isSarRequirementAssignedToUser(programmeId, cycleId, requirementCode, user.id);
}

export function createQaSarSourceContextRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/cycles/:cycleId/sar-book/requirements/:requirementCode/source-context",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const requirementCode = req.params.requirementCode;
      const parsed = QaSarBookQuerySchema.safeParse(req.query);
      if (
        !cycleId ||
        !requirementCode ||
        !/^\d\.\d$/.test(requirementCode) ||
        !parsed.success
      ) {
        res.status(400).json({ error: "Invalid SAR requirement source-context query" });
        return;
      }
      if (
        !(await canReadSarSourceContext(
          req.user!,
          parsed.data.programmeId,
          cycleId,
          requirementCode,
        ))
      ) {
        res.status(403).json({ error: "You do not have access to this SAR requirement context" });
        return;
      }
      try {
        res.json(
          await getQaSarRequirementSourceContext(
            parsed.data.programmeId,
            cycleId,
            requirementCode,
          ),
        );
      } catch (error) {
        if (error instanceof QaSarResourceNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof QaSarScopeMismatchError) {
          res.status(409).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: "Could not load SAR PMS source context" });
      }
    },
  );

  return router;
}
