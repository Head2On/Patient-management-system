"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Calendar,
  Phone,
  MapPin,
  User as UserIcon,
  FileText,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Clock,
  Trash2,
  UserCheck,
  Loader2,
} from "lucide-react";
import {
  usePatient,
  useDeletePatient,
  useReactivatePatient,
} from "@/features/patients/hooks/use-patients";
import { PageHeaderConfig } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { isApiClientError } from "@/lib/api/errors";
import { PatientPrescriptionsList } from "@/features/prescriptions/components/patient-prescriptions-list";

interface PatientDetailPageProps {
  params: Promise<{ patient_number: string }>;
}

/**
 * Safely extracts { year, month, day } from a YYYY-MM-DD date string.
 * Avoids JavaScript's new Date("YYYY-MM-DD") UTC midnight trap which shifts
 * the date backwards in negative UTC offsets (e.g. US timezones).
 */
function parseDateParts(dateString: string): { year: number; month: number; day: number } | null {
  if (!dateString) return null;
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10); // 1-12
  const day = parseInt(match[3], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month, day };
}

/**
 * Calculates current age from a YYYY-MM-DD birthdate string.
 * Uses exact calendar date components without timezone distortion.
 */
function calculateAge(dobString: string): number | null {
  const parts = parseDateParts(dobString);
  if (!parts) return null;

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-12
  const currentDay = today.getDate();

  let age = currentYear - parts.year;
  if (
    currentMonth < parts.month ||
    (currentMonth === parts.month && currentDay < parts.day)
  ) {
    age--;
  }
  return age >= 0 ? age : null;
}

/**
 * Formats a YYYY-MM-DD string into a localized display date.
 * Constructs local Date(year, month - 1, day) to prevent timezone day-shift.
 */
function formatDate(dateString: string): string {
  const parts = parseDateParts(dateString);
  if (!parts) return dateString || "—";
  try {
    const localDate = new Date(parts.year, parts.month - 1, parts.day);
    return localDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

/**
 * Masks Aadhaar number to protect sensitive PII.
 * Displays only the last 4 digits (e.g. •••• •••• 1234).
 */
function maskAadhaar(aadhaar: string | null | undefined): string {
  if (!aadhaar) return "Not provided";
  const sanitized = aadhaar.replace(/\s+/g, "");
  if (sanitized.length <= 4) {
    return "•••• •••• ••••";
  }
  const last4 = sanitized.slice(-4);
  return `•••• •••• ${last4}`;
}

/**
 * Loading skeleton component for patient details.
 */
function PatientDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border border-border">
        <CardHeader className="space-y-2 pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-7 w-48 bg-slate-200 animate-pulse rounded" />
              <div className="h-4 w-28 bg-slate-200 animate-pulse rounded" />
            </div>
            <div className="h-6 w-16 bg-slate-200 animate-pulse rounded-full" />
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 border border-border">
          <CardHeader className="pb-3">
            <div className="h-5 w-40 bg-slate-200 animate-pulse rounded" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3.5 w-20 bg-slate-200 animate-pulse rounded" />
                  <div className="h-5 w-32 bg-slate-200 animate-pulse rounded" />
                </div>
              ))}
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="h-3.5 w-20 bg-slate-200 animate-pulse rounded" />
              <div className="h-5 w-full bg-slate-200 animate-pulse rounded" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardHeader className="pb-3">
            <div className="h-5 w-36 bg-slate-200 animate-pulse rounded" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-20 bg-slate-200 animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PatientDetailContent({ patientNumber }: { patientNumber: string }) {
  const router = useRouter();
  const [isDeactivateOpen, setIsDeactivateOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const {
    data: patient,
    isLoading,
    isError,
    error,
    refetch,
  } = usePatient(patientNumber, {
    enabled: Boolean(patientNumber),
  });

  const deletePatientMutation = useDeletePatient();
  const reactivatePatientMutation = useReactivatePatient();

  const age = patient?.dob ? calculateAge(patient.dob) : null;
  const is404 = isApiClientError(error) && error.isNotFound;

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeaderConfig
        title={patient ? patient.name : "Patient Record"}
        description={
          patient
            ? `Viewing clinical file for ${patient.patient_number}`
            : "Detailed clinical record and history"
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Patients", href: "/patients" },
          {
            label: patient?.patient_number || patientNumber || "Details",
            href: `/patients/${encodeURIComponent(patientNumber)}`,
          },
        ]}
        headerActions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/patients">
                <ArrowLeft className="h-4 w-4" />
                Back to Directory
              </Link>
            </Button>
            {patient && (
              <>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link href={`/patients/${encodeURIComponent(patient.patient_number)}/edit`}>
                    <Pencil className="h-4 w-4" />
                    Edit Patient
                  </Link>
                </Button>

                {patient.is_active && (
                  <Dialog open={isDeactivateOpen} onOpenChange={setIsDeactivateOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                      >
                        <Trash2 className="h-4 w-4" />
                        Deactivate
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Deactivate Patient File</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to deactivate{" "}
                          <span className="font-semibold text-slate-900">
                            {patient.name}
                          </span>{" "}
                          (
                          <span className="font-mono text-slate-800">
                            {patient.patient_number}
                          </span>
                          )?
                        </DialogDescription>
                      </DialogHeader>

                      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md border border-border space-y-1">
                        <p className="font-medium text-slate-800">What happens next:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          <li>The patient file is archived and hidden from the active directory.</li>
                          <li>New appointments cannot be booked for this patient.</li>
                          <li>Authorized staff (Admin or Receptionist) can reactivate this file at any time.</li>
                        </ul>
                      </div>

                      {actionError && (
                        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md">
                          {actionError}
                        </div>
                      )}

                      <DialogFooter className="gap-2 sm:gap-0">
                        <DialogClose asChild>
                          <Button variant="outline" size="sm" disabled={deletePatientMutation.isPending}>
                            Cancel
                          </Button>
                        </DialogClose>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletePatientMutation.isPending}
                          onClick={() => {
                            setActionError(null);
                            deletePatientMutation.mutate(patient.patient_number, {
                              onSuccess: () => {
                                setIsDeactivateOpen(false);
                                router.push("/patients");
                              },
                              onError: (err) => {
                                if (err.isForbidden) {
                                  setActionError(
                                    "Access Denied: Only Administrators and Receptionists can deactivate patient records."
                                  );
                                } else {
                                  setActionError(err.message || "Failed to deactivate patient record.");
                                }
                              },
                            });
                          }}
                        >
                          {deletePatientMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                              Deactivating...
                            </>
                          ) : (
                            "Confirm Deactivation"
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </>
            )}
          </div>
        }
      />

      {/* Action Error Banner (Top of page) */}
      {actionError && patient && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md flex items-center justify-between">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-xs underline hover:no-underline ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Loading Skeleton */}
      {isLoading && <PatientDetailSkeleton />}

      {/* 2. 404 / Not Found / Inactive State */}
      {!isLoading && (is404 || (!patient && !isError)) && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <UserIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg text-slate-900">
                Patient Record Not Found or Inactive
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                No active patient file matches identifier{" "}
                <span className="font-mono font-medium text-slate-800">
                  {patientNumber || "—"}
                </span>
                . The record may have been deactivated or never existed.
              </p>
            </div>

            {actionError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md max-w-md">
                {actionError}
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/patients">
                  <ArrowLeft className="h-4 w-4" />
                  Return to Directory
                </Link>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                disabled={reactivatePatientMutation.isPending}
                onClick={() => {
                  setActionError(null);
                  reactivatePatientMutation.mutate(patientNumber, {
                    onSuccess: () => {
                      refetch();
                    },
                    onError: (err) => {
                      if (err.isForbidden) {
                        setActionError(
                          "Access Denied: Only Administrators and Receptionists can reactivate patient records."
                        );
                      } else if (err.isNotFound) {
                        setActionError("This patient record does not exist in the database.");
                      } else {
                        setActionError(err.message || "Failed to reactivate patient record.");
                      }
                    },
                  });
                }}
              >
                {reactivatePatientMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <UserCheck className="h-4 w-4 mr-1.5 text-emerald-600" />
                )}
                Reactivate Record
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. API Error State (Non-404) */}
      {!isLoading && isError && !is404 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <h3 className="font-semibold text-slate-900">
                Failed to load patient record
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

      {/* 4. Populated Patient Record */}
      {!isLoading && patient && (
        <div className="space-y-6">
          {/* Inactive Warning Banner if record is deactivated */}
          {!patient.is_active && (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-800">
              <div className="flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  This patient record is currently <strong>inactive</strong>. It is hidden from the active directory.
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 bg-white border-amber-300 text-amber-900 hover:bg-amber-100 shrink-0"
                disabled={reactivatePatientMutation.isPending}
                onClick={() => {
                  setActionError(null);
                  reactivatePatientMutation.mutate(patient.patient_number, {
                    onSuccess: () => {
                      refetch();
                    },
                    onError: (err) => {
                      if (err.isForbidden) {
                        setActionError(
                          "Access Denied: Only Administrators and Receptionists can reactivate patient records."
                        );
                      } else {
                        setActionError(err.message || "Failed to reactivate patient record.");
                      }
                    },
                  });
                }}
              >
                {reactivatePatientMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserCheck className="h-4 w-4 text-emerald-600" />
                )}
                Reactivate Patient
              </Button>
            </div>
          )}

          {/* Header Card */}
          <Card className="border-border">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
                      {patient.name}
                    </CardTitle>
                    {patient.is_active ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                  <CardDescription className="flex items-center gap-2 text-sm">
                    <span className="font-mono font-medium text-slate-700">
                      {patient.patient_number}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500">
                      Internal ID: #{patient.id}
                    </span>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Personal Information (2 Cols) */}
            <Card className="md:col-span-2 border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-primary" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Phone */}
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      Phone Number
                    </span>
                    <p className="text-sm font-medium text-slate-900">
                      {patient.phone || "—"}
                    </p>
                  </div>

                  {/* Date of Birth & Age */}
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Date of Birth
                    </span>
                    <p className="text-sm font-medium text-slate-900">
                      {formatDate(patient.dob)}
                      {age !== null && (
                        <span className="ml-2 text-xs text-muted-foreground font-normal">
                          ({age} years old)
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Gender */}
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <UserIcon className="h-3.5 w-3.5" />
                      Gender
                    </span>
                    <p className="text-sm font-medium text-slate-900">
                      {patient.gender || "—"}
                    </p>
                  </div>

                  {/* Aadhaar (Masked per Security Rule) */}
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Aadhaar Number
                    </span>
                    <p className="text-sm font-mono text-slate-800">
                      {maskAadhaar(patient.aadhaar)}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Address */}
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Residential Address
                  </span>
                  <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                    {patient.address || "—"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Medical / Clinical Information (1 Col) */}
            <div className="space-y-6">
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Medical Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Chief Complaint
                    </span>
                    <div className="p-3 rounded-md bg-muted/40 border border-border/60 text-sm text-slate-800 leading-relaxed">
                      {patient.chief_complaint || "None recorded"}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Record Metadata / Audit */}
              <Card className="border-border bg-slate-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Record Audit
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between items-center">
                    <span>Registered By Staff ID:</span>
                    <span className="font-mono font-medium text-slate-700">
                      {patient.created_by_id ? `#${patient.created_by_id}` : "System"}
                    </span>
                  </div>
                  {patient.updated_by_id && (
                    <div className="flex justify-between items-center">
                      <span>Last Modified By:</span>
                      <span className="font-mono font-medium text-slate-700">
                        #{patient.updated_by_id}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Clinical Prescriptions & Encounter History */}
          <PatientPrescriptionsList patientId={patient.id} />
        </div>
      )}
    </div>
  );
}

function PatientDetailWrapper({ params }: PatientDetailPageProps) {
  const resolvedParams = React.use(params);
  const patientNumber = resolvedParams?.patient_number ?? "";

  return <PatientDetailContent patientNumber={patientNumber} />;
}

export default function PatientDetailPage({ params }: PatientDetailPageProps) {
  return (
    <React.Suspense fallback={<PatientDetailSkeleton />}>
      <PatientDetailWrapper params={params} />
    </React.Suspense>
  );
}
