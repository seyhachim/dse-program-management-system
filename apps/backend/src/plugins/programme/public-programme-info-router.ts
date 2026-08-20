import { Router, type Response } from "express";
import {
  ProgrammeFaqAdminWriteSchema,
  ProgrammeImportantDateAdminWriteSchema,
  ProgrammePublicProfileAdminWriteSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  hasAnyRoleInProgramme,
  type AuthUser,
  type Role,
} from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  PublicProgrammeInfoConflictError,
  PublicProgrammeInfoNotFoundError,
  publicProgrammeInfoService,
} from "./public-programme-info-service.ts";

const MANAGEMENT_ROLES: Role[] = ["admin", "program_coordinator"];

export function hasPublicInfoManagementScope(
  user: AuthUser | undefined,
  programmeId: string,
): boolean {
  return Boolean(
    user && hasAnyRoleInProgramme(user, MANAGEMENT_ROLES, programmeId),
  );
}

function programmeIdOr400(req: Parameters<Parameters<Router["get"]>[1]>[0], res: Response) {
  const programmeId = req.params.programmeId;
  if (!programmeId) {
    res.status(400).json({ error: "Programme id is required" });
    return null;
  }
  if (!hasPublicInfoManagementScope(req.user, programmeId)) {
    res.status(403).json({ error: "No public-information access for this programme" });
    return null;
  }
  return programmeId;
}

function prismaCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null
    ? (error as { code?: string }).code
    : undefined;
}

function sendMutationError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof PublicProgrammeInfoNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof PublicProgrammeInfoConflictError || prismaCode(error) === "P2002") {
    res.status(409).json({
      error:
        error instanceof PublicProgrammeInfoConflictError
          ? error.message
          : "A public-information record with that unique value already exists.",
    });
    return;
  }
  console.error(fallback, error);
  res.status(500).json({ error: fallback });
}

export function createPublicProgrammeInfoRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/programmes/:programmeId/overview",
    requirePermission("programme:read"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      try {
        res.json(await publicProgrammeInfoService.overview(programmeId));
      } catch (error) {
        sendMutationError(res, error, "Could not load public-information overview");
      }
    },
  );

  router.get(
    "/programmes/:programmeId/faqs",
    requirePermission("programme:read"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      try {
        res.json(await publicProgrammeInfoService.listFaqs(programmeId));
      } catch (error) {
        sendMutationError(res, error, "Could not load public FAQs");
      }
    },
  );

  router.post(
    "/programmes/:programmeId/faqs",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      const parsed = ProgrammeFaqAdminWriteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid FAQ", details: parsed.error.flatten() });
        return;
      }
      try {
        res.status(201).json(await publicProgrammeInfoService.createFaq(programmeId, parsed.data));
      } catch (error) {
        sendMutationError(res, error, "Could not create public FAQ");
      }
    },
  );

  router.put(
    "/programmes/:programmeId/faqs/:id",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      const parsed = ProgrammeFaqAdminWriteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid FAQ", details: parsed.error.flatten() });
        return;
      }
      try {
        res.json(await publicProgrammeInfoService.updateFaq(programmeId, req.params.id!, parsed.data));
      } catch (error) {
        sendMutationError(res, error, "Could not update public FAQ");
      }
    },
  );

  router.post(
    "/programmes/:programmeId/faqs/:id/publish",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      try {
        res.json(await publicProgrammeInfoService.publishFaq(programmeId, req.params.id!));
      } catch (error) {
        sendMutationError(res, error, "Could not publish public FAQ");
      }
    },
  );

  router.post(
    "/programmes/:programmeId/faqs/:id/unpublish",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      try {
        res.json(await publicProgrammeInfoService.unpublishFaq(programmeId, req.params.id!));
      } catch (error) {
        sendMutationError(res, error, "Could not unpublish public FAQ");
      }
    },
  );

  router.delete(
    "/programmes/:programmeId/faqs/:id",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      try {
        await publicProgrammeInfoService.deleteFaq(programmeId, req.params.id!);
        res.status(204).end();
      } catch (error) {
        sendMutationError(res, error, "Could not delete public FAQ");
      }
    },
  );

  router.get(
    "/programmes/:programmeId/important-dates",
    requirePermission("programme:read"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      try {
        res.json(await publicProgrammeInfoService.listImportantDates(programmeId));
      } catch (error) {
        sendMutationError(res, error, "Could not load important dates");
      }
    },
  );

  router.post(
    "/programmes/:programmeId/important-dates",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      const parsed = ProgrammeImportantDateAdminWriteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid important date", details: parsed.error.flatten() });
        return;
      }
      try {
        res.status(201).json(
          await publicProgrammeInfoService.createImportantDate(programmeId, parsed.data),
        );
      } catch (error) {
        sendMutationError(res, error, "Could not create important date");
      }
    },
  );

  router.put(
    "/programmes/:programmeId/important-dates/:id",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      const parsed = ProgrammeImportantDateAdminWriteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid important date", details: parsed.error.flatten() });
        return;
      }
      try {
        res.json(
          await publicProgrammeInfoService.updateImportantDate(
            programmeId,
            req.params.id!,
            parsed.data,
          ),
        );
      } catch (error) {
        sendMutationError(res, error, "Could not update important date");
      }
    },
  );

  router.post(
    "/programmes/:programmeId/important-dates/:id/publish",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      try {
        res.json(
          await publicProgrammeInfoService.publishImportantDate(programmeId, req.params.id!),
        );
      } catch (error) {
        sendMutationError(res, error, "Could not publish important date");
      }
    },
  );

  router.post(
    "/programmes/:programmeId/important-dates/:id/unpublish",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      try {
        res.json(
          await publicProgrammeInfoService.unpublishImportantDate(programmeId, req.params.id!),
        );
      } catch (error) {
        sendMutationError(res, error, "Could not unpublish important date");
      }
    },
  );

  router.delete(
    "/programmes/:programmeId/important-dates/:id",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      try {
        await publicProgrammeInfoService.deleteImportantDate(programmeId, req.params.id!);
        res.status(204).end();
      } catch (error) {
        sendMutationError(res, error, "Could not delete important date");
      }
    },
  );

  router.get(
    "/programmes/:programmeId/profile",
    requirePermission("programme:read"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      try {
        res.json(await publicProgrammeInfoService.getProfile(programmeId));
      } catch (error) {
        sendMutationError(res, error, "Could not load public programme profile");
      }
    },
  );

  router.put(
    "/programmes/:programmeId/profile",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = programmeIdOr400(req, res);
      if (!programmeId) return;
      const parsed = ProgrammePublicProfileAdminWriteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid public profile", details: parsed.error.flatten() });
        return;
      }
      try {
        res.json(await publicProgrammeInfoService.upsertProfile(programmeId, parsed.data));
      } catch (error) {
        sendMutationError(res, error, "Could not save public programme profile");
      }
    },
  );

  return router;
}
