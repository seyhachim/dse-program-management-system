import { Router, type Request, type Response } from "express";
import {
  AddGraduationProjectPhaseInput,
  AssignGraduationProjectAdvisorInput,
  CreateGraduationProjectInput,
  CreateGraduationProjectMeetingInput,
  CreateGraduationProjectMilestoneInput,
  EndGraduationProjectAdvisorInput,
  ReviewGraduationProjectSubmissionInput,
  SubmitGraduationProjectMilestoneInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../core/auth/token.ts";
import {
  GraduationProjectConflictError,
  GraduationProjectNotFoundError,
  GraduationProjectValidationError,
  graduationProjectsService as service,
} from "./service.ts";

export const graduationProjectsRouter = Router();
graduationProjectsRouter.use(requireAuth);

function manager(req: Request, programmeId: string): boolean {
  return Boolean(req.user && hasAnyRoleInProgramme(req.user, ["admin", "program_coordinator"], programmeId));
}

async function canRead(req: Request, projectId: string): Promise<boolean> {
  const user = req.user!;
  const programmeId = await service.programmeId(projectId);
  if (manager(req, programmeId)) return true;
  if (user.roles.includes("lecturer") && await service.activeAdvisor(projectId, user.id)) return true;
  if (user.roles.includes("student")) {
    const studentId = await service.studentForUser(user.id);
    return Boolean(studentId && await service.isMember(projectId, studentId));
  }
  return false;
}

async function canAdvise(req: Request, projectId: string): Promise<boolean> {
  const programmeId = await service.programmeId(projectId);
  return manager(req, programmeId) || Boolean(req.user?.roles.includes("lecturer") && await service.activeAdvisor(projectId, req.user.id));
}

function fail(res: Response, error: unknown): void {
  if (error instanceof GraduationProjectNotFoundError) { res.status(404).json({ error: error.message }); return; }
  if (error instanceof GraduationProjectConflictError) { res.status(409).json({ error: error.message }); return; }
  if (error instanceof GraduationProjectValidationError) { res.status(400).json({ error: error.message }); return; }
  console.error("Graduation project API error", error);
  res.status(500).json({ error: "Internal server error" });
}

function invalid(res: Response, message: string): void { res.status(400).json({ error: message }); }
function forbidden(res: Response): void { res.status(403).json({ error: "Not authorized for this graduation project" }); }

graduationProjectsRouter.get("/projects", async (req, res) => {
  const programmeId = typeof req.query.programmeId === "string" ? req.query.programmeId : "";
  if (!programmeId) { invalid(res, "programmeId is required"); return; }
  if (!manager(req, programmeId)) { forbidden(res); return; }
  try { res.json(await service.listForProgramme(programmeId)); } catch (error) { fail(res, error); }
});

graduationProjectsRouter.get("/mine", async (req, res) => {
  try {
    const user = req.user!;
    if (user.roles.includes("lecturer")) { res.json(await service.listForLecturer(user.id)); return; }
    if (user.roles.includes("student")) {
      const studentId = await service.studentForUser(user.id);
      res.json(studentId ? await service.listForStudent(studentId) : []);
      return;
    }
    const programmeId = typeof req.query.programmeId === "string" ? req.query.programmeId : "";
    if (programmeId && manager(req, programmeId)) { res.json(await service.listForProgramme(programmeId)); return; }
    forbidden(res);
  } catch (error) { fail(res, error); }
});

graduationProjectsRouter.get("/projects/:id", async (req, res) => {
  try {
    if (!(await canRead(req, req.params.id))) { forbidden(res); return; }
    res.json(await service.get(req.params.id));
  } catch (error) { fail(res, error); }
});

graduationProjectsRouter.post("/projects", async (req, res) => {
  const parsed = CreateGraduationProjectInput.safeParse(req.body);
  if (!parsed.success) { invalid(res, parsed.error.issues[0]?.message ?? "Invalid project"); return; }
  if (!manager(req, parsed.data.programmeId)) { forbidden(res); return; }
  try { res.status(201).json(await service.create(parsed.data, req.user!.id)); } catch (error) { fail(res, error); }
});

graduationProjectsRouter.get("/advisors", async (req, res) => {
  const programmeId = typeof req.query.programmeId === "string" ? req.query.programmeId : "";
  if (!programmeId) { invalid(res, "programmeId is required"); return; }
  if (!manager(req, programmeId)) { forbidden(res); return; }
  try { res.json(await service.advisorWorkload(programmeId)); } catch (error) { fail(res, error); }
});

graduationProjectsRouter.post("/projects/:id/advisors", async (req, res) => {
  const parsed = AssignGraduationProjectAdvisorInput.safeParse(req.body);
  if (!parsed.success) { invalid(res, parsed.error.issues[0]?.message ?? "Invalid advisor"); return; }
  try {
    if (!manager(req, await service.programmeId(req.params.id))) { forbidden(res); return; }
    res.status(201).json(await service.assignAdvisor(req.params.id, parsed.data, req.user!.id));
  } catch (error) { fail(res, error); }
});

graduationProjectsRouter.post("/projects/:id/advisors/:assignmentId/end", async (req, res) => {
  const parsed = EndGraduationProjectAdvisorInput.safeParse(req.body);
  if (!parsed.success) { invalid(res, parsed.error.issues[0]?.message ?? "Invalid reason"); return; }
  try {
    if (!manager(req, await service.programmeId(req.params.id))) { forbidden(res); return; }
    res.json(await service.endAdvisor(req.params.id, req.params.assignmentId, parsed.data.reason, req.user!.id));
  } catch (error) { fail(res, error); }
});

graduationProjectsRouter.post("/projects/:id/phases", async (req, res) => {
  const parsed = AddGraduationProjectPhaseInput.safeParse(req.body);
  if (!parsed.success) { invalid(res, parsed.error.issues[0]?.message ?? "Invalid phase"); return; }
  try {
    if (!manager(req, await service.programmeId(req.params.id))) { forbidden(res); return; }
    res.status(201).json(await service.addPhase(req.params.id, parsed.data, req.user!.id));
  } catch (error) { fail(res, error); }
});

graduationProjectsRouter.post("/projects/:id/milestones", async (req, res) => {
  const parsed = CreateGraduationProjectMilestoneInput.safeParse(req.body);
  if (!parsed.success) { invalid(res, parsed.error.issues[0]?.message ?? "Invalid milestone"); return; }
  try {
    if (!(await canAdvise(req, req.params.id))) { forbidden(res); return; }
    res.status(201).json(await service.createMilestone(req.params.id, parsed.data, req.user!.id));
  } catch (error) { fail(res, error); }
});

graduationProjectsRouter.post("/milestones/:id/submissions", async (req, res) => {
  const parsed = SubmitGraduationProjectMilestoneInput.safeParse(req.body);
  if (!parsed.success) { invalid(res, parsed.error.issues[0]?.message ?? "Invalid submission"); return; }
  try {
    const studentId = await service.studentForUser(req.user!.id);
    if (!req.user!.roles.includes("student") || !studentId) { forbidden(res); return; }
    res.status(201).json(await service.submit(req.params.id, parsed.data, studentId, req.user!.id));
  } catch (error) { fail(res, error); }
});

graduationProjectsRouter.post("/submissions/:id/reviews", async (req, res) => {
  const parsed = ReviewGraduationProjectSubmissionInput.safeParse(req.body);
  if (!parsed.success) { invalid(res, parsed.error.issues[0]?.message ?? "Invalid review"); return; }
  try {
    const projectId = await service.projectIdForSubmission(req.params.id);
    if (!projectId) throw new GraduationProjectNotFoundError("Submission not found");
    if (!(await canAdvise(req, projectId))) { forbidden(res); return; }
    res.status(201).json(await service.review(req.params.id, parsed.data, req.user!.id));
  } catch (error) { fail(res, error); }
});

graduationProjectsRouter.post("/projects/:id/meetings", async (req, res) => {
  const parsed = CreateGraduationProjectMeetingInput.safeParse(req.body);
  if (!parsed.success) { invalid(res, parsed.error.issues[0]?.message ?? "Invalid meeting"); return; }
  try {
    if (!(await canAdvise(req, req.params.id))) { forbidden(res); return; }
    res.status(201).json(await service.addMeeting(req.params.id, parsed.data, req.user!.id));
  } catch (error) { fail(res, error); }
});
