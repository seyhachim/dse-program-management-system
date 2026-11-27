import { Topbar } from "../../topbar";
import { RegistrationRequestsClient } from "./registration-requests-client";

export default function RegistrationRequestsPage() {
  return <><Topbar title="Registration requests" subtitle="Verify Telegram student registrations against the official roster" /><main className="flex-1 overflow-y-auto p-6"><RegistrationRequestsClient /></main></>;
}
