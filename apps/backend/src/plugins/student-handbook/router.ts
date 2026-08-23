import { Router, type Response } from "express";
import {
  AssignStudentHandbookLecturerSchema,
  CreateStudentHandbookSchema,
  SaveStudentHandbookSectionSchema,
  StudentHandbookReviewSchema,
  StudentHandbookSourceKindSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  hasAnyRoleInProgramme,
  type AuthUser,
  type Role,
} from "../../core/auth/token.ts";
import {
  approveHandbook,
  assignLecturer,
  createHandbook,
  getHandbook,
  getHandbookHeader,
  getSourcePreview,
  listHandbooks,
  publishHandbook,
  replaceSectionBlocks,
  requestChanges,
  StudentHandbookConflictError,
  StudentHandbookNotFoundError,
  StudentHandbookValidationError,
  submitHandbook,
} from "./service.ts";

const GOVERNANCE_ROLES: Role[] = ["admin", "program_coordinator"];

function canGovern(user: AuthUser, programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, GOVERNANCE_ROLES, programmeId);
}

function canRead(user: AuthUser, header: NonNullable<Awaited<ReturnType<typeof getHandbookHeader>>>) {
  return header.assignedLecturerId === user.id || canGovern(user, header.programmeId);
}

function canEdit(user: AuthUser, header: NonNullable<Awaited<ReturnType<typeof getHandbookHeader>>>) {
  return header.assignedLecturerId === user.id;
}

function sendServiceError(res: Response, error: unknown) {
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
  res.status(500).json({ error: "Could not update Student Handbook" });
}

export function createStudentHandbookRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const programmeId = typeof req.query.programmeId === "string" ? req.query.programmeId : "dse";
    if (!req.user) return;
    try {
      const rows = await listHandbooks(programmeId);
      res.json(
        canGovern(req.user, programmeId)
          ? rows
          : rows.filter((row) => row.assignedLecturer.id === req.user!.id),
      );
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  router.post("/", async (req, res) => {
    const parsed = CreateStudentHandbookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid Student Handbook", details: parsed.error.flatten() });
      return;
    }
    if (!req.user || !canGovern(req.user, parsed.data.programmeId)) {
      res.status(403).json({ error: "Only Admin or Programme Coordinator can create and assign a Student Handbook" });
      return;
    }
    try {
      res.status(201).json(await createHandbook(parsed.data, req.user.id));
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  router.get("/:handbookId", async (req, res) => {
    if (!req.user) return;
    const header = await getHandbookHeader(req.params.handbookId!);
    if (!header) {
      res.status(404).json({ error: "Student Handbook not found" });
      return;
    }
    if (!canRead(req.user, header)) {
      res.status(403).json({ error: "You do not have access to this Student Handbook" });
      return;
    }
    try {
      res.json(await getHandbook(header.id));
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  router.patch("/:handbookId/assignment", async (req, res) => {
    const parsed = AssignStudentHandbookLecturerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid lecturer assignment", details: parsed.error.flatten() });
      return;
    }
    if (!req.user) return;
    const header = await getHandbookHeader(req.params.handbookId!);
    if (!header) {
      res.status(404).json({ error: "Student Handbook not found" });
      return;
    }
    if (!canGovern(req.user, header.programmeId)) {
      res.status(403).json({ error: "Only Admin or Programme Coordinator can assign the handbook owner" });
      return;
    }
    try {
      res.json(await assignLecturer(header.id, parsed.data.assignedLecturerId, req.user.id));
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  router.put("/:handbookId/sections/:sectionKey", async (req, res) => {
    const parsed = SaveStudentHandbookSectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid handbook section", details: parsed.error.flatten() });
      return;
    }
    if (!req.user) return;
    const header = await getHandbookHeader(req.params.handbookId!);
    if (!header) {
      res.status(404).json({ error: "Student Handbook not found" });
      return;
    }
    if (!canEdit(req.user, header)) {
      res.status(403).json({ error: "Only the assigned lecturer can edit handbook content" });
      return;
    }
    try {
      res.json(
        await replaceSectionBlocks(
          header.id,
          req.params.sectionKey!,
          parsed.data,
          req.user.id,
        ),
      );
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  router.get("/:handbookId/sources/:kind", async (req, res) => {
    const parsedKind = StudentHandbookSourceKindSchema.safeParse(req.params.kind);
    if (!parsedKind.success) {
      res.status(400).json({ error: "Unsupported handbook source" });
      return;
    }
    if (!req.user) return;
    const header = await getHandbookHeader(req.params.handbookId!);
    if (!header) {
      res.status(404).json({ error: "Student Handbook not found" });
      return;
    }
    if (!canRead(req.user, header)) {
      res.status(403).json({ error: "You do not have access to this Student Handbook" });
      return;
    }
    try {
      res.json(await getSourcePreview(header.id, parsedKind.data));
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  router.post("/:handbookId/submit", async (req, res) => {
    if (!req.user) return;
    const header = await getHandbookHeader(req.params.handbookId!);
    if (!header) {
      res.status(404).json({ error: "Student Handbook not found" });
      return;
    }
    if (!canEdit(req.user, header)) {
      res.status(403).json({ error: "Only the assigned lecturer can submit this handbook" });
      return;
    }
    try {
      res.json(await submitHandbook(header.id, req.user.id));
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  router.post("/:handbookId/request-changes", async (req, res) => {
    const parsed = StudentHandbookReviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid review note", details: parsed.error.flatten() });
      return;
    }
    if (!req.user) return;
    const header = await getHandbookHeader(req.params.handbookId!);
    if (!header) {
      res.status(404).json({ error: "Student Handbook not found" });
      return;
    }
    if (!canGovern(req.user, header.programmeId)) {
      res.status(403).json({ error: "Only Admin or Programme Coordinator can review this handbook" });
      return;
    }
    try {
      res.json(await requestChanges(header.id, req.user.id, parsed.data.note));
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  router.post("/:handbookId/approve", async (req, res) => {
    const parsed = StudentHandbookReviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid review note", details: parsed.error.flatten() });
      return;
    }
    if (!req.user) return;
    const header = await getHandbookHeader(req.params.handbookId!);
    if (!header) {
      res.status(404).json({ error: "Student Handbook not found" });
      return;
    }
    if (!canGovern(req.user, header.programmeId)) {
      res.status(403).json({ error: "Only Admin or Programme Coordinator can approve this handbook" });
      return;
    }
    try {
      res.json(await approveHandbook(header.id, req.user.id, parsed.data.note));
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  router.post("/:handbookId/publish", async (req, res) => {
    const parsed = StudentHandbookReviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid publish note", details: parsed.error.flatten() });
      return;
    }
    if (!req.user) return;
    const header = await getHandbookHeader(req.params.handbookId!);
    if (!header) {
      res.status(404).json({ error: "Student Handbook not found" });
      return;
    }
    if (!canGovern(req.user, header.programmeId)) {
      res.status(403).json({ error: "Only Admin or Programme Coordinator can publish this handbook" });
      return;
    }
    try {
      res.json(await publishHandbook(header.id, req.user.id, parsed.data.note));
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  return router;
}
