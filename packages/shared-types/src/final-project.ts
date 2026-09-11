import { z } from "zod";

export const FinalProjectResearchTrackInput = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(""),
});
export type FinalProjectResearchTrackInput = z.infer<typeof FinalProjectResearchTrackInput>;

export const FinalProjectIdeaInput = z.object({
  title: z.string().trim().min(3).max(180),
  summary: z.string().trim().max(1000).default(""),
  trackName: z.string().trim().max(100).default(""),
});
export type FinalProjectIdeaInput = z.infer<typeof FinalProjectIdeaInput>;

export const UpdateSupervisorProfileInput = z.object({
  programmeId: z.string().trim().min(1),
  supervisionStatement: z.string().trim().max(1500).default(""),
  capacity: z.number().int().min(0).max(50),
  acceptingStudents: z.boolean(),
  isPublished: z.boolean(),
  tracks: z.array(FinalProjectResearchTrackInput).max(20).default([]),
  projectIdeas: z.array(FinalProjectIdeaInput).max(30).default([]),
});
export type UpdateSupervisorProfileInput = z.infer<typeof UpdateSupervisorProfileInput>;

const OptionalBooleanQuery = z.preprocess(
  (value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  },
  z.boolean().optional(),
);

export const ListSupervisorDiscoveryQuery = z.object({
  programmeId: z.string().trim().min(1),
  q: z.string().trim().max(100).optional(),
  track: z.string().trim().max(100).optional(),
  accepting: OptionalBooleanQuery,
});
export type ListSupervisorDiscoveryQuery = z.infer<typeof ListSupervisorDiscoveryQuery>;

export const ProgrammeSupervisorOverviewQuery = z.object({
  programmeId: z.string().trim().min(1),
});
export type ProgrammeSupervisorOverviewQuery = z.infer<typeof ProgrammeSupervisorOverviewQuery>;

export interface FinalProjectResearchTrackView {
  id: string;
  name: string;
  description: string;
}

export interface FinalProjectIdeaView {
  id: string;
  title: string;
  summary: string;
  trackName: string;
}

export interface SupervisorDiscoveryProfileView {
  id: string;
  programmeId: string;
  lecturerId: string;
  lecturerName: string;
  lecturerTitle: string | null;
  qualification: string | null;
  supervisionStatement: string;
  capacity: number;
  /** Null until Final Project advisor assignments are introduced in a later slice. */
  currentLoad: number | null;
  acceptingStudents: boolean;
  isPublished: boolean;
  tracks: FinalProjectResearchTrackView[];
  projectIdeas: FinalProjectIdeaView[];
  updatedAt: string;
}

export interface ProgrammeSupervisorOverviewView {
  programmeId: string;
  publishedSupervisors: number;
  acceptingSupervisors: number;
  totalCapacity: number;
  /** Null until advisor assignment records exist; never infer workload from unrelated PMS data. */
  totalCurrentLoad: number | null;
  supervisors: SupervisorDiscoveryProfileView[];
}
