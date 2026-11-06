import { Router, type Request, type Response } from "express";
import { CreateOpportunityInput, SubmitOpportunityExperienceInput } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { OpportunityError, opportunitiesService } from "./service.ts";

type RouteTask = (req: Request, res: Response) => Promise<void>;
function route(task: RouteTask) {
  return (req: Request, res: Response) => {
    void task(req, res).catch((error: unknown) => {
      if (error instanceof OpportunityError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      console.error("Student Opportunities request failed", error);
      res.status(500).json({ error: "Could not complete opportunity request" });
    });
  };
}
function programmeId(req: Request): string {
  const value = req.query.programmeId;
  if (value === undefined) return "dse";
  if (typeof value !== "string" || value.length > 80 || value.length === 0) {
    throw new OpportunityError(400, "Invalid programme");
  }
  return value;
}
function parsedId(value: string | undefined): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) {
    throw new OpportunityError(400, "Invalid identifier");
  }
  return value;
}

export function createOpportunitiesRouter(): Router {
  const router = Router();
  router.use(requireAuth);
  // No caching a previously public opportunity after archive or expiry.
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    next();
  });

  router.get("/", route(async (req, res) => {
    res.json(await opportunitiesService.list(req.user!, programmeId(req)));
  }));
  router.get("/manage", route(async (req, res) => {
    res.json(await opportunitiesService.manage(req.user!, programmeId(req)));
  }));
  router.post("/manage", route(async (req, res) => {
    const input = CreateOpportunityInput.safeParse(req.body);
    if (!input.success) throw new OpportunityError(400, "Invalid opportunity: " + input.error.issues[0]?.message);
    res.status(201).json(await opportunitiesService.create(req.user!, input.data));
  }));
  router.post("/manage/:id/publish", route(async (req, res) => {
    res.json(await opportunitiesService.publish(req.user!, parsedId(req.params.id)));
  }));
  router.post("/manage/:id/archive", route(async (req, res) => {
    res.json(await opportunitiesService.archive(req.user!, parsedId(req.params.id)));
  }));
  router.get("/manage/experiences", route(async (req, res) => {
    res.json(await opportunitiesService.reviewList(req.user!, programmeId(req)));
  }));
  router.post("/manage/experiences/:id/approve", route(async (req, res) => {
    res.json(await opportunitiesService.reviewExperience(req.user!, parsedId(req.params.id), "approve"));
  }));
  router.post("/manage/experiences/:id/hide", route(async (req, res) => {
    res.json(await opportunitiesService.reviewExperience(req.user!, parsedId(req.params.id), "hide"));
  }));
  router.get("/:id", route(async (req, res) => {
    res.json(await opportunitiesService.detail(req.user!, parsedId(req.params.id)));
  }));
  router.get("/:id/my-experiences", route(async (req, res) => {
    res.json(await opportunitiesService.myExperiences(req.user!, parsedId(req.params.id)));
  }));
  router.post("/:id/experiences/:experienceId/withdraw", route(async (req, res) => {
    res.json(await opportunitiesService.withdrawExperience(req.user!, parsedId(req.params.id), parsedId(req.params.experienceId)));
  }));
  router.post("/:id/experiences", route(async (req, res) => {
    const input = SubmitOpportunityExperienceInput.safeParse(req.body);
    if (!input.success) throw new OpportunityError(400, "Consent, outcome and evidence ID are required");
    res.status(201).json(await opportunitiesService.submitExperience(req.user!, parsedId(req.params.id), input.data));
  }));
  return router;
}
