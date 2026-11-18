"use client";

import { useEffect, useState, type FormEvent } from "react";
import { studentPortalApi, type PermissionDocumentView } from "@/lib/student-portal";

const MAX_SIZE = 5 * 1024 * 1024;

/** Shown only for a student's own canonical Permission Pending attendance dates. */
export function PortalPermissionLetterUpload({ offeringId, date }: { offeringId: string; date: string }) {
  const [submitted, setSubmitted] = useState<PermissionDocumentView | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSubmitted(null);
    setError("");
    void studentPortalApi.permissionLetter(offeringId, date)
      .then((document) => { if (active) setSubmitted(document); })
      .catch(() => { if (active) setError("Could not check your permission letter status."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [offeringId, date]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || sending) return;
    if (file.size === 0 || file.size > MAX_SIZE ||
        !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setError("Choose a PDF, JPG or PNG smaller than 5 MB.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const saved = await studentPortalApi.uploadPermissionLetter(offeringId, date, file);
      setSubmitted(saved);
      setFile(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit the permission letter.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
      <p className="font-medium text-foreground">Permission letter</p>
      {loading ? <p className="mt-1 text-xs text-muted-foreground">Checking your submission…</p> : submitted ? (
        <div className="mt-1">
          <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">
            Submitted for lecturer review. This does not approve attendance automatically.
          </p>
          <p className="mt-1 break-all text-xs text-muted-foreground">{submitted.filename}</p>
        </div>
      ) : (
        <form onSubmit={(event) => void upload(event)} className="mt-2 space-y-2">
          <label className="block text-xs text-muted-foreground" htmlFor={"letter-" + date}>
            Upload your official permission letter (PDF, JPG or PNG; max 5 MB)
          </label>
          <input id={"letter-" + date} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="block w-full max-w-xs text-xs text-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1"
            disabled={sending}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          <button type="submit" disabled={!file || sending}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            {sending ? "Submitting…" : "Submit permission letter"}
          </button>
          <p className="text-xs text-muted-foreground">The lecturer must still review your letter and resolve Permission Pending.</p>
        </form>
      )}
      {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
