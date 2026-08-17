import { Router } from "express";
import {
  AddStudentCohortMembershipInput,
  AppendStudentProgressionInput,
  CreateStudentCohortInput,
  ExitStudentCohortMembershipInput,
  ListStudentCohortsQuery,
  ListStudentProgressionQuery,
} from "@dse-pms/shared-types";
import { requirePermission } from "../../core/permissions/index.ts";
import { studentCohortService } from "./cohort-service.ts";

const notFound = (err: unknown) => typeof err === "object" && err !== null && (err as { code?: string }).code === "P2025";
const conflict = (err: unknown) => typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";

export function createStudentCohortRouter(): Router {
  const router = Router();

  router.get("/", requirePermission("students:read"), async (req, res) => {
    const parsed = ListStudentCohortsQuery.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    res.json(await studentCohortService.listCohorts(parsed.data));
  });

  router.post("/", requirePermission("students:write"), async (req, res) => {
    const parsed = CreateStudentCohortInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    try { res.status(201).json(await studentCohortService.createCohort(parsed.data)); }
    catch (err) { res.status(conflict(err) ? 409 : 400).json({ error: conflict(err) ? "Cohort code already exists for this programme" : "Could not create cohort" }); }
  });

  router.get("/:cohortId", requirePermission("students:read"), async (req, res) => {
    const cohort = await studentCohortService.getCohort(req.params.cohortId!);
    if (!cohort) return void res.status(404).json({ error: "Cohort not found" });
    res.json(cohort);
  });

  router.post("/:cohortId/memberships", requirePermission("students:write"), async (req, res) => {
    const parsed = AddStudentCohortMembershipInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    try { res.status(201).json(await studentCohortService.addMembership(req.params.cohortId!, parsed.data)); }
    catch (err) { res.status(conflict(err) ? 409 : 400).json({ error: conflict(err) ? "Duplicate or overlapping cohort membership" : "Could not add cohort membership" }); }
  });

  router.post("/:cohortId/memberships/:membershipId/exit", requirePermission("students:write"), async (req, res) => {
    const parsed = ExitStudentCohortMembershipInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    try { res.json(await studentCohortService.exitMembership(req.params.cohortId!, req.params.membershipId!, parsed.data)); }
    catch (err) { res.status(notFound(err) ? 404 : 409).json({ error: notFound(err) ? "Cohort membership not found" : (err instanceof Error ? err.message : "Could not close cohort membership") }); }
  });

  router.get("/:cohortId/progression", requirePermission("students:read"), async (req, res) => {
    const parsed = ListStudentProgressionQuery.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    res.json(await studentCohortService.listProgression(req.params.cohortId!, parsed.data));
  });

  router.post("/:cohortId/progression", requirePermission("students:write"), async (req, res) => {
    const parsed = AppendStudentProgressionInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    try { res.status(201).json(await studentCohortService.appendProgression(req.params.cohortId!, parsed.data)); }
    catch (err) { res.status(notFound(err) ? 404 : conflict(err) ? 409 : 400).json({ error: notFound(err) ? "Cohort membership not found" : conflict(err) ? "Progression already recorded for this academic period" : "Could not append progression record" }); }
  });

  router.get("/:cohortId/students/:studentId/history", requirePermission("students:read"), async (req, res) => {
    res.json(await studentCohortService.studentHistory(req.params.cohortId!, req.params.studentId!));
  });

  return router;
}
