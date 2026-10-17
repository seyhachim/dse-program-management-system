"use client";

import { useState, type FormEvent } from "react";
import { Pin, Save, X } from "lucide-react";
import type { StudentSemesterNoteView } from "@dse-pms/shared-types";
import { offeringsApi } from "@/lib/offerings";

export function SemesterNoteButton({
  note, onClick,
}: {
  note: StudentSemesterNoteView | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={note?.note ? "Edit persistent student note" : "Add persistent student note"}
      title={note?.note ? "Edit note visible across all 16 weeks" : "Add note visible across all 16 weeks"}
      className="flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
    >
      <Pin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{note?.note ? note.note : "Semester note"}</span>
    </button>
  );
}

/** Private note editor; never changes attendance records or local roll-call drafts. */
export function SemesterNoteEditor({
  offeringId, studentId, studentName, current, readOnly, onClose, onSaved,
}: {
  offeringId: string;
  studentId: string;
  studentName: string;
  current: StudentSemesterNoteView | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: (saved: StudentSemesterNoteView) => void;
}) {
  const [draft, setDraft] = useState(current?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = draft.trim() !== (current?.note ?? "");

  function close() {
    if (saving) return;
    if (dirty && !window.confirm("Discard your unsaved student semester note?")) return;
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || readOnly || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const result = await offeringsApi.saveSemesterNote(offeringId, studentId, {
        note: draft.trim(),
        expectedVersion: current?.version ?? 0,
      });
      onSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save student semester note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="semester-note-title" className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 id="semester-note-title" className="font-semibold">Persistent student note</h2>
            <p className="text-sm text-muted-foreground">{studentName} · Visible in all 16 weeks of this class</p>
          </div>
          <button type="button" aria-label="Close student semester note" onClick={close} disabled={saving} className="rounded-md p-2 hover:bg-muted disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={(event) => { void submit(event); }} className="mt-4 space-y-3">
          <label htmlFor="student-semester-note" className="block text-sm font-medium">
            Lecturer-only note
          </label>
          <textarea
            id="student-semester-note"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            rows={5}
            readOnly={readOnly}
            placeholder="Example: Offer additional support during the next tutorial."
            className="w-full rounded-md border border-input bg-background p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">Saved independently of attendance. Not shown to students. Each edit is recorded in private history. {draft.length}/1000 characters.</p>
          {readOnly ? <p className="text-sm text-muted-foreground">Historical or completed class notes are read-only.</p> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={close} disabled={saving} className="min-h-10 rounded-md border border-border px-4 text-sm">Close</button>
            {!readOnly ? <button type="submit" disabled={!dirty || saving} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save note"}
            </button> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
