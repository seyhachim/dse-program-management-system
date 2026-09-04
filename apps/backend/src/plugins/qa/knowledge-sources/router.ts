import { Router, type Response } from "express";
import {
  ArchiveKnowledgeSourceSchema,
  CreateKnowledgeSourceSchema,
  CreateKnowledgeSourceVersionSchema,
  KnowledgeSourceContextSchema,
  KnowledgeSourceListQuerySchema,
  VerifyKnowledgeSourceVersionSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import {
  KnowledgeSourceConflictError,
  KnowledgeSourceNotFoundError,
  archiveKnowledgeSource,
  createKnowledgeSource,
  createKnowledgeSourceVersion,
  getKnowledgeSource,
  listKnowledgeSources,
  verifyKnowledgeSourceVersion,
} from "./service.ts";

const KNOWLEDGE_READ_ROLES = ["admin", "program_coordinator", "qa_reviewer", "qa_contributor", "lecturer"] as const;
const KNOWLEDGE_MANAGE_ROLES = ["admin", "program_coordinator"] as const;

function canRead(user: Parameters<typeof hasAnyRoleInProgramme>[0], programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, [...KNOWLEDGE_READ_ROLES], programmeId);
}

function canManage(user: Parameters<typeof hasAnyRoleInProgramme>[0], programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, [...KNOWLEDGE_MANAGE_ROLES], programmeId);
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof KnowledgeSourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof KnowledgeSourceConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the trusted-source operation" });
}

export function createKnowledgeSourcesRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/knowledge-sources", requirePermission("qa:read"), async (req, res) => {
    const parsed = KnowledgeSourceListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid trusted-source query", details: parsed.error.flatten() });
      return;
    }
    if (!canRead(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You do not have access to this programme knowledge registry" });
      return;
    }
    try {
      res.json(await listKnowledgeSources(parsed.data));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/knowledge-sources/:sourceId", requirePermission("qa:read"), async (req, res) => {
    const sourceId = req.params.sourceId;
    const parsed = KnowledgeSourceContextSchema.safeParse(req.query);
    if (!sourceId || !parsed.success) {
      res.status(400).json({ error: "Invalid trusted-source request", details: parsed.success ? undefined : parsed.error.flatten() });
      return;
    }
    if (!canRead(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You do not have access to this programme knowledge registry" });
      return;
    }
    try {
      res.json(await getKnowledgeSource(parsed.data.programmeId, sourceId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/knowledge-sources", requirePermission("qa:manage"), async (req, res) => {
    const parsed = CreateKnowledgeSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid trusted source", details: parsed.error.flatten() });
      return;
    }
    if (!canManage(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "Only programme leadership can register trusted sources" });
      return;
    }
    try {
      res.status(201).json(await createKnowledgeSource(parsed.data, req.user!.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/knowledge-sources/:sourceId/versions", requirePermission("qa:manage"), async (req, res) => {
    const sourceId = req.params.sourceId;
    const parsed = CreateKnowledgeSourceVersionSchema.safeParse(req.body);
    if (!sourceId || !parsed.success) {
      res.status(400).json({ error: "Invalid trusted-source version", details: parsed.success ? undefined : parsed.error.flatten() });
      return;
    }
    if (!canManage(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "Only programme leadership can add source versions" });
      return;
    }
    try {
      res.status(201).json(await createKnowledgeSourceVersion(sourceId, parsed.data, req.user!.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post(
    "/knowledge-sources/:sourceId/versions/:versionId/verify",
    requirePermission("qa:manage"),
    async (req, res) => {
      const sourceId = req.params.sourceId;
      const versionId = req.params.versionId;
      const parsed = VerifyKnowledgeSourceVersionSchema.safeParse(req.body);
      if (!sourceId || !versionId || !parsed.success) {
        res.status(400).json({ error: "Invalid source verification", details: parsed.success ? undefined : parsed.error.flatten() });
        return;
      }
      if (!canManage(req.user!, parsed.data.programmeId)) {
        res.status(403).json({ error: "Only programme leadership can verify source authority" });
        return;
      }
      try {
        res.json(await verifyKnowledgeSourceVersion(sourceId, versionId, parsed.data, req.user!.id));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post("/knowledge-sources/:sourceId/archive", requirePermission("qa:manage"), async (req, res) => {
    const sourceId = req.params.sourceId;
    const parsed = ArchiveKnowledgeSourceSchema.safeParse(req.body);
    if (!sourceId || !parsed.success) {
      res.status(400).json({ error: "Invalid source archive request", details: parsed.success ? undefined : parsed.error.flatten() });
      return;
    }
    if (!canManage(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "Only programme leadership can archive sources" });
      return;
    }
    try {
      await archiveKnowledgeSource(sourceId, parsed.data, req.user!.id);
      res.status(204).end();
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
