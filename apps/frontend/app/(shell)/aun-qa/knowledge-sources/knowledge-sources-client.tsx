"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, ChevronDown, ChevronUp, Plus, Search, ShieldCheck } from "lucide-react";
import type {
  KnowledgeAccessClassification,
  KnowledgeDomain,
  KnowledgeSourceDetailView,
  KnowledgeSourceSummaryView,
  KnowledgeSourceType,
  KnowledgeTrustCategory,
} from "@dse-pms/shared-types";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";

const PROGRAMME_ID = "dse";

const DOMAINS: Array<{ value: KnowledgeDomain; label: string }> = [
  { value: "AUN_QA", label: "AUN-QA" },
  { value: "CAMBODIA_OBE", label: "Cambodia OBE" },
  { value: "RUPP", label: "RUPP" },
  { value: "FACULTY_ENGINEERING", label: "Faculty of Engineering" },
  { value: "DSE", label: "DSE" },
];

const SOURCE_TYPES: Array<{ value: KnowledgeSourceType; label: string }> = [
  { value: "OFFICIAL_FRAMEWORK", label: "Official framework" },
  { value: "REGULATION_POLICY", label: "Regulation / policy" },
  { value: "GUIDELINE_PLAYBOOK", label: "Guideline / playbook" },
  { value: "OFFICIAL_STANDARD", label: "Official standard" },
  { value: "UNIVERSITY_POLICY", label: "University policy" },
  { value: "FACULTY_POLICY_PROCEDURE", label: "Faculty policy / procedure" },
  { value: "APPROVED_PROGRAMME_SPECIFICATION", label: "Approved programme specification" },
  { value: "APPROVED_CURRICULUM", label: "Approved curriculum" },
  { value: "APPROVED_ACADEMIC_DOCUMENT", label: "Approved academic document" },
  { value: "OFFICIAL_WEBPAGE", label: "Official webpage" },
  { value: "TRUSTED_EXTERNAL_REFERENCE", label: "Trusted external reference" },
  { value: "WORKING_REFERENCE", label: "Working reference" },
];

const ACCESS_LEVELS: Array<{ value: KnowledgeAccessClassification; label: string }> = [
  { value: "PUBLIC", label: "Public" },
  { value: "INTERNAL", label: "Internal" },
  { value: "RESTRICTED", label: "Restricted" },
];

const VERIFY_TRUST: Array<{ value: Exclude<KnowledgeTrustCategory, "UNVERIFIED">; label: string }> = [
  { value: "AUTHORITATIVE", label: "Authoritative" },
  { value: "INSTITUTIONAL_OFFICIAL", label: "Institutional official" },
  { value: "TRUSTED_REFERENCE", label: "Trusted reference" },
  { value: "WORKING_REFERENCE", label: "Working reference" },
];

type SourceForm = {
  domain: KnowledgeDomain;
  title: string;
  shortTitle: string;
  issuingOrganisation: string;
  sourceType: KnowledgeSourceType;
  accessClassification: KnowledgeAccessClassification;
  jurisdictionScope: string;
  versionLabel: string;
  publicationDate: string;
  effectiveDate: string;
  reviewDate: string;
  officialUrl: string;
  storedFileRef: string;
  language: string;
};

const EMPTY_FORM: SourceForm = {
  domain: "AUN_QA",
  title: "",
  shortTitle: "",
  issuingOrganisation: "",
  sourceType: "OFFICIAL_FRAMEWORK",
  accessClassification: "INTERNAL",
  jurisdictionScope: "",
  versionLabel: "",
  publicationDate: "",
  effectiveDate: "",
  reviewDate: "",
  officialUrl: "",
  storedFileRef: "",
  language: "en",
};

type VerifyForm = {
  trustCategory: Exclude<KnowledgeTrustCategory, "UNVERIFIED">;
  verificationNote: string;
};

const EMPTY_VERIFY: VerifyForm = {
  trustCategory: "AUTHORITATIVE",
  verificationNote: "",
};

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatLabel(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function trustClass(trust: KnowledgeTrustCategory): string {
  if (trust === "AUTHORITATIVE" || trust === "INSTITUTIONAL_OFFICIAL") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (trust === "UNVERIFIED") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
}

export function KnowledgeSourcesClient() {
  const { me, loading: meLoading } = useMe();
  const [sources, setSources] = useState<KnowledgeSourceSummaryView[]>([]);
  const [selected, setSelected] = useState<KnowledgeSourceDetailView | null>(null);
  const [query, setQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState<KnowledgeDomain | "">("");
  const [trustFilter, setTrustFilter] = useState<KnowledgeTrustCategory | "">("");
  const [showCreate, setShowCreate] = useState(false);
  const [showVersionForm, setShowVersionForm] = useState(false);
  const [form, setForm] = useState<SourceForm>(EMPTY_FORM);
  const [versionForm, setVersionForm] = useState<SourceForm>(EMPTY_FORM);
  const [verifyForm, setVerifyForm] = useState<VerifyForm>(EMPTY_VERIFY);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManage = me?.permissions.includes("qa:manage") ?? false;

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      const result = await api.get<KnowledgeSourceSummaryView[]>(`/api/qa/knowledge-sources?${params}`);
      setSources(result);
      if (selected) {
        const detail = await api.get<KnowledgeSourceDetailView>(
          `/api/qa/knowledge-sources/${selected.id}?programmeId=${PROGRAMME_ID}`,
        );
        setSelected(detail);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load trusted sources");
    } finally {
      setLoading(false);
    }
  }, [me, selected?.id]);

  useEffect(() => {
    if (!meLoading && me) void load();
  }, [load, me, meLoading]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sources.filter((source) => {
      if (domainFilter && source.domain !== domainFilter) return false;
      if (trustFilter && source.trustCategory !== trustFilter) return false;
      if (!needle) return true;
      return [
        source.title,
        source.shortTitle ?? "",
        source.issuingOrganisation,
        source.currentVersion?.versionLabel ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [domainFilter, query, sources, trustFilter]);

  async function openSource(id: string) {
    setBusy(`read:${id}`);
    setError(null);
    try {
      setSelected(
        await api.get<KnowledgeSourceDetailView>(`/api/qa/knowledge-sources/${id}?programmeId=${PROGRAMME_ID}`),
      );
      setShowVersionForm(false);
      setVerifyForm(EMPTY_VERIFY);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load source detail");
    } finally {
      setBusy(null);
    }
  }

  async function createSource() {
    setBusy("create");
    setError(null);
    try {
      const created = await api.post<KnowledgeSourceDetailView>("/api/qa/knowledge-sources", {
        programmeId: PROGRAMME_ID,
        domain: form.domain,
        title: form.title.trim(),
        shortTitle: optional(form.shortTitle),
        issuingOrganisation: form.issuingOrganisation.trim(),
        sourceType: form.sourceType,
        accessClassification: form.accessClassification,
        jurisdictionScope: optional(form.jurisdictionScope),
        initialVersion: {
          versionLabel: form.versionLabel.trim(),
          publicationDate: optional(form.publicationDate),
          effectiveDate: optional(form.effectiveDate),
          reviewDate: optional(form.reviewDate),
          officialUrl: optional(form.officialUrl),
          storedFileRef: optional(form.storedFileRef),
          language: form.language.trim() || "en",
          checksum: null,
        },
      });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      setSelected(created);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not register source");
    } finally {
      setBusy(null);
    }
  }

  async function addVersion() {
    if (!selected) return;
    setBusy("version");
    setError(null);
    try {
      const detail = await api.post<KnowledgeSourceDetailView>(`/api/qa/knowledge-sources/${selected.id}/versions`, {
        programmeId: PROGRAMME_ID,
        versionLabel: versionForm.versionLabel.trim(),
        publicationDate: optional(versionForm.publicationDate),
        effectiveDate: optional(versionForm.effectiveDate),
        reviewDate: optional(versionForm.reviewDate),
        officialUrl: optional(versionForm.officialUrl),
        storedFileRef: optional(versionForm.storedFileRef),
        language: versionForm.language.trim() || "en",
        checksum: null,
      });
      setSelected(detail);
      setVersionForm(EMPTY_FORM);
      setShowVersionForm(false);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not add source version");
    } finally {
      setBusy(null);
    }
  }

  async function verifyVersion(versionId: string) {
    if (!selected) return;
    setBusy(`verify:${versionId}`);
    setError(null);
    try {
      const detail = await api.post<KnowledgeSourceDetailView>(
        `/api/qa/knowledge-sources/${selected.id}/versions/${versionId}/verify`,
        {
          programmeId: PROGRAMME_ID,
          trustCategory: verifyForm.trustCategory,
          verificationNote: verifyForm.verificationNote.trim(),
        },
      );
      setSelected(detail);
      setVerifyForm(EMPTY_VERIFY);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not verify source version");
    } finally {
      setBusy(null);
    }
  }

  if (meLoading || loading) {
    return <div className="rounded-2xl border p-6 text-sm text-muted-foreground">Loading trusted sources…</div>;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Verified authority
          </div>
          <div className="mt-2 text-3xl font-semibold">
            {sources.filter((source) => ["AUTHORITATIVE", "INSTITUTIONAL_OFFICIAL"].includes(source.trustCategory)).length}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Official sources approved for governed use.</p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <BookOpenCheck className="h-4 w-4" /> Registered sources
          </div>
          <div className="mt-2 text-3xl font-semibold">{sources.length}</div>
          <p className="mt-1 text-sm text-muted-foreground">Across AUN-QA, Cambodia OBE, RUPP, Faculty and DSE.</p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" /> Awaiting verification
          </div>
          <div className="mt-2 text-3xl font-semibold">
            {sources.filter((source) => source.trustCategory === "UNVERIFIED").length}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Candidate sources are never treated as authoritative automatically.</p>
        </div>
      </section>

      {error ? (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search sources</span>
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title, issuer, version…"
                className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm"
              />
            </label>
            <select
              aria-label="Filter by domain"
              value={domainFilter}
              onChange={(event) => setDomainFilter(event.target.value as KnowledgeDomain | "")}
              className="h-10 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="">All domains</option>
              {DOMAINS.map((domain) => <option key={domain.value} value={domain.value}>{domain.label}</option>)}
            </select>
            <select
              aria-label="Filter by trust"
              value={trustFilter}
              onChange={(event) => setTrustFilter(event.target.value as KnowledgeTrustCategory | "")}
              className="h-10 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="">All trust states</option>
              <option value="AUTHORITATIVE">Authoritative</option>
              <option value="INSTITUTIONAL_OFFICIAL">Institutional official</option>
              <option value="TRUSTED_REFERENCE">Trusted reference</option>
              <option value="WORKING_REFERENCE">Working reference</option>
              <option value="UNVERIFIED">Unverified</option>
            </select>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={() => setShowCreate((current) => !current)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Register source
            </button>
          ) : null}
        </div>

        {showCreate && canManage ? (
          <SourceEditor
            title="Register a candidate source"
            form={form}
            onChange={setForm}
            onCancel={() => { setShowCreate(false); setForm(EMPTY_FORM); }}
            onSave={() => void createSource()}
            saving={busy === "create"}
          />
        ) : null}

        <div className="divide-y">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No trusted sources match this view.</div>
          ) : filtered.map((source) => (
            <button
              type="button"
              key={source.id}
              onClick={() => void openSource(source.id)}
              className="flex w-full flex-col gap-3 p-4 text-left transition hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{source.title}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${trustClass(source.trustCategory)}`}>
                    {formatLabel(source.trustCategory)}
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {source.issuingOrganisation} · {formatLabel(source.domain)}
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{source.currentVersion ? `v${source.currentVersion.versionLabel}` : "No current version"}</span>
                <span>{source.versionCount} version{source.versionCount === 1 ? "" : "s"}</span>
                {selected?.id === source.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>
          ))}
        </div>
      </section>

      {selected ? (
        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{selected.title}</h2>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${trustClass(selected.trustCategory)}`}>
                  {formatLabel(selected.trustCategory)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{selected.issuingOrganisation}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border px-2 py-1">{formatLabel(selected.domain)}</span>
                <span className="rounded-full border px-2 py-1">{formatLabel(selected.sourceType)}</span>
                <span className="rounded-full border px-2 py-1">{formatLabel(selected.accessClassification)}</span>
              </div>
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={() => setShowVersionForm((current) => !current)}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
              >
                <Plus className="h-4 w-4" /> Add version
              </button>
            ) : null}
          </div>

          {showVersionForm && canManage ? (
            <SourceEditor
              title="Add successor candidate version"
              form={versionForm}
              onChange={setVersionForm}
              versionOnly
              onCancel={() => { setShowVersionForm(false); setVersionForm(EMPTY_FORM); }}
              onSave={() => void addVersion()}
              saving={busy === "version"}
            />
          ) : null}

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Versions</h3>
              <div className="mt-3 space-y-3">
                {selected.versions.map((version) => (
                  <article key={version.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">Version {version.versionLabel}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {formatLabel(version.status)}
                          {version.publicationDate ? ` · Published ${version.publicationDate}` : ""}
                          {version.effectiveDate ? ` · Effective ${version.effectiveDate}` : ""}
                        </div>
                      </div>
                      {version.officialUrl ? (
                        <a
                          href={version.officialUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Original source
                        </a>
                      ) : null}
                    </div>
                    {version.verificationNote ? (
                      <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
                        <span className="font-medium">Why trusted:</span> {version.verificationNote}
                      </p>
                    ) : null}
                    {version.status === "CANDIDATE" && canManage ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-[220px_1fr_auto]">
                        <select
                          aria-label={`Trust category for version ${version.versionLabel}`}
                          value={verifyForm.trustCategory}
                          onChange={(event) => setVerifyForm((current) => ({
                            ...current,
                            trustCategory: event.target.value as VerifyForm["trustCategory"],
                          }))}
                          className="h-10 rounded-lg border bg-background px-3 text-sm"
                        >
                          {VERIFY_TRUST.map((trust) => <option key={trust.value} value={trust.value}>{trust.label}</option>)}
                        </select>
                        <input
                          aria-label={`Verification note for version ${version.versionLabel}`}
                          value={verifyForm.verificationNote}
                          onChange={(event) => setVerifyForm((current) => ({ ...current, verificationNote: event.target.value }))}
                          placeholder="Why is this source trustworthy?"
                          className="h-10 rounded-lg border bg-background px-3 text-sm"
                        />
                        <button
                          type="button"
                          disabled={verifyForm.verificationNote.trim().length < 3 || busy === `verify:${version.id}`}
                          onClick={() => void verifyVersion(version.id)}
                          className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                        >
                          {busy === `verify:${version.id}` ? "Verifying…" : "Verify & make current"}
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Audit history</h3>
              <div className="mt-3 space-y-3">
                {selected.audit.map((event) => (
                  <div key={event.id} className="rounded-xl border p-3 text-sm">
                    <div className="font-medium">{formatLabel(event.action)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</div>
                    {event.reason ? <p className="mt-2 text-muted-foreground">{event.reason}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SourceEditor({
  title,
  form,
  onChange,
  onCancel,
  onSave,
  saving,
  versionOnly = false,
}: {
  title: string;
  form: SourceForm;
  onChange: (form: SourceForm) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  versionOnly?: boolean;
}) {
  const canSave = versionOnly
    ? form.versionLabel.trim().length > 0
    : form.title.trim().length >= 2 && form.issuingOrganisation.trim().length >= 2 && form.versionLabel.trim().length > 0;

  return (
    <div className="border-b bg-muted/20 p-4 sm:p-5">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {!versionOnly ? (
          <>
            <Field label="Title"><input value={form.title} onChange={(e) => onChange({ ...form, title: e.target.value })} className="field" /></Field>
            <Field label="Short title"><input value={form.shortTitle} onChange={(e) => onChange({ ...form, shortTitle: e.target.value })} className="field" /></Field>
            <Field label="Issuing organisation"><input value={form.issuingOrganisation} onChange={(e) => onChange({ ...form, issuingOrganisation: e.target.value })} className="field" /></Field>
            <Field label="Domain">
              <select value={form.domain} onChange={(e) => onChange({ ...form, domain: e.target.value as KnowledgeDomain })} className="field">
                {DOMAINS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Source type">
              <select value={form.sourceType} onChange={(e) => onChange({ ...form, sourceType: e.target.value as KnowledgeSourceType })} className="field">
                {SOURCE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Access">
              <select value={form.accessClassification} onChange={(e) => onChange({ ...form, accessClassification: e.target.value as KnowledgeAccessClassification })} className="field">
                {ACCESS_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Scope / applicability"><input value={form.jurisdictionScope} onChange={(e) => onChange({ ...form, jurisdictionScope: e.target.value })} className="field" /></Field>
          </>
        ) : null}
        <Field label="Version"><input value={form.versionLabel} onChange={(e) => onChange({ ...form, versionLabel: e.target.value })} placeholder="e.g. 4.0" className="field" /></Field>
        <Field label="Publication date"><input type="date" value={form.publicationDate} onChange={(e) => onChange({ ...form, publicationDate: e.target.value })} className="field" /></Field>
        <Field label="Effective date"><input type="date" value={form.effectiveDate} onChange={(e) => onChange({ ...form, effectiveDate: e.target.value })} className="field" /></Field>
        <Field label="Review date"><input type="date" value={form.reviewDate} onChange={(e) => onChange({ ...form, reviewDate: e.target.value })} className="field" /></Field>
        <Field label="Official URL"><input type="url" value={form.officialUrl} onChange={(e) => onChange({ ...form, officialUrl: e.target.value })} className="field" /></Field>
        <Field label="Stored file reference"><input value={form.storedFileRef} onChange={(e) => onChange({ ...form, storedFileRef: e.target.value })} className="field" /></Field>
        <Field label="Language"><input value={form.language} onChange={(e) => onChange({ ...form, language: e.target.value })} className="field" /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm font-medium">Cancel</button>
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={onSave}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : versionOnly ? "Add candidate version" : "Register candidate"}
        </button>
      </div>
      <style jsx>{`
        .field {
          height: 2.5rem;
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          padding: 0 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
