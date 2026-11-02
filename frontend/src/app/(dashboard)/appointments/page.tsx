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
  Calendar,
  Clock,
  Loader2,
  Info,
  User as UserIcon,
  Filter,
  ArrowLeft,
  Eye,
} from "lucide-react";
import { useAppointments } from "@/features/appointments/hooks/use-appointments";
import type { Appointment, AppointmentStatus } from "@/types/appointment";
import {
  formatClinicDate,
  formatClinicTimeRange,
} from "@/lib/datetime";
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

/**
 * Maps appointment lifecycle status to design-system badge styling.
 */
function getStatusBadge(status: AppointmentStatus) {
  switch (status) {
    case "scheduled":
      return <Badge variant="info">Scheduled</Badge>;
    case "confirmed":
      return <Badge variant="success">Confirmed</Badge>;
    case "checked_in":
      return <Badge variant="warning">Checked In</Badge>;
    case "in_progress":
      return <Badge variant="default">In Progress</Badge>;
    case "completed":
      return <Badge variant="secondary">Completed</Badge>;
    case "cancelled":
      return <Badge variant="destructive">Cancelled</Badge>;
    case "no_show":
      return (
        <Badge
          variant="outline"
          className="border-red-300 text-red-700 bg-red-50"
        >
          No Show
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AppointmentsPage() {
  const userRole = useCurrentUserRole();
  const canBook = userRole === "ADMIN" || userRole === "RECEPTIONIST";

  const [filterQuery, setFilterQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [page, setPage] = React.useState(1);

  const skip = (page - 1) * PAGE_SIZE;
  // Lookahead pagination: request PAGE_SIZE + 1 to reliably detect next page existence without false positives
  const limit = PAGE_SIZE + 1;

  const {
    data: appointments,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useAppointments({
    skip,
    limit,
  });

  // Extract only up to PAGE_SIZE records for rendering and counts on the current page
  const pageAppointments = React.useMemo(() => {
    return appointments?.slice(0, PAGE_SIZE) ?? [];
  }, [appointments]);

  // Next page exists if and only if more than PAGE_SIZE items were returned by backend
  const hasNextPage = Boolean(appointments && appointments.length > PAGE_SIZE);
  const hasPreviousPage = page > 1;

  // Client-side filtering across currently loaded records (doctor, doc_number, reason, patient ID)
  const filteredAppointments = React.useMemo(() => {
    let result = pageAppointments;

    // Apply status filter
    if (statusFilter !== "ALL") {
      result = result.filter((appt) => appt.status === statusFilter);
    }

    // Apply text search filter
    const query = filterQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (appt) =>
          appt.provider.name.toLowerCase().includes(query) ||
          appt.provider.doc_number.toLowerCase().includes(query) ||
          appt.provider.specialization.toLowerCase().includes(query) ||
          appt.reason_for_visit.toLowerCase().includes(query) ||
          String(appt.patient_id).includes(query) ||
          String(appt.id).includes(query)
      );
    }

    return result;
  }, [pageAppointments, filterQuery, statusFilter]);

  const isFiltering = filterQuery.trim().length > 0 || statusFilter !== "ALL";

  const handleFilterQueryChange = (value: string) => {
    setFilterQuery(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
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

  const handleClearFilters = () => {
    setFilterQuery("");
    setStatusFilter("ALL");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Shell Header Configuration */}
      <PageHeaderConfig
        title="Appointments"
        description="Manage clinical consultations, patient visits, and provider schedules"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Appointments" },
        ]}
        headerActions={
          canBook ? (
            <Button asChild size="sm">
              <Link href="/appointments/new">
                <Plus className="h-4 w-4 mr-1.5" />
                Book Appointment
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Search, Filter, and Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
          {/* Text search filter */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by doctor, patient ID, reason..."
              value={filterQuery}
              onChange={(e) => handleFilterQueryChange(e.target.value)}
              className="pl-9"
              aria-label="Filter appointments"
            />
          </div>

          {/* Status selector */}
          <div className="w-full sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              aria-label="Filter by appointment status"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="ALL">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked In</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
          </div>

          {/* Clear filters shortcut */}
          {isFiltering && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Reset filters
            </Button>
          )}
        </div>

        {/* Refresh indicator */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          {isFetching && !isLoading && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating...
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh appointments"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="sr-only">Refresh appointments</span>
          </Button>
        </div>
      </div>

      {/* Filter Scope Notice */}
      {isFiltering && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-md border border-muted">
          <Info className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0" />
          <span>
            Filtering across the current page batch. Use pagination controls
            below to navigate across clinic records.
          </span>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="flex flex-col sm:flex-row items-center justify-between p-4 gap-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  Failed to load clinic appointments
                </p>
                <p className="text-xs text-muted-foreground">
                  {error?.message ||
                    "An unexpected error occurred while communicating with the server."}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="border-destructive/30 hover:bg-destructive/10 text-destructive text-xs shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Appointments Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">ID</TableHead>
                <TableHead className="w-[200px]">Date & Time</TableHead>
                <TableHead className="w-[130px]">Patient</TableHead>
                <TableHead className="w-[240px]">Doctor / Provider</TableHead>
                <TableHead>Reason for Visit</TableHead>
                <TableHead className="w-[120px] text-center">Status</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                // 5-Row Loading Skeleton
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index} className="animate-pulse">
                    <TableCell>
                      <div className="h-4 w-10 bg-slate-200 dark:bg-slate-700 rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="h-4 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
                        <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800 rounded" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                        <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800 rounded" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded mx-auto" />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="h-8 w-12 bg-slate-200 dark:bg-slate-700 rounded ml-auto" />
                    </TableCell>
                  </TableRow>
                ))
              ) : isError ? (
                // Error State in Table
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-44 text-center text-muted-foreground"
                  >
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <AlertCircle className="h-8 w-8 text-destructive/70" />
                      <p className="text-sm font-medium text-foreground">
                        Unable to load clinic appointments
                      </p>
                      <p className="text-xs text-muted-foreground">
                        An error occurred while communicating with the server.
                        Please check the notification banner above and try again.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        className="mt-2 text-xs"
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Retry Request
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredAppointments.length > 0 ? (
                // Populated Table Rows
                filteredAppointments.map((appt: Appointment) => (
                  <TableRow key={appt.id} className="hover:bg-muted/50">
                    {/* Appointment ID */}
                    <TableCell className="font-mono text-xs text-muted-foreground font-semibold">
                      #{appt.id}
                    </TableCell>

                    {/* Date & Time */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>{formatClinicDate(appt.start_time)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>
                            {formatClinicTimeRange(
                              appt.start_time,
                              appt.end_time
                            )}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Patient ID */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium">
                          Patient #{appt.patient_id}
                        </span>
                      </div>
                    </TableCell>

                    {/* Provider */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/providers/${encodeURIComponent(
                              appt.provider.doc_number
                            )}`}
                            className="text-xs font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            Dr. {appt.provider.name}
                          </Link>
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] px-1.5 py-0 h-4 border-slate-300"
                          >
                            {appt.provider.doc_number}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {appt.provider.post} • {appt.provider.specialization}
                        </p>
                      </div>
                    </TableCell>

                    {/* Reason for Visit */}
                    <TableCell>
                      <p className="text-xs text-foreground line-clamp-2 font-medium max-w-xs">
                        {appt.reason_for_visit}
                      </p>
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell className="text-center">
                      {getStatusBadge(appt.status)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs">
                        <Link href={`/appointments/${appt.id}`}>
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : isFiltering ? (
                // Filter Empty State
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-44 text-center text-muted-foreground"
                  >
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <Filter className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm font-medium text-foreground">
                        No matching appointments found
                      </p>
                      <p className="text-xs text-muted-foreground">
                        No appointments on this page match your current filter
                        criteria.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearFilters}
                        className="mt-2 text-xs"
                      >
                        Clear filters
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : page > 1 ? (
                // Later Page Empty State
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-44 text-center text-muted-foreground"
                  >
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <Calendar className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm font-medium text-foreground">
                        No appointments on page {page}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        You have navigated past the last available page of
                        clinic appointments.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(1)}
                        className="mt-2 text-xs"
                      >
                        <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                        Return to page 1
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                // Total Database Empty State
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-52 text-center text-muted-foreground"
                  >
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <Calendar className="h-9 w-9 text-muted-foreground/40" />
                      <p className="text-sm font-semibold text-foreground">
                        No appointments scheduled
                      </p>
                      <p className="text-xs text-muted-foreground">
                        There are currently no clinical appointments booked in the
                        system.
                      </p>
                      {canBook && (
                        <Button asChild size="sm" className="mt-2 text-xs">
                          <Link href="/appointments/new">
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Book First Appointment
                          </Link>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <div>
          {isError ? (
            <span className="text-destructive font-medium">Failed to retrieve page records</span>
          ) : pageAppointments.length > 0 ? (
            <span>
              Showing records{" "}
              <span className="font-medium text-foreground">
                {skip + 1}
              </span>{" "}
              to{" "}
              <span className="font-medium text-foreground">
                {skip + pageAppointments.length}
              </span>
            </span>
          ) : (
            <span>No records to display</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={!hasPreviousPage || isFetching || isError}
            className="h-8 px-2 text-xs"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="px-2 font-medium text-foreground">
            Page {page}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={!hasNextPage || isFetching || isError}
            className="h-8 px-2 text-xs"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
