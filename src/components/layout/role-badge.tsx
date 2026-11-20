import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const ROLE_STYLES: Record<Role, { classes: string; emoji: string }> = {
  OWNER: {
    classes:
      "border-[#2C2623] bg-[#FDE68A] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#4A3B1E] dark:text-[#FDE68A] dark:shadow-[2px_2px_0px_0px_#0E0B0A]",
    emoji: "👑",
  },
  SUPER_ADMIN: {
    classes:
      "border-[#2C2623] bg-[#DDD6FE] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#35284A] dark:text-[#DDD6FE] dark:shadow-[2px_2px_0px_0px_#0E0B0A]",
    emoji: "✨",
  },
  TEAM_LEADER: {
    classes:
      "border-[#2C2623] bg-[#BAE6FD] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#1B3548] dark:text-[#BAE6FD] dark:shadow-[2px_2px_0px_0px_#0E0B0A]",
    emoji: "🌟",
  },
  STAFF: {
    classes:
      "border-[#2C2623] bg-[#BBF7D0] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#1B392C] dark:text-[#A7F3D0] dark:shadow-[2px_2px_0px_0px_#0E0B0A]",
    emoji: "🍀",
  },
};

export function RoleBadge({
  role,
  showSubtitle = false,
  className,
}: {
  role: Role;
  showSubtitle?: boolean;
  className?: string;
}) {
  const label = ROLE_LABELS[role];
  const style = ROLE_STYLES[role];

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-xs font-extrabold print:border print:shadow-none",
        style.classes,
        className,
      )}
      title={label.subtitle}
    >
      <span aria-hidden="true" className="text-[11px] leading-none">
        {style.emoji}
      </span>
      <span>{label.title}</span>
      {showSubtitle && (
        <span className="hidden font-semibold opacity-80 sm:inline">· {label.subtitle}</span>
      )}
    </Badge>
  );
}
