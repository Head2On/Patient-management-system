"use client";

import * as React from "react";
import Link from "next/link";
import { User, ChevronRight, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface AppHeaderProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  user?: {
    name?: string;
    role?: string;
  };
  onMenuClick?: () => void;
}

function getInitials(name?: string): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return null;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AppHeader({
  title,
  description,
  breadcrumbs,
  user,
  onMenuClick,
  className,
  children,
  ...props
}: AppHeaderProps) {
  const initials = getInitials(user?.name);

  return (
    <header
      className={cn(
        "flex min-h-16 items-center justify-between border-b border-border bg-card px-6 py-3",
        className
      )}
      {...props}
    >
      {/* Left: Mobile Toggle & Page Context */}
      <div className="flex items-center gap-3 min-w-0">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="flex md:hidden h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-slate-700 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer shrink-0"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <div className="flex flex-col justify-center min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb navigation"
            className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5"
          >
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    aria-current={
                      idx === breadcrumbs.length - 1 ? "page" : undefined
                    }
                    className="hover:text-slate-900 transition-colors truncate"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={
                      idx === breadcrumbs.length - 1 ? "page" : undefined
                    }
                    className="font-medium text-slate-800 truncate"
                  >
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}

        {title && (
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 leading-tight truncate">
            {title}
          </h1>
        )}

        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">
            {description}
          </p>
        )}
        </div>
      </div>

      {/* Right: Extra slot & Account Dropdown */}
      <div className="flex items-center gap-4 shrink-0">
        {children}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Open user account menu"
              className="flex items-center gap-2 rounded-full p-0.5 outline-none hover:ring-2 hover:ring-ring/20 focus-visible:ring-2 focus-visible:ring-ring transition cursor-pointer"
            >
              <Avatar className="h-9 w-9 border border-border">
                <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-medium">
                  {initials ? (
                    initials
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-48">
            {user?.name && (
              <>
                <div className="px-2 py-1.5 text-xs">
                  <p className="font-medium text-slate-900 truncate">
                    {user.name}
                  </p>
                  {user.role && (
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      {user.role}
                    </p>
                  )}
                </div>
                <DropdownMenuSeparator />
              </>
            )}

            <DropdownMenuItem asChild>
              <Link
                href="/profile"
                className="flex items-center gap-2 cursor-pointer w-full"
              >
                <User className="h-4 w-4" />
                <span>My Profile</span>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
