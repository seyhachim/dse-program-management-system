"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { telegramApi } from "../../../telegram-client";

type LecturerArrivalStatus = "Present" | "NotYet";

type DeliveryResponse = {
  access: {
    actorKind: "Lecturer" | "ClassMonitor" | "SubClassMonitor";
    responsibilityAssignmentId: string | null;
  };
  confirmation: null | {
    id: string;
    offeringId: string;
    date: string;
    status: LecturerArrivalStatus;
    recordedBy: { id: string; name: string };
    recordedAt: string;
    updatedAt: string;
  };
};

type SaveResponse = DeliveryResponse & { changed: boolean };

function localDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function TelegramClassDeliveryPage({ params }: { params: Promise<{ offeringId: string }> }) {
  const { offeringId } = use(params);
  const [date, setDate] = useState(localDate);
  const [data, setData] = useState<DeliveryResponse | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    setMessage("");
    try {
      setData(await telegramApi<DeliveryResponse>(
        `/api/telegram/mini/classes/${encodeURIComponent(offeringId)}/lecturer-arrival/${date}`,
      ));
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
      const result = await telegramApi<SaveResponse>(
        `/api/telegram/mini/classes/${encodeURIComponent(offeringId)}/lecturer-arrival/${date}`,
        { method: "PUT", body: JSON.stringify({ status }) },
      );
      setData(result);
      setMessage(result.changed ? "Class delivery status recorded." : "Already recorded — no duplicate change was created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save class delivery status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <Link href={`/telegram/classes/${encodeURIComponent(offeringId)}`} className="text-sm text-slate-500">← Class</Link>
      <header>
        <p className="text-sm font-medium text-slate-500">Class delivery</p>
        <h1 className="text-2xl font-semibold">Lecturer arrival</h1>
        <p className="mt-1 text-sm text-slate-500">For assigned lecturers and current Class Monitor / Sub-class Monitor only.</p>
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
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Your authorization</p>
            <p className="mt-1 font-semibold">{data.access.actorKind}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current state</p>
            <p className="mt-1 text-xl font-semibold">
              {data.confirmation?.status === "Present" ? "Lecturer present" : data.confirmation?.status === "NotYet" ? "Not yet" : "Not recorded"}
            </p>
            {data.confirmation ? (
              <p className="mt-1 text-xs text-slate-500">
                Recorded by {data.confirmation.recordedBy.name} · {new Date(data.confirmation.recordedAt).toLocaleString()}
              </p>
            ) : null}
          </div>

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
        </div>
      ) : null}
    </section>
  );
}
