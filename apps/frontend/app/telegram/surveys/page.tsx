"use client";

import { useEffect, useState } from "react";
import { telegramApi } from "../telegram-client";

type Survey = { offeringId: string; courseCode: string; courseTitle: string; submitted: boolean };

export default function TelegramSurveysPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selected, setSelected] = useState<Survey | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { void telegramApi<Survey[]>("/api/telegram/mini/surveys").then(setSurveys).catch((e) => setMessage(e instanceof Error ? e.message : "Could not load surveys")); }, []);

  async function submit(form: HTMLFormElement) {
    if (!selected) return;
    const data = new FormData(form);
    setSaving(true); setMessage("");
    try {
      await telegramApi(`/api/telegram/mini/surveys/${encodeURIComponent(selected.offeringId)}`, {
        method: "POST",
        body: JSON.stringify({
          overallRating: Number(data.get("overallRating")),
          teachingClarityRating: Number(data.get("teachingClarityRating")),
          assessmentClarityRating: Number(data.get("assessmentClarityRating")),
          workload: String(data.get("workload")),
          positiveComment: String(data.get("positiveComment") ?? ""),
          improvementComment: String(data.get("improvementComment") ?? ""),
        }),
      });
      setSurveys((items) => items.map((item) => item.offeringId === selected.offeringId ? { ...item, submitted: true } : item));
      setSelected(null); setMessage("Survey submitted anonymously.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not submit survey"); }
    finally { setSaving(false); }
  }

  return <section className="space-y-4"><a href="/telegram" className="text-sm text-slate-500">← Home</a><div><h1 className="text-2xl font-semibold">Course surveys</h1><p className="text-sm text-slate-500">Responses use the existing anonymous PMS feedback flow.</p></div>{message ? <p className="text-sm text-slate-600">{message}</p> : null}<div className="space-y-2">{surveys.map((survey) => <button key={survey.offeringId} type="button" disabled={survey.submitted} onClick={() => setSelected(survey)} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left disabled:opacity-60"><p className="font-medium">{survey.courseCode}</p><p className="text-sm text-slate-600">{survey.courseTitle}</p><p className="mt-1 text-xs text-slate-500">{survey.submitted ? "Submitted" : "2-minute final survey"}</p></button>)}</div>{selected ? <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}><h2 className="font-semibold">{selected.courseCode} survey</h2>{[["overallRating","Overall"],["teachingClarityRating","Teaching clarity"],["assessmentClarityRating","Assessment clarity"]].map(([name,label]) => <label key={name} className="block text-sm">{label}<select name={name} defaultValue="5" className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3"><option value="5">5 — Excellent</option><option value="4">4 — Good</option><option value="3">3 — Fair</option><option value="2">2 — Needs improvement</option><option value="1">1 — Poor</option></select></label>)}<label className="block text-sm">Workload<select name="workload" defaultValue="appropriate" className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3"><option value="light">Light</option><option value="appropriate">Appropriate</option><option value="heavy">Heavy</option></select></label><label className="block text-sm">What worked well?<textarea name="positiveComment" className="mt-1 w-full rounded-lg border border-slate-200 p-3" rows={3} /></label><label className="block text-sm">What should improve?<textarea name="improvementComment" className="mt-1 w-full rounded-lg border border-slate-200 p-3" rows={3} /></label><div className="flex gap-2"><button disabled={saving} className="min-h-11 flex-1 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white">{saving ? "Submitting…" : "Submit anonymously"}</button><button type="button" onClick={() => setSelected(null)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button></div></form> : null}</section>;
}
