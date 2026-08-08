import { Router } from "express";
import {
  UpdateProgramCompetencyPlosSchema,
  UpdateProgramPolicySchema,
  UpdateProgrammeProfileSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { InvalidPloCodesError, programmeService } from "./service.ts";

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

  return router;
}
