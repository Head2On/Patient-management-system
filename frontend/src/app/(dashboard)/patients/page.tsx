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
  RotateCcw,
  CheckCircle2,
  Archive,
  Calendar,
  ShieldCheck,
} from "lucide-react";
import {
  usePatients,
  useReactivatePatient,
} from "@/features/patients/hooks/use-patients";
import type { PatientListItem } from "@/types/patient";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PAGE_SIZE = 10;
const DEBOUNCE_DELAY_MS = 300;
const emptySubscribe = () => () => {};

/**
 * Hook to safely read user role from the client-side caredesk_user metadata cookie.
 * React 19 compliant: returns a primitive string snapshot to maintain value equality.
 */
function useCurrentUserRole(): string | null {
  const rawCookie = React.useSyncExternalStore(
    emptySubscribe,
    () => {
      if (typeof document === "undefined") return null;
      const match = document.cookie.match(/(?:^|;\s*)caredesk_user=([^;]+)/);
      return match && match[1] ? match[1] : null;
    },
    () => null
  );

  return React.useMemo(() => {
    if (!rawCookie) return null;
    try {
      const parsed = JSON.parse(decodeURIComponent(rawCookie));
      return typeof parsed.role === "string" ? parsed.role : null;
    } catch {
      return null;
    }
  }, [rawCookie]);
}

export default function PatientsPage() {
  const role = useCurrentUserRole();
  const canManageLifecycle = role === "ADMIN" || role === "RECEPTIONIST";

  const [statusTab, setStatusTab] = React.useState<"active" | "inactive">("active");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [page, setPage] = React.useState(1);

  // Reactivation dialog state
  const [selectedPatientForReactivation, setSelectedPatientForReactivation] =
    React.useState<PatientListItem | null>(null);
  const [reactivateError, setReactivateError] = React.useState<string | null>(null);
  const [successBanner, setSuccessBanner] = React.useState<string | null>(null);

  const reactivateMutation = useReactivatePatient();

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
    is_active: statusTab === "active",
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

  const handleConfirmReactivation = () => {
    if (!selectedPatientForReactivation) return;
    setReactivateError(null);

    const targetPatient = selectedPatientForReactivation;

    reactivateMutation.mutate(targetPatient.patient_number, {
      onSuccess: (reactivatedPatient) => {
        setSelectedPatientForReactivation(null);
        setSuccessBanner(
          `Patient record ${reactivatedPatient.patient_number} (${reactivatedPatient.name}) has been reactivated successfully.`
        );
        // Automatically dismiss success notification after 5s
        setTimeout(() => setSuccessBanner(null), 5000);
      },
      onError: (err) => {
        setReactivateError(
          err.message ||
            "Failed to reactivate patient record. Please ensure you have permission and try again."
        );
      },
    });
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
          canManageLifecycle && (
            <Button asChild size="sm">
              <Link href="/patients/new">
                <Plus className="h-4 w-4 mr-1.5" />
                New Patient
              </Link>
            </Button>
          )
        }
      />

      {/* Success Notification Banner */}
      {successBanner && (
        <Card
          className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200"
          role="status"
          aria-live="polite"
        >
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-sm font-medium">{successBanner}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSuccessBanner(null)}
              className="text-xs h-7 text-emerald-700 hover:text-emerald-900"
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search and Lifecycle View Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder={
                statusTab === "active"
                  ? "Search active patients..."
                  : "Search inactive records..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {/* Active / Inactive Segmented View Filter (Admin & Receptionist only) */}
          {canManageLifecycle && (
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border shrink-0 self-start sm:self-auto">
              <Button
                type="button"
                variant={statusTab === "active" ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  if (statusTab !== "active") {
                    setStatusTab("active");
                    setPage(1);
                  }
                }}
                className="h-8 text-xs font-medium"
              >
                Active Patients
              </Button>
              <Button
                type="button"
                variant={statusTab === "inactive" ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  if (statusTab !== "inactive") {
                    setStatusTab("inactive");
                    setPage(1);
                  }
                }}
                className="h-8 text-xs font-medium gap-1.5"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Inactive Records</span>
              </Button>
            </div>
          )}
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
              <h3 className="font-semibold text-foreground">
                Failed to load patient records
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {error?.message ||
                  "An unexpected error occurred while communicating with the patient service."}
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
                  <TableHead className="w-[140px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* 1. Loading Skeleton */}
                {isLoading &&
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-14 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-5 w-14 bg-slate-200 dark:bg-slate-700 animate-pulse rounded-full" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="h-8 w-16 bg-slate-200 dark:bg-slate-700 animate-pulse rounded ml-auto" />
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
                          <span className="font-medium text-foreground">
                            No matching patient records found
                          </span>
                          <span className="text-xs text-muted-foreground max-w-sm">
                            No {statusTab === "active" ? "active" : "inactive"} patients
                            match &quot;{debouncedSearch}&quot;. Try searching by a
                            different name, phone number, or patient ID.
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
                                  View Patient Record
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
                          {statusTab === "active" ? (
                            <>
                              <Users className="h-8 w-8 text-muted-foreground/60" />
                              <span className="font-medium text-foreground">
                                No active patient records registered yet
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Get started by creating your first clinical patient record.
                              </span>
                              {canManageLifecycle && (
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
                              )}
                            </>
                          ) : (
                            <>
                              <Archive className="h-8 w-8 text-muted-foreground/60" />
                              <span className="font-medium text-foreground">
                                No inactive patient records
                              </span>
                              <span className="text-xs text-muted-foreground max-w-sm">
                                There are currently no deactivated patient files in the clinic archive.
                                Deactivated records will appear here for review and reactivation.
                              </span>
                            </>
                          )}
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
                      <TableCell className="font-medium text-foreground">
                        <Link
                          href={`/patients/${patient.patient_number}`}
                          className="hover:text-primary hover:underline transition-colors font-medium text-foreground"
                        >
                          {patient.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {patient.patient_number}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
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
                          variant={patient.is_active ? "success" : "destructive"}
                        >
                          {patient.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                            <Link href={`/patients/${patient.patient_number}`}>
                              View
                            </Link>
                          </Button>

                          {/* Direct Reactivation Action for Inactive Records */}
                          {!patient.is_active && canManageLifecycle && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedPatientForReactivation(patient);
                                setReactivateError(null);
                              }}
                              className="h-8 text-xs text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 gap-1"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Reactivate
                            </Button>
                          )}
                        </div>
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
                <span className="font-semibold text-foreground">{page}</span>
                {statusTab === "inactive" && " (Inactive Archive)"}
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

      {/* Patient Reactivation Confirmation Dialog */}
      <Dialog
        open={Boolean(selectedPatientForReactivation)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPatientForReactivation(null);
            setReactivateError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <RotateCcw className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Reactivate Patient Record
            </DialogTitle>
            <DialogDescription>
              Confirm restoration of patient account for clinic access and appointment scheduling.
            </DialogDescription>
          </DialogHeader>

          {selectedPatientForReactivation && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted/60 rounded-md border border-border space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase font-medium">
                    Patient Reference
                  </span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {selectedPatientForReactivation.patient_number}
                  </Badge>
                </div>
                <p className="text-base font-semibold text-foreground">
                  {selectedPatientForReactivation.name}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {selectedPatientForReactivation.phone}
                </p>
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>The patient will be restored to active status across the clinic directory.</span>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Clinic staff will be permitted to book new appointments for this patient.</span>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>All historical clinical files, notes, and appointment history remain preserved.</span>
                </div>
              </div>

              {reactivateError && (
                <div
                  className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md flex items-start gap-2"
                  role="alert"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{reactivateError}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedPatientForReactivation(null)}
              disabled={reactivateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmReactivation}
              disabled={reactivateMutation.isPending}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {reactivateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reactivating...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  Confirm Reactivation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
