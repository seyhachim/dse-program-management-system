import { z } from "zod";

/** Shared contracts for the Year IV Final Project supervisor-discovery MVP (#1006). */
export const FINAL_PROJECT_MAX_SUPERVISION_CAPACITY = 20;

export const FinalProjectIdeaInput = z.object({
  title: z.string().trim().min(1, "Project idea title is required").max(200),
  summary: z.string().trim().max(2000).default(""),
  skills: z.array(z.string().trim().min(1).max(80)).max(15).default([]),
}).strict();
export type FinalProjectIdeaInput = z.infer<typeof FinalProjectIdeaInput>;

export const FinalProjectResearchTrackInput = z.object({
  title: z.string().trim().min(1, "Research track title is required").max(120),
  description: z.string().trim().max(1200).default(""),
  ideas: z.array(FinalProjectIdeaInput).max(20).default([]),
}).strict();
export type FinalProjectResearchTrackInput = z.infer<typeof FinalProjectResearchTrackInput>;

export const UpsertFinalProjectSupervisorProfileInput = z.object({
  statement: z.string().trim().max(4000).default(""),
  capacity: z.number().int().min(0).max(FINAL_PROJECT_MAX_SUPERVISION_CAPACITY),
  acceptingStudents: z.boolean(),
  isPublished: z.boolean(),
  tracks: z.array(FinalProjectResearchTrackInput).max(20).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.acceptingStudents && value.capacity === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["acceptingStudents"],
      message: "A supervisor cannot accept students when capacity is zero",
    });
  }

  const trackTitles = new Set<string>();
  value.tracks.forEach((track, trackIndex) => {
    const key = track.title.toLocaleLowerCase();
    if (trackTitles.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tracks", trackIndex, "title"],
        message: "Research track titles must be unique",
      });
    }
    trackTitles.add(key);

    const ideaTitles = new Set<string>();
    track.ideas.forEach((idea, ideaIndex) => {
      const ideaKey = idea.title.toLocaleLowerCase();
      if (ideaTitles.has(ideaKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tracks", trackIndex, "ideas", ideaIndex, "title"],
          message: "Project idea titles must be unique within a research track",
        });
      }
      ideaTitles.add(ideaKey);
    });
  });
});
export type UpsertFinalProjectSupervisorProfileInput = z.infer<
  typeof UpsertFinalProjectSupervisorProfileInput
>;

export interface FinalProjectIdea {
  id: string;
  title: string;
  summary: string;
  skills: string[];
  sortOrder: number;
}

export interface FinalProjectResearchTrack {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  ideas: FinalProjectIdea[];
}

export interface FinalProjectSupervisorProfile {
  id: string;
  programmeId: string;
  lecturer: {
    id: string;
    name: string;
    honorific: string | null;
    academicPosition: string | null;
    qualification: string | null;
    fieldOfSpecialization: string | null;
  };
  statement: string;
  capacity: number;
  currentLoad: number;
  availableSlots: number;
  acceptingStudents: boolean;
  isPublished: boolean;
  tracks: FinalProjectResearchTrack[];
  createdAt: string;
  updatedAt: string;
}

export interface FinalProjectSupervisorOverview {
  programmeId: string;
  totalSupervisors: number;
  publishedSupervisors: number;
  acceptingSupervisors: number;
  totalCapacity: number;
  currentLoad: number;
  availableSlots: number;
  supervisors: FinalProjectSupervisorProfile[];
}
