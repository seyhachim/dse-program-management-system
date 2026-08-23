import { z } from "zod";
import type { PluginManifest } from "./plugins.ts";

export const StudentHandbookStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "CHANGES_REQUESTED",
  "APPROVED",
  "PUBLISHED",
]);
export type StudentHandbookStatus = z.infer<typeof StudentHandbookStatusSchema>;

export const StudentHandbookBlockTypeSchema = z.enum(["NARRATIVE", "SOURCE_DATA"]);
export type StudentHandbookBlockType = z.infer<typeof StudentHandbookBlockTypeSchema>;

export const StudentHandbookSourceKindSchema = z.enum([
  "CURRICULUM_SUMMARY",
  "PROGRAMME_PROFILE",
  "PROGRAMME_CONTACT",
]);
export type StudentHandbookSourceKind = z.infer<typeof StudentHandbookSourceKindSchema>;

export const CreateStudentHandbookSchema = z.object({
  programmeId: z.string().trim().min(1),
  assignedLecturerId: z.string().uuid(),
  version: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(160).default("Student Handbook"),
});
export type CreateStudentHandbookInput = z.infer<typeof CreateStudentHandbookSchema>;

export const AssignStudentHandbookLecturerSchema = z.object({
  assignedLecturerId: z.string().uuid(),
});
export type AssignStudentHandbookLecturerInput = z.infer<
  typeof AssignStudentHandbookLecturerSchema
>;

const NarrativeBlockInputSchema = z.object({
  type: z.literal("NARRATIVE"),
  content: z.string().max(100_000),
});

const SourceDataBlockInputSchema = z.object({
  type: z.literal("SOURCE_DATA"),
  sourceKind: StudentHandbookSourceKindSchema,
  label: z.string().trim().min(1).max(120).optional(),
});

export const SaveStudentHandbookSectionSchema = z.object({
  blocks: z.array(z.discriminatedUnion("type", [NarrativeBlockInputSchema, SourceDataBlockInputSchema])).max(100),
});
export type SaveStudentHandbookSectionInput = z.infer<typeof SaveStudentHandbookSectionSchema>;

export const CreateStudentHandbookSectionSchema = z.object({
  title: z.string().trim().min(1).max(160),
});
export type CreateStudentHandbookSectionInput = z.infer<typeof CreateStudentHandbookSectionSchema>;

export const RenameStudentHandbookSectionSchema = z.object({
  title: z.string().trim().min(1).max(160),
});
export type RenameStudentHandbookSectionInput = z.infer<typeof RenameStudentHandbookSectionSchema>;

export const ReorderStudentHandbookSectionsSchema = z.object({
  sectionIds: z.array(z.string().uuid()).min(1).max(100),
});
export type ReorderStudentHandbookSectionsInput = z.infer<typeof ReorderStudentHandbookSectionsSchema>;

export const StudentHandbookReviewSchema = z.object({
  note: z.string().trim().max(2_000).default(""),
});
export type StudentHandbookReviewInput = z.infer<typeof StudentHandbookReviewSchema>;

export type StudentHandbookSourcePreview = {
  kind: StudentHandbookSourceKind;
  label: string;
  readOnly: true;
  data: unknown;
  snapshot: boolean;
};

export type StudentHandbookBlockView = {
  id: string;
  type: StudentHandbookBlockType;
  sortOrder: number;
  content: string | null;
  sourceKind: StudentHandbookSourceKind | null;
  label: string | null;
  sourcePreview: StudentHandbookSourcePreview | null;
};

export type StudentHandbookSectionView = {
  id: string;
  key: string;
  title: string;
  sortOrder: number;
  isCore: boolean;
  blocks: StudentHandbookBlockView[];
};

export type StudentHandbookOwnerView = {
  id: string;
  name: string;
  email: string;
};

export type StudentHandbookView = {
  id: string;
  programmeId: string;
  title: string;
  version: string;
  status: StudentHandbookStatus;
  assignedLecturer: StudentHandbookOwnerView;
  submittedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sections: StudentHandbookSectionView[];
};

export const studentHandbookManifest: PluginManifest = {
  id: "student-handbook",
  name: "Student Handbook",
  version: "0.1.0",
  description:
    "Single-owner Student Handbook authoring with read-only authoritative PMS data blocks and controlled review/publishing.",
  routes: [
    {
      label: "Student Handbook",
      path: "/student-handbook",
      icon: "file-text",
      roles: ["admin", "program_coordinator", "lecturer"],
      group: "Curriculum",
    },
  ],
};
