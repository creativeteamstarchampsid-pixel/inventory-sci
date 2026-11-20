import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive print:transition-none",
  {
    variants: {
      variant: {
        default:
          "border-2 border-[#2C2623] bg-primary text-primary-foreground shadow-[2.5px_2.5px_0px_0px_#2C2623] hover:-translate-x-[1px] hover:-translate-y-[1.5px] hover:bg-primary/92 hover:shadow-[3.5px_3.5px_0px_0px_#2C2623] active:translate-x-[1.5px] active:translate-y-[1.5px] active:scale-[0.97] active:shadow-none dark:border-[#6D5D54] dark:shadow-[2.5px_2.5px_0px_0px_#0E0B0A] dark:hover:shadow-[3.5px_3.5px_0px_0px_#0E0B0A] print:transform-none print:border print:shadow-none",
        destructive:
          "border-2 border-[#2C2623] bg-destructive text-white shadow-[2.5px_2.5px_0px_0px_#2C2623] hover:-translate-x-[1px] hover:-translate-y-[1.5px] hover:bg-destructive/92 hover:shadow-[3.5px_3.5px_0px_0px_#2C2623] active:translate-x-[1.5px] active:translate-y-[1.5px] active:scale-[0.97] active:shadow-none focus-visible:ring-destructive/20 dark:border-[#6D5D54] dark:bg-destructive/85 dark:shadow-[2.5px_2.5px_0px_0px_#0E0B0A] dark:hover:shadow-[3.5px_3.5px_0px_0px_#0E0B0A] dark:focus-visible:ring-destructive/40 print:transform-none print:border print:shadow-none",
        outline:
          "border-2 border-[#2C2623] bg-[#FFFDF7] text-foreground shadow-[2px_2px_0px_0px_#2C2623] hover:-translate-x-[1px] hover:-translate-y-[1.5px] hover:bg-[#FEF3C7] hover:text-[#2C2623] hover:shadow-[3px_3px_0px_0px_#2C2623] active:translate-x-[1.5px] active:translate-y-[1.5px] active:scale-[0.97] active:shadow-none dark:border-[#6D5D54] dark:bg-card dark:shadow-[2px_2px_0px_0px_#0E0B0A] dark:hover:bg-accent dark:hover:text-accent-foreground dark:hover:shadow-[3px_3px_0px_0px_#0E0B0A] print:transform-none print:border print:border-neutral-300 print:shadow-none",
        secondary:
          "border-2 border-[#2C2623] bg-secondary text-secondary-foreground shadow-[2.5px_2.5px_0px_0px_#2C2623] hover:-translate-x-[1px] hover:-translate-y-[1.5px] hover:bg-secondary/88 hover:shadow-[3.5px_3.5px_0px_0px_#2C2623] active:translate-x-[1.5px] active:translate-y-[1.5px] active:scale-[0.97] active:shadow-none dark:border-[#6D5D54] dark:shadow-[2.5px_2.5px_0px_0px_#0E0B0A] dark:hover:shadow-[3.5px_3.5px_0px_0px_#0E0B0A] print:transform-none print:border print:shadow-none",
        ghost:
          "hover:-translate-y-[0.5px] hover:bg-accent hover:text-accent-foreground active:scale-[0.97] dark:hover:bg-accent/60 print:transform-none",
        link: "text-primary underline-offset-4 hover:underline active:scale-[0.98] print:transform-none",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-xl gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-xl px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
