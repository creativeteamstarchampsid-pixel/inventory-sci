import { cookies } from "next/headers";
import Link from "next/link";
import { BookOpen, CalendarClock } from "lucide-react";

import { CartoonFeedbackProvider } from "@/components/cartoon/feedback-provider";
import { KawaiiBackdrop } from "@/components/cartoon/kawaii-backdrop";
import { KawaiiMascotSvg } from "@/components/cartoon/kawaii-icons";
import { KawaiiPageTransition } from "@/components/cartoon/page-transition";
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
      <CartoonFeedbackProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <AppSidebar />
          <SidebarInset className="kawaii-paper-bg relative print:bg-white">
            <KawaiiBackdrop />

            {/* Pastel Rainbow Doodle Top Stripe */}
            <div
              aria-hidden="true"
              className="animate-kawaii-shimmer relative z-[1] h-2 w-full shrink-0 border-b-2 border-[#2C2623] bg-[linear-gradient(90deg,#2AB673_0%,#7CC4FA_25%,#FDE68A_50%,#FDA4AF_75%,#C4B5FD_100%)] dark:border-[#5E5048] print:hidden"
            />

            {/* Sticky 2D Japanese Cartoon Header */}
            <header className="sticky top-0 z-10 flex h-15 shrink-0 items-center justify-between gap-2 border-b-2 border-[#2C2623] bg-[#FFFDF7]/92 px-3.5 backdrop-blur-md sm:px-4 dark:border-[#5E5048] dark:bg-[#231E1B]/92 print:hidden">
              <div className="flex min-w-0 items-center gap-2">
                <SidebarTrigger className="-ml-0.5 size-9 rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:bg-[#FEF3C7] hover:shadow-[3px_3px_0px_0px_#2C2623] active:translate-x-[1px] active:translate-y-[1px] active:scale-95 active:shadow-none dark:border-[#6D5D54] dark:bg-[#2C2522] dark:text-[#FDF8F0] dark:shadow-[2px_2px_0px_0px_#0E0B0A] dark:hover:bg-[#3A311E] dark:hover:shadow-[3px_3px_0px_0px_#0E0B0A]" />
                <Separator
                  orientation="vertical"
                  className="mx-1 bg-[#2C2623]/25 data-[orientation=vertical]:h-5 dark:bg-[#6D5D54]/50"
                />
                <Link
                  href="/dashboard"
                  aria-label="Beranda StarOps"
                  className="group flex min-w-0 items-center gap-2.5"
                >
                  <span className="hidden size-9 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7] shadow-[2px_2px_0px_0px_#2C2623] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:-rotate-6 group-active:scale-95 sm:flex dark:border-[#6D5D54] dark:bg-[#3A311E] dark:shadow-[2px_2px_0px_0px_#0E0B0A]">
                    <KawaiiMascotSvg
                      type="star"
                      className="size-7 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-105 group-hover:rotate-6"
                    />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center rounded-full border-[1.5px] border-[#2C2623] bg-[#2AB673] px-2 py-0.5 text-[11px] font-black tracking-wide text-white shadow-[1.5px_1.5px_0px_0px_#2C2623] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-translate-y-[1px] group-hover:scale-105 dark:border-[#6D5D54] dark:bg-[#4ADE9B] dark:text-[#1B1715]">
                        StarOps
                      </span>
                      <span className="truncate text-sm font-extrabold tracking-tight text-[#2C2623] dark:text-[#FDF8F0]">
                        Star Champs Indonesia
                      </span>
                    </div>
                    <span className="text-muted-foreground hidden text-xs font-semibold sm:inline">
                      {todayLabel} (WIB)
                    </span>
                  </div>
                </Link>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="group/guide h-8 gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#FDE68A] px-3 text-xs font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:bg-[#FCD34D] hover:shadow-[3px_3px_0px_0px_#2C2623] active:translate-x-[1px] active:translate-y-[1px] active:scale-95 active:shadow-none dark:border-[#6D5D54] dark:bg-[#4A3B1E] dark:text-[#FDE68A] dark:shadow-[2px_2px_0px_0px_#0E0B0A] dark:hover:bg-[#5A4723] dark:hover:shadow-[3px_3px_0px_0px_#0E0B0A]"
                >
                  <Link href="/guide">
                    <BookOpen
                      className="size-3.5 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/guide:scale-110 group-hover/guide:-rotate-12"
                      aria-hidden
                    />
                    <span>Panduan</span>
                  </Link>
                </Button>
                <RoleBadge role={user.role} showSubtitle />
              </div>
            </header>

            {/* Warm Comic End-of-Month Opname Banner */}
            {period.active && can(user.role, "inventory.validate_opname") && (
              <div className="relative z-[1] border-b-2 border-[#2C2623] bg-[linear-gradient(90deg,#FEF3C7_0%,#FFECD6_50%,#FFE4EA_100%)] px-4 py-2.5 text-[#2C2623] dark:border-[#5E5048] dark:bg-[linear-gradient(90deg,#3A2F1B_0%,#3D291C_50%,#3A2128_100%)] dark:text-[#FDF8F0] print:hidden">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-[#2C2623] bg-[#FFFDF7] text-[#D97706] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#28221F] dark:text-[#FDE68A]">
                      <CalendarClock className="size-4" aria-hidden />
                    </span>
                    <span className="font-semibold">
                      <strong className="font-black">
                        Waktunya Cek Barang Akhir Bulan ({period.periodLabel})
                      </strong>{" "}
                      —{" "}
                      {period.daysUntilCutoff === 0
                        ? "Hari ini hari terakhir pengecekan bulan ini (sampai pukul 23:59 WIB)."
                        : `Tinggal ${period.daysUntilCutoff} hari lagi menuju penutupan laporan akhir bulan.`}
                    </span>
                  </div>
                  {canAccessRoute(user.role, "/backup") && (
                    <Link
                      href="/backup"
                      className="inline-flex items-center gap-1 rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] px-3 py-1 text-xs font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:bg-[#D8F8E7] hover:shadow-[3px_3px_0px_0px_#2C2623] active:translate-x-[1px] active:translate-y-[1px] active:scale-95 active:shadow-none dark:border-[#6D5D54] dark:bg-[#28221F] dark:text-[#FDE68A] dark:hover:bg-[#1E352B]"
                    >
                      {can(user.role, "backup.view")
                        ? "Buka Laporan Akhir Bulan →"
                        : "Buka Cek Ruangan & Ekspor →"}
                    </Link>
                  )}
                </div>
              </div>
            )}

            <div className="relative z-[1] mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
              <KawaiiPageTransition>{children}</KawaiiPageTransition>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </CartoonFeedbackProvider>
    </RoleProvider>
  );
}
