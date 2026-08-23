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

export const StudentHandbookFontFamilySchema = z.enum([
  "Arial",
  "Calibri",
  "Times New Roman",
]);
export type StudentHandbookFontFamily = z.infer<typeof StudentHandbookFontFamilySchema>;

export const StudentHandbookTextAlignmentSchema = z.enum([
  "left",
  "center",
  "right",
  "justify",
]);
export type StudentHandbookTextAlignment = z.infer<typeof StudentHandbookTextAlignmentSchema>;

export const StudentHandbookDocumentThemeSchema = z.object({
  bodyFontFamily: StudentHandbookFontFamilySchema,
  bodyFontSizePt: z.number().min(9).max(14),
  heading1SizePt: z.number().min(14).max(26),
  heading2SizePt: z.number().min(12).max(22),
  heading3SizePt: z.number().min(11).max(18),
  lineHeight: z.number().min(1).max(2),
  paragraphSpacingPt: z.number().min(0).max(24),
  defaultAlignment: StudentHandbookTextAlignmentSchema,
  marginsMm: z.object({
    top: z.number().min(10).max(40),
    bottom: z.number().min(10).max(40),
    left: z.number().min(10).max(40),
    right: z.number().min(10).max(40),
  }),
  showHeader: z.boolean(),
  showFooter: z.boolean(),
  showPageNumbers: z.boolean(),
});
export type StudentHandbookDocumentTheme = z.infer<typeof StudentHandbookDocumentThemeSchema>;

export const DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME: StudentHandbookDocumentTheme = {
  bodyFontFamily: "Arial",
  bodyFontSizePt: 11,
  heading1SizePt: 18,
  heading2SizePt: 15,
  heading3SizePt: 13,
  lineHeight: 1.15,
  paragraphSpacingPt: 6,
  defaultAlignment: "justify",
  marginsMm: { top: 25, bottom: 25, left: 25, right: 25 },
  showHeader: true,
  showFooter: true,
  showPageNumbers: true,
};

export const UpdateStudentHandbookThemeSchema = StudentHandbookDocumentThemeSchema;
export type UpdateStudentHandbookThemeInput = z.infer<typeof UpdateStudentHandbookThemeSchema>;

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
