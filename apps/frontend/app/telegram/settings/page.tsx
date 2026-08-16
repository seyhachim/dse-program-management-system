"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { telegramApi } from "../telegram-client";

export default function TelegramSettingsPage() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void telegramApi<{ announcementsEnabled: boolean }>("/api/telegram/mini/notification-preferences").then((value) => { setEnabled(value.announcementsEnabled); setLoaded(true); }).catch((e) => setMessage(e instanceof Error ? e.message : "Could not load preferences")); }, []);
  async function update(next: boolean) { setEnabled(next); try { await telegramApi("/api/telegram/mini/notification-preferences", { method: "PUT", body: JSON.stringify({ announcementsEnabled: next }) }); setMessage("Notification preference saved."); } catch (e) { setEnabled(!next); setMessage(e instanceof Error ? e.message : "Could not save preference"); } }
  return <section className="space-y-4"><Link href="/telegram" className="text-sm text-slate-500">← Home</Link><div><h1 className="text-2xl font-semibold">Notifications</h1><p className="text-sm text-slate-500">Control Telegram delivery without changing PMS announcements.</p></div>{message ? <p className="text-sm text-slate-600">{message}</p> : null}<label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4"><div><p className="font-medium">Course announcements</p><p className="text-xs text-slate-500">Receive a Telegram message with a secure Mini App deep link.</p></div><input type="checkbox" checked={enabled} disabled={!loaded} onChange={(e) => void update(e.target.checked)} className="h-5 w-5" /></label></section>;
}
