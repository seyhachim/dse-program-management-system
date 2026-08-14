import { Router } from "express";
import {
  CreateActiveLearningClusterInput,
  CreateActiveLearningStrategyInput,
  CreateMethodInput,
  SetVocabularyActiveInput,
  UpdateActiveLearningClusterInput,
  UpdateActiveLearningStrategyInput,
  UpdateMethodInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { methodService } from "./service.ts";

function idParam(value: string | undefined): string | null {
  return value?.trim() || null;
}

export function createMethodRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // Lecturer-facing catalogue: active entries only.
  router.get("/", requirePermission("methods:read"), async (_req, res) => {
    res.json(await methodService.list());
  });

  // Programme-management catalogue: includes archived entries.
  router.get("/managed", requirePermission("programme:write"), async (_req, res) => {
    res.json(await methodService.listManaged());
  });

  router.post("/teaching", requirePermission("programme:write"), async (req, res) => {
    const parsed = CreateMethodInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      const { method, created } = await methodService.addTeaching(parsed.data);
      res.status(created ? 201 : 200).json(method);
    } catch {
      res.status(500).json({ error: "Could not add teaching method" });
    }
  });

  router.put("/teaching/:id", requirePermission("programme:write"), async (req, res) => {
    const id = idParam(req.params.id);
    const parsed = UpdateMethodInput.safeParse(req.body);
    if (!id || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    try {
      res.json(await methodService.updateTeaching(id, parsed.data));
    } catch {
      res.status(409).json({ error: "Could not rename teaching method" });
    }
  });

  router.put("/teaching/:id/active", requirePermission("programme:write"), async (req, res) => {
    const id = idParam(req.params.id);
    const parsed = SetVocabularyActiveInput.safeParse(req.body);
    if (!id || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    try {
      res.json(await methodService.setTeachingActive(id, parsed.data.active));
    } catch {
      res.status(404).json({ error: "Teaching method not found" });
    }
  });

  router.post("/assessment", requirePermission("programme:write"), async (req, res) => {
    const parsed = CreateMethodInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      const { method, created } = await methodService.addAssessment(parsed.data);
      res.status(created ? 201 : 200).json(method);
    } catch {
      res.status(500).json({ error: "Could not add assessment method" });
    }
  });

  router.put("/assessment/:id", requirePermission("programme:write"), async (req, res) => {
    const id = idParam(req.params.id);
    const parsed = UpdateMethodInput.safeParse(req.body);
    if (!id || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    try {
      res.json(await methodService.updateAssessment(id, parsed.data));
    } catch {
      res.status(409).json({ error: "Could not rename assessment method" });
    }
  });

  router.put("/assessment/:id/active", requirePermission("programme:write"), async (req, res) => {
    const id = idParam(req.params.id);
    const parsed = SetVocabularyActiveInput.safeParse(req.body);
    if (!id || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    try {
      res.json(await methodService.setAssessmentActive(id, parsed.data.active));
    } catch {
      res.status(404).json({ error: "Assessment method not found" });
    }
  });

  router.post("/active-learning/clusters", requirePermission("programme:write"), async (req, res) => {
    const parsed = CreateActiveLearningClusterInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(await methodService.createCluster(parsed.data));
    } catch {
      res.status(409).json({ error: "Could not create active-learning cluster" });
    }
  });

  router.put("/active-learning/clusters/:id", requirePermission("programme:write"), async (req, res) => {
    const id = idParam(req.params.id);
    const parsed = UpdateActiveLearningClusterInput.safeParse(req.body);
    if (!id || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    try {
      res.json(await methodService.updateCluster(id, parsed.data));
    } catch {
      res.status(404).json({ error: "Active-learning cluster not found" });
    }
  });

  router.put("/active-learning/clusters/:id/active", requirePermission("programme:write"), async (req, res) => {
    const id = idParam(req.params.id);
    const parsed = SetVocabularyActiveInput.safeParse(req.body);
    if (!id || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    try {
      res.json(await methodService.setClusterActive(id, parsed.data.active));
    } catch {
      res.status(404).json({ error: "Active-learning cluster not found" });
    }
  });

  router.post("/active-learning/strategies", requirePermission("programme:write"), async (req, res) => {
    const parsed = CreateActiveLearningStrategyInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(await methodService.createStrategy(parsed.data));
    } catch {
      res.status(409).json({ error: "Could not create active-learning strategy" });
    }
  });

  router.put("/active-learning/strategies/:id", requirePermission("programme:write"), async (req, res) => {
    const id = idParam(req.params.id);
    const parsed = UpdateActiveLearningStrategyInput.safeParse(req.body);
    if (!id || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    try {
      res.json(await methodService.updateStrategy(id, parsed.data));
    } catch {
      res.status(404).json({ error: "Active-learning strategy not found" });
    }
  });

  router.put("/active-learning/strategies/:id/active", requirePermission("programme:write"), async (req, res) => {
    const id = idParam(req.params.id);
    const parsed = SetVocabularyActiveInput.safeParse(req.body);
    if (!id || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    try {
      res.json(await methodService.setStrategyActive(id, parsed.data.active));
    } catch {
      res.status(404).json({ error: "Active-learning strategy not found" });
    }
  });

  return router;
}
