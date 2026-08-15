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

const COMMUNITY_ROLES = new Set([
  "admin",
  "program_coordinator",
  "program_secretary",
  "lecturer",
  "qa_contributor",
  "qa_reviewer",
  "student",
]);

const FACILITATOR_ROLES = new Set([
  "admin",
  "program_coordinator",
  "lecturer",
  "qa_contributor",
]);

const GOVERNANCE_ROLES = new Set(["admin", "program_coordinator", "lecturer"]);

function hasAnyRole(user: { roles?: string[]; role?: string }, allowed: Set<string>) {
  const roles = user.roles ?? (user.role ? [user.role] : []);
  return roles.some((role) => allowed.has(role));
}

export function createCommunityRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.use((req, res, next) => {
    if (!req.user || !hasAnyRole(req.user, COMMUNITY_ROLES)) {
      res.status(403).json({ error: "Community of Practice access is not available for this role" });
      return;
    }
    next();
  });

  router.get("/communities", async (req, res) => {
    const programmeId = typeof req.query.programmeId === "string" ? req.query.programmeId : "dse";
    res.json(await listCommunities(programmeId, req.user!.id));
  });

  router.post("/communities", async (req, res) => {
    if (!req.user || !hasAnyRole(req.user, GOVERNANCE_ROLES)) {
      res.status(403).json({ error: "Only programme leadership or lecturers can create a community" });
      return;
    }
    const parsed = CreateCommunitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid community", details: parsed.error.flatten() });
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
    const community = await getCommunity(req.params.communityId!, req.user!.id);
    if (!community) {
      res.status(404).json({ error: "Community not found" });
      return;
    }
    res.json(community);
  });

  router.post("/communities/:communityId/join", async (req, res) => {
    await joinCommunity(req.params.communityId!, req.user!.id);
    res.status(204).end();
  });

  router.get("/communities/:communityId/discussions", async (req, res) => {
    res.json(await listDiscussions(req.params.communityId!));
  });

  router.post("/communities/:communityId/discussions", async (req, res) => {
    const parsed = CreateCommunityDiscussionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid discussion", details: parsed.error.flatten() });
      return;
    }
    res.status(201).json(
      await createDiscussion(req.params.communityId!, parsed.data, req.user!.id),
    );
  });

  router.get("/discussions/:discussionId", async (req, res) => {
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
    res.status(201).json(
      await addComment(req.params.discussionId!, parsed.data.body, req.user!.id),
    );
  });

  router.post("/discussions/:discussionId/actions", async (req, res) => {
    if (!req.user || !hasAnyRole(req.user, FACILITATOR_ROLES)) {
      res.status(403).json({ error: "Only community facilitators can convert a discussion to an action" });
      return;
    }
    const parsed = CreateCommunityActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid action", details: parsed.error.flatten() });
      return;
    }
    res.status(201).json(
      await createAction(req.params.discussionId!, parsed.data, req.user.id),
    );
  });

  router.patch("/actions/:actionId/status", async (req, res) => {
    if (!req.user || !hasAnyRole(req.user, FACILITATOR_ROLES)) {
      res.status(403).json({ error: "Only community facilitators can update action status" });
      return;
    }
    const parsed = UpdateCommunityActionStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid action status", details: parsed.error.flatten() });
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
