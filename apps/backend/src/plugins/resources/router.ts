import { Router, type NextFunction, type Request, type Response } from "express";
import {
  AssignResourceResponsibilityInput,
  CreateResourceLocationInput,
  CreateResourceTypeInput,
  EndResourceResponsibilityInput,
  HandoverResourceResponsibilityInput,
  RenewResourceResponsibilityInput,
  UpdateResourceLocationInput,
  UpdateResourceTypeInput,
  type InventoryCapability,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasInventoryCapability, resolveInventoryCapabilities } from "./policy.ts";
import {
  ResourceConflictError,
  ResourceEligibilityError,
  ResourceNotFoundError,
  resourceService,
} from "./service.ts";

function programmeId(req: Request): string | null {
  return req.params.programmeId?.trim() || null;
}

function idParam(value: string | undefined): string | null {
  return value?.trim() || null;
}

function requireInventoryCapability(capability: InventoryCapability) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = programmeId(req);
    if (!id || !req.user) {
      res.status(400).json({ error: "Programme id is required" });
      return;
    }
    if (!(await hasInventoryCapability(req.user, id, capability))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

function sendDomainError(res: Response, error: unknown) {
  if (error instanceof ResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof ResourceConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof ResourceEligibilityError) {
    res.status(422).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Resource operation failed" });
}

export function createResourceRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/programmes/:programmeId/capabilities", async (req, res) => {
    const id = programmeId(req);
    if (!id || !req.user) {
      res.status(400).json({ error: "Programme id is required" });
      return;
    }
    try {
      const resolved = await resolveInventoryCapabilities(req.user, id);
      res.json({ programmeId: id, ...resolved });
    } catch (error) {
      sendDomainError(res, error);
    }
  });

  router.get(
    "/programmes/:programmeId/types",
    requireInventoryCapability("inventory:read"),
    async (req, res) => {
      try {
        res.json(await resourceService.listTypes(programmeId(req)!));
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  router.post(
    "/programmes/:programmeId/types",
    requireInventoryCapability("inventory:write"),
    async (req, res) => {
      const parsed = CreateResourceTypeInput.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
        return;
      }
      try {
        res.status(201).json(
          await resourceService.createType(programmeId(req)!, parsed.data),
        );
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  router.patch(
    "/programmes/:programmeId/types/:id",
    requireInventoryCapability("inventory:write"),
    async (req, res) => {
      const id = idParam(req.params.id);
      const parsed = UpdateResourceTypeInput.safeParse(req.body);
      if (!id || !parsed.success) {
        res.status(400).json({ error: "Invalid request" });
        return;
      }
      try {
        res.json(
          await resourceService.updateType(programmeId(req)!, id, parsed.data),
        );
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  router.get(
    "/programmes/:programmeId/locations",
    requireInventoryCapability("inventory:read"),
    async (req, res) => {
      try {
        res.json(await resourceService.listLocations(programmeId(req)!));
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  router.post(
    "/programmes/:programmeId/locations",
    requireInventoryCapability("inventory:write"),
    async (req, res) => {
      const parsed = CreateResourceLocationInput.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
        return;
      }
      try {
        res.status(201).json(
          await resourceService.createLocation(programmeId(req)!, parsed.data),
        );
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  router.patch(
    "/programmes/:programmeId/locations/:id",
    requireInventoryCapability("inventory:write"),
    async (req, res) => {
      const id = idParam(req.params.id);
      const parsed = UpdateResourceLocationInput.safeParse(req.body);
      if (!id || !parsed.success) {
        res.status(400).json({ error: "Invalid request" });
        return;
      }
      try {
        res.json(
          await resourceService.updateLocation(programmeId(req)!, id, parsed.data),
        );
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  router.get(
    "/programmes/:programmeId/responsibilities",
    requireInventoryCapability("inventory:read"),
    async (req, res) => {
      try {
        res.json(await resourceService.listResponsibilities(programmeId(req)!));
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  router.get(
    "/programmes/:programmeId/responsibilities/audit",
    requireInventoryCapability("inventory:approve"),
    async (req, res) => {
      try {
        res.json(await resourceService.responsibilityAudit(programmeId(req)!));
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  router.post(
    "/programmes/:programmeId/responsibilities",
    requireInventoryCapability("inventory:approve"),
    async (req, res) => {
      const parsed = AssignResourceResponsibilityInput.safeParse(req.body);
      if (!parsed.success || !req.user) {
        res.status(400).json({ error: "Invalid body", details: parsed.success ? undefined : parsed.error.flatten() });
        return;
      }
      try {
        res.status(201).json(
          await resourceService.assignResponsibility(
            programmeId(req)!,
            parsed.data,
            req.user.id,
          ),
        );
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  router.patch(
    "/programmes/:programmeId/responsibilities/:id/end",
    requireInventoryCapability("inventory:approve"),
    async (req, res) => {
      const id = idParam(req.params.id);
      const parsed = EndResourceResponsibilityInput.safeParse(req.body);
      if (!id || !parsed.success || !req.user) {
        res.status(400).json({ error: "Invalid request" });
        return;
      }
      try {
        res.json(
          await resourceService.endResponsibility(
            programmeId(req)!,
            id,
            parsed.data,
            req.user.id,
          ),
        );
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  router.patch(
    "/programmes/:programmeId/responsibilities/:id/renew",
    requireInventoryCapability("inventory:approve"),
    async (req, res) => {
      const id = idParam(req.params.id);
      const parsed = RenewResourceResponsibilityInput.safeParse(req.body);
      if (!id || !parsed.success || !req.user) {
        res.status(400).json({ error: "Invalid request" });
        return;
      }
      try {
        res.json(
          await resourceService.renewResponsibility(
            programmeId(req)!,
            id,
            parsed.data,
            req.user.id,
          ),
        );
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  router.post(
    "/programmes/:programmeId/responsibilities/:id/handover",
    requireInventoryCapability("inventory:approve"),
    async (req, res) => {
      const id = idParam(req.params.id);
      const parsed = HandoverResourceResponsibilityInput.safeParse(req.body);
      if (!id || !parsed.success || !req.user) {
        res.status(400).json({ error: "Invalid request" });
        return;
      }
      try {
        res.status(201).json(
          await resourceService.handoverResponsibility(
            programmeId(req)!,
            id,
            parsed.data,
            req.user.id,
          ),
        );
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  );

  return router;
}
