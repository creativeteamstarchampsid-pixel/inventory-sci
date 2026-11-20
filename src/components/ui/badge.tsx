import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border-[1.5px] px-2.5 py-0.5 text-xs font-bold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] transition-[color,box-shadow] overflow-hidden print:shadow-none",
  {
    variants: {
      variant: {
        default:
          "border-[#2C2623] bg-primary text-primary-foreground shadow-[1.5px_1.5px_0px_0px_#2C2623] [a&]:hover:bg-primary/90 dark:border-[#6D5D54] dark:shadow-[1.5px_1.5px_0px_0px_#0E0B0A]",
        secondary:
          "border-[#2C2623] bg-secondary text-secondary-foreground shadow-[1.5px_1.5px_0px_0px_#2C2623] [a&]:hover:bg-secondary/90 dark:border-[#6D5D54] dark:shadow-[1.5px_1.5px_0px_0px_#0E0B0A]",
        destructive:
          "border-[#2C2623] bg-destructive text-white shadow-[1.5px_1.5px_0px_0px_#2C2623] [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:border-[#6D5D54] dark:bg-destructive/80 dark:shadow-[1.5px_1.5px_0px_0px_#0E0B0A] dark:focus-visible:ring-destructive/40",
        outline:
          "border-[#2C2623] bg-[#FFFDF7] text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground dark:border-[#6D5D54] dark:bg-card",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
