"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, EyeOff, History, RotateCcw, Trash2 } from "lucide-react";
import type {
  ProgrammeFaqRecord,
  ProgrammeImportantDateRecord,
  ProgrammePublicPublicationStatus,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { publicProgrammeInfoApi } from "@/lib/public-programme-info";

const PROGRAMME_ID = "dse";

type LifecycleLabel = "Draft" | "Published" | "Hidden / Unpublished" | "Archived";

function lifecycleLabel(
  status: ProgrammePublicPublicationStatus,
  publishedAt: string | null,
): LifecycleLabel {
  if (status === "Archived") return "Archived";
  if (status === "Published") return "Published";
  return publishedAt ? "Hidden / Unpublished" : "Draft";
}

function badgeClass(label: LifecycleLabel): string {
  switch (label) {
    case "Published":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Hidden / Unpublished":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Archived":
      return "border-slate-300 bg-slate-100 text-slate-600";
    default:
      return "border-blue-200 bg-blue-50 text-blue-700";
  }
}

function firstPublished(value: string | null): string {
  if (!value) return "Never published";
  return new Date(value).toLocaleString();
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function PublicInformationLifecycleClient() {
  const [faqs, setFaqs] = useState<ProgrammeFaqRecord[]>([]);
  const [dates, setDates] = useState<ProgrammeImportantDateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [faqRows, dateRows] = await Promise.all([
        publicProgrammeInfoApi.listFaqLifecycle(PROGRAMME_ID),
        publicProgrammeInfoApi.listImportantDateLifecycle(PROGRAMME_ID),
      ]);
      setFaqs(faqRows);
      setDates(dateRows);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const labels = [...faqs, ...dates].map((item) =>
      lifecycleLabel(item.status, item.publishedAt),
    );
    return {
      draft: labels.filter((label) => label === "Draft").length,
      published: labels.filter((label) => label === "Published").length,
      hidden: labels.filter((label) => label === "Hidden / Unpublished").length,
      archived: labels.filter((label) => label === "Archived").length,
    };
  }, [dates, faqs]);

  async function mutate(key: string, action: () => Promise<unknown>) {
    setBusyKey(key);
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteFaq(item: ProgrammeFaqRecord) {
    if (!window.confirm(`Permanently delete never-published draft “${item.question}”?`)) return;
    await mutate(`faq-delete-${item.id}`, () =>
      publicProgrammeInfoApi.removeFaq(PROGRAMME_ID, item.id),
    );
  }

  async function archiveFaq(item: ProgrammeFaqRecord) {
    if (!window.confirm(`Archive “${item.question}”? It will stay in history and cannot be republished.`)) return;
    await mutate(`faq-archive-${item.id}`, () =>
      publicProgrammeInfoApi.archiveFaq(PROGRAMME_ID, item.id),
    );
  }

  async function deleteDate(item: ProgrammeImportantDateRecord) {
    if (!window.confirm(`Permanently delete never-published draft “${item.title}”?`)) return;
    await mutate(`date-delete-${item.id}`, () =>
      publicProgrammeInfoApi.removeImportantDate(PROGRAMME_ID, item.id),
    );
  }

  async function archiveDate(item: ProgrammeImportantDateRecord) {
    if (!window.confirm(`Archive “${item.title}”? It will stay in history and cannot be republished.`)) return;
    await mutate(`date-archive-${item.id}`, () =>
      publicProgrammeInfoApi.archiveImportantDate(PROGRAMME_ID, item.id),
    );
  }

  if (loading) {
    return <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">Loading lifecycle history…</div>;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Draft", summary.draft],
          ["Published", summary.published],
          ["Hidden / Unpublished", summary.hidden],
          ["Archived", summary.archived],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex gap-3">
          <History className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Published history is retained.</p>
            <p className="mt-1">
              Only never-published drafts can be permanently deleted. Once an item has been public,
              unpublishing hides it but keeps its first publication timestamp; archiving makes that
              historical record terminal and keeps it out of all public channels.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <LifecycleTable
        title="FAQ lifecycle"
        rows={faqs.map((item) => ({
          id: item.id,
          primary: item.question,
          secondary: `${item.category} · ${item.slug}`,
          label: lifecycleLabel(item.status, item.publishedAt),
          publishedAt: item.publishedAt,
          updatedAt: item.updatedAt,
          actions:
            item.status === "Published"
              ? [
                  {
                    label: "Unpublish",
                    icon: EyeOff,
                    key: `faq-unpublish-${item.id}`,
                    run: () =>
                      mutate(`faq-unpublish-${item.id}`, () =>
                        publicProgrammeInfoApi.unpublishFaq(PROGRAMME_ID, item.id),
                      ),
                  },
                ]
              : item.status === "Archived"
                ? []
                : item.publishedAt
                  ? [
                      {
                        label: "Republish",
                        icon: RotateCcw,
                        key: `faq-publish-${item.id}`,
                        run: () =>
                          mutate(`faq-publish-${item.id}`, () =>
                            publicProgrammeInfoApi.publishFaq(PROGRAMME_ID, item.id),
                          ),
                      },
                      {
                        label: "Archive",
                        icon: Archive,
                        key: `faq-archive-${item.id}`,
                        run: () => archiveFaq(item),
                      },
                    ]
                  : [
                      {
                        label: "Delete draft",
                        icon: Trash2,
                        key: `faq-delete-${item.id}`,
                        run: () => deleteFaq(item),
                      },
                    ],
        }))}
        busyKey={busyKey}
      />

      <LifecycleTable
        title="Important-date lifecycle"
        rows={dates.map((item) => ({
          id: item.id,
          primary: item.title,
          secondary: `${item.kind} · ${String(item.date).slice(0, 10)}`,
          label: lifecycleLabel(item.status, item.publishedAt),
          publishedAt: item.publishedAt,
          updatedAt: item.updatedAt,
          actions:
            item.status === "Published"
              ? [
                  {
                    label: "Unpublish",
                    icon: EyeOff,
                    key: `date-unpublish-${item.id}`,
                    run: () =>
                      mutate(`date-unpublish-${item.id}`, () =>
                        publicProgrammeInfoApi.unpublishImportantDate(PROGRAMME_ID, item.id),
                      ),
                  },
                ]
              : item.status === "Archived"
                ? []
                : item.publishedAt
                  ? [
                      {
                        label: "Republish",
                        icon: RotateCcw,
                        key: `date-publish-${item.id}`,
                        run: () =>
                          mutate(`date-publish-${item.id}`, () =>
                            publicProgrammeInfoApi.publishImportantDate(PROGRAMME_ID, item.id),
                          ),
                      },
                      {
                        label: "Archive",
                        icon: Archive,
                        key: `date-archive-${item.id}`,
                        run: () => archiveDate(item),
                      },
                    ]
                  : [
                      {
                        label: "Delete draft",
                        icon: Trash2,
                        key: `date-delete-${item.id}`,
                        run: () => deleteDate(item),
                      },
                    ],
        }))}
        busyKey={busyKey}
      />
    </div>
  );
}

type RowAction = {
  label: string;
  icon: typeof Archive;
  key: string;
  run: () => void | Promise<void>;
};

type LifecycleRow = {
  id: string;
  primary: string;
  secondary: string;
  label: LifecycleLabel;
  publishedAt: string | null;
  updatedAt: string;
  actions: RowAction[];
};

function LifecycleTable({
  title,
  rows,
  busyKey,
}: {
  title: string;
  rows: LifecycleRow[];
  busyKey: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b px-4 py-3 sm:px-5">
        <h2 className="font-semibold text-slate-900">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-slate-500">No records yet.</p>
      ) : (
        <div className="divide-y">
          {rows.map((row) => (
            <div key={row.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-900">{row.primary}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass(row.label)}`}>
                    {row.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{row.secondary}</p>
                <p className="mt-1 text-xs text-slate-500">
                  First published: {firstPublished(row.publishedAt)} · Last lifecycle change:{" "}
                  {new Date(row.updatedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {row.actions.length === 0 ? (
                  <span className="text-xs text-slate-500">Historical record · no destructive actions</span>
                ) : (
                  row.actions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <Button
                        key={action.key}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(busyKey)}
                        onClick={() => void action.run()}
                      >
                        <Icon className="mr-1.5 h-4 w-4" />
                        {busyKey === action.key ? "Working…" : action.label}
                      </Button>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
