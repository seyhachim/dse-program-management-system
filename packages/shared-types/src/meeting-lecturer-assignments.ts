import { z } from "zod";

/**
 * Explicit lecturer ownership for recurring OfferingMeeting rows.
 *
 * The persisted assignment uses the meeting's recurring schedule signature rather
 * than the transient OfferingMeeting id because the current Offering editor may
 * replace meeting rows during a timetable edit. API clients still address the
 * current meeting by id; the backend resolves that id to the stable signature.
 */
export const MeetingLecturerAssignmentItemSchema = z.object({
  meetingId: z.string().uuid(),
  lecturerIds: z
    .array(z.string().uuid())
    .max(20)
    .superRefine((ids, ctx) => {
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate lecturer assignment" });
      }
    }),
});
export type MeetingLecturerAssignmentItem = z.infer<typeof MeetingLecturerAssignmentItemSchema>;

export const ReplaceMeetingLecturerAssignmentsSchema = z.object({
  assignments: z
    .array(MeetingLecturerAssignmentItemSchema)
    .max(20)
    .superRefine((items, ctx) => {
      const ids = items.map((item) => item.meetingId);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate meeting assignment" });
      }
    }),
});
export type ReplaceMeetingLecturerAssignments = z.infer<typeof ReplaceMeetingLecturerAssignmentsSchema>;

export const MEETING_LECTURER_ASSIGNMENT_SOURCES = [
  "EXPLICIT",
  "SOLE_LECTURER_DEFAULT",
  "UNASSIGNED",
] as const;
export const MeetingLecturerAssignmentSourceSchema = z.enum(MEETING_LECTURER_ASSIGNMENT_SOURCES);
export type MeetingLecturerAssignmentSource = z.infer<typeof MeetingLecturerAssignmentSourceSchema>;

export interface MeetingLecturerAssignmentViewItem {
  meetingId: string;
  lecturerIds: string[];
  source: MeetingLecturerAssignmentSource;
}

export interface MeetingLecturerAssignmentsView {
  offeringId: string;
  meetings: MeetingLecturerAssignmentViewItem[];
}
