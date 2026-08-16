import { Topbar } from "../topbar";
import { AccountSettingsClient } from "./account-settings-client";
import { TelegramAccountCard } from "./telegram-account-card";

export default function AccountSettingsPage() {
  return (
    <>
      <Topbar title="Account Settings" subtitle="Manage your profile, password, and connected access" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <AccountSettingsClient />
          <TelegramAccountCard />
        </div>
      </main>
    </>
  );
}
