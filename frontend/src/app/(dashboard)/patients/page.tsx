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
  Users,
  Loader2,
} from "lucide-react";
import { usePatients } from "@/features/patients/hooks/use-patients";
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
const DEBOUNCE_DELAY_MS = 300;

export default function PatientsPage() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [page, setPage] = React.useState(1);

  // Debounce search input by 300ms and reset to page 1 on search change
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, DEBOUNCE_DELAY_MS);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  const {
    data: patients,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = usePatients({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
  });

  const hasPreviousPage = page > 1;
  const hasNextPage = Boolean(patients && patients.length === PAGE_SIZE);

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
      {/* Dynamic Shell Header Configuration */}
      <PageHeaderConfig
        title="Patients"
        description="Manage and search patient records"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Patients" },
        ]}
        headerActions={
          <Button asChild size="sm">
            <Link href="/patients/new">
              <Plus className="h-4 w-4 mr-1.5" />
              New Patient
            </Link>
          </Button>
        }
      />

      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search patients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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

      {/* Error State */}
      {isError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <h3 className="font-semibold text-slate-900">
                Failed to load patient records
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {error instanceof Error
                  ? error.message
                  : "An unexpected error occurred while communicating with the patient service."}
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
                  <TableHead className="w-[180px]">Patient</TableHead>
                  <TableHead className="w-[130px]">Patient ID</TableHead>
                  <TableHead className="w-[130px]">Phone</TableHead>
                  <TableHead className="w-[100px]">Gender</TableHead>
                  <TableHead className="w-[120px]">Date of Birth</TableHead>
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
                        <div className="h-4 w-20 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-24 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-14 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-20 bg-slate-200 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-5 w-14 bg-slate-200 animate-pulse rounded-full" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="h-8 w-12 bg-slate-200 animate-pulse rounded ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}

                {/* 2. Search-Specific Empty State */}
                {!isLoading &&
                  patients?.length === 0 &&
                  debouncedSearch.length > 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-48 text-center text-muted-foreground"
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Search className="h-8 w-8 text-muted-foreground/60" />
                          <span className="font-medium text-slate-800">
                            No matching patient records found
                          </span>
                          <span className="text-xs text-muted-foreground max-w-sm">
                            No active patients match &quot;{debouncedSearch}&quot;. Try
                            searching by a different name, phone number, or
                            patient ID.
                          </span>
                          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSearchQuery("")}
                              className="text-xs"
                            >
                              Clear search query
                            </Button>
                            {debouncedSearch.trim().toUpperCase().startsWith("PDC-") && (
                              <Button asChild size="sm" variant="outline" className="text-xs">
                                <Link
                                  href={`/patients/${encodeURIComponent(
                                    debouncedSearch.trim().toUpperCase()
                                  )}`}
                                >
                                  View / Reactivate {debouncedSearch.trim().toUpperCase()}
                                </Link>
                              </Button>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}

                {/* 3. General Empty State */}
                {!isLoading &&
                  patients?.length === 0 &&
                  debouncedSearch.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-48 text-center text-muted-foreground"
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Users className="h-8 w-8 text-muted-foreground/60" />
                          <span className="font-medium text-slate-800">
                            No patient records registered yet
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Get started by creating your first clinical patient
                            record.
                          </span>
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="mt-2"
                          >
                            <Link href="/patients/new">
                              <Plus className="h-4 w-4 mr-1.5" />
                              Register Patient
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}

                {/* 4. Populated State */}
                {!isLoading &&
                  patients &&
                  patients.length > 0 &&
                  patients.map((patient) => (
                    <TableRow
                      key={patient.patient_number}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <TableCell className="font-medium text-slate-900">
                        <Link
                          href={`/patients/${patient.patient_number}`}
                          className="hover:text-primary hover:underline transition-colors font-medium text-slate-900"
                        >
                          {patient.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {patient.patient_number}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {patient.phone}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {patient.gender}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {patient.dob}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={patient.is_active ? "success" : "secondary"}
                        >
                          {patient.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/patients/${patient.patient_number}`}>
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {!isLoading && patients && patients.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 sm:px-6">
              <div className="text-xs text-muted-foreground">
                Page{" "}
                <span className="font-semibold text-slate-700">{page}</span>
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
