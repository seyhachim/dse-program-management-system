import { Router, type Response } from "express";
import {
  CurriculumImportApplyInputSchema,
  CurriculumJsonUploadSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, type Role } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  CurriculumImportConflictError,
  CurriculumImportNotFoundError,
  CurriculumImportValidationError,
  curriculumImportService,
} from "./curriculum-import-service.ts";

const READ_ROLES: Role[] = [
  "admin",
  "program_coordinator",
  "program_secretary",
  "qa_reviewer",
];
const WRITE_ROLES: Role[] = ["admin", "program_coordinator"];

function sendImportError(res: Response, error: unknown) {
  if (error instanceof CurriculumImportNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof CurriculumImportValidationError) {
    res.status(400).json({ error: error.message, details: error.details });
    return;
  }
  if (error instanceof CurriculumImportConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not process curriculum import" });
}

async function scopeForVersion(
  versionId: string,
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  roles: Role[],
) {
  const target = await curriculumImportService.loadTarget(versionId);
  return {
    target,
    allowed: hasAnyRoleInProgramme(user, roles, target.programmeId),
  };
}

export function createCurriculumImportRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.post(
    "/curricula/versions/:versionId/import-json/preview",
    requirePermission("programme:write"),
    async (req, res) => {
      const versionId = req.params.versionId;
      if (!versionId || !req.user) {
        res.status(400).json({ error: "Curriculum version id is required" });
        return;
      }
      const parsed = CurriculumJsonUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid curriculum JSON upload",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        const scope = await scopeForVersion(versionId, req.user, WRITE_ROLES);
        if (!scope.allowed) {
          res.status(403).json({ error: "No curriculum import access for this programme" });
          return;
        }
        res.json(await curriculumImportService.preview(versionId, parsed.data));
      } catch (error) {
        sendImportError(res, error);
      }
    },
  );

  router.post(
    "/curricula/versions/:versionId/import-json/apply",
    requirePermission("programme:write"),
    async (req, res) => {
      const versionId = req.params.versionId;
      if (!versionId || !req.user) {
        res.status(400).json({ error: "Curriculum version id is required" });
        return;
      }
      const parsed = CurriculumImportApplyInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid curriculum import decisions",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        const scope = await scopeForVersion(versionId, req.user, WRITE_ROLES);
        if (!scope.allowed) {
          res.status(403).json({ error: "No curriculum import access for this programme" });
          return;
        }
        res.json(
          await curriculumImportService.apply(versionId, req.user.id, parsed.data),
        );
      } catch (error) {
        sendImportError(res, error);
      }
    },
  );

  router.get(
    "/curricula/versions/:versionId/artifact",
    requirePermission("programme:read"),
    async (req, res) => {
      const versionId = req.params.versionId;
      if (!versionId || !req.user) {
        res.status(400).json({ error: "Curriculum version id is required" });
        return;
      }
      try {
        const scope = await scopeForVersion(versionId, req.user, READ_ROLES);
        if (!scope.allowed) {
          res.status(403).json({ error: "No curriculum access for this programme" });
          return;
        }
        res.json(await curriculumImportService.artifact(versionId));
      } catch (error) {
        sendImportError(res, error);
      }
    },
  );

  router.get(
    "/curricula/versions/:versionId/artifact/export",
    requirePermission("programme:read"),
    async (req, res) => {
      const versionId = req.params.versionId;
      if (!versionId || !req.user) {
        res.status(400).json({ error: "Curriculum version id is required" });
        return;
      }
      try {
        const scope = await scopeForVersion(versionId, req.user, READ_ROLES);
        if (!scope.allowed) {
          res.status(403).json({ error: "No curriculum export access for this programme" });
          return;
        }
        res.json(await curriculumImportService.artifactForExport(versionId));
      } catch (error) {
        sendImportError(res, error);
      }
    },
  );

  return router;
}
