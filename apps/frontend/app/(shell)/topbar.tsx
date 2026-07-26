import { TopbarUser } from "./topbar-user";

export interface TopbarProps {
  title: string;
  subtitle?: string;
}

/** Page topbar: title + user menu + theme switcher. Sidebar toggle lives in the sidebar header. */
export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-3">
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
