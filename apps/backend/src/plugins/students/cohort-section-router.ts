import { Router } from "express";
import {
  AddStudentCohortSectionMembershipInput,
  CreateStudentCohortSectionInput,
  ExitStudentCohortSectionMembershipInput,
  ListStudentCohortSectionsQuery,
  UpdateStudentCohortSectionInput,
} from "@dse-pms/shared-types";
import { requirePermission } from "../../core/permissions/index.ts";
import { StudentCohortSectionError, studentCohortSectionService } from "./cohort-section-service.ts";

function statusFor(error: unknown) {
  if (!(error instanceof StudentCohortSectionError)) return null;
  if (error.code === "NOT_FOUND") return 404;
  if (error.code === "CONFLICT") return 409;
  return 400;
}

export function createStudentCohortSectionRouter(): Router {
  const router = Router();

  router.get("/", requirePermission("students:read"), async (req, res) => {
    const parsed = ListStudentCohortSectionsQuery.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    try {
      res.json(await studentCohortSectionService.list(parsed.data.cohortId, parsed.data.activeOnly));
    } catch (error) {
      const status = statusFor(error);
      if (status) return void res.status(status).json({ error: (error as Error).message });
      throw error;
    }
  });

  router.post("/", requirePermission("students:write"), async (req, res) => {
    const parsed = CreateStudentCohortSectionInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    try {
      res.status(201).json(await studentCohortSectionService.create(parsed.data));
    } catch (error) {
      const status = statusFor(error);
      if (status) return void res.status(status).json({ error: (error as Error).message });
      throw error;
    }
  });

  router.patch("/:sectionId", requirePermission("students:write"), async (req, res) => {
    const parsed = UpdateStudentCohortSectionInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    try {
      res.json(await studentCohortSectionService.update(req.params.sectionId!, parsed.data));
    } catch (error) {
      const status = statusFor(error);
      if (status) return void res.status(status).json({ error: (error as Error).message });
      throw error;
    }
  });

  router.get("/:cohortId/members", requirePermission("students:read"), async (req, res) => {
    try {
      res.json(await studentCohortSectionService.listMembers(req.params.cohortId!));
    } catch (error) {
      const status = statusFor(error);
      if (status) return void res.status(status).json({ error: (error as Error).message });
      throw error;
    }
  });

  router.get("/:cohortId/history", requirePermission("students:read"), async (req, res) => {
    try {
      res.json(await studentCohortSectionService.listHistory(req.params.cohortId!));
    } catch (error) {
      const status = statusFor(error);
      if (status) return void res.status(status).json({ error: (error as Error).message });
      throw error;
    }
  });

  router.post("/:sectionId/memberships", requirePermission("students:write"), async (req, res) => {
    const parsed = AddStudentCohortSectionMembershipInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    try {
      res.status(201).json(await studentCohortSectionService.addMembership(req.params.sectionId!, parsed.data));
    } catch (error) {
      const status = statusFor(error);
      if (status) return void res.status(status).json({ error: (error as Error).message });
      throw error;
    }
  });

  router.post("/:sectionId/memberships/:membershipId/exit", requirePermission("students:write"), async (req, res) => {
    const parsed = ExitStudentCohortSectionMembershipInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    try {
      res.json(await studentCohortSectionService.exitMembership(req.params.sectionId!, req.params.membershipId!, parsed.data));
    } catch (error) {
      const status = statusFor(error);
      if (status) return void res.status(status).json({ error: (error as Error).message });
      throw error;
    }
  });

  return router;
}
