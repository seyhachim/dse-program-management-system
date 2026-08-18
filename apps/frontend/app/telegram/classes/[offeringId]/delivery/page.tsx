"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { telegramApi } from "../../../telegram-client";

type LecturerArrivalStatus = "Present" | "NotYet";
type ClassSessionStatus = "Scheduled" | "Holiday" | "Cancelled" | "Rescheduled" | "Other";
type ActorKind = "Lecturer" | "ClassMonitor" | "SubClassMonitor" | "ProgrammeManager";

type Access = {
  actorKind: ActorKind;
  responsibilityAssignmentId: string | null;
  canRecordArrival: boolean;
  canManageSession: boolean;
};

type Confirmation = {
  id: string;
  offeringId: string;
  date: string;
  status: LecturerArrivalStatus;
  note: string;
  recordedBy: { id: string; name: string };
  recordedAt: string;
  updatedAt: string;
};

type Session = {
  id: string;
  offeringId: string;
  date: string;
  status: ClassSessionStatus;
  reason: string;
  recordedBy: { id: string; name: string };
  recordedAt: string;
  updatedAt: string;
};

type DeliveryResponse = {
  access: Access;
  confirmation: Confirmation | null;
  session: Session | null;
};

type SaveArrivalResponse = Omit<DeliveryResponse, "confirmation"> & {
  confirmation: Confirmation;
  changed: boolean;
};
type SaveSessionResponse = {
  access: Access;
  confirmation: Confirmation | null;
  session: Session;
  changed: boolean;
};

const SESSION_OPTIONS: Array<{ value: ClassSessionStatus; label: string }> = [
  { value: "Scheduled", label: "Scheduled" },
  { value: "Holiday", label: "Holiday" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "Rescheduled", label: "Rescheduled" },
  { value: "Other", label: "Other" },
];

function localDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function sessionLabel(status: ClassSessionStatus) {
  if (status === "Scheduled") return "Scheduled class";
  if (status === "Holiday") return "Holiday — lecturer arrival not applicable";
  if (status === "Cancelled") return "Cancelled — lecturer arrival not applicable";
  if (status === "Rescheduled") return "Rescheduled — lecturer arrival not applicable";
  return "Other class exception — lecturer arrival not applicable";
}

export default function TelegramClassDeliveryPage({ params }: { params: Promise<{ offeringId: string }> }) {
  const { offeringId } = use(params);
  const [date, setDate] = useState(localDate);
  const [data, setData] = useState<DeliveryResponse | null>(null);
  const [note, setNote] = useState("");
  const [sessionStatus, setSessionStatus] = useState<ClassSessionStatus>("Scheduled");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    setMessage("");
    try {
      const result = await telegramApi<DeliveryResponse>(
        `/api/telegram/mini/classes/${encodeURIComponent(offeringId)}/lecturer-arrival/${date}`,
      );
      setData(result);
      setNote(result.confirmation?.note ?? "");
      setSessionStatus(result.session?.status ?? "Scheduled");
      setReason(result.session?.reason ?? "");
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : "Could not load class delivery status");
    }
  }, [date, offeringId]);

  useEffect(() => { void load(); }, [load]);

  async function confirm(status: LecturerArrivalStatus) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await telegramApi<SaveArrivalResponse>(
        `/api/telegram/mini/classes/${encodeURIComponent(offeringId)}/lecturer-arrival/${date}`,
        { method: "PUT", body: JSON.stringify({ status, note }) },
      );
      setData(result);
      setNote(result.confirmation.note);
      setMessage(result.changed ? "Lecturer arrival recorded." : "Already recorded — no duplicate change was created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save lecturer arrival");
    } finally {
      setSaving(false);
    }
  }

  async function saveSession() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await telegramApi<SaveSessionResponse>(
        `/api/telegram/mini/classes/${encodeURIComponent(offeringId)}/session-status/${date}`,
        { method: "PUT", body: JSON.stringify({ status: sessionStatus, reason }) },
      );
      setData({ access: result.access, confirmation: result.confirmation, session: result.session });
      setSessionStatus(result.session.status);
      setReason(result.session.reason);
      setMessage(result.changed ? "Official class-session status recorded." : "Session status is already recorded with the same reason.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save class-session status");
    } finally {
      setSaving(false);
    }
  }

  const effectiveSessionStatus = data?.session?.status ?? "Scheduled";
  const arrivalApplicable = effectiveSessionStatus === "Scheduled";

  return (
    <section className="space-y-5">
      <Link href={`/telegram/classes/${encodeURIComponent(offeringId)}`} className="text-sm text-slate-500">← Class</Link>
      <header>
        <p className="text-sm font-medium text-slate-500">Class delivery</p>
        <h1 className="text-2xl font-semibold">Session & lecturer arrival</h1>
        <p className="mt-1 text-sm text-slate-500">
          Monitors and assigned lecturers record arrival. Programme management controls official session exceptions.
        </p>
      </header>

      <label className="block rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium">
        Class date
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3"
        />
      </label>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{message}</p> : null}

      {data ? (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Your authorization</p>
            <p className="mt-1 font-semibold">{data.access.actorKind}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {data.access.canRecordArrival ? "Can record lecturer arrival. " : "Lecturer arrival is read-only. "}
              {data.access.canManageSession ? "Can manage official class-session status." : "Official session status is read-only."}
            </p>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Class session</p>
              <p className="mt-1 text-lg font-semibold">{sessionLabel(effectiveSessionStatus)}</p>
              {data.session?.reason ? <p className="mt-1 text-sm text-slate-600">Reason: {data.session.reason}</p> : null}
              {data.session ? (
                <p className="mt-1 text-xs text-slate-500">
                  Recorded by {data.session.recordedBy.name} · {new Date(data.session.recordedAt).toLocaleString()}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">No exception recorded; treated as a scheduled class.</p>
              )}
            </div>

            {data.access.canManageSession ? (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <label className="block text-sm font-medium">
                  Official session status
                  <select
                    value={sessionStatus}
                    onChange={(event) => setSessionStatus(event.target.value as ClassSessionStatus)}
                    className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
                  >
                    {SESSION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Reason / note (optional)
                  <textarea
                    value={reason}
                    maxLength={500}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    placeholder="e.g. Public holiday, make-up class moved to Friday…"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                  <span className="mt-1 block text-right text-xs text-slate-400">{reason.length}/500</span>
                </label>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveSession()}
                  className="min-h-11 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Save session status
                </button>
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Lecturer arrival</p>
              <p className="mt-1 text-xl font-semibold">
                {!arrivalApplicable
                  ? "Not applicable"
                  : data.confirmation?.status === "Present"
                    ? "Lecturer present"
                    : data.confirmation?.status === "NotYet"
                      ? "Not yet"
                      : "Not recorded"}
              </p>
              {data.confirmation ? (
                <>
                  <p className="mt-1 text-xs text-slate-500">
                    Recorded by {data.confirmation.recordedBy.name} · {new Date(data.confirmation.recordedAt).toLocaleString()}
                  </p>
                  {data.confirmation.note ? <p className="mt-2 text-sm text-slate-600">Note: {data.confirmation.note}</p> : null}
                </>
              ) : null}
            </div>

            {!arrivalApplicable ? (
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                Arrival recording is disabled because this session is marked {effectiveSessionStatus.toLowerCase()}.
              </p>
            ) : data.access.canRecordArrival ? (
              <>
                <label className="block text-sm font-medium">
                  Note / reason (optional)
                  <textarea
                    value={note}
                    maxLength={500}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    placeholder="e.g. Lecturer informed the class they will arrive shortly…"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                  <span className="mt-1 block text-right text-xs text-slate-400">{note.length}/500</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void confirm("Present")}
                    className="min-h-16 rounded-xl bg-slate-950 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
                  >
                    Present
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void confirm("NotYet")}
                    className="min-h-16 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold disabled:opacity-50"
                  >
                    Not Yet
                  </button>
                </div>
              </>
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">You can view this arrival record but cannot change it.</p>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
