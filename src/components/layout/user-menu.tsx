"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import { useRole } from "@/components/rbac/role-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/actions/auth";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { RoleBadge } from "./role-badge";

const AVATAR_BG_BY_ROLE: Record<Role, string> = {
  OWNER: "bg-[#FDE68A] text-[#2C2623]",
  SUPER_ADMIN: "bg-[#DDD6FE] text-[#2C2623]",
  TEAM_LEADER: "bg-[#BAE6FD] text-[#2C2623]",
  STAFF: "bg-[#BBF7D0] text-[#2C2623]",
};

export function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function UserMenu() {
  const { user, role, can } = useRole();
  const { isMobile } = useSidebar();
  const { showWorking } = useCartoonFeedback();
  const settingsLabel = can("users.manage") ? "Pengaturan & Tim" : "Profil Saya";

  const handleLogoutSubmit = () => {
    showWorking({
      title: "Sampai Jumpa! 👋",
      message: "Sedang keluar dari akunmu dengan aman...",
    });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] text-[#2C2623] shadow-[2.5px_2.5px_0px_0px_#2C2623] transition-all hover:bg-[#FEF3C7] data-[state=open]:bg-[#FEF3C7] data-[state=open]:text-[#2C2623] group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:shadow-none dark:border-[#6D5D54] dark:bg-[#28221F] dark:text-[#FDF8F0] dark:shadow-[2.5px_2.5px_0px_0px_#0E0B0A] dark:hover:bg-[#352D28] dark:data-[state=open]:bg-[#352D28] dark:data-[state=open]:text-[#FDF8F0]"
            >
              <Avatar className="size-8 rounded-xl border-2 border-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-[#6D5D54]">
                <AvatarFallback
                  className={cn("rounded-lg text-xs font-black", AVATAR_BG_BY_ROLE[role])}
                >
                  {getInitials(user.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-extrabold">{user.fullName}</span>
                <span className="text-muted-foreground truncate text-xs font-semibold">
                  {ROLE_LABELS[role].title}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 opacity-75" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) max-w-[calc(100vw-1.5rem)] min-w-60 rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-1.5 shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#28221F] dark:shadow-[4px_4px_0px_0px_#0E0B0A]"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={6}
          >
            <DropdownMenuLabel className="space-y-1.5 rounded-xl bg-[#FEF9EC] p-2.5 font-normal dark:bg-[#332B27]">
              <p className="truncate text-sm font-extrabold text-[#2C2623] dark:text-[#FDF8F0]">
                {user.fullName}
              </p>
              {user.email && (
                <p className="text-muted-foreground truncate text-xs font-medium">{user.email}</p>
              )}
              <RoleBadge role={role} showSubtitle />
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#2C2623]/15 dark:bg-[#6D5D54]/40" />
            <DropdownMenuGroup>
              <DropdownMenuItem
                asChild
                className="cursor-pointer rounded-xl font-bold focus:bg-[#FEF3C7] dark:focus:bg-[#3A311E]"
              >
                <Link href="/settings">
                  <Settings aria-hidden />
                  {settingsLabel}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-[#2C2623]/15 dark:bg-[#6D5D54]/40" />
            <form action={signOut}>
              <DropdownMenuItem
                asChild
                variant="destructive"
                className="cursor-pointer rounded-xl font-bold"
              >
                <button type="submit" onClick={handleLogoutSubmit} className="w-full">
                  <LogOut aria-hidden />
                  Keluar
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
