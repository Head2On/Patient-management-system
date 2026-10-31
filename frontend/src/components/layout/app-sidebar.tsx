"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  Users,
  Calendar,
  Stethoscope,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Patients",
    href: "/patients",
    icon: Users,
  },
  {
    title: "Appointments",
    href: "/appointments",
    icon: Calendar,
  },
  {
    title: "Providers",
    href: "/providers",
    icon: Stethoscope,
  },
  {
    title: "Users",
    href: "/users",
    icon: UserCog,
  },
];

export type AppSidebarProps = React.HTMLAttributes<HTMLElement> & {
  onNavigate?: () => void;
};

export function AppSidebar({
  className,
  onNavigate,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full w-60 flex-col border-r border-border bg-card",
        className
      )}
      {...props}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
          <Activity className="h-5 w-5" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-base font-semibold tracking-tight text-slate-900 truncate">
            CareDesk
          </span>
          <span className="text-xs text-muted-foreground truncate">
            Clinic Management
          </span>
        </div>
      </div>

      {/* Navigation Section */}
      <nav aria-label="Main navigation" className="flex-1 space-y-1 p-3">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace
        </div>
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-semibold"
                  : "text-slate-600 hover:bg-secondary hover:text-slate-900"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive
                    ? "text-accent-foreground"
                    : "text-slate-500 group-hover:text-slate-900"
                )}
              />
              <span className="truncate">{item.title}</span>
            </Link>
          );
        })}
      </nav>

      {/* Subtle Sidebar Footer */}
      <div className="border-t border-border p-4 text-[11px] text-muted-foreground">
        CareDesk v1.0 · Clinic System
      </div>
    </aside>
  );
}
