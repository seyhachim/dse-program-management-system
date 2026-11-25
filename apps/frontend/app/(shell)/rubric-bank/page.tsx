import { Topbar } from "../topbar";
import { RubricBankClient } from "./rubric-bank-client";

export default function RubricBankPage() {
  return (
    <>
      <Topbar
        title="Assessment Instrument Library"
        subtitle="Create and manage reusable rubrics and marking schemes for Course Specifications"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <RubricBankClient />
      </main>
    </>
  );
}
