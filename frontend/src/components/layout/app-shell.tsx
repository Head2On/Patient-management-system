"use client";

import * as React from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader, type BreadcrumbItem } from "@/components/layout/app-header";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface HeaderConfig {
  title?: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  headerActions?: React.ReactNode;
}

interface HeaderContextType extends HeaderConfig {
  setHeader: (config: HeaderConfig) => void;
  resetHeader: () => void;
}

const HeaderContext = React.createContext<HeaderContextType | null>(null);

export function useHeader(): HeaderContextType {
  const context = React.useContext(HeaderContext);
  if (!context) {
    return {
      title: undefined,
      description: undefined,
      breadcrumbs: undefined,
      headerActions: undefined,
      setHeader: () => {},
      resetHeader: () => {},
    };
  }
  return context;
}

export function PageHeaderConfig({
  title,
  description,
  breadcrumbs,
  headerActions,
}: HeaderConfig) {
  const { setHeader, resetHeader } = useHeader();

  // Stable key for array-based breadcrumbs to prevent redundant effect triggers
  const breadcrumbsKey = React.useMemo(
    () => JSON.stringify(breadcrumbs),
    [breadcrumbs]
  );

  React.useEffect(() => {
    setHeader({ title, description, breadcrumbs, headerActions });
    return () => {
      resetHeader();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, breadcrumbsKey, headerActions, setHeader, resetHeader]);

  return null;
}

export interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  user?: {
    name?: string;
    role?: string;
  };
  headerActions?: React.ReactNode;
}

export function AppShell({
  children,
  title: initialTitle,
  description: initialDescription,
  breadcrumbs: initialBreadcrumbs,
  user,
  headerActions: initialActions,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const initialConfig = React.useMemo<HeaderConfig>(
    () => ({
      title: initialTitle,
      description: initialDescription,
      breadcrumbs: initialBreadcrumbs,
      headerActions: initialActions,
    }),
    [initialTitle, initialDescription, initialBreadcrumbs, initialActions]
  );

  const [headerState, setHeaderState] = React.useState<HeaderConfig>(initialConfig);

  // Directly replace the header configuration (avoid stale property retention between pages)
  const setHeader = React.useCallback((config: HeaderConfig) => {
    setHeaderState(config);
  }, []);

  // Reset to initial shell defaults when navigating or unmounting
  const resetHeader = React.useCallback(() => {
    setHeaderState(initialConfig);
  }, [initialConfig]);

  return (
    <HeaderContext.Provider value={{ ...headerState, setHeader, resetHeader }}>
      {/* Viewport-constrained shell preventing body scroll */}
      <div className="flex h-screen h-dvh overflow-hidden bg-background text-foreground antialiased">
        {/* Desktop Fixed Sidebar (240px) */}
        <div className="hidden md:flex shrink-0 h-full overflow-hidden">
          <React.Suspense fallback={<div className="w-60 h-full bg-card border-r border-border" />}>
            <AppSidebar className="h-full border-r border-border" />
          </React.Suspense>
        </div>

        {/* Mobile Navigation Drawer (Sheet) */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            showCloseButton={true}
            className="p-0 w-60 border-r border-border bg-card"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation Menu</SheetTitle>
            </SheetHeader>
            <React.Suspense fallback={<div className="w-full h-full bg-card" />}>
              <AppSidebar
                className="w-full h-full border-r-0"
                onNavigate={() => setMobileOpen(false)}
              />
            </React.Suspense>
          </SheetContent>
        </Sheet>

        {/* Main Application Area (min-h-0 prevents flex child overflow) */}
        <div className="flex flex-1 flex-col min-w-0 h-full min-h-0 overflow-hidden">
          <AppHeader
            title={headerState.title}
            description={headerState.description}
            breadcrumbs={headerState.breadcrumbs}
            user={user}
            onMenuClick={() => setMobileOpen(true)}
            className="shrink-0"
          >
            {headerState.headerActions}
          </AppHeader>

          {/* Independent Scrolling Content Region */}
          <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-background">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </HeaderContext.Provider>
  );
}
