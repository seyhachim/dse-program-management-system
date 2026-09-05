import { Topbar } from "../topbar";
import { PortalHome } from "./portal-home";

export default function StudentPortalPage() {
  return (
    <>
      <Topbar title="Student Portal" subtitle="Your learning at a glance" />
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <PortalHome />
      </main>
    </>
  );
}
