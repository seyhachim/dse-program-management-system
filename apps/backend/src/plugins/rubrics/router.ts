import { Router } from "express";
import {
  CreateRubricInput,
  ListRubricsQuery,
  UpdateRubricInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission, roleHasPermission } from "../../core/permissions/index.ts";
import { rubricService } from "./service.ts";

/**
 * Rubric Library REST router.
 *
 * Public access is intentionally narrow: GET /api/rubrics/public/:id is mounted
 * before auth and only returns Active rubrics through a stripped public DTO.
 * Every management/list/detail route below remains authenticated.
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
  router.get("/", requirePermission("rubrics:read"), async (req, res) => {
    const parsed = ListRubricsQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const canWrite = await roleHasPermission(req.user!.roles, "rubrics:write");
    const query = canWrite ? parsed.data : { ...parsed.data, status: "Active" as const };
    res.json(await rubricService.list(query));
  });

  // GET /api/rubrics/:id
  router.get("/:id", requirePermission("rubrics:read"), async (req, res) => {
    const rubric = await rubricService.getById(req.params.id!);
    if (!rubric) {
      res.status(404).json({ error: "Rubric not found" });
      return;
    }

    const canWrite = await roleHasPermission(req.user!.roles, "rubrics:write");
    if (!canWrite && rubric.status !== "Active") {
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
      const created = await rubricService.create(parsed.data, req.user!.id);
      res.status(201).json(created);
    } catch {
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
      res.json(await rubricService.update(req.params.id!, parsed.data));
    } catch (err) {
      res.status(notFound(err) ? 404 : 500).json({
        error: notFound(err) ? "Rubric not found" : "Could not update rubric",
      });
    }
  });

  // DELETE /api/rubrics/:id
  router.delete("/:id", requirePermission("rubrics:write"), async (req, res) => {
    try {
      await rubricService.remove(req.params.id!);
      res.status(204).end();
    } catch {
      res.status(404).json({ error: "Rubric not found" });
    }
  });

  return router;
}

/** Prisma P2025 = record not found. */
function notFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2025";
}
