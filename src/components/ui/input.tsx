import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-xl border-2 border-[#2C2623]/80 bg-[#FFFFFF] px-3.5 py-1 text-base font-medium shadow-[2px_2px_0px_0px_rgba(44,38,35,0.12)] transition-[color,box-shadow,border-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-bold disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:border-[#6D5D54] dark:bg-input/30 dark:shadow-none print:border print:border-neutral-300 print:shadow-none",
        "focus-visible:border-[#2C2623] focus-visible:ring-primary/35 focus-visible:ring-[3px] focus-visible:shadow-[2px_2px_0px_0px_#2AB673] dark:focus-visible:border-ring",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
