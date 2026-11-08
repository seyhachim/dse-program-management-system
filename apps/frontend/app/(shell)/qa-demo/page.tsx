import { Topbar } from "../topbar";
import { QaDemoClient } from "./qa-demo-client";

export default function QaDemoPage() {
  return (
    <>
      <Topbar
        title="AUN-QA — Démonstration"
        subtitle="Exemple fictif, lecture seule, sans analyse IA et sans changement des données du programme"
      />
      <QaDemoClient />
    </>
  );
}
