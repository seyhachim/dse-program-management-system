import { SidebarTrigger } from "@dse-pms/ui";
import { MOBILE_SHELL_LAYOUT } from "./mobile-shell-layout";
import { TopbarUser } from "./topbar-user";

export interface TopbarProps {
  title: string;
  subtitle?: string;
}

/** Page topbar: compact app bar on phones, full title/subtitle context on larger screens. */
export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className={MOBILE_SHELL_LAYOUT.topbar}>
      <div className={MOBILE_SHELL_LAYOUT.topbarLeading}>
        <SidebarTrigger className={MOBILE_SHELL_LAYOUT.sidebarTrigger} />
        <div className={MOBILE_SHELL_LAYOUT.titleBlock}>
          <h1 className={MOBILE_SHELL_LAYOUT.title}>{title}</h1>
          {subtitle ? (
            <p className={MOBILE_SHELL_LAYOUT.subtitle} title={subtitle}>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <div className={MOBILE_SHELL_LAYOUT.userArea}>
        <TopbarUser />
      </div>
    </header>
  );
}
