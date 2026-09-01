import { Topbar } from "../topbar";
import { ParentPortalHome } from "./parent-portal-home";

export default function ParentPortalPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar
        title="Parent / Guardian Portal"
        subtitle="View information for your linked student relationships."
      />
      <ParentPortalHome />
    </div>
  );
}
