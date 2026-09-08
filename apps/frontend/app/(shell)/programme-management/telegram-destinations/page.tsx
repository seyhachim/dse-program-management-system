import { Topbar } from "../../topbar";
import { TelegramDestinationsClient } from "./telegram-destinations-client";

export default function TelegramDestinationsPage() {
  return (
    <>
      <Topbar
        title="Telegram Destinations"
        subtitle="Connect programme groups and channels to privacy-safe DSE PMS notifications"
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <TelegramDestinationsClient />
      </main>
    </>
  );
}
