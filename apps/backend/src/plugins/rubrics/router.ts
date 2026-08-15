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
 * Rubric Library REST router. Reads need `rubrics:read`, writes `rubrics:write`.
 * Read-only users can only discover and open Active rubrics. Users with write
 * permission can also work with Draft and Archived rubrics.
 *
 * On create the owner is taken from `req.user`, never the request body. Bodies
 * and queries are validated with the shared Zod schemas so the wire contract is
 * enforced at runtime.
 */
export function createRubricRouter(): Router {
  const router = Router();
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
