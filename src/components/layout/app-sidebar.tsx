"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import { KawaiiMascotSvg, KawaiiNavIcon } from "@/components/cartoon/kawaii-icons";
import { useRole } from "@/components/rbac/role-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { getNavGroupsForRole } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ROUTE_TILE_COLORS: Record<string, string> = {
  "/dashboard": "bg-[#D8F8E7] dark:bg-[#1E352B]",
  "/guide": "bg-[#FEF3C7] dark:bg-[#3A311E]",
  "/inventory": "bg-[#FFECD6] dark:bg-[#3B281B]",
  "/kits": "bg-[#FEF6D3] dark:bg-[#382F1C]",
  "/rooms": "bg-[#CCFBF1] dark:bg-[#1B3330]",
  "/scan": "bg-[#CCFBF1] dark:bg-[#1B3330]",
  "/barcode-studio": "bg-[#FFE4EA] dark:bg-[#3A2229]",
  "/requests": "bg-[#FFE2DC] dark:bg-[#3C2221]",
  "/archives": "bg-[#D1FAE5] dark:bg-[#1B342B]",
  "/deliveries": "bg-[#FFEDD5] dark:bg-[#3C2A1E]",
  "/vault": "bg-[#DFF2FE] dark:bg-[#1A2E3D]",
  "/backup": "bg-[#E0F2FE] dark:bg-[#1B2D3D]",
  "/audit-log": "bg-[#EDE9FE] dark:bg-[#2C233D]",
  "/recycle-bin": "bg-[#FCE7F3] dark:bg-[#3A2130]",
  "/settings": "bg-[#EDE9FE] dark:bg-[#2B243A]",
};

const GROUP_DOT_COLORS = [
  "bg-[#2AB673]",
  "bg-[#7CC4FA]",
  "bg-[#FDA4AF]",
  "bg-[#FDE68A]",
];

export function AppSidebar() {
  const pathname = usePathname();
  const { role } = useRole();
  const { isMobile, setOpenMobile } = useSidebar();
  const { showNavigating } = useCartoonFeedback();
  const groups = getNavGroupsForRole(role);

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const handleNavClick = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
    title: string,
    shouldNavigate: boolean,
  ) => {
    closeOnMobile();
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (shouldNavigate || pathname !== href) {
      showNavigating({
        title: `Membuka ${title}...`,
        subMessage: `Menuju: ${title}`,
      });
    }
  };

  return (
    <Sidebar
      collapsible="icon"
      className="border-r-2 border-[#2C2623] dark:border-[#5E5048] print:hidden"
    >
      <SidebarHeader className="border-b-2 border-dashed border-[#2C2623]/20 pb-3 dark:border-[#6D5D54]/40">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip="StarOps — Star Champs Indonesia"
              className="group/brand rounded-2xl border-2 border-[#2C2623] bg-[linear-gradient(135deg,#D8F8E7_0%,#FFFDF7_55%,#FEF3C7_100%)] text-[#2C2623] shadow-[2.5px_2.5px_0px_0px_#2C2623] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-[linear-gradient(135deg,#C6F6DC_0%,#FFFDF7_55%,#FDE68A_100%)] hover:shadow-[3.5px_3.5px_0px_0px_#2C2623] active:translate-x-[1px] active:translate-y-[1px] active:scale-[0.98] active:shadow-none group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:shadow-none dark:border-[#6D5D54] dark:bg-[linear-gradient(135deg,#1D352B_0%,#28221F_55%,#3A311E_100%)] dark:text-[#FDF8F0] dark:shadow-[2.5px_2.5px_0px_0px_#0E0B0A] dark:hover:shadow-[3.5px_3.5px_0px_0px_#0E0B0A]"
            >
              <Link
                href="/dashboard"
                onClick={(e) =>
                  handleNavClick(e, "/dashboard", "Beranda", pathname !== "/dashboard")
                }
                aria-label="Beranda StarOps"
              >
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[1.5px_1.5px_0px_0px_#2C2623] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/brand:scale-110 group-hover/brand:-rotate-6 dark:border-[#6D5D54] dark:bg-[#2C2522] dark:shadow-[1.5px_1.5px_0px_0px_#0E0B0A]">
                  <KawaiiMascotSvg type="dino" className="size-6.5" />
                </div>
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="flex items-center gap-1 truncate font-black tracking-tight">
                    <span>StarOps</span>
                    <span
                      aria-hidden="true"
                      className="animate-twinkle-2d inline-block text-xs text-[#2AB673] dark:text-[#4ADE9B]"
                    >
                      ★
                    </span>
                  </span>
                  <span className="truncate text-[11px] font-bold text-[#6B5E57] dark:text-[#C8B9AE]">
                    Star Champs Indonesia
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-1 py-2">
        {groups.map((group, groupIdx) => (
          <SidebarGroup key={group.label} className="py-1.5">
            <SidebarGroupLabel className="mb-1 h-auto px-2 py-0.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[#2C2623]/30 bg-[#F5E9D6]/85 px-2.5 py-0.5 text-[10px] font-black tracking-wider text-[#5A4D46] uppercase dark:border-[#6D5D54]/50 dark:bg-[#332B27] dark:text-[#D5C6BA]">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 rounded-full border border-[#2C2623]",
                    GROUP_DOT_COLORS[groupIdx % GROUP_DOT_COLORS.length],
                  )}
                />
                {group.label}
              </span>
            </SidebarGroupLabel>
            <SidebarMenu className="gap-1.5">
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                const tileBg =
                  ROUTE_TILE_COLORS[item.href] ?? "bg-[#FFFDF7] dark:bg-[#2C2522]";

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={cn(
                        "group/nav h-10 rounded-2xl border-2 px-2 py-1.5 font-bold transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-x-[1px] active:translate-y-[1px] active:scale-[0.97] active:shadow-none group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0.5!",
                        active
                          ? "border-[#2C2623] bg-[#FEF3C7]! font-extrabold text-[#2C2623]! shadow-[2.5px_2.5px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#3A311E]! dark:text-[#FDF8F0]! dark:shadow-[2.5px_2.5px_0px_0px_#0E0B0A]"
                          : "border-transparent text-[#3D3430] hover:-translate-y-0.5 hover:border-[#2C2623]/45 hover:bg-[#FFF4D6]/85 hover:text-[#2C2623] hover:shadow-[2px_2px_0px_0px_#2C2623]/30 dark:text-[#E5D8CE] dark:hover:border-[#6D5D54]/65 dark:hover:bg-[#332B27] dark:hover:text-[#FDF8F0] dark:hover:shadow-[2px_2px_0px_0px_#0E0B0A]/50",
                      )}
                    >
                      <Link
                        href={item.href}
                        onClick={(e) =>
                          handleNavClick(e, item.href, item.title, !active)
                        }
                      >
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-[#2C2623] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/nav:scale-110 group-hover/nav:-rotate-6 group-active/nav:scale-95 dark:border-[#6D5D54]",
                            tileBg,
                            active &&
                              "scale-105 shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:shadow-[1.5px_1.5px_0px_0px_#0E0B0A]",
                          )}
                        >
                          <KawaiiNavIcon href={item.href} className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/nav:translate-x-0.5 group-data-[collapsible=icon]:hidden">
                          {item.title}
                        </span>
                        {active && (
                          <i
                            aria-hidden="true"
                            className="animate-kawaii-pop ml-auto flex size-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#2C2623] bg-[#2AB673] text-[9px] leading-none font-black not-italic text-white shadow-[1px_1px_0px_0px_#2C2623] group-data-[collapsible=icon]:hidden dark:border-[#6D5D54] dark:bg-[#4ADE9B] dark:text-[#1B1715] dark:shadow-[1px_1px_0px_0px_#0E0B0A]"
                          >
                            ★
                          </i>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t-2 border-dashed border-[#2C2623]/20 pt-2.5 dark:border-[#6D5D54]/40">
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
