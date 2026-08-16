"use client";

import { useEffect, useState } from "react";
import type { TelegramHomeResponse, TelegramInitDataVerifyResponse } from "@dse-pms/shared-types";
import { API_URL } from "../../lib/api";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready(): void;
        expand(): void;
      };
    };
  }
}

type State =
  | { status: "loading" }
  | { status: "outside" }
  | { status: "unlinked"; verificationId: string }
  | { status: "ready"; home: TelegramHomeResponse; token: string }
  | { status: "error"; message: string };

async function telegramFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Telegram session request failed");
  return response.json() as Promise<T>;
}

export function TelegramStatus() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
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
        const home = await telegramFetch<TelegramHomeResponse>("/api/telegram/mini/home", verified.sessionToken);
        if (!cancelled) setState({ status: "ready", home, token: verified.sessionToken });
      } catch (error) {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Telegram Mini App failed" });
      }
    }
    void boot();
    return () => { cancelled = true; };
  }, []);

  if (state.status === "loading") return <p className="text-sm text-slate-500">Securely connecting to PMS…</p>;
  if (state.status === "outside") {
    return <p className="text-sm text-slate-600">Open this page from the official DSE Telegram Mini App to sign in.</p>;
  }
  if (state.status === "error") return <p className="text-sm text-red-700">{state.message}</p>;
  if (state.status === "unlinked") {
    return (
      <div className="space-y-3">
        <p className="font-medium">Link your PMS account</p>
        <p className="text-sm text-slate-600">Telegram has been verified. Sign in to PMS once to confirm which account this Telegram identity belongs to.</p>
        <a
          href={`/telegram/link?verificationId=${encodeURIComponent(state.verificationId)}`}
          className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white"
        >
          Link PMS account
        </a>
      </div>
    );
  }

  const { home } = state;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Signed in as</p>
        <p className="text-lg font-semibold">{home.user.name}</p>
        <p className="text-xs text-slate-500">{home.user.roles.join(" · ")}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-100 p-3"><p className="text-lg font-semibold">{home.courses.length}</p><p className="text-xs text-slate-500">Classes</p></div>
        <div className="rounded-xl bg-slate-100 p-3"><p className="text-lg font-semibold">{home.unreadAnnouncements}</p><p className="text-xs text-slate-500">News</p></div>
        <div className="rounded-xl bg-slate-100 p-3"><p className="text-lg font-semibold">{home.surveyActions}</p><p className="text-xs text-slate-500">Surveys</p></div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Your classes</h2>
        {home.courses.map((course) => (
          <a key={course.offeringId} href={`/telegram/classes/${course.offeringId}`} className="block rounded-xl border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-medium">{course.courseCode}</p><p className="text-sm text-slate-600">{course.courseTitle}</p></div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{course.sectionCode}</span>
            </div>
            {course.nextMeeting ? <p className="mt-2 text-xs text-slate-500">{course.nextMeeting.dayOfWeek} · {course.nextMeeting.startTime}–{course.nextMeeting.endTime}{course.nextMeeting.room ? ` · ${course.nextMeeting.room}` : ""}</p> : null}
          </a>
        ))}
      </div>
    </div>
  );
}
