import { z } from "zod";
import {
  QaSarBookPart3CriterionRatingSchema,
  QaSarBookPart3ImprovementActionSchema,
  QaSarBookPart3NarrativeAssociationSchema,
} from "./qa-sar-book-part3.ts";

export const QaSarBookPart3SnapshotSchema = z.object({
  programmeId: z.string().trim().min(1),
  cycleId: z.string().uuid(),
  capturedAt: z.string().datetime(),
  note: z.literal(
    "Human self-assessment only — ratings are not external assessor scores or an accreditation verdict.",
  ),
  criteria: z.array(QaSarBookPart3CriterionRatingSchema),
  associations: z.array(QaSarBookPart3NarrativeAssociationSchema),
  improvementActions: z.array(QaSarBookPart3ImprovementActionSchema),
});

export type QaSarBookPart3Snapshot = z.infer<typeof QaSarBookPart3SnapshotSchema>;
