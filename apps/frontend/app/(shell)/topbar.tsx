import { SidebarTrigger } from "@dse-pms/ui";
import { TopbarUser } from "./topbar-user";

export interface TopbarProps {
  title: string;
  subtitle?: string;
}

/** Page topbar: sidebar toggle (mobile only, md:hidden) + title + user menu + theme switcher. On desktop the toggle lives in the sidebar header instead, next to the logo. */
export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="md:hidden" />
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
