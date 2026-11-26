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
export type ExamGradeWorkspace = { assignment: ExamWorkspaceAssignment; snapshot: ExamWorkspaceSnapshot; canEdit: boolean; academicDossierId: string|null; savedDossierId: string|null; blueprint: ExamAcademicBlueprint|null; feedback: ExamQuestionFeedback[]; canModerate: boolean; sampleModeration: ExamSampleModeration|null; gradeRevision: number; complete: boolean; questionLabels: Record<string,string>; earnedPoints: number | null; maximumPoints: number; marks: ExamGradeMark[]; savedAt: string | null };
export type SaveExamGradeDraft = ExamWorkspaceScope & { enrollmentId: string; assignmentId: string; assignmentRevision: number; variantHash: string; expectedGradeRevision: number; marks: { questionId: string; score: number | null }[]; feedback?: ExamQuestionFeedback[] };

export type ExamBloomLevel = "Remember"|"Understand"|"Apply"|"Analyze"|"Evaluate"|"Create";
export type ExamAcademicComponentInput = {questionId:string;parentLabel:string;componentLabel:string;topic:string;bloom:ExamBloomLevel;expectedAnswerRef:string;partialCredit:string};
export type ExamAcademicBlueprintInput = {durationMinutes:number;conditions:string;restrictedSchemeRef:string;components:ExamAcademicComponentInput[]};
export type ExamAcademicBlueprint = Omit<ExamAcademicBlueprintInput,"components"> & {components:(ExamAcademicComponentInput & ExamWorkspaceQuestion)[]};
export type ExamAcademicDistribution = {cloCode:string;evidence:"direct"|"supporting";bloom:ExamBloomLevel;points:number}[];
export type ExamAcademicDossier = {id:string;offeringId:string;variantId:string;variantHash:string;blueprint:ExamAcademicBlueprint;baselineId:string|null;submittedById:string;submittedAt:string;status:"Pending"|"Approved"|"Returned";decidedById:string|null;decidedAt:string|null;review:unknown;distribution:ExamAcademicDistribution};
export type ExamAcademicWorkspace = {snapshot:ExamWorkspaceSnapshot;dossiers:ExamAcademicDossier[];baseline:{id:string;variantId:string;variantHash:string;durationMinutes:number;conditions:string;distribution:ExamAcademicDistribution}|null;canSubmit:boolean;canReview:boolean;questionLabels:Record<string,string>};
export type ExamQuestionFeedback = {questionId:string;comment:string};
export type ExamSampleModeration = {gradeRevision:number;reviewerId:string;outcome:"Accepted"|"ChangesRequired";reason:string;sampleRef:string;reviewedAt:string};

export type ExamCloPreviewStatus = "ineligible"|"unassigned"|"ungraded"|"incomplete"|"unverified"|"changes-required"|"available";
export type ExamCloPreviewRow = {cloCode:string;role:"direct"|"supporting";population:number;eligible:number;mapped:number;notMapped:number;unknownMapping:number;available:number;missing:number;meanPercentage:number|null;meetsScenarioCount:number|null;meetsScenarioRate:number|null};
export type ExamCloPreviewStudent = {enrollmentId:string;eligible:boolean;status:ExamCloPreviewStatus;assignmentId:string|null;assignmentRevision:number|null;variantId:string|null;variantHash:string|null;instrumentHash:string|null;gradeRevision:number|null;dossierId:string|null;approvedDossierId:string|null;sampleOutcome:"Accepted"|"ChangesRequired"|null;evidence:{cloCode:string;role:"direct"|"supporting";state:ExamCloPreviewStatus|"not-mapped";plannedMaximum:number|null;earnedPoints:number|null;percentage:number|null;meetsScenario:boolean|null;questionIds:string[]}[]};
export type ExamCloPreview = {calculationVersion:string;kind:"private-exam-draft-preview";official:false;scope:{programmeId:string;courseSpecId:string;assessmentItemId:string;offeringId:string;activeCloCodes:string[]};scenarioThreshold:number|null;population:number;students:ExamCloPreviewStudent[];rows:ExamCloPreviewRow[];byPaper:{variantId:string;variantHash:string;population:number;rows:ExamCloPreviewRow[]}[];calculationHash:string};
