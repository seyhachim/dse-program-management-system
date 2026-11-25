"use client";

import { BookOpenCheck, ClipboardCheck, FileQuestion, FileText, ShieldCheck } from "lucide-react";
import { QaEvidenceResultPanel } from "@/components/qa/qa-evidence-result";
import { useMe } from "@/lib/auth";
import { QA_DEMO_NOTICE, qaDemoDocuments, qaDemoResult } from "./demo-data";

/** Visible only to signed-in QA readers; the shell also enforces QA route roles. */
export function QaDemoClient() {
  const { me, loading, error } = useMe();

  if (loading) {
    return <main className="flex-1 p-6 text-sm text-muted-foreground" role="status">Vérification des droits d’accès…</main>;
  }

  if (error || !me?.permissions.includes("qa:read")) {
    return (
      <main className="flex-1 p-6">
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          Cette démonstration est réservée aux utilisateurs autorisés à consulter l’assurance qualité.
        </p>
      </main>
    );
  }

  return <QaDemoPresentation />;
}

/**
 * Static, screenshot-friendly composition. Deliberately has no handlers,
 * timers, API calls, AI providers, or writes to QA records.
 */
export function QaDemoPresentation() {
  return (
    <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-6">
      <div className="mx-auto max-w-[1220px] space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              DSE-PMS · AUN-QA 4.0
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
              Analyse des preuves d’assurance qualité
            </h2>
            <p className="mt-1 text-base text-muted-foreground">
              Exemple pédagogique : recherche de preuves, interprétation et validation humaine.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-base font-bold text-amber-800 dark:text-amber-300">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            {QA_DEMO_NOTICE.title}
          </span>
        </header>

        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-base font-bold text-amber-800 dark:text-amber-300" role="note">
          <span>{QA_DEMO_NOTICE.fictional}</span>
          <span>{QA_DEMO_NOTICE.noAi}</span>
          <span className="font-normal">Aucune conclusion réelle sur la RUPP ou le programme DSE.</span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6" aria-labelledby="qa-demo-case-title">
            <div className="flex items-center gap-2">
              <BookOpenCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 id="qa-demo-case-title" className="text-lg font-semibold text-foreground">Exemple de dossier de preuves</h3>
            </div>

            <div className="mt-4 rounded-xl bg-muted/60 p-4">
              <p className="text-base font-bold text-foreground">Exigence AUN-QA 4.1</p>
              <p className="mt-1 text-base text-foreground">TSA301 — Analyse des séries temporelles</p>
              <p className="mt-1 text-sm text-muted-foreground">Compétence C4 : analyser et visualiser des données</p>
              <p className="mt-2 text-sm text-muted-foreground">Association à l’exigence utilisée ici à titre illustratif, non comme conclusion d’audit.</p>
            </div>

            <h4 className="mt-5 text-base font-semibold text-foreground">Preuves dans ce scénario fictif</h4>
            <ul className="mt-3 space-y-3">
              {qaDemoDocuments.map((document, index) => {
                const Icon = index === 0 ? FileText : index === 1 ? ClipboardCheck : FileQuestion;
                return (
                  <li key={document.title} className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium leading-tight text-foreground">{document.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{document.description}</p>
                    </div>
                    <span className={`max-w-32 shrink-0 text-right text-xs font-semibold ${document.supplied ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}>
                      {document.availability}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <QaEvidenceResultPanel result={qaDemoResult} mode="demo" />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            { number: "01", title: "Documents", description: "Repérer les sources et les critères" },
            { number: "02", title: "Analyse", description: "Signaler une preuve à vérifier" },
            { number: "03", title: "Expert", description: "Valider avant toute décision" },
          ].map((step) => (
            <div key={step.number} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <span className="text-2xl font-bold text-primary">{step.number}</span>
              <div>
                <p className="text-base font-semibold text-foreground">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-sm font-medium text-muted-foreground">
          Interface de démonstration uniquement — ni analyse automatique ni résultat d’évaluation institutionnelle.
        </p>
      </div>
    </main>
  );
}
