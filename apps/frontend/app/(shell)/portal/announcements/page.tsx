import { Topbar } from "../../topbar";
import { PortalAnnouncements } from "./portal-announcements";

export default function PortalAnnouncementsPage() {
  return <><Topbar title="Announcements" subtitle="Updates from your course sections" /><main className="flex-1 overflow-y-auto p-4 md:p-6"><PortalAnnouncements /></main></>;
}
