import { Topbar } from "../topbar";
import { RubricBankClient } from "./rubric-bank-client";

export default function RubricBankPage() {
  return (
    <>
      <Topbar
        title="Rubric Bank"
        subtitle="Create and manage reusable assessment rubrics for Course Specifications"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <RubricBankClient />
      </main>
    </>
  );
}
