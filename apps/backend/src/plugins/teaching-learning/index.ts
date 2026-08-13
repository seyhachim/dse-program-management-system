import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createTeachingLearningRouter } from "./router.ts";
import {
  teachingLearningService,
  type TeachingLearningService,
} from "./service.ts";

export const teachingLearningPlugin: BackendPlugin<TeachingLearningService> = {
  manifest: {
    id: "teaching-learning",
    name: "Teaching & Learning",
    version: "0.1.0",
    description: "Course-level teaching philosophy and learning strategy persistence.",
  },
  router: createTeachingLearningRouter(),
  service: teachingLearningService,
};
