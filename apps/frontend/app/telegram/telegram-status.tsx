"use client";

import type {
  TelegramHomeResponse,
  TelegramInitDataVerifyResponse,
  TelegramTodayClass,
} from "@dse-pms/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";
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

function minutes(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function greeting(localTime: string) {
  const hour = Number(localTime.slice(0, 2));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function dateLabel(date: string, dayOfWeek: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const monthDay = parsed.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  });
  return `${dayOfWeek}, ${monthDay}`;
}

function shortDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}

function arrivalTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: "Asia/Phnom_Penh",
    hour: "numeric",
    minute: "2-digit",
  });
}

function arrivalPresentation(item: TelegramTodayClass) {
  if (item.sessionStatus !== "Scheduled") {
    return { label: item.sessionStatus, className: "bg-slate-100 text-slate-700" };
  }
  if (item.arrivalStatus === "Present") {
    const time = arrivalTime(item.arrivalRecordedAt);
    return {
      label: time ? `Lecturer present · ${time}` : "Lecturer present",
      className: "bg-emerald-50 text-emerald-700",
    };
  }
  if (item.arrivalStatus === "NotYet") {
    return { label: "Lecturer not here yet", className: "bg-amber-50 text-amber-700" };
  }
  return { label: "Not confirmed yet", className: "bg-orange-50 text-orange-700" };
}

function canShowArrivalAction(item: TelegramTodayClass, localTime: string) {
  if (!item.canConfirmLecturerArrival || item.sessionStatus !== "Scheduled" || item.arrivalStatus === "Present") {
    return false;
  }
  if (item.arrivalStatus === "NotYet") return minutes(localTime) <= minutes(item.endTime);
  const current = minutes(localTime);
  return current >= minutes(item.startTime) - 30 && current <= minutes(item.endTime);
}

function ClassMeta({ item }: { item: TelegramTodayClass }) {
  return (
    <div className="space-y-2 text-sm text-slate-600">
      <p className="flex items-center gap-2"><span aria-hidden="true">◷</span><span>{item.startTime} – {item.endTime}</span></p>
      <p className="flex items-center gap-2"><span aria-hidden="true">⌖</span><span>{item.room || "Room to be announced"}</span></p>
      <p className="flex items-center gap-2"><span aria-hidden="true">♙</span><span>{item.lecturerNames.length ? item.lecturerNames.join(", ") : "Lecturer to be announced"}</span></p>
    </div>
  );
}

function StudentTodayHome({ home }: { home: TelegramHomeResponse }) {
  const today = home.today;
  if (!today) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName(home.user.name)}</h1>
          <p className="mt-1 text-sm text-slate-500">Today’s class view is temporarily unavailable.</p>
        </div>
        <Link href="/telegram/schedule" className="block min-h-11 rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white">View weekly schedule</Link>
      </div>
    );
  }

  const primary = today.classes.find((item) => item.endTime >= today.localTime) ?? today.classes.at(-1) ?? null;
  const later = primary
    ? today.classes.filter((item) => item.meetingId !== primary.meetingId && item.startTime > primary.startTime)
    : [];
  const status = primary ? arrivalPresentation(primary) : null;
  const showArrivalAction = primary ? canShowArrivalAction(primary, today.localTime) : false;

  return (
    <div className="space-y-6 pb-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-blue-600">DSE PMS</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          {greeting(today.localTime)}, {firstName(home.user.name)} <span aria-hidden="true">👋</span>
        </h1>
        <p className="text-sm text-slate-500">{dateLabel(today.date, today.dayOfWeek)}</p>
      </header>

      <section className="space-y-3" aria-labelledby="today-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="today-heading" className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Today</h2>
          <Link href="/telegram/schedule" className="text-xs font-semibold text-blue-600">Full schedule</Link>
        </div>

        {primary ? (
          <article className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
            <div className="border-l-4 border-blue-500 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{primary.courseCode} · {primary.sectionCode}</p><h3 className="mt-1 text-xl font-semibold leading-tight text-slate-950">{primary.courseTitle}</h3></div>
                <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{primary.activityType}</span>
              </div>
              <div className="my-4 border-t border-slate-100" />
              <ClassMeta item={primary} />
              <div className="my-4 border-t border-slate-100" />
              <p className="text-xs font-medium text-slate-500">Lecturer arrival</p>
              {status ? <span className={`mt-2 inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${status.className}`}>{status.label}</span> : null}
              {showArrivalAction ? (
                <Link href={`/telegram/classes/${encodeURIComponent(primary.offeringId)}/delivery`} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm active:bg-blue-700">
                  {primary.arrivalStatus === "NotYet" ? "Lecturer has arrived" : "Confirm lecturer arrival"}
                </Link>
              ) : null}
              {primary.canConfirmLecturerArrival ? <p className="mt-3 text-xs leading-5 text-slate-500">Class Monitor / Sub-class Monitor access is verified by DSE PMS.</p> : null}
            </div>
          </article>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <div className="text-3xl" aria-hidden="true">☀️</div>
            <h3 className="mt-2 font-semibold text-slate-950">No classes today</h3>
            <p className="mt-1 text-sm text-slate-500">You have no current class meetings scheduled for today.</p>
            {today.nextClass ? (
              <Link href={`/telegram/classes/${encodeURIComponent(today.nextClass.offeringId)}`} className="mt-4 block rounded-xl bg-slate-50 p-3 text-left">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next class · {today.nextClass.dayOfWeek}</p>
                <p className="mt-1 font-semibold text-slate-900">{today.nextClass.courseTitle}</p>
                <p className="mt-1 text-xs text-slate-500">{today.nextClass.startTime}–{today.nextClass.endTime}{today.nextClass.room ? ` · ${today.nextClass.room}` : ""}</p>
              </Link>
            ) : null}
          </div>
        )}

        {later.length ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Later today</p>
            {later.map((item) => (
              <Link key={item.meetingId} href={`/telegram/classes/${encodeURIComponent(item.offeringId)}`} className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                <span className="w-12 shrink-0 text-sm font-semibold text-slate-700">{item.startTime}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{item.courseTitle}</span><span className="block truncate text-xs text-slate-500">{item.room || "Room TBA"} · {item.activityType}</span></span>
                <span aria-hidden="true" className="text-slate-400">›</span>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      {home.actions.length > 0 ? (
        <section className="space-y-3" aria-labelledby="action-required-heading">
          <h2 id="action-required-heading" className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Action required</h2>
          {home.actions.map((action) => (
            <Link key={action.permissionPendingId} href={action.deepLink} className="block rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="text-xl">🟠</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-amber-950">Permission letter pending</p>
                  <p className="mt-1 text-sm font-medium text-amber-900">{action.courseCode} · {shortDate(action.date)}</p>
                  <p className="mt-2 text-sm leading-5 text-amber-800">Please give your paper permission letter to your lecturer, preferably before your next class.</p>
                  <p className="mt-2 text-xs font-semibold text-amber-900">View attendance →</p>
                </div>
              </div>
            </Link>
          ))}
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="quick-access-heading">
        <h2 id="quick-access-heading" className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quick access</h2>
        <nav className="grid grid-cols-2 gap-2 text-sm">
          <Link href="/telegram/schedule" className="min-h-16 rounded-xl border border-slate-200 bg-white p-3 font-medium text-slate-900"><span aria-hidden="true">▣</span><span className="mt-1 block">Schedule</span></Link>
          <Link href="/telegram/deadlines" className="min-h-16 rounded-xl border border-slate-200 bg-white p-3 font-medium text-slate-900"><span aria-hidden="true">◷</span><span className="mt-1 block">Assessments</span></Link>
          <Link href="/telegram/attendance" className="min-h-16 rounded-xl border border-slate-200 bg-white p-3 font-medium text-slate-900"><span aria-hidden="true">✓</span><span className="mt-1 block">My attendance</span></Link>
          <Link href="/telegram/results" className="min-h-16 rounded-xl border border-slate-200 bg-white p-3 font-medium text-slate-900"><span aria-hidden="true">▥</span><span className="mt-1 block">Results & CLO</span></Link>
          <Link href="/telegram/announcements" className="min-h-16 rounded-xl border border-slate-200 bg-white p-3 font-medium text-slate-900"><span aria-hidden="true">◉</span><span className="mt-1 block">Announcements{home.unreadAnnouncements ? ` · ${home.unreadAnnouncements}` : ""}</span></Link>
          <Link href="/telegram/surveys" className="min-h-16 rounded-xl border border-slate-200 bg-white p-3 font-medium text-slate-900"><span aria-hidden="true">✎</span><span className="mt-1 block">Course surveys{home.surveyActions ? ` · ${home.surveyActions}` : ""}</span></Link>
        </nav>
      </section>

      <Link href="/telegram/settings" className="block text-center text-sm font-medium text-slate-500">Notification settings</Link>
    </div>
  );
}

function StaffHome({ home }: { home: TelegramHomeResponse }) {
  const lecturer = home.user.roles.includes("lecturer");
  return (
    <div className="space-y-5 pb-6">
      <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Signed in as</p><p className="text-lg font-semibold">{home.user.name}</p><p className="text-xs text-slate-500">{home.user.roles.join(" · ")}</p></div>
      <nav className="grid grid-cols-2 gap-2 text-sm">
        <Link href="/telegram/announcements" className="rounded-xl border border-slate-200 bg-white p-3 font-medium">Announcements</Link>
        {lecturer ? <Link href="/telegram/workload" className="rounded-xl border border-slate-200 bg-white p-3 font-medium">Teaching workload</Link> : null}
        <Link href="/telegram/settings" className="rounded-xl border border-slate-200 bg-white p-3 font-medium">Notifications</Link>
      </nav>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Your classes</h2>
        {home.courses.map((course) => (
          <Link key={course.offeringId} href={`/telegram/classes/${course.offeringId}`} className="block rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{course.courseCode}</p><p className="text-sm text-slate-600">{course.courseTitle}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{course.sectionCode}</span></div>
            {course.nextMeeting ? <p className="mt-2 text-xs text-slate-500">{course.nextMeeting.dayOfWeek} · {course.nextMeeting.startTime}–{course.nextMeeting.endTime}{course.nextMeeting.room ? ` · ${course.nextMeeting.room}` : ""}</p> : null}
          </Link>
        ))}
      </div>
    </div>
  );
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
            const home = await telegramFetch<TelegramHomeResponse>("/api/telegram/mini/home", cachedSession);
            if (!cancelled) setState({ status: "ready", home });
            return;
          } catch (error) {
            if (!(error instanceof TelegramSessionRequestError) || error.status !== 401) throw error;
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

  if (state.status === "loading") return <p className="py-10 text-center text-sm text-slate-500">Securely connecting to DSE PMS…</p>;
  if (state.status === "outside") {
    return <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="font-medium text-slate-900">Open DSE PMS from Telegram</p><p className="text-sm leading-6 text-slate-600">This page only signs in when it is opened from the official DSE Telegram Mini App. A normal browser cannot create a Telegram session.</p></div>;
  }
  if (state.status === "error") return <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.message}</p>;
  if (state.status === "unlinked") {
    return (
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-2"><p className="text-lg font-semibold text-slate-950">Connect your DSE PMS account</p><p className="text-sm leading-6 text-slate-600">Use your existing DSE PMS account to connect Telegram. You only need to do this once.</p><p className="text-sm leading-6 text-slate-600">Telegram confirms your Telegram identity. DSE PMS determines your student or lecturer account, courses, roles, and permissions.</p></div>
        <Link href={`/telegram/link?verificationId=${encodeURIComponent(state.verificationId)}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white">Connect DSE PMS Account</Link>
        <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600"><p className="font-medium text-slate-700">Why do I need to connect?</p><p className="mt-1">Connecting tells DSE PMS which PMS account belongs to this verified Telegram account. Telegram does not decide whether you are a student, lecturer, monitor, or administrator.</p></div>
      </div>
    );
  }

  return state.home.user.roles.includes("student")
    ? <StudentTodayHome home={state.home} />
    : <StaffHome home={state.home} />;
}
