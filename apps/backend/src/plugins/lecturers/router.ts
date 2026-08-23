import { Router } from "express";
import {
  CreateLecturerInput,
  ListLecturersQuery,
  UpdateLecturerInput,
  UpdateMyLecturerProfileInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { lecturerService, NotFoundError } from "./service.ts";

/** Lecturers router — read for everyone, write for admins only (a lecturer cannot edit lecturer profiles, including their own, through this route). */
export function createLecturerRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // Keep /me before /:id. Both operations derive the record ID from the
  // verified bearer token, so one lecturer cannot select another target.
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

  router.get("/", requirePermission("lecturers:read"), async (req, res) => {
    const parsed = ListLecturersQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    res.json(await lecturerService.list(parsed.data));
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

/** Map service/Prisma errors to HTTP status. */
function errStatus(err: unknown): number {
  if (err instanceof NotFoundError) return 404;
  const code = (err as { code?: string }).code;
  if (code === "P2002") return 409;
  if (code === "P2025") return 404;
  return 409;
}

function errMessage(err: unknown): string | null {
  if (err instanceof NotFoundError) return err.message;
  const code = (err as { code?: string }).code;
  if (code === "P2002") return "A user with that email already exists";
  if (code === "P2025") return "Lecturer not found";
  return null;
}
