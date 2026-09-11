import { z } from "zod";
import { DateOnlySchema } from "./offerings.ts";

/**
 * Privacy-safe projection of one approved teaching-session change for students.
 *
 * Keep this contract intentionally independent from the private teaching-leave
 * request DTO: no leave reason, attachment, reviewer comment, requester identity,
 * audit metadata, or internal request id may cross this boundary.
 */
export const PortalScheduleImpactSchema = z.object({
  occurrenceId: z.string().uuid(),
  offeringId: z.string().uuid(),
  meetingId: z.string().uuid(),
  sessionDate: DateOnlySchema,
  state: z.literal("cancelled"),
  originalStartTime: z.string().min(1),
  originalEndTime: z.string().min(1),
  originalRoom: z.string().nullable(),
}).strict();

export type PortalScheduleImpact = z.infer<typeof PortalScheduleImpactSchema>;

export const PortalScheduleImpactListSchema = z.array(PortalScheduleImpactSchema);
