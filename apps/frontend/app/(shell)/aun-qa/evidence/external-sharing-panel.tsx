"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, ShieldCheck } from "lucide-react";
import type {
  CreatedQaEvidenceExternalReferenceView,
  QaDashboardView,
  QaEvidenceItemView,
  QaEvidenceSnapshotView,
} from "@dse-pms/shared-types";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";

const PROGRAMME_ID = "dse";

export function ExternalSharingPanel() {
  const { me, loading: meLoading } = useMe();
  const [items, setItems] = useState<QaEvidenceItemView[]>([]);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, { url: string; code: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const canShare = me?.permissions.includes("qa:manage") ?? false;

  const load = useCallback(async () => {
    if (!me || !canShare) return;
    setError(null);
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      const [evidence, dashboard] = await Promise.all([
        api.get<QaEvidenceItemView[]>(`/api/qa/evidence-library?${params}`),
        api.get<QaDashboardView>(`/api/qa/dashboard?${params}`),
      ]);
      setItems(evidence);
      setCycleId(dashboard.selectedCycle?.id ?? null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load external sharing controls");
    }
  }, [canShare, me]);

  useEffect(() => {
    if (!meLoading) void load();
  }, [load, meLoading]);

  if (meLoading || !canShare) return null;

  async function share(item: QaEvidenceItemView) {
    if (!cycleId) return;
    setBusy(item.id);
    setError(null);
    try {
      const snapshot = await api.post<QaEvidenceSnapshotView>(
        `/api/qa/evidence/${item.id}/snapshots`,
        { programmeId: PROGRAMME_ID, cycleId },
      );
      const reference = await api.post<CreatedQaEvidenceExternalReferenceView>(
        `/api/qa/evidence-snapshots/${snapshot.id}/external-references`,
        {
          programmeId: PROGRAMME_ID,
          expiresAt: expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : null,
        },
      );
      const url = `${window.location.origin}${reference.externalPath}`;
      setLinks((current) => ({ ...current, [item.id]: { url, code: snapshot.referenceCode } }));
      await navigator.clipboard?.writeText(url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create external assessor link");
    } finally {
      setBusy(null);
    }
  }

  async function copy(url: string) {
    await navigator.clipboard?.writeText(url);
  }

  return (
    <section className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-700" />
            <h2 className="font-semibold text-slate-950">External assessor references</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Capture an immutable, redacted evidence snapshot and create an unlisted read-only link. The copied link is shown only when it is created; the PMS stores only its token hash.
          </p>
        </div>
        <label className="text-sm text-slate-700">
          Optional expiry
          <input
            type="date"
            value={expiresOn}
            onChange={(event) => setExpiresOn(event.target.value)}
            className="mt-1 block h-9 rounded-md border bg-white px-3"
          />
        </label>
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {!cycleId ? <div className="mt-4 text-sm text-slate-600">No active QA cycle is available for external sharing.</div> : null}

      {cycleId ? (
        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {items.filter((item) => item.mappings.some((mapping) => mapping.cycleId === cycleId)).map((item) => {
            const created = links[item.id];
            return (
              <div key={item.id} className="rounded-xl border bg-white p-4">
                <div className="font-medium text-slate-900">{item.title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {item.reportingPeriod || "No reporting period"} · {item.status}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    disabled={busy === item.id}
                    onClick={() => void share(item)}
                    className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {busy === item.id ? "Creating…" : "Create assessor link"}
                  </button>
                  {created ? (
                    <button
                      onClick={() => void copy(created.url)}
                      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy link
                    </button>
                  ) : null}
                </div>
                {created ? (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs">
                    <div className="font-mono font-medium text-slate-700">{created.code}</div>
                    <div className="mt-1 break-all text-slate-500">{created.url}</div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
