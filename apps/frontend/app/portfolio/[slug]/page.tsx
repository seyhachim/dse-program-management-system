"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ExternalLink, FolderKanban, ShieldCheck, Sparkles, Target } from "lucide-react";
import type { PublicStudentPortfolio, PublicStudentPortfolioEvidence } from "@dse-pms/shared-types";
import { Dialog, DialogContent, DialogTitle } from "@dse-pms/ui";
import { publicStudentPortfolio } from "@/lib/student-portfolio";

function human(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function Pill({ children }: { children: React.ReactNode }) { return <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium">{children}</span>; }

function PublicEvidenceDialog({ evidence, onClose }: { evidence: PublicStudentPortfolioEvidence; onClose(): void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="inset-0 left-0 top-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-background p-0 text-foreground ring-0 md:left-auto md:right-0 md:w-[58vw] md:min-w-[620px] md:max-w-[900px]">
        <header className="border-b border-border p-5 pr-14 md:p-7 md:pr-14">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Public Evidence</p>
          <DialogTitle className="mt-1 text-xl font-semibold">{evidence.title}</DialogTitle>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill>{evidence.verification.state === "verified" ? `Verified · ${human(evidence.verification.context ?? "")}` : human(evidence.verification.state)}</Pill>
            {evidence.featured ? <Pill>Featured</Pill> : null}
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 md:p-7">
          <section className="rounded-2xl border border-border p-5">
            <h3 className="font-semibold">Contribution</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{evidence.contribution || "No contribution statement provided."}</p>
            {evidence.role ? <p className="mt-3 text-sm"><span className="font-medium">Role:</span> {evidence.role}</p> : null}
          </section>

          <section className="rounded-2xl border border-border p-5">
            <h3 className="font-semibold">Project summary</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{evidence.summary || "No summary provided."}</p>
          </section>

          {evidence.links.length ? (
            <section className="rounded-2xl border border-border p-5">
              <h3 className="font-semibold">Supporting artifacts</h3>
              <div className="mt-3 space-y-2">
                {evidence.links.map((link) => (
                  <a key={`${link.kind}:${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-muted">
                    <span>{link.label || human(link.kind)}</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          <p className="text-xs text-muted-foreground">Public verification intentionally omits private reviewer notes, identities beyond the safe verifier context, marks/results, student IDs and internal PMS identifiers.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PublicPortfolioPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [data, setData] = useState<PublicStudentPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    publicStudentPortfolio(slug)
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load portfolio"))
      .finally(() => setLoading(false));
  }, [slug]);

  const selected = useMemo(() => data?.evidence.find((item) => item.id === selectedId) ?? null, [data, selectedId]);

  if (loading) return <main className="min-h-screen bg-background p-8 text-center text-sm text-muted-foreground">Loading public portfolio…</main>;
  if (error || !data) return <main className="min-h-screen bg-background p-8"><div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center"><h1 className="text-xl font-semibold">Portfolio unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error ?? "This portfolio is private or no longer published."}</p></div></main>;

  return <main className="min-h-screen bg-background">
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6 md:py-12">
      <header className="rounded-3xl border border-border bg-card p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">DSE Student Portfolio</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{data.name}</h1>
        <p className="mt-2 text-base font-medium text-muted-foreground">{data.headline}</p>
        {data.bio ? <p className="mt-5 max-w-3xl text-sm leading-6 text-muted-foreground">{data.bio}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">{data.careerInterests.map((item) => <Pill key={item}>{item}</Pill>)}</div>
        {data.links.length ? <div className="mt-6 flex flex-wrap gap-2">{data.links.map((link) => <a key={`${link.provider}:${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted"><ExternalLink className="h-4 w-4" />{link.label || human(link.provider)}</a>)}</div> : null}
      </header>

      <section>
        <div className="mb-3 flex items-center gap-2"><FolderKanban className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Projects & Evidence</h2></div>
        {data.evidence.length ? <div className="grid gap-4 md:grid-cols-2">{data.evidence.map((item) => <article key={item.id} className="rounded-2xl border border-border bg-card p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.title}</h3>{item.featured ? <Pill>Featured</Pill> : null}{item.verification.state === "verified" ? <Pill>Verified · {human(item.verification.context ?? "")}</Pill> : null}</div><p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{item.summary || item.contribution}</p><button type="button" onClick={() => setSelectedId(item.id)} className="mt-4 text-sm font-semibold text-primary">View Evidence →</button></article>)}</div> : <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No public project evidence selected.</p>}
      </section>

      {data.softSkills.length ? <section><div className="mb-3 flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Professional & Soft Skills</h2></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.softSkills.map((skill) => <article key={skill.code} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{skill.name}</h3><Pill>{human(skill.status)}</Pill></div><p className="mt-2 text-sm text-muted-foreground">{skill.verifiedExperienceCount} verified experience(s)</p>{skill.evidence[0] ? <button type="button" onClick={() => setSelectedId(skill.evidence[0]!.id)} className="mt-3 text-sm font-semibold text-primary">View Evidence →</button> : null}</article>)}</div></section> : null}

      {data.competencies.length ? <section><div className="mb-3 flex items-center gap-2"><Target className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Program Competencies</h2></div><div className="space-y-4">{data.competencies.map((competency) => <article key={competency.competencyId} className="rounded-2xl border border-border bg-card p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">{competency.code}</p><h3 className="mt-1 font-semibold">{competency.name}</h3>{competency.description ? <p className="mt-1 text-sm text-muted-foreground">{competency.description}</p> : null}</div><Pill>{human(competency.status)}</Pill></div>{competency.evidence[0] ? <button type="button" onClick={() => setSelectedId(competency.evidence[0]!.evidenceId)} className="mt-3 text-sm font-semibold text-primary">Why / View Evidence →</button> : null}</article>)}</div></section> : null}

      <footer className="flex items-center gap-2 border-t border-border py-6 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Only information explicitly published by the student is shown here. Private academic records and reviewer notes are not exposed.</footer>
    </div>

    {selected ? <PublicEvidenceDialog evidence={selected} onClose={() => setSelectedId(null)} /> : null}
  </main>;
}
