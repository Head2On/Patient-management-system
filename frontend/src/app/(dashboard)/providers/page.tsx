"use client";

import * as React from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Stethoscope,
  Loader2,
  Info,
  Phone,
  Mail,
  ArrowLeft,
} from "lucide-react";
import { useProviders } from "@/features/providers/hooks/use-providers";
import { PageHeaderConfig } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 10;
const emptySubscribe = () => () => {};

/**
 * Hook to safely read user role from the client-side caredesk_user metadata cookie
 * using useSyncExternalStore (React 19 compliant, SSR-safe without cascading renders).
 */
function useCurrentUserRole(): string | null {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => {
      if (typeof document === "undefined") return null;
      const match = document.cookie.match(/(?:^|;\s*)caredesk_user=([^;]+)/);
      if (!match || !match[1]) return null;
      try {
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        return typeof parsed.role === "string" ? parsed.role : null;
      } catch {
        return null;
      }
    },
    () => null
  );
}

export default function ProvidersPage() {
  const userRole = useCurrentUserRole();
  const isAdmin = userRole === "ADMIN";

  const [filterQuery, setFilterQuery] = React.useState("");
  const [page, setPage] = React.useState(1);

  const skip = (page - 1) * PAGE_SIZE;
  // Lookahead pagination: request PAGE_SIZE + 1 to reliably detect next page existence without false positives
  const limit = PAGE_SIZE + 1;

  const {
    data: providers,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useProviders({
    skip,
    limit,
  });

  // Extract only up to PAGE_SIZE records for rendering and counts on the current page
  const pageProviders = React.useMemo(() => {
    return providers?.slice(0, PAGE_SIZE) ?? [];
  }, [providers]);

  // Next page exists if and only if more than PAGE_SIZE items were returned by backend
  const hasNextPage = Boolean(providers && providers.length > PAGE_SIZE);
  const hasPreviousPage = page > 1;

  // Client-side filtering across currently loaded records (name, doc_number, specialization)
  const filteredProviders = React.useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    if (!query) return pageProviders;

    return pageProviders.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.doc_number.toLowerCase().includes(query) ||
        p.specialization.toLowerCase().includes(query)
    );
  }, [pageProviders, filterQuery]);

  const handlePreviousPage = () => {
    if (hasPreviousPage) {
      setPage((prev) => Math.max(1, prev - 1));
    }
  };

  const handleNextPage = () => {
    if (hasNextPage) {
      setPage((prev) => prev + 1);
    }
  };

  return (
    <div className="space-y-6">
      {/* Shell Header Configuration */}
      <PageHeaderConfig
        title="Providers"
        description="Manage registered medical providers and clinic staff"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Providers" },
        ]}
        headerActions={
          isAdmin ? (
            <Button asChild size="sm">
              <Link href="/providers/new">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Provider
              </Link>
            </Button>
          ) : null
        }
      />

      {/* Search and Action Bar */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              aria-label="Filter providers"
              placeholder="Filter by name, doc number, specialization..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                Updating...
              </span>
            )}
          </div>
        </div>

        {/* Explicit indication that search filters the currently loaded page */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>
            Filtering applies to currently loaded results ({filteredProviders.length} of {pageProviders.length} loaded). Use pagination to browse other records.
          </span>
        </div>
      </div>

      {/* Error State */}
      {isError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <h3 className="font-semibold text-slate-900">
                Failed to load providers
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {error instanceof Error
                  ? error.message
                  : "An unexpected error occurred while communicating with the provider service."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="mt-2"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Main Table Card */}
      {!isError && (
        <Card className="overflow-hidden border border-border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[200px]">Provider</TableHead>
                  <TableHead className="w-[120px]">Doctor ID</TableHead>
                  <TableHead className="w-[160px]">Specialization</TableHead>
                  <TableHead className="w-[100px]">Post</TableHead>
                  <TableHead className="w-[160px]">Contact</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[90px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* 1. Loading Skeleton */}
                {isLoading &&
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <div className="h-4 w-32 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-16 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-28 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-5 w-12 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-24 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-5 w-14 bg-slate-200 animate-pulse rounded-full" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="h-8 w-12 bg-slate-200 animate-pulse rounded ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}

                {/* 2. Filter-Specific Empty State (no matches on loaded page) */}
                {!isLoading &&
                  pageProviders.length > 0 &&
                  filteredProviders.length === 0 &&
                  filterQuery.length > 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-48 text-center text-muted-foreground"
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Search className="h-8 w-8 text-muted-foreground/60" />
                          <span className="font-medium text-slate-800">
                            No matching providers on this page
                          </span>
                          <span className="text-xs text-muted-foreground max-w-sm">
                            No loaded providers match &quot;{filterQuery}&quot;. Try adjusting your filter or navigating between pages.
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setFilterQuery("")}
                            className="mt-1 text-xs"
                          >
                            Clear filter
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}

                {/* 3. Empty State on Later Pages (navigated past last available record) */}
                {!isLoading && pageProviders.length === 0 && page > 1 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-48 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <AlertCircle className="h-8 w-8 text-muted-foreground/60" />
                        <span className="font-medium text-slate-800">
                          No providers found on page {page}
                        </span>
                        <span className="text-xs text-muted-foreground max-w-sm">
                          You have navigated past the available provider records. Return to the previous page to view records.
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                          className="mt-2 gap-1.5"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          Return to Previous Page
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {/* 4. Filter Empty State on Page 1 when Database has 0 Records */}
                {!isLoading &&
                  pageProviders.length === 0 &&
                  page === 1 &&
                  filterQuery.length > 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-48 text-center text-muted-foreground"
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Search className="h-8 w-8 text-muted-foreground/60" />
                          <span className="font-medium text-slate-800">
                            No matching provider records
                          </span>
                          <span className="text-xs text-muted-foreground max-w-sm">
                            No records match &quot;{filterQuery}&quot;.
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setFilterQuery("")}
                            className="mt-1 text-xs"
                          >
                            Clear filter
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}

                {/* 5. General Empty State (no providers registered in database) */}
                {!isLoading &&
                  pageProviders.length === 0 &&
                  page === 1 &&
                  filterQuery.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-48 text-center text-muted-foreground"
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Stethoscope className="h-8 w-8 text-muted-foreground/60" />
                          <span className="font-medium text-slate-800">
                            No medical providers registered yet
                          </span>
                          <span className="text-xs text-muted-foreground max-w-sm">
                            Get started by adding clinic doctors and medical specialists.
                          </span>
                          {isAdmin && (
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="mt-2"
                            >
                              <Link href="/providers/new">
                                <Plus className="h-4 w-4 mr-1.5" />
                                Add Provider
                              </Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}

                {/* 6. Populated State (Active + Inactive Providers) */}
                {!isLoading &&
                  filteredProviders.length > 0 &&
                  filteredProviders.map((provider) => (
                    <TableRow
                      key={provider.doc_number}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      {/* Name & Title */}
                      <TableCell className="font-medium text-slate-900">
                        <Link
                          href={`/providers/${encodeURIComponent(provider.doc_number)}`}
                          className="hover:text-primary hover:underline transition-colors font-medium text-slate-900"
                        >
                          {provider.name}
                        </Link>
                      </TableCell>

                      {/* Doctor ID Number */}
                      <TableCell className="font-mono text-xs text-slate-600">
                        {provider.doc_number}
                      </TableCell>

                      {/* Specialization */}
                      <TableCell className="text-sm text-slate-700">
                        {provider.specialization}
                      </TableCell>

                      {/* Post / Degree */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="font-mono text-xs font-semibold uppercase text-slate-700 bg-slate-50"
                        >
                          {provider.post}
                        </Badge>
                      </TableCell>

                      {/* Contact Info (Phone & Email) */}
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span>{provider.phone}</span>
                          </div>
                          {provider.email && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              <span className="truncate max-w-[140px]" title={provider.email}>
                                {provider.email}
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Status Badge (Defensively supports both Active and Inactive) */}
                      <TableCell>
                        {provider.is_active ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>

                      {/* Action Button */}
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/providers/${encodeURIComponent(provider.doc_number)}`}>
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls (skip / limit relative navigation with lookahead) */}
          {!isLoading && pageProviders.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 sm:px-6">
              <div className="text-xs text-muted-foreground">
                Page <span className="font-semibold text-slate-700">{page}</span>
                <span className="text-slate-400 mx-1.5">·</span>
                Showing records {skip + 1}–{skip + pageProviders.length}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={!hasPreviousPage || isFetching}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!hasNextPage || isFetching}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
