import { Topbar } from "../topbar";
import { PortfolioVerificationInbox } from "./verification-inbox";

export default function PortfolioVerificationPage() {
  return <><Topbar title="Portfolio Evidence Review" subtitle="Verify only student evidence within your teaching or approved supervision scope" /><main className="flex-1 overflow-y-auto p-4 md:p-6"><PortfolioVerificationInbox /></main></>;
}
