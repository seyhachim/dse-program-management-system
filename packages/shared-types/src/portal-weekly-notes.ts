export interface PortalWeeklyNoteEntry {
  week: number | null;
  date: string;
  classHeld: boolean;
  lecturerName: string | null;
  topic: string;
  learningSummary: string;
}

export interface PortalWeeklyNotesView {
  offeringId: string;
  currentWeek: number | null;
  entries: PortalWeeklyNoteEntry[];
}
