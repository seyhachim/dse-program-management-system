import { Topbar } from "../topbar";
import { FinalProjectClient } from "./final-project-client";

export default function FinalProjectPage() {
  return (
    <>
      <Topbar
        title="Final Project"
        subtitle="Discover supervision fit, publish research directions, and see programme capacity"
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FinalProjectClient />
      </main>
    </>
  );
}
