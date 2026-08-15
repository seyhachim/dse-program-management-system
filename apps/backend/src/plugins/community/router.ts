import { Router } from "express";
import {
  CreateCommunityActionSchema,
  CreateCommunityCommentSchema,
  CreateCommunityDiscussionSchema,
  CreateCommunitySchema,
  UpdateCommunityActionStatusSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  hasAnyRoleInProgramme,
  type AuthUser,
  type Role,
} from "../../core/auth/token.ts";
import {
  addComment,
  createAction,
  createCommunity,
  createDiscussion,
  getCommunity,
  getDiscussion,
  joinCommunity,
  listCommunities,
  listDiscussions,
  updateActionStatus,
} from "./service.ts";
import {
  actionProgrammeId,
  communityProgrammeId,
  discussionProgrammeId,
} from "./scope.ts";

const COMMUNITY_ROLES: Role[] = [
  "admin",
  "program_coordinator",
  "program_secretary",
  "lecturer",
  "qa_contributor",
  "qa_reviewer",
  "student",
];

const FACILITATOR_ROLES: Role[] = [
  "admin",
  "program_coordinator",
  "lecturer",
  "qa_contributor",
];

const GOVERNANCE_ROLES: Role[] = ["admin", "program_coordinator", "lecturer"];

function canAccessProgramme(user: AuthUser, programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, COMMUNITY_ROLES, programmeId);
}

function canFacilitate(user: AuthUser, programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, FACILITATOR_ROLES, programmeId);
}

function canGovern(user: AuthUser, programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, GOVERNANCE_ROLES, programmeId);
}

function denyProgramme(res: Parameters<Parameters<Router["use"]>[0]>[1]) {
  res.status(403).json({ error: "You do not have Community of Practice access to this programme" });
}

export function createCommunityRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/communities", async (req, res) => {
    const programmeId = typeof req.query.programmeId === "string" ? req.query.programmeId : "dse";
    if (!req.user || !canAccessProgramme(req.user, programmeId)) {
      denyProgramme(res);
      return;
    }
    res.json(await listCommunities(programmeId, req.user.id));
  });

  router.post("/communities", async (req, res) => {
    const parsed = CreateCommunitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid community", details: parsed.error.flatten() });
      return;
    }
    if (!req.user || !canGovern(req.user, parsed.data.programmeId)) {
      res.status(403).json({ error: "Only programme leadership or lecturers in this programme can create a community" });
      return;
    }
    try {
      res.status(201).json(await createCommunity(parsed.data, req.user.id));
    } catch (error) {
      if (error instanceof Error && error.message.includes("unique constraint")) {
        res.status(409).json({ error: "A community with this name already exists" });
        return;
      }
      res.status(500).json({ error: "Could not create community" });
    }
  });

  router.get("/communities/:communityId", async (req, res) => {
    const programmeId = await communityProgrammeId(req.params.communityId!);
    if (!programmeId) {
      res.status(404).json({ error: "Community not found" });
      return;
    }
    if (!req.user || !canAccessProgramme(req.user, programmeId)) {
      denyProgramme(res);
      return;
    }
    const community = await getCommunity(req.params.communityId!, req.user.id);
    if (!community) {
      res.status(404).json({ error: "Community not found" });
      return;
    }
    res.json(community);
  });

  router.post("/communities/:communityId/join", async (req, res) => {
    const programmeId = await communityProgrammeId(req.params.communityId!);
    if (!programmeId) {
      res.status(404).json({ error: "Community not found" });
      return;
    }
    if (!req.user || !canAccessProgramme(req.user, programmeId)) {
      denyProgramme(res);
      return;
    }
    await joinCommunity(req.params.communityId!, req.user.id);
    res.status(204).end();
  });

  router.get("/communities/:communityId/discussions", async (req, res) => {
    const programmeId = await communityProgrammeId(req.params.communityId!);
    if (!programmeId) {
      res.status(404).json({ error: "Community not found" });
      return;
    }
    if (!req.user || !canAccessProgramme(req.user, programmeId)) {
      denyProgramme(res);
      return;
    }
    res.json(await listDiscussions(req.params.communityId!));
  });

  router.post("/communities/:communityId/discussions", async (req, res) => {
    const parsed = CreateCommunityDiscussionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid discussion", details: parsed.error.flatten() });
      return;
    }
    const programmeId = await communityProgrammeId(req.params.communityId!);
    if (!programmeId) {
      res.status(404).json({ error: "Community not found" });
      return;
    }
    if (!req.user || !canAccessProgramme(req.user, programmeId)) {
      denyProgramme(res);
      return;
    }
    res.status(201).json(
      await createDiscussion(req.params.communityId!, parsed.data, req.user.id),
    );
  });

  router.get("/discussions/:discussionId", async (req, res) => {
    const programmeId = await discussionProgrammeId(req.params.discussionId!);
    if (!programmeId) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }
    if (!req.user || !canAccessProgramme(req.user, programmeId)) {
      denyProgramme(res);
      return;
    }
    const discussion = await getDiscussion(req.params.discussionId!);
    if (!discussion) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }
    res.json(discussion);
  });

  router.post("/discussions/:discussionId/comments", async (req, res) => {
    const parsed = CreateCommunityCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid comment", details: parsed.error.flatten() });
      return;
    }
    const programmeId = await discussionProgrammeId(req.params.discussionId!);
    if (!programmeId) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }
    if (!req.user || !canAccessProgramme(req.user, programmeId)) {
      denyProgramme(res);
      return;
    }
    res.status(201).json(
      await addComment(req.params.discussionId!, parsed.data.body, req.user.id),
    );
  });

  router.post("/discussions/:discussionId/actions", async (req, res) => {
    const parsed = CreateCommunityActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid action", details: parsed.error.flatten() });
      return;
    }
    const programmeId = await discussionProgrammeId(req.params.discussionId!);
    if (!programmeId) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }
    if (!req.user || !canFacilitate(req.user, programmeId)) {
      res.status(403).json({ error: "Only community facilitators in this programme can convert a discussion to an action" });
      return;
    }
    res.status(201).json(
      await createAction(req.params.discussionId!, parsed.data, req.user.id),
    );
  });

  router.patch("/actions/:actionId/status", async (req, res) => {
    const parsed = UpdateCommunityActionStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid action status", details: parsed.error.flatten() });
      return;
    }
    const programmeId = await actionProgrammeId(req.params.actionId!);
    if (!programmeId) {
      res.status(404).json({ error: "Action not found" });
      return;
    }
    if (!req.user || !canFacilitate(req.user, programmeId)) {
      res.status(403).json({ error: "Only community facilitators in this programme can update action status" });
      return;
    }
    const action = await updateActionStatus(req.params.actionId!, parsed.data.status);
    if (!action) {
      res.status(404).json({ error: "Action not found" });
      return;
    }
    res.json(action);
  });

  return router;
}
