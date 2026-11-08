import type { QaEvidenceResultSummary } from "@/components/qa/qa-evidence-result";

/** All values are invented for the AUF interface illustration. No PMS records are read. */
export const QA_DEMO_NOTICE = {
  title: "Démonstration",
  fictional: "Données fictives",
  noAi: "Aucune analyse IA réelle exécutée",
} as const;

export const qaDemoDocuments = [
  {
    title: "Spécification du cours",
    description: "Objectifs et lien avec la compétence C4",
    availability: "Disponible dans l’exemple",
    supplied: true,
  },
  {
    title: "Grille d’évaluation",
    description: "Critères et méthodes d’évaluation",
    availability: "Disponible dans l’exemple",
    supplied: true,
  },
  {
    title: "Travaux étudiants évalués",
    description: "Échantillon anonymisé de résultats",
    availability: "Non fourni dans l’exemple",
    supplied: false,
  },
] as const;

export const qaDemoResult: QaEvidenceResultSummary = {
  state: "expertReviewRequired",
  explanation:
    "Les documents fictifs décrivent le cours et son évaluation, mais ne permettent pas, à eux seuls, de confirmer l’atteinte de la compétence C4. Un examen humain serait nécessaire.",
  sourceLabels: [
    "Spécification TSA301 (fictive)",
    "Grille d’évaluation TSA301 (fictive)",
  ],
  humanReviewStatus: "notReviewed",
};
