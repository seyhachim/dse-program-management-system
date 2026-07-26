import { Topbar } from "../topbar";
import { DashboardClient } from "./dashboard-client";

export default function DashboardPage() {
  return (
    <>
      <Topbar title="Dashboard" subtitle="Programme overview" />
      <main className="flex-1 overflow-y-auto p-6">
        <DashboardClient />
      </main>
    </>
  );
}
