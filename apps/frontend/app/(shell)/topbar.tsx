import { SidebarTrigger } from "@dse-pms/ui";
import { TopbarUser } from "./topbar-user";

export interface TopbarProps {
  title: string;
  subtitle?: string;
}

/** Page topbar: sidebar toggle + title + user menu + theme switcher. The trigger lives here (not just the sidebar header) since on mobile the sidebar itself renders inside a hidden sheet with no other way to open it. */
export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <TopbarUser />
      </div>
    </header>
  );
}
