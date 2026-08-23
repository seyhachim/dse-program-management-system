import { Router, type NextFunction, type Request, type Response } from "express";
import {
  CreateLecturerInput,
  CreateLecturerPortfolioItemInput,
  ListLecturersQuery,
  ReviewLecturerPortfolioItemInput,
  UpdateLecturerInput,
  UpdateLecturerPortfolioItemInput,
  UpdateMyLecturerProfileInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  lecturerPortfolioService,
  PortfolioConflictError,
  PortfolioNotFoundError,
  PortfolioValidationError,
} from "./portfolio-service.ts";
import { lecturerService, NotFoundError } from "./service.ts";

/** Lecturers router — profile CRUD plus self-owned professional portfolio. */
export function createLecturerRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // Keep all /me routes before /:id. Self-service targets come exclusively from
  // the verified bearer token; callers never choose another lecturer id.
  router.get("/me", async (req, res) => {
    const lecturer = await lecturerService.getOwnProfile(req.user!.id);
    if (!lecturer) {
      res.status(404).json({ error: "Lecturer profile not found" });
      return;
    }
    res.json(lecturer);
  });

  router.patch("/me", async (req, res) => {
    const parsed = UpdateMyLecturerProfileInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await lecturerService.updateOwnProfile(req.user!.id, parsed.data));
    } catch (err) {
      res.status(errStatus(err)).json({ error: errMessage(err) ?? "Could not update lecturer profile" });
    }
  });

  router.get("/me/portfolio-items", async (req, res) => {
    res.json(await lecturerPortfolioService.listOwnItems(req.user!.id));
  });

  router.post("/me/portfolio-items", async (req, res) => {
    const parsed = CreateLecturerPortfolioItemInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(await lecturerPortfolioService.createOwnItem(req.user!.id, parsed.data));
    } catch (err) {
      res.status(errStatus(err)).json({ error: errMessage(err) ?? "Could not create portfolio item" });
    }
  });

  router.patch("/me/portfolio-items/:itemId", async (req, res) => {
    const parsed = UpdateLecturerPortfolioItemInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await lecturerPortfolioService.updateOwnItem(req.user!.id, req.params.itemId!, parsed.data));
    } catch (err) {
      res.status(errStatus(err)).json({ error: errMessage(err) ?? "Could not update portfolio item" });
    }
  });

  router.delete("/me/portfolio-items/:itemId", async (req, res) => {
    try {
      await lecturerPortfolioService.deleteOwnItem(req.user!.id, req.params.itemId!);
      res.status(204).end();
    } catch (err) {
      res.status(errStatus(err)).json({ error: errMessage(err) ?? "Could not delete portfolio item" });
    }
  });

  router.get("/me/aun-qa-evidence", async (req, res) => {
    try {
      res.json(await lecturerPortfolioService.aunQaEvidenceExport(req.user!.id));
    } catch (err) {
      res.status(errStatus(err)).json({ error: errMessage(err) ?? "Could not assemble AUN-QA staff evidence" });
    }
  });

  router.get("/", requirePermission("lecturers:read"), async (req, res) => {
    const parsed = ListLecturersQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    res.json(await lecturerService.list(parsed.data));
  });

  // Private professional evidence is visible for governance review only to
  // Admin/Programme Coordinator; general lecturers:read is intentionally not enough.
  router.get("/:id/portfolio-items", requirePortfolioReviewer, async (req, res) => {
    res.json(await lecturerPortfolioService.listOwnItems(req.params.id!));
  });

  router.post("/:id/portfolio-items/:itemId/review", requirePortfolioReviewer, async (req, res) => {
    const parsed = ReviewLecturerPortfolioItemInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await lecturerPortfolioService.reviewItem(
        req.user!.id,
        req.params.id!,
        req.params.itemId!,
        parsed.data,
      ));
    } catch (err) {
      res.status(errStatus(err)).json({ error: errMessage(err) ?? "Could not review portfolio item" });
    }
  });

  router.get("/:id", requirePermission("lecturers:read"), async (req, res) => {
    const lecturer = await lecturerService.getById(req.params.id!);
    if (!lecturer) {
      res.status(404).json({ error: "Lecturer not found" });
      return;
    }
    res.json(lecturer);
  });

  router.post("/", requirePermission("lecturers:write"), async (req, res) => {
    const parsed = CreateLecturerInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(await lecturerService.create(parsed.data));
    } catch (err) {
      res.status(errStatus(err)).json({ error: errMessage(err) ?? "Could not create lecturer" });
    }
  });

  router.patch("/:id", requirePermission("lecturers:write"), async (req, res) => {
    const parsed = UpdateLecturerInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await lecturerService.update(req.params.id!, parsed.data));
    } catch (err) {
      res.status(errStatus(err)).json({ error: errMessage(err) ?? "Could not update lecturer" });
    }
  });

  router.delete("/:id", requirePermission("lecturers:write"), async (req, res) => {
    try {
      await lecturerService.remove(req.params.id!);
      res.status(204).end();
    } catch (err) {
      res.status(errStatus(err)).json({ error: errMessage(err) ?? "Could not delete lecturer" });
    }
  });

  return router;
}

function requirePortfolioReviewer(req: Request, res: Response, next: NextFunction): void {
  if (req.user!.roles.some((role) => role === "admin" || role === "program_coordinator")) {
    next();
    return;
  }
  res.status(403).json({ error: "Lecturer portfolio review requires Admin or Programme Coordinator role" });
}

function errStatus(err: unknown): number {
  if (err instanceof NotFoundError || err instanceof PortfolioNotFoundError) return 404;
  if (err instanceof PortfolioValidationError) return 400;
  if (err instanceof PortfolioConflictError) return 409;
  const code = (err as { code?: string }).code;
  if (code === "P2002") return 409;
  if (code === "P2025") return 404;
  return 409;
}

function errMessage(err: unknown): string | null {
  if (
    err instanceof NotFoundError
    || err instanceof PortfolioNotFoundError
    || err instanceof PortfolioValidationError
    || err instanceof PortfolioConflictError
  ) return err.message;
  const code = (err as { code?: string }).code;
  if (code === "P2002") return "A user with that email already exists";
  if (code === "P2025") return "Lecturer not found";
  return null;
}
