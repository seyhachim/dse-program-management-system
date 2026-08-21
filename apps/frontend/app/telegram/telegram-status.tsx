"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TelegramHomeResponse, TelegramInitDataVerifyResponse } from "@dse-pms/shared-types";
import { API_URL } from "../../lib/api";
import {
  clearTelegramSession,
  getCachedTelegramSession,
  saveTelegramSession,
} from "./telegram-client";

type State =
  | { status: "loading" }
  | { status: "outside" }
  | { status: "unlinked"; verificationId: string }
  | { status: "ready"; home: TelegramHomeResponse }
  | { status: "error"; message: string };

class TelegramSessionRequestError extends Error {
  constructor(public readonly status: number) {
    super("Telegram session request failed");
    this.name = "TelegramSessionRequestError";
  }
}

async function telegramFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new TelegramSessionRequestError(response.status);
  return response.json() as Promise<T>;
}

export function TelegramStatus() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const cachedSession = getCachedTelegramSession();
        if (cachedSession) {
          try {
            const home = await telegramFetch<TelegramHomeResponse>(
              "/api/telegram/mini/home",
              cachedSession,
            );
            if (!cancelled) setState({ status: "ready", home });
            return;
          } catch (error) {
            if (!(error instanceof TelegramSessionRequestError) || error.status !== 401) {
              throw error;
            }
            clearTelegramSession();
          }
        }

        const webApp = window.Telegram?.WebApp;
        webApp?.ready();
        webApp?.expand();
        const initData = webApp?.initData ?? "";
        if (!initData) {
          if (!cancelled) setState({ status: "outside" });
          return;
        }
        const response = await fetch(`${API_URL}/api/telegram/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        if (!response.ok) throw new Error("Could not verify this Telegram launch");
        const verified = await response.json() as TelegramInitDataVerifyResponse;
        if (!verified.linked || !verified.sessionToken) {
          if (!cancelled) setState({ status: "unlinked", verificationId: verified.verificationId });
          return;
        }
        saveTelegramSession(verified.sessionToken, verified.sessionExpiresAt);
        const home = await telegramFetch<TelegramHomeResponse>("/api/telegram/mini/home", verified.sessionToken);
        if (!cancelled) setState({ status: "ready", home });
      } catch (error) {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Telegram Mini App failed" });
      }
    }
    void boot();
    return () => { cancelled = true; };
  }, []);

  if (state.status === "loading") return <p className="text-sm text-slate-500">Securely connecting to DSE PMS…</p>;
  if (state.status === "outside") {
    return (
      <div className="space-y-2">
        <p className="font-medium text-slate-900">Open DSE PMS from Telegram</p>
        <p className="text-sm leading-6 text-slate-600">
          This page only signs in when it is opened from the official DSE Telegram Mini App. A normal browser cannot create a Telegram session.
        </p>
      </div>
    );
  }
  if (state.status === "error") return <p className="text-sm text-red-700">{state.message}</p>;
  if (state.status === "unlinked") {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-lg font-semibold text-slate-950">Connect your DSE PMS account</p>
          <p className="text-sm leading-6 text-slate-600">
            Use your existing DSE PMS account to connect Telegram. You only need to do this once.
          </p>
          <p className="text-sm leading-6 text-slate-600">
            Telegram confirms your Telegram identity. DSE PMS determines your student or lecturer account, courses, roles, and permissions.
          </p>
        </div>

        <Link
          href={`/telegram/link?verificationId=${encodeURIComponent(state.verificationId)}`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white"
        >
          Connect DSE PMS Account
        </Link>

        <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <p className="font-medium text-slate-700">Why do I need to connect?</p>
          <p className="mt-1">
            Connecting tells DSE PMS which PMS account belongs to this verified Telegram account. Telegram does not decide whether you are a student, lecturer, monitor, or administrator.
          </p>
        </div>

        <p className="text-xs leading-5 text-slate-500">
          Your Telegram account does not replace your PMS account. Your PMS password and academic data are not stored by Telegram.
        </p>
      </div>
    );
  }

  const { home } = state;
  const student = home.user.roles.includes("student");
  const lecturer = home.user.roles.includes("lecturer");
  return (
    <div className="space-y-5 pb-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Signed in as</p>
        <p className="text-lg font-semibold">{home.user.name}</p>
        <p className="text-xs text-slate-500">{home.user.roles.join(" · ")}</p>
      </div>

      <nav className="grid grid-cols-2 gap-2 text-sm">
        <Link href="/telegram/announcements" className="rounded-xl border border-slate-200 bg-white p-3 font-medium">Announcements</Link>
        {student ? <Link href="/telegram/deadlines" className="rounded-xl border border-slate-200 bg-white p-3 font-medium">Assessment deadlines</Link> : null}
        {student ? <Link href="/telegram/attendance" className="rounded-xl border border-slate-200 bg-white p-3 font-medium">My attendance</Link> : null}
        {student ? <Link href="/telegram/results" className="rounded-xl border border-slate-200 bg-white p-3 font-medium">Results & CLO</Link> : null}
        {student ? <Link href="/telegram/surveys" className="rounded-xl border border-slate-200 bg-white p-3 font-medium">Course surveys</Link> : null}
        {lecturer ? <Link href="/telegram/workload" className="rounded-xl border border-slate-200 bg-white p-3 font-medium">Teaching workload</Link> : null}
        <Link href="/telegram/settings" className="rounded-xl border border-slate-200 bg-white p-3 font-medium">Notifications</Link>
      </nav>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-100 p-3"><p className="text-lg font-semibold">{home.courses.length}</p><p className="text-xs text-slate-500">Classes</p></div>
        <div className="rounded-xl bg-slate-100 p-3"><p className="text-lg font-semibold">{home.unreadAnnouncements}</p><p className="text-xs text-slate-500">News</p></div>
        <div className="rounded-xl bg-slate-100 p-3"><p className="text-lg font-semibold">{student ? home.surveyActions : home.publishedResultCount}</p><p className="text-xs text-slate-500">{student ? "Surveys" : "Results"}</p></div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Your classes</h2>
        {home.courses.map((course) => (
          <Link key={course.offeringId} href={`/telegram/classes/${course.offeringId}`} className="block rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-medium">{course.courseCode}</p><p className="text-sm text-slate-600">{course.courseTitle}</p></div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{course.sectionCode}</span>
            </div>
            {course.nextMeeting ? <p className="mt-2 text-xs text-slate-500">{course.nextMeeting.dayOfWeek} · {course.nextMeeting.startTime}–{course.nextMeeting.endTime}{course.nextMeeting.room ? ` · ${course.nextMeeting.room}` : ""}</p> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
