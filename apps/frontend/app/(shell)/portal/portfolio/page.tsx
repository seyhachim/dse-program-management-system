import { Topbar } from "../../topbar";
import { PortfolioWorkspace } from "./portfolio-workspace";

export default function StudentPortfolioPage() {
  return (
    <>
      <Topbar
        title="Portfolio"
        subtitle="Projects, professional presence, soft skills and programme competencies backed by PMS evidence"
      />
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <PortfolioWorkspace />
      </main>
    </>
  );
}
