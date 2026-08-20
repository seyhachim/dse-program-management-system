import { Topbar } from "../topbar";
import { PublicInformationClient } from "./public-information-client";

export default function PublicInformationPage() {
  return (
    <>
      <Topbar
        title="Public Information"
        subtitle="Manage DSE programme information published to public channels"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <PublicInformationClient />
      </main>
    </>
  );
}
