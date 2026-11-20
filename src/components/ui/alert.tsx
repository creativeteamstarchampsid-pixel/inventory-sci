import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-2xl border-2 border-[#2C2623] px-4 py-3.5 text-sm shadow-[3px_3px_0px_0px_#2C2623] grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current dark:border-[#6D5D54] dark:shadow-[3px_3px_0px_0px_#0E0B0A] print:rounded-lg print:border print:border-neutral-300 print:shadow-none",
  {
    variants: {
      variant: {
        default: "bg-[#FFFDF7] text-[#2C2623] dark:bg-card dark:text-card-foreground",
        destructive:
          "border-[#2C2623] bg-[#FFE4E8] text-[#881337] dark:border-[#FB7185] dark:bg-[#3B1D24] dark:text-[#FECDD3] [&>svg]:text-[#E11D48] dark:[&>svg]:text-[#FDA4AF] *:data-[slot=alert-description]:text-[#9F1239] dark:*:data-[slot=alert-description]:text-[#FDA4AF]",
        warning:
          "border-[#2C2623] bg-[#FEF4C7] text-[#5C3A06] dark:border-[#FBBF24]/70 dark:bg-[#3A2F1B] dark:text-[#FDE68A] [&>svg]:text-[#D97706] dark:[&>svg]:text-[#FBBF24] *:data-[slot=alert-description]:text-[#784A0A] dark:*:data-[slot=alert-description]:text-[#FDE68A]/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-extrabold tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm font-medium [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
