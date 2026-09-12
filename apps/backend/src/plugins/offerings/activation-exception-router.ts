import { Router } from "express";
import {
  RequestOfferingActivationExceptionInputSchema,
  ResolveOfferingActivationExceptionInputSchema,
  ReviewOfferingActivationExceptionInputSchema,
  RevokeOfferingActivationExceptionInputSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  hasAnyRoleInProgramme,
  type AuthUser,
  type Role,
} from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  OfferingActivationExceptionConflictError,
  OfferingActivationExceptionNotFoundError,
  OfferingActivationExceptionValidationError,
  offeringActivationExceptionService,
} from "./activation-exception-service.ts";

export const ACTIVATION_EXCEPTION_REQUEST_ROLES: Role[] = [
  "admin",
  "program_coordinator",
  "program_secretary",
];
export const ACTIVATION_EXCEPTION_REVIEW_ROLES: Role[] = [
  "admin",
  "program_coordinator",
];

export function canRequestOfferingActivationException(
  user: AuthUser,
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(
    user,
    ACTIVATION_EXCEPTION_REQUEST_ROLES,
    programmeId,
  );
}

export function canReviewOfferingActivationException(
  user: AuthUser,
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(
    user,
    ACTIVATION_EXCEPTION_REVIEW_ROLES,
    programmeId,
  );
}

function handleError(error: unknown, res: import("express").Response): void {
  if (error instanceof OfferingActivationExceptionNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof OfferingActivationExceptionValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof OfferingActivationExceptionConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  console.error("Offering activation exception request failed", error);
  res.status(500).json({ error: "Could not process Offering activation exception" });
}

async function assertScope(
  req: import("express").Request,
  res: import("express").Response,
  review: boolean,
): Promise<boolean> {
  const programmeId = await offeringActivationExceptionService.programmeIdForOffering(
    req.params.id!,
  );
  const allowed = review
    ? canReviewOfferingActivationException(req.user!, programmeId)
    : canRequestOfferingActivationException(req.user!, programmeId);
  if (!allowed) {
    res.status(403).json({
      error: review
        ? "Only a programme administrator or programme coordinator can review activation exceptions"
        : "You cannot manage activation exceptions for this programme",
    });
    return false;
  }
  return true;
}

export function createOfferingActivationExceptionRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/:id/activation-exception",
    requirePermission("offerings:manage"),
    async (req, res) => {
      try {
        if (!(await assertScope(req, res, false))) return;
        res.json(await offeringActivationExceptionService.snapshot(req.params.id!));
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    "/:id/activation-exception",
    requirePermission("offerings:manage"),
    async (req, res) => {
      const parsed = RequestOfferingActivationExceptionInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid activation exception request",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        if (!(await assertScope(req, res, false))) return;
        res.status(201).json(
          await offeringActivationExceptionService.request(
            req.params.id!,
            parsed.data,
            req.user!.id,
          ),
        );
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    "/:id/activation-exception/:exceptionId/review",
    requirePermission("offerings:manage"),
    async (req, res) => {
      const parsed = ReviewOfferingActivationExceptionInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid activation exception review",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        if (!(await assertScope(req, res, true))) return;
        res.json(
          await offeringActivationExceptionService.review(
            req.params.id!,
            req.params.exceptionId!,
            parsed.data,
            req.user!.id,
          ),
        );
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    "/:id/activation-exception/:exceptionId/revoke",
    requirePermission("offerings:manage"),
    async (req, res) => {
      const parsed = RevokeOfferingActivationExceptionInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid activation exception revocation",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        if (!(await assertScope(req, res, true))) return;
        res.json(
          await offeringActivationExceptionService.revoke(
            req.params.id!,
            req.params.exceptionId!,
            parsed.data.reason,
            req.user!.id,
          ),
        );
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    "/:id/activation-exception/:exceptionId/resolve",
    requirePermission("offerings:manage"),
    async (req, res) => {
      const parsed = ResolveOfferingActivationExceptionInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid activation exception resolution",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        if (!(await assertScope(req, res, true))) return;
        res.json(
          await offeringActivationExceptionService.resolve(
            req.params.id!,
            req.params.exceptionId!,
            parsed.data.note,
            req.user!.id,
          ),
        );
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  return router;
}
