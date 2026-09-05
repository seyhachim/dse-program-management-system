import { z } from "zod";
import type { ResearchCycleStatus } from "./action-research.ts";

/**
 * Bounded manager-facing Action Research project list query. The backend owns
 * the opaque cursor so callers cannot infer or bypass programme scope.
 */
export const ResearchProjectPageQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ResearchProjectPageQuery = z.infer<typeof ResearchProjectPageQuerySchema>;

export interface ResearchProjectListItemView {
  id: string;
  programmeId: string;
  title: string;
  problemStatement: string;
  academicYear: string;
  semester: string;
  status: string;
  currentCycleStatus: ResearchCycleStatus | null;
  assignmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchProjectPage {
  items: ResearchProjectListItemView[];
  nextCursor: string | null;
}
