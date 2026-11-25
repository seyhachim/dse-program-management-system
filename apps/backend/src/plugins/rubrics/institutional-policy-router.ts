import { Router } from "express";
import { prisma } from "../../core/db/prisma.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { POLICY_TOPICS, policyAccess, policyRevisionInput } from "./institutional-policy.ts";

// Mounted exclusively behind requireAuth; never on a public rubric route.
// No private source URLs or documents are accepted or returned in this MVP.
const citationSelect = {
  id: true, topic: true, revision: true, title: true, institutionalOwner: true,
  version: true, effectiveDate: true, locator: true, modules: true,
  status: true, classification: true, createdAt: true, verifiedAt: true,
} as const;

export function createInstitutionalPolicyRouter(): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  router.get("/:programmeId", requirePermission("rubrics:read"), async (req, res) => {
    const programmeId = req.params.programmeId!;
    const access = policyAccess(req.user!, programmeId);
    if (access === "deny") { res.status(403).json({error: "Access denied"}); return; }
    try {
      // Resolve the latest revision for each topic before filtering status. An
      // archived or pending successor must not resurrect its verified predecessor.
      const latest = await Promise.all(POLICY_TOPICS.map(topic =>
        prisma.institutionalPolicyRevision.findFirst({
          where: { programmeId, topic }, orderBy: { revision: "desc" }, select: citationSelect,
        })));
      const records = latest.filter(row => row !== null && (access === "manage" || row.status === "verified"));
      res.json({canManage: access === "manage", records});
    } catch {
      res.status(500).json({error: "Could not load institutional references"});
    }
  });
  router.get("/:programmeId/history/:topic", requirePermission("rubrics:read"), async (req, res) => {
    const programmeId = req.params.programmeId!;
    if (policyAccess(req.user!, programmeId) !== "manage") { res.status(403).json({error: "Access denied"}); return; }
    try {
      const records = await prisma.institutionalPolicyRevision.findMany({
        where: { programmeId, topic: req.params.topic! },
        orderBy: { revision: "desc" }, take: 100,
        select: {...citationSelect, createdById: true},
      });
      res.json(records);
    } catch { res.status(500).json({error: "Could not load history"}); }
  });
  router.post("/:programmeId", requirePermission("rubrics:write"), async (req, res) => {
    const programmeId = req.params.programmeId!;
    if (policyAccess(req.user!, programmeId) !== "manage") { res.status(403).json({error: "Access denied"}); return; }
    const parsed = policyRevisionInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({error: "Invalid policy metadata; links and files are not accepted"}); return; }
    const {expectedRevision, ...data} = parsed.data;
    try {
      const row = await prisma.$transaction(async tx => {
        const current = await tx.institutionalPolicyRevision.findFirst({
          where: {programmeId, topic: data.topic}, orderBy: {revision: "desc"}, select: {revision: true},
        });
        if ((current?.revision ?? 0) !== expectedRevision) return null;
        return tx.institutionalPolicyRevision.create({
          data: {...data, programmeId, revision: expectedRevision + 1, createdById: req.user!.id,
            verifiedAt: data.status === "verified" ? new Date() : null},
          select: citationSelect,
        });
      });
      if (!row) {res.status(409).json({error: "Policy changed; reload before revising"}); return;}
      res.status(201).json(row);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        res.status(409).json({error: "Policy changed; reload before revising"}); return;
      }
      // Do not log request bodies or Prisma metadata containing restricted values.
      res.status(500).json({error: "Could not save policy revision"});
    }
  });
  return router;
}
