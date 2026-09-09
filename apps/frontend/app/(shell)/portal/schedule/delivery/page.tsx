import { Suspense } from "react";
import { Topbar } from "../../../topbar";
import { PortalLoading } from "../../portal-state";
import { MonitorDeliveryForm } from "./monitor-delivery-form";

export default function MonitorDeliveryPage() {
  return (
    <>
      <Topbar
        title="Class delivery"
        subtitle="Record what actually happened in this class"
      />
      <main className="flex-1 overflow-y-auto bg-muted/20 p-3 sm:p-4 md:p-6">
        <Suspense fallback={<PortalLoading />}>
          <MonitorDeliveryForm />
        </Suspense>
      </main>
    </>
  );
}
