import { Router } from "express";
import {
  CreateCurriculumRevisionSchema,
  CreateInitialCurriculumSchema,
  UpdatePloTaxonomySchema,
  UpdateProgramCompetencyPlosSchema,
  UpdateProgramPolicySchema,
  UpdateProgrammeProfileSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  hasAnyRoleInProgramme,
  type AuthUser,
  type Role,
} from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  CurriculumConflictError,
  CurriculumNotFoundError,
  InvalidCurriculumRevisionError,
  curriculumService,
} from "./curriculum-service.ts";
import { InvalidPloCodesError, programmeService } from "./service.ts";

const CURRICULUM_READ_ROLES: Role[] = [
  "admin",
  "program_coordinator",
  "program_secretary",
  "qa_reviewer",
];
const CURRICULUM_WRITE_ROLES: Role[] = ["admin", "program_coordinator"];

function hasCurriculumScope(
  user: AuthUser | undefined,
  programmeId: string,
  roles: Role[],
): boolean {
  return Boolean(user && hasAnyRoleInProgramme(user, roles, programmeId));
}

function sendCurriculumError(res: Parameters<Parameters<Router["get"]>[1]>[1], error: unknown) {
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
  res.status(500).json({ error: "Could not process curriculum request" });
}

export function createProgrammeRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  router.get("/", requirePermission("programme:read"), async (_req, res) => {
    try {
      res.json(await programmeService.getAcademicConfig());
    } catch {
      res.status(500).json({
        error: "Could not load programme academic configuration",
      });
    }
  });

  router.get(
    "/curricula/programmes/:programmeId",
    requirePermission("programme:read"),
    async (req, res) => {
      const programmeId = req.params.programmeId;
      if (!programmeId) {
        res.status(400).json({ error: "Programme id is required" });
        return;
      }
      if (!hasCurriculumScope(req.user, programmeId, CURRICULUM_READ_ROLES)) {
        res.status(403).json({ error: "No curriculum access for this programme" });
        return;
      }

      try {
        res.json(await curriculumService.listForProgramme(programmeId));
      } catch (error) {
        sendCurriculumError(res, error);
      }
    },
  );

  router.post(
    "/curricula/programmes/:programmeId",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = req.params.programmeId;
      if (!programmeId || !req.user) {
        res.status(400).json({ error: "Programme id is required" });
        return;
      }
      if (!hasCurriculumScope(req.user, programmeId, CURRICULUM_WRITE_ROLES)) {
        res.status(403).json({ error: "No curriculum write access for this programme" });
        return;
      }

      const parsed = CreateInitialCurriculumSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid initial curriculum",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        res.status(201).json(
          await curriculumService.createInitial(programmeId, req.user.id, parsed.data),
        );
      } catch (error) {
        sendCurriculumError(res, error);
      }
    },
  );

  router.get(
    "/curricula/:curriculumId",
    requirePermission("programme:read"),
    async (req, res) => {
      const curriculumId = req.params.curriculumId;
      if (!curriculumId) {
        res.status(400).json({ error: "Curriculum id is required" });
        return;
      }

      try {
        const result = await curriculumService.getById(
          curriculumId,
          typeof req.query.versionId === "string" ? req.query.versionId : undefined,
        );
        if (
          !hasCurriculumScope(
            req.user,
            result.curriculum.programmeId,
            CURRICULUM_READ_ROLES,
          )
        ) {
          res.status(403).json({ error: "No curriculum access for this programme" });
          return;
        }
        res.json(result);
      } catch (error) {
        sendCurriculumError(res, error);
      }
    },
  );

  router.post(
    "/curricula/:curriculumId/versions/:versionId/revisions",
    requirePermission("programme:write"),
    async (req, res) => {
      const curriculumId = req.params.curriculumId;
      const versionId = req.params.versionId;
      if (!curriculumId || !versionId || !req.user) {
        res.status(400).json({ error: "Curriculum and predecessor version ids are required" });
        return;
      }

      const parsed = CreateCurriculumRevisionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid curriculum revision",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        const existing = await curriculumService.getById(curriculumId, versionId);
        if (
          !hasCurriculumScope(
            req.user,
            existing.curriculum.programmeId,
            CURRICULUM_WRITE_ROLES,
          )
        ) {
          res.status(403).json({ error: "No curriculum write access for this programme" });
          return;
        }

        res.status(201).json(
          await curriculumService.createRevision(
            curriculumId,
            versionId,
            req.user.id,
            parsed.data,
          ),
        );
      } catch (error) {
        sendCurriculumError(res, error);
      }
    },
  );

  router.put(
    "/profile",
    requirePermission("programme:write"),
    async (req, res) => {
      const parsed = UpdateProgrammeProfileSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid programme profile",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        res.json(await programmeService.updateProfile(parsed.data));
      } catch {
        res.status(500).json({
          error: "Could not update programme profile",
        });
      }
    },
  );

  router.put(
    "/policies",
    requirePermission("programme:write"),
    async (req, res) => {
      const parsed = UpdateProgramPolicySchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid programme policy",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        res.json(await programmeService.updatePolicy(parsed.data));
      } catch {
        res.status(500).json({
          error: "Could not update programme policies",
        });
      }
    },
  );

  router.put(
    "/competencies/:code/plos",
    requirePermission("programme:write"),
    async (req, res) => {
      const code = req.params.code;

      if (!code) {
        res.status(400).json({
          error: "Programme competency code is required",
        });
        return;
      }

      const parsed = UpdateProgramCompetencyPlosSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid body",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        const competency = await programmeService.updateCompetencyPlos(
          code,
          parsed.data,
        );

        if (!competency) {
          res.status(404).json({
            error: "Programme competency not found",
          });
          return;
        }

        res.json(competency);
      } catch (err) {
        if (err instanceof InvalidPloCodesError) {
          res.status(400).json({
            error: "Invalid PLO code",
            codes: err.codes,
          });
          return;
        }

        res.status(500).json({
          error: "Could not update competency PLO mappings",
        });
      }
    },
  );

  router.put(
    "/plos/:code",
    requirePermission("programme:write"),
    async (req, res) => {
      const code = req.params.code;

      if (!code) {
        res.status(400).json({ error: "PLO code is required" });
        return;
      }

      const parsed = UpdatePloTaxonomySchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid PLO taxonomy",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        const plo = await programmeService.updatePloTaxonomy(
          code,
          parsed.data,
        );

        if (!plo) {
          res.status(404).json({ error: "PLO not found" });
          return;
        }

        res.json(plo);
      } catch {
        res.status(500).json({ error: "Could not update PLO taxonomy" });
      }
    },
  );

  return router;
}
