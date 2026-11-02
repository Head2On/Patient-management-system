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
  Loader2,
  Info,
  ShieldAlert,
  ArrowLeft,
  Eye,
  Filter,
  Users,
} from "lucide-react";
import { useUsers } from "@/features/users/hooks/use-users";
import type { UserResponse, UserRole } from "@/types/auth";
import { formatClinicDate } from "@/lib/datetime";
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
 * Hook to safely read user role from the client-side caredesk_user metadata cookie.
 * React 19 compliant, SSR-safe without cascading renders.
 * Returns undefined during SSR (unknown state, failing closed), null if cookie missing, or UserRole string.
 */
function useCurrentUserRole(): string | null | undefined {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => {
      if (typeof document === "undefined") return undefined;
      const match = document.cookie.match(/(?:^|;\s*)caredesk_user=([^;]+)/);
      if (!match || !match[1]) return null;
      try {
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        return typeof parsed.role === "string" ? parsed.role : null;
      } catch {
        return null;
      }
    },
    () => undefined
  );
}

/**
 * Maps staff user role to design-system badge styling.
 */
function getRoleBadge(role: UserRole) {
  switch (role) {
    case "ADMIN":
      return (
        <Badge variant="outline" className="border-indigo-200/80 bg-indigo-50/70 text-indigo-700 font-medium">
          Administrator
        </Badge>
      );
    case "DOCTOR":
      return (
        <Badge variant="info" className="font-medium">
          Doctor
        </Badge>
      );
    case "RECEPTIONIST":
      return (
        <Badge variant="secondary" className="font-medium">
          Receptionist
        </Badge>
      );
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}

/**
 * Maps account active status to design-system badge styling.
 */
function getStatusBadge(isActive: boolean) {
  if (isActive) {
    return <Badge variant="success">Active</Badge>;
  }
  return <Badge variant="destructive">Inactive</Badge>;
}

export default function UsersDirectoryPage() {
  const userRole = useCurrentUserRole();
  const isAdmin = userRole === "ADMIN";

  const [filterQuery, setFilterQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>("ALL");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [page, setPage] = React.useState(1);

  const skip = (page - 1) * PAGE_SIZE;
  // Lookahead pagination: request PAGE_SIZE + 1 to detect next page existence without false positives
  const limit = PAGE_SIZE + 1;

  const {
    data: users,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useUsers(
    { skip, limit },
    { enabled: isAdmin }
  );

  // Extract only up to PAGE_SIZE records for rendering and counts on the current page
  const pageUsers = React.useMemo(() => {
    return users?.slice(0, PAGE_SIZE) ?? [];
  }, [users]);

  // Next page exists if and only if more than PAGE_SIZE items were returned by backend
  const hasNextPage = Boolean(users && users.length > PAGE_SIZE);
  const hasPreviousPage = page > 1;

  // Client-side filtering across currently loaded records (phone, email, ID, role, status)
  const filteredUsers = React.useMemo(() => {
    const query = filterQuery.trim().toLowerCase();

    return pageUsers.filter((u: UserResponse) => {
      // Role filter
      if (roleFilter !== "ALL" && u.role !== roleFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === "ACTIVE" && !u.is_active) {
        return false;
      }
      if (statusFilter === "INACTIVE" && u.is_active) {
        return false;
      }

      // Text search filter
      if (query) {
        const idMatch = String(u.id).includes(query);
        const phoneMatch = u.phone.toLowerCase().includes(query);
        const emailMatch = u.email ? u.email.toLowerCase().includes(query) : false;
        const providerMatch = u.provider_id ? String(u.provider_id).includes(query) : false;
        return idMatch || phoneMatch || emailMatch || providerMatch;
      }

      return true;
    });
  }, [pageUsers, filterQuery, roleFilter, statusFilter]);

  const hasActiveFilters = filterQuery !== "" || roleFilter !== "ALL" || statusFilter !== "ALL";

  const handleFilterQueryChange = (val: string) => {
    setFilterQuery(val);
    setPage(1);
  };

  const handleRoleFilterChange = (val: string) => {
    setRoleFilter(val);
    setPage(1);
  };

  const handleStatusFilterChange = (val: string) => {
    setStatusFilter(val);
    setPage(1);
  };

  const handleClearFilters = () => {
    setFilterQuery("");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
    setPage(1);
  };

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

  // 1. Fail-closed loading state while role is being verified (SSR / initial mount)
  if (userRole === undefined) {
    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title="Staff Directory"
          description="Manage clinic staff accounts and system access"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Staff & Users" },
          ]}
        />
        <div className="p-16 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying staff management permissions...</p>
        </div>
      </div>
    );
  }

  // 2. Fail-closed access denied state for non-administrators
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title="Staff Directory"
          description="Manage clinic staff accounts and system access"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Staff & Users" },
          ]}
        />
        <Card className="border-destructive/30 bg-destructive/5 max-w-lg mx-auto mt-12">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-slate-900 text-lg">
                Access Restricted
              </h3>
              <p className="text-sm text-muted-foreground">
                Only clinic Administrators are authorized to view and manage staff accounts.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Return to Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. Authorized Administrator View
  return (
    <div className="space-y-6">
      {/* Shell Header Configuration */}
      <PageHeaderConfig
        title="Staff Directory"
        description="Manage clinic staff accounts, system roles, and doctor linkages"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Staff & Users" },
        ]}
        headerActions={
          <Button asChild size="sm">
            <Link href="/users/new">
              <Plus className="h-4 w-4 mr-1.5" />
              Create Staff User
            </Link>
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <div className="space-y-2">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
            {/* Text Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                aria-label="Filter staff accounts"
                placeholder="Filter by phone, email, or ID..."
                value={filterQuery}
                onChange={(e) => handleFilterQueryChange(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            {/* Role Filter Dropdown */}
            <div className="w-full sm:w-40">
              <select
                aria-label="Filter by role"
                value={roleFilter}
                onChange={(e) => handleRoleFilterChange(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ALL">All Roles</option>
                <option value="ADMIN">Administrator</option>
                <option value="DOCTOR">Doctor</option>
                <option value="RECEPTIONIST">Receptionist</option>
              </select>
            </div>

            {/* Status Filter Dropdown */}
            <div className="w-full sm:w-36">
              <select
                aria-label="Filter by account status"
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Inactive Only</option>
              </select>
            </div>

            {/* Reset Filters Action */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Filter className="h-3.5 w-3.5 mr-1" />
                Clear Filters
              </Button>
            )}
          </div>

          {/* Background Fetching Indicator */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            {isFetching && !isLoading && (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                Updating...
              </span>
            )}
          </div>
        </div>

        {/* Lookahead Scope Notice */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>
            Filtering applies to currently loaded results ({filteredUsers.length} of {pageUsers.length} loaded). Use pagination to browse other records.
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
                Failed to load staff accounts
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {error instanceof Error
                  ? error.message
                  : "An unexpected error occurred while communicating with the user management service."}
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

      {/* Main Staff Table Card */}
      {!isError && (
        <Card className="overflow-hidden border border-border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[80px]">User ID</TableHead>
                  <TableHead className="w-[180px]">Phone Number</TableHead>
                  <TableHead className="w-[220px]">Email Address</TableHead>
                  <TableHead className="w-[140px]">Role</TableHead>
                  <TableHead className="w-[150px]">Linked Provider</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[150px]">Created</TableHead>
                  <TableHead className="w-[90px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* 1. Loading Skeleton */}
                {isLoading &&
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <div className="h-4 w-10 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-28 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-36 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-5 w-20 bg-slate-200 animate-pulse rounded-full" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-16 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-5 w-14 bg-slate-200 animate-pulse rounded-full" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-24 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="h-8 w-12 bg-slate-200 animate-pulse rounded ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}

                {/* 2. Filter-Specific Empty State (loaded records exist, but none match active filters) */}
                {!isLoading &&
                  pageUsers.length > 0 &&
                  filteredUsers.length === 0 &&
                  hasActiveFilters && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-40 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Filter className="h-7 w-7 text-muted-foreground/50" />
                          <p className="text-sm font-medium text-slate-800">
                            No staff accounts match the active filters on this page
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Try adjusting your search terms or clearing the role and status filters.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleClearFilters}
                            className="mt-2 text-xs"
                          >
                            Reset Active Filters
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}

                {/* 3. Global Empty State (no staff users in the entire clinic directory) */}
                {!isLoading && pageUsers.length === 0 && page === 1 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <Users className="h-8 w-8 text-muted-foreground/50" />
                        <div className="space-y-1">
                          <p className="text-base font-medium text-slate-900">
                            No staff accounts registered
                          </p>
                          <p className="text-xs text-muted-foreground max-w-sm">
                            There are currently no staff accounts registered in CareDesk. Create a staff user to get started.
                          </p>
                        </div>
                        <Button asChild size="sm" className="mt-2">
                          <Link href="/users/new">
                            <Plus className="h-4 w-4 mr-1.5" />
                            Create First Staff User
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {/* 4. Page Out-of-Range Empty State (e.g. page > 1 with no records) */}
                {!isLoading && pageUsers.length === 0 && page > 1 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <Users className="h-8 w-8 text-muted-foreground/50" />
                        <div className="space-y-1">
                          <p className="text-base font-medium text-slate-900">
                            No records on this page
                          </p>
                          <p className="text-xs text-muted-foreground max-w-sm">
                            Page {page} does not contain any staff records. This page may be out of range.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePreviousPage}
                            className="text-xs"
                          >
                            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                            Previous Page
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(1)}
                            className="text-xs"
                          >
                            Go to Page 1
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {/* 4. Populated Rows */}
                {!isLoading &&
                  filteredUsers.map((user: UserResponse) => (
                    <TableRow
                      key={user.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      {/* User ID */}
                      <TableCell className="font-mono text-xs font-semibold text-slate-700">
                        #{user.id}
                      </TableCell>

                      {/* Phone */}
                      <TableCell className="font-medium text-slate-900 text-sm">
                        {user.phone}
                      </TableCell>

                      {/* Email */}
                      <TableCell className="text-sm text-slate-600">
                        {user.email || (
                          <span className="text-muted-foreground text-xs italic">—</span>
                        )}
                      </TableCell>

                      {/* Role */}
                      <TableCell>{getRoleBadge(user.role)}</TableCell>

                      {/* Linked Provider ID */}
                      <TableCell>
                        {user.provider_id !== null ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-slate-100 text-slate-800 border border-slate-200">
                            Provider #{user.provider_id}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>

                      {/* Account Status */}
                      <TableCell>{getStatusBadge(user.is_active)}</TableCell>

                      {/* Created At */}
                      <TableCell className="text-xs text-muted-foreground">
                        {formatClinicDate(user.created_at)}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-8 px-2 text-xs"
                        >
                          <Link href={`/users/${user.id}`}>
                            <Eye className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          {/* Lookahead Pagination Footer */}
          {!isLoading && (pageUsers.length > 0 || page > 1) && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 bg-muted/20">
              <div className="text-xs text-muted-foreground">
                Showing page <span className="font-medium text-slate-900">{page}</span> ({filteredUsers.length} {filteredUsers.length === 1 ? "staff account" : "staff accounts"} shown)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={!hasPreviousPage || isFetching}
                  className="h-8 text-xs"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!hasNextPage || isFetching}
                  className="h-8 text-xs"
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
