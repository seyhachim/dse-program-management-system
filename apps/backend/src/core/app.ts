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
import { studentPortalPlugin } from "../plugins/student-portal/index.ts";
import { qaPlugin } from "../plugins/qa/index.ts";
import { communityPlugin } from "../plugins/community/index.ts";

/**
 * Builds the Express app: registers plugins, mounts each plugin router at
 * /api/{id}, and exposes /api/registry for nav/introspection. The core knows
 * nothing about any plugin's domain — it just iterates the registry.
 */
export function createApp(): Express {
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
  registry.register(studentPortalPlugin);
  registry.register(qaPlugin);
  registry.register(communityPlugin);

  const app = express();

  const origins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim());
  app.use(cors({ origin: origins }));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/api/registry", (_req, res) => res.json(registry.manifests()));

  for (const plugin of registry.all()) {
    app.use(`/api/${plugin.manifest.id}`, plugin.router);
  }

  return app;
}
