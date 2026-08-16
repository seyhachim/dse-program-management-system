import { Router } from "express";
import { SaveCurriculumDraftSchema } from "@dse-pms/shared-types";
import {
  hasAnyRoleInProgramme,
  type AuthUser,
  type Role,
} from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { curriculumDraftService } from "./curriculum-draft-service.ts";
import {
  CurriculumConflictError,
  CurriculumNotFoundError,
  InvalidCurriculumRevisionError,
  curriculumService,
} from "./curriculum-service.ts";

const CURRICULUM_WRITE_ROLES: Role[] = ["admin", "program_coordinator"];

function hasWriteScope(user: AuthUser | undefined, programmeId: string) {
  return Boolean(
    user && hasAnyRoleInProgramme(user, CURRICULUM_WRITE_ROLES, programmeId),
  );
}

export function createCurriculumDraftRouter(): Router {
  const router = Router();

  router.put(
    "/:curriculumId/versions/:versionId/draft",
    requirePermission("programme:write"),
    async (req, res) => {
      const curriculumId = req.params.curriculumId;
      const versionId = req.params.versionId;
      if (!curriculumId || !versionId || !req.user) {
        res.status(400).json({ error: "Curriculum and version ids are required" });
        return;
      }

      const parsed = SaveCurriculumDraftSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid curriculum draft",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        const existing = await curriculumService.getById(curriculumId, versionId);
        if (!hasWriteScope(req.user, existing.curriculum.programmeId)) {
          res.status(403).json({ error: "No curriculum write access for this programme" });
          return;
        }

        res.json(
          await curriculumDraftService.save(
            curriculumId,
            versionId,
            req.user.id,
            parsed.data,
          ),
        );
      } catch (error) {
        if (error instanceof CurriculumNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof CurriculumConflictError) {
          res.status(409).json({ error: error.message });
          return;
        }
        if (error instanceof InvalidCurriculumRevisionError) {
          res.status(400).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: "Could not save curriculum draft" });
      }
    },
  );

  return router;
}
