import { SidebarInset, SidebarProvider } from "@dse-pms/ui";
import { AuthGuard } from "./auth-guard";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { MOBILE_APP_SHELL_LAYOUT } from "./mobile-app-navigation";
import { RoleAccessGuard } from "./role-access-guard";
import { AppSidebar } from "./sidebar";

/** App shell: desktop sidebar plus a role-aware mobile app frame on phones. */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className={MOBILE_APP_SHELL_LAYOUT.inset}>
          <RoleAccessGuard>{children}</RoleAccessGuard>
          <MobileBottomNav />
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  );
}
