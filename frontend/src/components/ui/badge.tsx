import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-xs",
        secondary:
          "border-slate-200/70 bg-slate-100/70 text-slate-700",
        destructive:
          "border-rose-200/70 bg-rose-50/70 text-rose-700",
        outline:
          "border-border/80 text-foreground bg-background/50",
        success:
          "border-emerald-200/70 bg-emerald-50/70 text-emerald-700",
        warning:
          "border-amber-200/70 bg-amber-50/70 text-amber-700",
        info:
          "border-sky-200/70 bg-sky-50/70 text-sky-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
