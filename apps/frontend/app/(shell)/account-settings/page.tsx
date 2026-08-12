import { Topbar } from "../topbar";
import { AccountSettingsClient } from "./account-settings-client";

export default function AccountSettingsPage() {
  return (
    <>
      <Topbar title="Account Settings" subtitle="Manage your lecturer profile and password" />
      <main className="flex-1 overflow-y-auto p-6">
        <AccountSettingsClient />
      </main>
    </>
  );
}
