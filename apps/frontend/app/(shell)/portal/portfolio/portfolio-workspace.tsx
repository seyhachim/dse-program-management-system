"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  ExternalLink,
  FolderKanban,
  Link2,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import {
  STUDENT_PORTFOLIO_SOFT_SKILLS,
  type StudentPortfolioEvidence,
  type StudentPortfolioOverview,
  type StudentPortfolioSoftSkillCode,
  type StudentPortfolioVerificationEvent,
} from "@dse-pms/shared-types";
import { Dialog, DialogContent, DialogTitle } from "@dse-pms/ui";
import { studentPortfolioApi } from "@/lib/student-portfolio";
import { PortalError, PortalLoading } from "../portal-state";
import { PortfolioEvidenceManager } from "./portfolio-evidence-manager";
import { PortfolioLinksManager } from "./portfolio-links-manager";
import { PortfolioProfileEditor } from "./portfolio-profile-editor";

type Tab = "overview" | "projects" | "soft-skills" | "competencies" | "links";
type DrawerTab = "overview" | "evidence" | "verification";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "projects", label: "Projects" },
  { id: "soft-skills", label: "Soft Skills" },
  { id: "competencies", label: "Program Competencies" },
  { id: "links", label: "Accounts & Links" },
];

function humanStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground">{children}</span>;
}

function EvidenceDrawer({ evidence, onClose }: { evidence: StudentPortfolioEvidence; onClose(): void }) {
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [history, setHistory] = useState<StudentPortfolioVerificationEvent[]>([]);
  const [skillCodes, setSkillCodes] = useState<StudentPortfolioSoftSkillCode[]>([]);
  const [savingSkills, setSavingSkills] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab("overview");
    setError(null);
    Promise.all([
      studentPortfolioApi.verificationHistory(evidence.id),
      studentPortfolioApi.evidenceSoftSkills(evidence.id),
    ]).then(([events, mapping]) => {
      setHistory(events);
      setSkillCodes(mapping.skillCodes);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load evidence detail"));
  }, [evidence.id]);

  const currentVerification = history.at(-1);

  async function saveSoftSkills() {
    setSavingSkills(true);
    setError(null);
    try {
      const result = await studentPortfolioApi.updateEvidenceSoftSkills(evidence.id, skillCodes);
      setSkillCodes(result.skillCodes);
      setHistory(await studentPortfolioApi.verificationHistory(evidence.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update soft skills");
    } finally {
      setSavingSkills(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="inset-0 left-0 top-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-background p-0 text-foreground ring-0 md:left-auto md:right-0 md:w-[62vw] md:min-w-[640px] md:max-w-[960px]">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 pr-14 md:px-7 md:pr-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">View Evidence</p>
            <DialogTitle className="mt-1 text-xl font-semibold">{evidence.title}</DialogTitle>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill>{humanStatus(evidence.origin)}</StatusPill>
              <StatusPill>{evidence.visibility}</StatusPill>
              <StatusPill>{currentVerification ? humanStatus(currentVerification.newState) : "Unverified"}</StatusPill>
            </div>
          </div>
        </header>

        <nav aria-label="Evidence detail sections" className="flex gap-1 overflow-x-auto border-b border-border px-5 py-2 md:px-7">
          {(["overview", "evidence", "verification"] as DrawerTab[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              aria-pressed={tab === item}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {humanStatus(item)}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-5 md:p-7">
          {error ? <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

          {tab === "overview" ? (
            <div className="space-y-5">
              <section className="rounded-2xl border border-border p-5">
                <h3 className="font-semibold">Contribution</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{evidence.contribution || "No contribution statement yet."}</p>
                {evidence.role ? <p className="mt-3 text-sm"><span className="font-medium">Role:</span> {evidence.role}</p> : null}
              </section>
              <section className="rounded-2xl border border-border p-5">
                <h3 className="font-semibold">Summary</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{evidence.summary || "No summary yet."}</p>
              </section>
              {evidence.source ? (
                <section className="rounded-2xl border border-border p-5">
                  <h3 className="font-semibold">PMS provenance</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {evidence.source.available
                      ? `${evidence.source.courseCode} · ${evidence.source.assessmentName} · ${evidence.source.term}/${evidence.source.sectionCode}`
                      : "The academic source is currently restricted or unavailable. Provenance is retained without exposing source detail."}
                  </p>
                </section>
              ) : null}
            </div>
          ) : null}

          {tab === "evidence" ? (
            <div className="space-y-5">
              <section className="rounded-2xl border border-border p-5">
                <h3 className="font-semibold">Supporting artifacts</h3>
                {evidence.links.length ? (
                  <div className="mt-3 space-y-2">
                    {evidence.links.map((link) => (
                      <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-muted">
                        <span>{link.label || humanStatus(link.kind)}</span>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ))}
                  </div>
                ) : <p className="mt-2 text-sm text-muted-foreground">No artifact links added.</p>}
              </section>

              <section className="rounded-2xl border border-border p-5">
                <h3 className="font-semibold">Soft skills supported by this evidence</h3>
                <p className="mt-1 text-sm text-muted-foreground">These are evidence links, not self-ratings. Changing them invalidates a current verification so the new claim can be reviewed.</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {STUDENT_PORTFOLIO_SOFT_SKILLS.map((skill) => (
                    <label key={skill.code} className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={skillCodes.includes(skill.code)}
                        onChange={(event) => setSkillCodes((current) => event.target.checked ? [...current, skill.code] : current.filter((code) => code !== skill.code))}
                      />
                      <span>
                        <span className="font-medium">{skill.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{skill.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <button type="button" onClick={saveSoftSkills} disabled={savingSkills} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {savingSkills ? "Saving…" : "Save soft-skill evidence"}
                </button>
              </section>
            </div>
          ) : null}

          {tab === "verification" ? (
            <section className="rounded-2xl border border-border p-5">
              <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h3 className="font-semibold">Verification history</h3></div>
              {history.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">This evidence has not been verified yet.</p> : (
                <ol className="mt-4 space-y-3">
                  {history.map((event) => (
                    <li key={event.id} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill>{humanStatus(event.previousState)} → {humanStatus(event.newState)}</StatusPill>
                        <span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="mt-2 text-sm font-medium">{event.actorName ?? "System"} · {humanStatus(event.actorContext)}</p>
                      {event.reason ? <p className="mt-1 text-sm text-muted-foreground">{event.reason}</p> : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PortfolioWorkspace() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<StudentPortfolioOverview | null>(null);
  const [evidence, setEvidence] = useState<StudentPortfolioEvidence[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextOverview, nextEvidence] = await Promise.all([studentPortfolioApi.overview(), studentPortfolioApi.evidence()]);
      setOverview(nextOverview);
      setEvidence(nextEvidence);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load portfolio");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === "overview" || tab === "soft-skills" || tab === "competencies") void load(); }, [tab, load]);

  const selectedEvidence = useMemo(() => evidence.find((item) => item.id === selectedEvidenceId) ?? null, [evidence, selectedEvidenceId]);
  const openEvidence = (evidenceId: string) => setSelectedEvidenceId(evidenceId);

  if (loading && !overview) return <PortalLoading />;
  if (error && !overview) return <PortalError message={error} />;
  if (!overview) return <PortalError message="Could not load portfolio" />;

  return <div className="mx-auto max-w-7xl space-y-5">
    <div className="overflow-x-auto rounded-2xl border border-border bg-card p-1.5">
      <div className="flex min-w-max gap-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-pressed={tab === item.id}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium ${tab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>

    {error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div> : null}

    {tab === "overview" ? <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1.7fr_0.8fr]">
        <div className="rounded-2xl border border-border bg-card p-5 md:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Student Portfolio</p><h1 className="mt-1 text-2xl font-semibold">{overview.profile.identity.name}</h1><p className="mt-1 text-sm font-medium text-muted-foreground">{overview.profile.headline || "Add a professional headline"}</p>{overview.profile.bio ? <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">{overview.profile.bio}</p> : null}<div className="mt-4 flex flex-wrap gap-2">{overview.profile.careerInterests.map((interest) => <StatusPill key={interest}>{interest}</StatusPill>)}</div></div>{overview.profile.visibility === "public" && overview.profile.publicSlug ? <a href={`/portfolio/${overview.profile.publicSlug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold"><ExternalLink className="h-4 w-4" />Public portfolio</a> : <span className="rounded-xl bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">Private portfolio</span>}</div></div>
        <div className="rounded-2xl border border-border bg-card p-5 md:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Completion</p><p className="mt-1 text-3xl font-semibold">{overview.completion.percentage}%</p></div><CheckCircle2 className="h-8 w-8 text-primary" /></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${overview.completion.percentage}%` }} /></div>{overview.completion.remaining.length ? <p className="mt-3 text-xs text-muted-foreground">Next: {overview.completion.remaining[0]}</p> : <p className="mt-3 text-xs text-muted-foreground">Core portfolio sections complete.</p>}</div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><FolderKanban className="h-5 w-5 text-primary" /><h2 className="font-semibold">Featured Projects & Evidence</h2></div>{overview.featuredEvidence.length ? <div className="mt-4 space-y-3">{overview.featuredEvidence.slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => openEvidence(item.id)} className="w-full rounded-xl border border-border p-4 text-left hover:bg-muted/50"><p className="font-medium">{item.title}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.summary || item.contribution || "View supporting evidence"}</p><span className="mt-2 inline-block text-xs font-semibold text-primary">View Evidence →</span></button>)}</div> : <p className="mt-4 text-sm text-muted-foreground">Feature one of your projects to highlight it here.</p>}</div>
      <div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /><h2 className="font-semibold">Program Competency Snapshot</h2></div><div className="mt-4 space-y-3">{overview.competencies.slice(0, 5).map((item) => <div key={item.competencyId} className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{item.code} · {item.name}</p><p className="text-xs text-muted-foreground">{item.evidence.length} supporting evidence item(s)</p></div><StatusPill>{humanStatus(item.status)}</StatusPill></div>)}</div></div></section>

      <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><h2 className="font-semibold">Soft Skills</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{overview.softSkills.filter((item) => item.evidenceCount > 0).slice(0, 6).map((item) => <div key={item.code} className="rounded-xl border border-border p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{item.name}</p><StatusPill>{humanStatus(item.status)}</StatusPill></div><p className="mt-1 text-xs text-muted-foreground">{item.verifiedExperienceCount} verified experience(s)</p>{item.evidence[0] ? <button type="button" onClick={() => openEvidence(item.evidence[0]!.id)} className="mt-2 text-xs font-semibold text-primary">View Evidence →</button> : null}</div>)}{overview.softSkills.every((item) => item.evidenceCount === 0) ? <p className="text-sm text-muted-foreground">Link your projects to teamwork, communication, leadership and other professional skills.</p> : null}</div></div><div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" /><h2 className="font-semibold">Professional Accounts</h2></div><div className="mt-4 space-y-2">{overview.links.slice(0, 5).map((item) => <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"><span>{item.label || humanStatus(item.provider)}</span><ExternalLink className="h-4 w-4 text-primary" /></a>)}{overview.links.length === 0 ? <p className="text-sm text-muted-foreground">Add GitHub/GitLab, LinkedIn, CV and other professional profiles.</p> : null}</div></div></section>
      <PortfolioProfileEditor />
    </div> : null}

    {tab === "projects" ? <PortfolioEvidenceManager /> : null}
    {tab === "links" ? <PortfolioLinksManager /> : null}

    {tab === "soft-skills" ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{overview.softSkills.map((skill) => <article key={skill.code} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{skill.name}</p><p className="mt-1 text-xs text-muted-foreground">{skill.description}</p></div><StatusPill>{humanStatus(skill.status)}</StatusPill></div><p className="mt-4 text-sm"><strong>{skill.verifiedExperienceCount}</strong> verified experience(s) · {skill.evidenceCount} linked evidence</p><div className="mt-3 space-y-2">{skill.evidence.slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => openEvidence(item.id)} className="block w-full rounded-xl border border-border px-3 py-2 text-left text-sm hover:bg-muted"><span className="font-medium">{item.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{humanStatus(item.verification.state)} · {item.sourceLabel}</span></button>)}</div></article>)}</section> : null}

    {tab === "competencies" ? <section className="space-y-4">{overview.competencies.map((competency) => <article key={competency.competencyId} className="rounded-2xl border border-border bg-card p-5 md:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">{competency.code}</p><h2 className="mt-1 text-lg font-semibold">{competency.name}</h2>{competency.description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{competency.description}</p> : null}<p className="mt-2 text-xs text-muted-foreground">Derived through PLOs: {competency.linkedPloCodes.join(", ") || "—"} · Rule {competency.ruleVersion}</p></div><StatusPill>{humanStatus(competency.status)}</StatusPill></div>{competency.evidence.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{competency.evidence.map((item) => <button key={`${competency.competencyId}:${item.evidenceId}:${item.cloCode}`} type="button" onClick={() => openEvidence(item.evidenceId)} className="rounded-xl border border-border p-4 text-left hover:bg-muted"><p className="font-medium">{item.evidenceTitle}</p><p className="mt-1 text-xs text-muted-foreground">{item.courseCode} · {item.cloCode} → {item.ploCodes.join(", ")}</p><p className="mt-2 text-xs font-semibold text-primary">Why / View Evidence →</p></button>)}</div> : <p className="mt-4 text-sm text-muted-foreground">No eligible approved course evidence supports this competency yet.</p>}</article>)}</section> : null}

    {selectedEvidence ? <EvidenceDrawer evidence={selectedEvidence} onClose={() => setSelectedEvidenceId(null)} /> : null}
  </div>;
}
