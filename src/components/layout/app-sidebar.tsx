"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Star } from "lucide-react";

import { getNavGroupsForRole } from "@/config/navigation";
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
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const { role } = useRole();
  const { isMobile, setOpenMobile } = useSidebar();
  const groups = getNavGroupsForRole(role);

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="StarOps">
              <Link href="/dashboard" onClick={closeOnMobile}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-500 text-white shadow-sm">
                  <Star className="size-4 fill-white/25" aria-hidden />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold tracking-tight">StarOps</span>
                  <span className="text-muted-foreground truncate text-xs">
                    Star Champs Indonesia
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] font-semibold tracking-wider uppercase opacity-70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={cn(
                        "rounded-xl transition-all",
                        active && "bg-indigo-50/90 font-semibold text-indigo-950 shadow-2xs dark:bg-indigo-950/50 dark:text-indigo-100",
                      )}
                    >
                      <Link href={item.href} onClick={closeOnMobile}>
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-lg transition-transform",
                            item.colorClass,
                          )}
                        >
                          <item.icon className="size-3.5" aria-hidden />
                        </span>
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
