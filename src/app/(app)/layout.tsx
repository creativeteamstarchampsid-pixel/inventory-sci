import { cookies } from "next/headers";
import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { RoleBadge } from "@/components/layout/role-badge";
import { RoleProvider } from "@/components/rbac/role-provider";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/auth";
import { formatJakartaDate, getMonthlyUpdatePeriod } from "@/lib/period";
import { canAccessRoute } from "@/lib/rbac";

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  const period = getMonthlyUpdatePeriod();
  const todayLabel = formatJakartaDate();

  return (
    <RoleProvider
      user={{
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      }}
    >
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        <SidebarInset>
          <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold leading-none">
                  StarOps · Star Champs Indonesia
                </span>
                <span className="text-muted-foreground hidden text-xs sm:inline">
                  {todayLabel} (WIB)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <RoleBadge role={user.role} showSubtitle />
            </div>
          </header>

          {period.active && (
            <div className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4 shrink-0 text-amber-700 dark:text-amber-300" />
                  <span>
                    <strong>Periode Pengkinian Data Bulanan ({period.periodLabel})</strong> aktif —{" "}
                    {period.daysUntilCutoff === 0
                      ? "Hari ini batas cut-off akhir bulan pukul 23:59 WIB."
                      : `${period.daysUntilCutoff} hari menuju cut-off akhir bulan (23:59 WIB).`}
                  </span>
                </div>
                {canAccessRoute(user.role, "/backup") ? (
                  <Link
                    href="/backup"
                    className="font-medium underline underline-offset-4 hover:opacity-80"
                  >
                    Buka Rekonsiliasi & Backup →
                  </Link>
                ) : (
                  <Link
                    href="/scan"
                    className="font-medium underline underline-offset-4 hover:opacity-80"
                  >
                    Lakukan Stock Opname →
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </RoleProvider>
  );
}
