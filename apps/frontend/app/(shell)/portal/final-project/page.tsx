import { Topbar } from "../../topbar";
import { MyFinalProjectClient } from "./my-final-project-client";

export default function MyFinalProjectPage() {
  return (
    <>
      <Topbar title="My Final Project" subtitle="Advisor, milestones, submissions and project progression" />
      <main className="flex-1 overflow-y-auto p-6">
        <MyFinalProjectClient />
      </main>
    </>
  );
}
