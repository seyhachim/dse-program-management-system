"use client";

import { useEffect, useState } from "react";
import { telegramApi } from "../telegram-client";

type Announcement = {
  id: string;
  title: string;
  body: string;
  pinned?: boolean;
  publishedAt?: string | null;
  courseCode?: string;
  offering?: { course?: { code?: string; title?: string } };
};

export default function TelegramAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void telegramApi<Announcement[]>("/api/telegram/mini/announcements").then(setItems).catch((e) => setError(e instanceof Error ? e.message : "Could not load announcements")); }, []);
  return <section className="space-y-4"><a href="/telegram" className="text-sm text-slate-500">← Home</a><h1 className="text-2xl font-semibold">Announcements</h1>{error ? <p className="text-sm text-red-700">{error}</p> : null}<div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex justify-between gap-3"><h2 className="font-semibold">{item.title}</h2>{item.pinned ? <span className="text-xs text-slate-500">Pinned</span> : null}</div><p className="mt-1 text-xs text-slate-500">{item.courseCode ?? item.offering?.course?.code ?? "DSE"}</p><p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{item.body}</p></article>)}</div>{!error && items.length === 0 ? <p className="text-sm text-slate-500">No published announcements.</p> : null}</section>;
}
