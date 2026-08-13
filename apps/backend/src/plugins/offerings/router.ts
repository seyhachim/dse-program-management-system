import { Router } from "express";
import {
  CreateOfferingInput,
  EnrollInput,
  ListOfferingsQuery,
  UpdateOfferingInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, PROGRAMME_WIDE_ROLES, type Role } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { CapacityError, offeringService, ReferenceError } from "./service.ts";

export function createOfferingRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", requirePermission("offerings:read"), async (req, res) => {
    const parsed = ListOfferingsQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    // Lecturers only ever see offerings they're assigned to (primary or
    // co-lecturer) — issue #104. Programme-wide roles see everything.
    const ownerScope = req.user!.roles.some((r) => PROGRAMME_WIDE_ROLES.includes(r)) ? undefined : req.user!.id;
    res.json(await offeringService.list(parsed.data, ownerScope));
  });

  router.get("/:id", requirePermission("offerings:read"), async (req, res) => {
    const offering = await offeringService.getById(req.params.id!);
    if (!offering) {
      res.status(404).json({ error: "Offering not found" });
      return;
    }
    // A lecturer may only fetch an offering they're assigned to (issue #104);
    // a caller holding a programme-wide role for the offering's own course's
    // programme (globally, or scoped to that programme — issue #147) may
    // fetch any offering in it.
    if (!hasAnyRoleInProgramme(req.user!, PROGRAMME_WIDE_ROLES, offering.course?.programmeId ?? null)) {
      const isAssigned =
        offering.lecturer?.id === req.user!.id || offering.coLecturers.some((c) => c.id === req.user!.id);
      if (!isAssigned) {
        res.status(403).json({ error: "You can only access your own offerings" });
        return;
      }
    }
    res.json(offering);
  });

  // Scheduling an offering (term, capacity, status, lecturer assignment) is
  // curriculum-admin work, not something a lecturer does for their own class.
  router.post("/", requirePermission("offerings:manage"), async (req, res) => {
    const parsed = CreateOfferingInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(await offeringService.create(parsed.data));
    } catch (err) {
      handleError(err, res, "Could not create offering");
    }
  });

  router.patch("/:id", requirePermission("offerings:manage"), async (req, res) => {
    if (!(await assertOwnOfferingOrAdmin(req, res, "update"))) return;
    const parsed = UpdateOfferingInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await offeringService.update(req.params.id!, parsed.data));
    } catch (err) {
      handleError(err, res, "Could not update offering");
    }
  });

  router.delete("/:id", requirePermission("offerings:manage"), async (req, res) => {
    if (!(await assertOwnOfferingOrAdmin(req, res, "delete"))) return;
    try {
      await offeringService.remove(req.params.id!);
      res.status(204).end();
    } catch {
      res.status(404).json({ error: "Offering not found" });
    }
  });

  // Enrollment management (links Students <-> this offering). A lecturer may only
  // manage the roster of an offering they're assigned to; admins can manage any.
  router.post("/:id/enrollments", requirePermission("offerings:write"), async (req, res) => {
    if (!(await assertOwnOfferingOrAdmin(req, res))) return;
    const parsed = EnrollInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(await offeringService.enroll(req.params.id!, parsed.data));
    } catch (err) {
      handleError(err, res, "Could not enroll students");
    }
  });

  router.delete(
    "/:id/enrollments/:studentId",
    requirePermission("offerings:write"),
    async (req, res) => {
      if (!(await assertOwnOfferingOrAdmin(req, res))) return;
      try {
        res.json(await offeringService.unenroll(req.params.id!, req.params.studentId!));
      } catch (err) {
        handleError(err, res, "Could not unenroll student");
      }
    },
  );

  return router;
}

/**
 * Roles that may manage any offering's roster without being its assigned
 * lecturer — admin plus the two academic/administrative roles the roster
 * workflow (§9 of issue #101) names explicitly. `qa_reviewer` is deliberately
 * excluded: it never holds `offerings:write`, so it would never reach this
 * check anyway.
 */
const OFFERING_ROSTER_WIDE_ROLES: Role[] = ["admin", "program_coordinator", "program_secretary"];

/**
 * True (and untouched response) if the caller may manage this offering —
 * scheduling (PATCH/DELETE) or its roster (enroll/unenroll): a programme-wide
 * role scoped to the offering's own course's programme (issue #147), the
 * primary lecturer, or an assigned co-lecturer (#79). `courses:manage`'s
 * `program_coordinator`/`program_secretary`/`admin` set matches
 * `OFFERING_ROSTER_WIDE_ROLES` exactly, so this is the right guard for both.
 */
async function assertOwnOfferingOrAdmin(
  req: import("express").Request,
  res: import("express").Response,
  action = "manage enrollment for",
): Promise<boolean> {
  const offering = await offeringService.getById(req.params.id!);
  if (hasAnyRoleInProgramme(req.user!, OFFERING_ROSTER_WIDE_ROLES, offering?.course?.programmeId ?? null)) {
    return true;
  }
  const isAssigned =
    offering?.lecturer?.id === req.user!.id || offering?.coLecturers.some((c) => c.id === req.user!.id);
  if (!isAssigned) {
    res.status(403).json({ error: `You can only ${action} your own offerings` });
    return false;
  }
  return true;
}

function handleError(err: unknown, res: import("express").Response, fallback: string): void {
  if (err instanceof ReferenceError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof CapacityError) {
    res.status(409).json({ error: err.message });
    return;
  }
  const code = (err as { code?: string }).code;
  if (code === "P2002") {
    res.status(409).json({ error: "An offering for that course and term already exists" });
    return;
  }
  if (code === "P2025") {
    res.status(404).json({ error: "Offering not found" });
    return;
  }
  res.status(409).json({ error: fallback });
}
