"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { telegramApi } from "../telegram-client";

type ResultCourse = {
  offeringId: string;
  code: string;
  title: string;
  finalGrade?: number | null;
  cloAchievement?: Array<{ cloCode?: string; code?: string; achievement?: number; percentage?: number }>;
  assessments: Array<{ id?: string; title: string; maxScore?: number; result?: { score: number; feedback?: string } | null }>;
};

export default function TelegramResultsPage() {
  const [courses, setCourses] = useState<ResultCourse[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void telegramApi<ResultCourse[]>("/api/telegram/mini/results").then(setCourses).catch((e) => setError(e instanceof Error ? e.message : "Could not load results")); }, []);
  return <section className="space-y-4"><Link href="/telegram" className="text-sm text-slate-500">← Home</Link><div><h1 className="text-2xl font-semibold">Results & CLO</h1><p className="text-sm text-slate-500">Published PMS results only.</p></div>{error ? <p className="text-sm text-red-700">{error}</p> : null}{courses.map((course) => <article key={course.offeringId} className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{course.code} · {course.title}</h2><div className="mt-3 space-y-2">{course.assessments.map((assessment, index) => <div key={assessment.id ?? `${course.offeringId}-${index}`} className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2 text-sm"><div><p>{assessment.title}</p>{assessment.result?.feedback ? <p className="text-xs text-slate-500">{assessment.result.feedback}</p> : null}</div><strong>{assessment.result ? `${assessment.result.score}${assessment.maxScore ? ` / ${assessment.maxScore}` : ""}` : "Not published"}</strong></div>)}</div>{course.cloAchievement?.length ? <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CLO achievement</p><div className="mt-2 flex flex-wrap gap-2">{course.cloAchievement.map((clo, index) => <span key={index} className="rounded-full bg-slate-100 px-3 py-1 text-xs">{clo.cloCode ?? clo.code ?? `CLO ${index + 1}`}: {Math.round(clo.achievement ?? clo.percentage ?? 0)}%</span>)}</div></div> : null}</article>)}</section>;
}
