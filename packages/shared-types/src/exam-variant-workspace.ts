/** Private staff workspace DTOs; never use these in student/public routes. */
export type ExamWorkspaceQuestion = { questionId: string; maxPoints: number; cloCode: string; evidence: "direct" | "supporting" };
export type ExamWorkspaceSnapshot = { programmeId: string; courseSpecId: string; assessmentItemId: string; variantId: string; revision: number; instrumentId: string; instrumentHash: string; examMaximum: number; questions: readonly ExamWorkspaceQuestion[]; variantHash: string };
export type ExamWorkspaceAssignment = { id: string; revision: number; variantId: string; variantHash: string };
export type ExamWorkspaceHistory = { revision: number; previousVariantId: string | null; previousVariantHash: string | null; variantId: string; variantHash: string; actorId: string; reason: string; evidenceRef: string; changedAt: string };
export type ExamWorkspace = {
  actorId: string; offeringId: string; assessmentItemId: string; offeringStatus: string;
  canPrepare: boolean; canReview: boolean; canAssign: boolean; activeCloCodes: string[]; examMaximum: number | null;
  instruments: { id: string; name: string; criterionRows: { id: string; maxPoints: number | null }[] }[];
  papers: { variantId: string; variantHash: string; revision: number; permitted: boolean }[];
  submissions: { id: string; submittedById: string; submittedAt: string; status: "Pending" | "Approved" | "Returned"; decidedById: string | null; decidedAt: string | null; decisionRef: string | null; snapshot: ExamWorkspaceSnapshot }[];
  roster: { enrollmentId: string; name: string; studentId: string | null; eligible: boolean; hasResult: boolean; grade: { revision: number; complete: boolean } | null; assignment: ExamWorkspaceAssignment | null }[];
};
export type ExamWorkspaceScope = { offeringId: string; assessmentItemId: string };
export type ExamWorkspacePrepare = ExamWorkspaceScope & { variantId: string; revision: number; instrumentId: string; examMaximum: number; mappings: Pick<ExamWorkspaceQuestion,"questionId"|"cloCode"|"evidence">[] };
export type ExamWorkspaceDecision = ExamWorkspaceScope & { submissionId: string; expectedHash: string; decision: "Approved"|"Returned"; decisionRef: string };
export type ExamWorkspaceAssignmentEntry = { enrollmentId: string; variantId: string; variantHash: string; expectedRevision: number; reason: string; evidenceRef: string };

export type ExamGradeMark = { questionId: string; maxPoints: number; score: number | null };
export type ExamGradeWorkspace = { assignment: ExamWorkspaceAssignment; snapshot: ExamWorkspaceSnapshot; canEdit: boolean; gradeRevision: number; complete: boolean; earnedPoints: number | null; maximumPoints: number; marks: ExamGradeMark[]; savedAt: string | null };
export type SaveExamGradeDraft = ExamWorkspaceScope & { enrollmentId: string; assignmentId: string; assignmentRevision: number; variantHash: string; expectedGradeRevision: number; marks: { questionId: string; score: number | null }[] };
