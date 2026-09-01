import { Router, type Request, type Response } from "express";
import {
  CreateGuardianRelationshipInput,
  GuardianAccessScope,
  GuardianRelationshipListQuery,
  UpdateGuardianRelationshipInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { parentProgressService } from "./parent-progress-service.ts";
import {
  GuardianRelationshipError,
  guardianRelationshipService,
} from "./service.ts";

const MANAGEMENT_ROLES = ["admin", "program_coordinator", "program_secretary"] as const;

function assertGuardian(req: Request, res: Response): boolean {
  if (!req.user?.roles.includes("guardian")) {
    res.status(403).json({ error: "Guardian account required" });
    return false;
  }
  return true;
}

function assertProgrammeManager(req: Request, res: Response, programmeId: string): boolean {
  if (!req.user || !hasAnyRoleInProgramme(req.user, [...MANAGEMENT_ROLES], programmeId)) {
    res.status(403).json({ error: "Not authorized to manage guardian relationships for this programme" });
    return false;
  }
  return true;
}

async function relationshipExistsInProgramme(id: string, programmeId: string): Promise<boolean> {
  const rows = await guardianRelationshipService.list({
    programmeId,
    includeInactive: true,
  });
  return rows.some((row) => row.id === id);
}

function handleServiceError(error: unknown, res: Response): void {
  if (!(error instanceof GuardianRelationshipError)) throw error;
  const status = error.code === "NOT_FOUND"
    ? 404
    : error.code === "FORBIDDEN"
      ? 403
      : 409;
  res.status(status).json({ error: error.message, code: error.code });
}

export function createGuardianRelationshipRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // Guardian self-service boundary. These routes deliberately use the exact
  // relationship/scopes rather than broad role permissions.
  router.get("/me", async (req, res) => {
    if (!assertGuardian(req, res)) return;
    res.json(await guardianRelationshipService.listMine(req.user!.id));
  });

  router.get("/me/relationships/:relationshipId/attendance", async (req, res) => {
    if (!assertGuardian(req, res)) return;
    try {
      res.json(await parentProgressService.attendance(
        req.user!.id,
        req.params.relationshipId!,
      ));
    } catch (error) {
      handleServiceError(error, res);
    }
  });

  router.get("/me/relationships/:relationshipId/academic-progress", async (req, res) => {
    if (!assertGuardian(req, res)) return;
    try {
      res.json(await parentProgressService.academicProgress(
        req.user!.id,
        req.params.relationshipId!,
      ));
    } catch (error) {
      handleServiceError(error, res);
    }
  });

  router.get("/me/students/:studentId/access/:scope", async (req, res) => {
    if (!assertGuardian(req, res)) return;
    const scope = GuardianAccessScope.safeParse(req.params.scope);
    if (!scope.success) {
      res.status(400).json({ error: "Invalid guardian access scope" });
      return;
    }
    try {
      const access = await guardianRelationshipService.assertStudentScope(
        req.user!.id,
        req.params.studentId!,
        scope.data,
      );
      res.json(access);
    } catch (error) {
      handleServiceError(error, res);
    }
  });

  // Management routes reuse the existing student-write permission as the coarse
  // gate, then enforce exact programme scope server-side.
  router.get("/", requirePermission("students:write"), async (req, res) => {
    const parsed = GuardianRelationshipListQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    if (!assertProgrammeManager(req, res, parsed.data.programmeId)) return;
    res.json(await guardianRelationshipService.list(parsed.data));
  });

  router.post("/", requirePermission("students:write"), async (req, res) => {
    const parsed = CreateGuardianRelationshipInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    if (!assertProgrammeManager(req, res, parsed.data.programmeId)) return;
    try {
      const relationship = await guardianRelationshipService.create(parsed.data, req.user!.id);
      res.status(201).json(relationship);
    } catch (error) {
      handleServiceError(error, res);
    }
  });

  router.patch("/:id", requirePermission("students:write"), async (req, res) => {
    const programmeId = typeof req.query.programmeId === "string" ? req.query.programmeId.trim() : "";
    const parsed = UpdateGuardianRelationshipInput.safeParse(req.body);
    if (!programmeId || !parsed.success) {
      res.status(400).json({ error: "programmeId and a valid body are required" });
      return;
    }
    if (!assertProgrammeManager(req, res, programmeId)) return;
    if (!(await relationshipExistsInProgramme(req.params.id!, programmeId))) {
      res.status(404).json({ error: "Guardian relationship not found" });
      return;
    }
    try {
      res.json(await guardianRelationshipService.update(req.params.id!, parsed.data, req.user!.id));
    } catch (error) {
      handleServiceError(error, res);
    }
  });

  router.post("/:id/verify", requirePermission("students:write"), async (req, res) => {
    const programmeId = typeof req.query.programmeId === "string" ? req.query.programmeId.trim() : "";
    if (!programmeId) {
      res.status(400).json({ error: "programmeId is required" });
      return;
    }
    if (!assertProgrammeManager(req, res, programmeId)) return;
    if (!(await relationshipExistsInProgramme(req.params.id!, programmeId))) {
      res.status(404).json({ error: "Guardian relationship not found" });
      return;
    }
    try {
      res.json(await guardianRelationshipService.verify(req.params.id!, req.user!.id));
    } catch (error) {
      handleServiceError(error, res);
    }
  });

  router.post("/:id/revoke", requirePermission("students:write"), async (req, res) => {
    const programmeId = typeof req.query.programmeId === "string" ? req.query.programmeId.trim() : "";
    if (!programmeId) {
      res.status(400).json({ error: "programmeId is required" });
      return;
    }
    if (!assertProgrammeManager(req, res, programmeId)) return;
    if (!(await relationshipExistsInProgramme(req.params.id!, programmeId))) {
      res.status(404).json({ error: "Guardian relationship not found" });
      return;
    }
    try {
      res.json(await guardianRelationshipService.revoke(req.params.id!, req.user!.id));
    } catch (error) {
      handleServiceError(error, res);
    }
  });

  return router;
}
