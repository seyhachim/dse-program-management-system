import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import type { QaEvidenceAnalysisState } from "@dse-pms/shared-types";

/**
 * Read-only evidence analysis presentation. The view model intentionally does
 * not perform retrieval, classification, human review, or any persistence.
 * Future real QA analysis records can be adapted into this component.
 */
export type QaEvidenceResultSummary = Readonly<{
  state: QaEvidenceAnalysisState | null;
  explanation: string;
  sourceLabels: readonly string[];
  humanReviewStatus: "notReviewed" | "confirmed" | "rejected" | "needsMoreEvidence";
}>;

const statePresentation: Record<QaEvidenceAnalysisState, { label: string; classes: string }> = {
  evidenceIdentified: {
    label: "Preuve identifiée",
    classes: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  },
  potentialEvidenceGap: {
    label: "Lacune potentielle de preuve",
    classes: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  expertReviewRequired: {
    label: "Examen par un expert requis",
    classes: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  },
};

const reviewLabels: Record<QaEvidenceResultSummary["humanReviewStatus"], string> = {
  notReviewed: "En attente de validation humaine",
  confirmed: "Confirmé par un expert",
  rejected: "Rejeté par un expert",
  needsMoreEvidence: "Preuves supplémentaires demandées",
};

export function QaEvidenceResultPanel({
  result,
  mode = "real",
}: {
  result: QaEvidenceResultSummary;
  mode?: "demo" | "real";
}) {
  const presentation = result.state ? statePresentation[result.state] : null;

  return (
    <section aria-label="Résultat de l'analyse des preuves" className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-foreground">Résultat de l’analyse</h3>
        {mode === "demo" ? (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-800 dark:text-amber-300">
            Résultat illustratif
          </span>
        ) : null}
      </div>

      <div className={`mt-4 flex items-start gap-3 rounded-xl border px-4 py-4 ${presentation?.classes ?? "border-border bg-muted/50 text-foreground"}`}>
        {result.state === "evidenceIdentified" ? (
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
        ) : (
          <AlertCircle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight">{presentation?.label ?? "Non analysé"}</p>
          <p className="mt-2 text-base leading-relaxed">{result.explanation}</p>
        </div>
      </div>

      {result.sourceLabels.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-foreground">Références présentées</p>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {result.sourceLabels.map((label) => (
              <li key={label} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-auto pt-5">
        <div className="flex items-center gap-2 border-t border-border pt-4 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          {reviewLabels[result.humanReviewStatus]}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Une lacune documentaire n’est pas une preuve de mauvaise qualité. Aucun score ni décision d’accréditation automatique.
        </p>
        {mode === "demo" ? (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm font-bold text-amber-800 dark:text-amber-300">
            Aucune analyse IA réelle exécutée
          </p>
        ) : null}
      </div>
    </section>
  );
}
