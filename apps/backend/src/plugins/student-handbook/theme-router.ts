import { Router, type Response } from "express";
import { UpdateStudentHandbookThemeSchema } from "@dse-pms/shared-types";
import { hasAnyRoleInProgramme, type Role } from "../../core/auth/token.ts";
import {
  getHandbookHeader,
  StudentHandbookConflictError,
  StudentHandbookNotFoundError,
  StudentHandbookValidationError,
} from "./service.ts";
import { getHandbookTheme, updateHandbookTheme } from "./theme.ts";

const GOVERNANCE_ROLES: Role[] = ["admin", "program_coordinator"];

function sendThemeError(res: Response, error: unknown) {
  if (error instanceof StudentHandbookNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof StudentHandbookConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof StudentHandbookValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not update Student Handbook document style" });
}

export function createStudentHandbookThemeRouter(): Router {
  const router = Router();

  router.get("/:handbookId/theme", async (req, res) => {
    if (!req.user) return;
    const header = await getHandbookHeader(req.params.handbookId!);
    if (!header) {
      res.status(404).json({ error: "Student Handbook not found" });
      return;
    }
    const canRead =
      header.assignedLecturerId === req.user.id ||
      hasAnyRoleInProgramme(req.user, GOVERNANCE_ROLES, header.programmeId);
    if (!canRead) {
      res.status(403).json({ error: "You do not have access to this Student Handbook" });
      return;
    }
    try {
      res.json(await getHandbookTheme(header.id));
    } catch (error) {
      sendThemeError(res, error);
    }
  });

  router.put("/:handbookId/theme", async (req, res) => {
    const parsed = UpdateStudentHandbookThemeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid document style", details: parsed.error.flatten() });
      return;
    }
    if (!req.user) return;
    const header = await getHandbookHeader(req.params.handbookId!);
    if (!header) {
      res.status(404).json({ error: "Student Handbook not found" });
      return;
    }
    if (!hasAnyRoleInProgramme(req.user, GOVERNANCE_ROLES, header.programmeId)) {
      res.status(403).json({ error: "Only Admin or Programme Coordinator can change document style" });
      return;
    }
    try {
      res.json(await updateHandbookTheme(header.id, parsed.data, req.user.id));
    } catch (error) {
      sendThemeError(res, error);
    }
  });

  return router;
}
