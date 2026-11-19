import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const ROLE_STYLES: Record<Role, string> = {
  OWNER: "border-amber-300 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  SUPER_ADMIN:
    "border-violet-300 bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100",
  TEAM_LEADER: "border-sky-300 bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  STAFF:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
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
  return (
    <Badge variant="outline" className={cn(ROLE_STYLES[role], className)} title={label.subtitle}>
      {label.title}
      {showSubtitle && <span className="font-normal opacity-80">· {label.subtitle}</span>}
    </Badge>
  );
}
