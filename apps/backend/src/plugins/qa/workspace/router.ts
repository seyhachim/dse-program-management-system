import { Router } from "express";
import { QaRequirementAssignmentScopeSchema } from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import { getQaContributorWorkspace } from "./service.ts";

export function createQaWorkspaceRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/workspace/my-work",
    requirePermission("qa:contribute"),
    async (req, res) => {
      const parsed = QaRequirementAssignmentScopeSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid AUN-QA workspace query",
          details: parsed.error.flatten(),
        });
        return;
      }
      if (
        !hasAnyRoleInProgramme(
          req.user!,
          ["admin", "program_coordinator", "qa_reviewer", "qa_contributor"],
          parsed.data.programmeId,
        )
      ) {
        res.status(403).json({ error: "You do not have AUN-QA workspace access to this programme" });
        return;
      }

      try {
        res.json(await getQaContributorWorkspace(parsed.data.programmeId, req.user!.id));
      } catch {
        res.status(500).json({ error: "Could not load your AUN-QA workspace" });
      }
    },
  );

  return router;
}
