import { Topbar } from "../../topbar";
import { ParticipationClient } from "./participation-client";

export default function OpportunityParticipationPage() {
  return (
    <>
      <Topbar title="Interested students" subtitle="Programme-only participation roster" />
      <main className="flex-1 overflow-y-auto px-4 py-5 md:px-8">
        <ParticipationClient />
      </main>
    </>
  );
}
