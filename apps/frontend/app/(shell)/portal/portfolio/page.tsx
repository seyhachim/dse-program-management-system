import { Topbar } from "../../topbar";
import { PortfolioProfileEditor } from "./portfolio-profile-editor";

export default function StudentPortfolioPage() {
  return <><Topbar title="Portfolio" subtitle="Build your professional profile from verified PMS evidence" /><main className="flex-1 overflow-y-auto p-4 md:p-6"><PortfolioProfileEditor /></main></>;
}
