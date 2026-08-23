import { Topbar } from "../../topbar";
import { TelegramAnalyticsClient } from "./telegram-analytics-client";

export default function TelegramAnalyticsPage() {
  return (
    <>
      <Topbar
        title="Telegram Analytics"
        subtitle="Track Mini App adoption and Ask DSE information gaps without exposing individual activity"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <TelegramAnalyticsClient />
      </main>
    </>
  );
}
