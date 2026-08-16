import { Router, type Response } from "express";
import {
  CreateRubricInput,
  ListRubricsQuery,
  UpdateRubricInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  RubricConflictError,
  RubricNotFoundError,
  rubricService,
} from "./service.ts";

/**
 * Rubric Library REST router.
 *
 * Public access is intentionally narrow: GET /api/rubrics/public/:id is mounted
 * before auth and only returns Active rubrics through a stripped public DTO.
 * Every management/list/detail route below remains authenticated. Ownership and
 * lifecycle checks are repeated in the service, so direct API calls cannot
 * bypass the UI's action visibility.
 */
export function createRubricRouter(): Router {
  const router = Router();

  // GET /api/rubrics/public/:id — no login required, Active only.
  router.get("/public/:id", async (req, res) => {
    const rubric = await rubricService.getPublicById(req.params.id!);
    if (!rubric) {
      res.status(404).json({ error: "Rubric not found" });
      return;
    }
    res.json(rubric);
  });

  router.use(requireAuth);

  // GET /api/rubrics?search=&status=
  // Active rubrics are shared. Draft/Archived visibility is owner/elevated-role scoped in the service.
  router.get("/", requirePermission("rubrics:read"), async (req, res) => {
    const parsed = ListRubricsQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    res.json(await rubricService.list(parsed.data, req.user!));
  });

  // GET /api/rubrics/:id
  router.get("/:id", requirePermission("rubrics:read"), async (req, res) => {
    const rubric = await rubricService.getById(req.params.id!, req.user!);
    if (!rubric) {
      res.status(404).json({ error: "Rubric not found" });
      return;
    }
    res.json(rubric);
  });

  // POST /api/rubrics
  router.post("/", requirePermission("rubrics:write"), async (req, res) => {
    const parsed = CreateRubricInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      const created = await rubricService.create(parsed.data, req.user!);
      res.status(201).json(created);
    } catch (error) {
      console.error("Could not create rubric", error);
      res.status(500).json({ error: "Could not create rubric" });
    }
  });

  // PATCH /api/rubrics/:id
  router.patch("/:id", requirePermission("rubrics:write"), async (req, res) => {
    const parsed = UpdateRubricInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await rubricService.update(req.params.id!, parsed.data, req.user!));
    } catch (error) {
      sendRubricMutationError(res, error, "Could not update rubric");
    }
  });

  // DELETE /api/rubrics/:id
  router.delete("/:id", requirePermission("rubrics:write"), async (req, res) => {
    try {
      await rubricService.remove(req.params.id!, req.user!);
      res.status(204).end();
    } catch (error) {
      sendRubricMutationError(res, error, "Could not delete rubric");
    }
  });

  return router;
}

function prismaErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null
    ? (error as { code?: string }).code
    : undefined;
}

function sendRubricMutationError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof RubricNotFoundError || prismaErrorCode(error) === "P2025") {
    res.status(404).json({ error: "Rubric not found" });
    return;
  }
  if (error instanceof RubricConflictError || prismaErrorCode(error) === "P2003") {
    res.status(409).json({
      error: error instanceof RubricConflictError
        ? error.message
        : "Rubric is still referenced by academic records and cannot be deleted.",
    });
    return;
  }
  console.error(fallback, error);
  res.status(500).json({ error: fallback });
}
