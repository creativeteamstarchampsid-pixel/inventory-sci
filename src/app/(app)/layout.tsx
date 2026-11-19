import { cookies } from "next/headers";
import Link from "next/link";
import { BookOpen, CalendarClock } from "lucide-react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { RoleBadge } from "@/components/layout/role-badge";
import { RoleProvider } from "@/components/rbac/role-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/auth";
import { formatJakartaDate, getMonthlyUpdatePeriod } from "@/lib/period";
import { can, canAccessRoute } from "@/lib/rbac";

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
          <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500" />
          <header className="bg-background/90 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 backdrop-blur">
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
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-full border-amber-200 bg-amber-50/80 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <Link href="/guide">
                  <BookOpen className="size-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Panduan</span>
                </Link>
              </Button>
              <RoleBadge role={user.role} showSubtitle />
            </div>
          </header>

          {period.active && can(user.role, "inventory.validate_opname") && (
            <div className="border-b border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50/70 to-amber-50 px-4 py-2.5 text-amber-950 dark:border-amber-800 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-amber-950/40 dark:text-amber-100">
              <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4 shrink-0 text-amber-600 dark:text-amber-300" />
                  <span>
                    <strong>Waktunya Cek Barang Akhir Bulan ({period.periodLabel})</strong> —{" "}
                    {period.daysUntilCutoff === 0
                      ? "Hari ini hari terakhir pengecekan bulan ini (sampai pukul 23:59 WIB)."
                      : `Tinggal ${period.daysUntilCutoff} hari lagi menuju penutupan laporan akhir bulan.`}
                  </span>
                </div>
                {canAccessRoute(user.role, "/backup") && (
                  <Link
                    href="/backup"
                    className="font-semibold text-amber-900 underline underline-offset-4 hover:opacity-80 dark:text-amber-200"
                  >
                    {can(user.role, "backup.view")
                      ? "Buka Laporan Akhir Bulan →"
                      : "Buka Cek Ruangan & Ekspor →"}
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
