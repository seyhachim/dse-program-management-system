"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, Pin, Send } from "lucide-react";
import type { CourseDeliveryOffering } from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { QueryRefreshStatus } from "@/components/query-refresh-status";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { courseDeliveryApi } from "@/lib/course-delivery";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";
import { Topbar } from "../topbar";
import { MOBILE_ANNOUNCEMENTS_LAYOUT } from "./mobile-announcements-layout";

export function AnnouncementsClient() {
  const { me, loading: meLoading } = useMe();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const queryScope = { userId: me?.id ?? "pending" };
  const deliveryKey = protectedQueryKey(
    queryScope,
    "course-delivery",
    "offerings",
  );
  const deliveryQuery = useQuery({
    queryKey: deliveryKey,
    queryFn: () => courseDeliveryApi.offerings(),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.operational,
  });
  const offerings: CourseDeliveryOffering[] = deliveryQuery.data ?? [];
  const hasData = deliveryQuery.data !== undefined;
  const loading = meLoading || (!hasData && deliveryQuery.isPending);
  const hardError = !hasData && deliveryQuery.isError;
  const queryError = hardError
    ? deliveryQuery.error instanceof ApiError
      ? deliveryQuery.error.message
      : "Could not load announcements"
    : null;

  useEffect(() => {
    setSelectedId((current) =>
      offerings.some((row) => row.offeringId === current)
        ? current
        : (offerings[0]?.offeringId ?? ""),
    );
  }, [offerings]);
  const selected =
    offerings.find((row) => row.offeringId === selectedId) ?? null;

  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setMutationError(null);
    setNotice(null);
    try {
      await courseDeliveryApi.publishAnnouncement({
        offeringId: selected.offeringId,
        title: title.trim(),
        body: body.trim(),
        pinned,
      });
      setTitle("");
      setBody("");
      setPinned(false);
      setNotice("Announcement published to this section.");
      await queryClient.invalidateQueries({ queryKey: deliveryKey, exact: true });
    } catch (reason) {
      setMutationError(
        reason instanceof ApiError || reason instanceof Error
          ? reason.message
          : "Could not publish announcement",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Topbar
        title="Announcements"
        subtitle="Publish section-specific updates to enrolled students."
      />
      <main className={MOBILE_ANNOUNCEMENTS_LAYOUT.main}>
        <div className="mx-auto max-w-6xl space-y-4 md:space-y-5">
          <QueryRefreshStatus
            hasData={hasData}
            isPending={deliveryQuery.isPending}
            isFetching={deliveryQuery.isFetching}
            isError={deliveryQuery.isError}
            label="Announcements"
          />
          {loading ? (
            <StateCard>Loading your course sections…</StateCard>
          ) : queryError ? (
            <StateCard>{queryError}</StateCard>
          ) : !offerings.length ? (
            <StateCard>No assigned course sections.</StateCard>
          ) : selected ? (
            <>
              <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-primary">
                        {selected.code}
                      </span>
                      <span className="rounded-lg bg-muted px-2.5 py-1">
                        Section {selected.sectionCode}
                      </span>
                      <span className="rounded-lg bg-muted px-2.5 py-1">
                        {selected.term}
                      </span>
                    </div>
                    <h2 className="mt-3 break-words text-xl font-bold">
                      {selected.title}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Only students enrolled in this section receive these
                      announcements.
                    </p>
                  </div>
                  <label className="w-full text-sm font-medium md:w-auto">
                    Course section
                    <select
                      value={selected.offeringId}
                      onChange={(event) => {
                        setSelectedId(event.target.value);
                        setNotice(null);
                        setMutationError(null);
                      }}
                      className={MOBILE_ANNOUNCEMENTS_LAYOUT.sectionSelector}
                    >
                      {offerings.map((offering) => (
                        <option
                          key={offering.offeringId}
                          value={offering.offeringId}
                        >
                          {offering.code} · Section {offering.sectionCode} ·{" "}
                          {offering.term}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              {notice ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{notice}</span>
                </div>
              ) : null}
              {mutationError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {mutationError}
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
                  <h3 className="font-semibold">Publish announcement</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Students see published updates immediately in their portal.
                  </p>
                  <form onSubmit={publish} className="mt-4 space-y-4">
                    <label className="block text-sm font-medium">
                      Title
                      <Input
                        className={`mt-1 ${MOBILE_ANNOUNCEMENTS_LAYOUT.formControl}`}
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        maxLength={160}
                        required
                        placeholder="e.g. Lab moved to Room 302"
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      Message
                      <textarea
                        className="mt-1 min-h-44 w-full rounded-lg border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        rows={8}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        maxLength={10000}
                        required
                        placeholder="Write a clear update…"
                      />
                    </label>
                    <label className="flex min-h-11 items-center gap-3 rounded-lg px-1 text-sm">
                      <input
                        type="checkbox"
                        checked={pinned}
                        onChange={(event) => setPinned(event.target.checked)}
                        className="h-5 w-5 shrink-0 accent-primary"
                      />
                      <Pin className="h-4 w-4 shrink-0" />
                      <span>Pin this announcement</span>
                    </label>
                    <Button
                      className={MOBILE_ANNOUNCEMENTS_LAYOUT.publishAction}
                      disabled={saving || !title.trim() || !body.trim()}
                    >
                      <Send className="h-4 w-4" />
                      {saving ? "Publishing…" : "Publish announcement"}
                    </Button>
                  </form>
                </section>

                <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">Published announcements</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selected.announcements.length} in this section.
                      </p>
                    </div>
                    <Bell className="h-5 w-5 shrink-0 text-primary" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {selected.announcements.map((item) => (
                      <article
                        key={item.id}
                        className={MOBILE_ANNOUNCEMENTS_LAYOUT.card}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="break-words font-semibold">
                              {item.title}
                            </h4>
                            <p className="mt-1 break-words text-xs text-muted-foreground">
                              {item.authorName} · {formatDate(item.publishedAt)}
                            </p>
                          </div>
                          {item.pinned ? (
                            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                              Pinned
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                          {item.body}
                        </p>
                      </article>
                    ))}
                    {!selected.announcements.length ? (
                      <p className="text-sm text-muted-foreground">
                        No announcements published yet.
                      </p>
                    ) : null}
                  </div>
                </section>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}

function StateCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground md:p-10">
      {children}
    </div>
  );
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not published";
}
