"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex min-h-10 w-fit items-center justify-center gap-1 rounded-2xl border-2 border-[#2C2623] bg-[#F5E9D6] p-1 text-muted-foreground shadow-[2.5px_2.5px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-muted dark:shadow-[2.5px_2.5px_0px_0px_#0E0B0A] print:border print:shadow-none",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-[calc(100%-2px)] flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-transparent px-3 py-1.5 text-sm font-bold whitespace-nowrap text-[#5A4D46] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-[1px] hover:bg-[#FFFDF7]/60 hover:text-[#2C2623] active:translate-y-[1px] active:scale-[0.97] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:-translate-y-[1px] data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FFFDF7] data-[state=active]:text-[#2C2623] data-[state=active]:shadow-[2px_2px_0px_0px_#2C2623] dark:text-muted-foreground dark:hover:bg-card/55 dark:hover:text-foreground dark:data-[state=active]:border-[#6D5D54] dark:data-[state=active]:bg-card dark:data-[state=active]:text-foreground dark:data-[state=active]:shadow-[2px_2px_0px_0px_#0E0B0A] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 print:transform-none print:transition-none print:data-[state=active]:translate-y-0 print:data-[state=active]:shadow-none",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "animate-kawaii-page-enter flex-1 outline-none print:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
