import cors from "cors";
import express, { type Express } from "express";
import { registry } from "./plugins/registry.ts";
import { studentsPlugin } from "../plugins/students/index.ts";
import { lecturersPlugin } from "../plugins/lecturers/index.ts";
import { coursesPlugin } from "../plugins/courses/index.ts";
import { offeringsPlugin } from "../plugins/offerings/index.ts";
import { methodsPlugin } from "../plugins/methods/index.ts";
import { rubricsPlugin } from "../plugins/rubrics/index.ts";
import { authPlugin } from "../plugins/auth/index.ts";
import { programmePlugin } from "../plugins/programme/index.ts";
import { teachingLearningPlugin } from "../plugins/teaching-learning/index.ts";
import { assessmentTemplatePlugin } from "../plugins/assessment-template/index.ts";

/**
 * Builds the Express app: registers plugins, mounts each plugin router at
 * /api/{id}, and exposes /api/registry for nav/introspection. The core knows
 * nothing about any plugin's domain — it just iterates the registry.
 */
export function createApp(): Express {
  // Register plugins (one line per plugin — this is the only place they're listed).
  // Cross-plugin dependencies are resolved lazily at request time via the registry,
  // so registration order is not significant, but we list providers first for clarity.
  registry.register(studentsPlugin);
  registry.register(lecturersPlugin);
  registry.register(coursesPlugin);
  registry.register(offeringsPlugin);
  registry.register(methodsPlugin);
  registry.register(rubricsPlugin);
  registry.register(authPlugin);
  registry.register(programmePlugin);
  registry.register(teachingLearningPlugin);
  registry.register(assessmentTemplatePlugin);

  const app = express();

  const origins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim());
  app.use(cors({ origin: origins }));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Runtime introspection: the frontend can read the live manifest list.
  app.get("/api/registry", (_req, res) => res.json(registry.manifests()));

  // Mount every registered plugin's router at /api/{id}.
  for (const plugin of registry.all()) {
    app.use(`/api/${plugin.manifest.id}`, plugin.router);
  }

  return app;
}
