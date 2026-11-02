"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Calendar,
  User as UserIcon,
  Stethoscope,
  FileText,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Lock,
  ChevronRight,
  CalendarPlus,
} from "lucide-react";
import { usePatients, usePatient } from "@/features/patients/hooks/use-patients";
import { useProviders } from "@/features/providers/hooks/use-providers";
import { useCreateAppointment } from "@/features/appointments/hooks/use-appointments";
import type { AppointmentCreateInput } from "@/types/appointment";
import type { PatientListItem } from "@/types/patient";
import { CLINIC_TIMEZONE } from "@/lib/datetime";
import { PageHeaderConfig } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const emptySubscribe = () => () => {};

/**
 * Hook to safely read user role from the client-side caredesk_user metadata cookie.
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
 * Formats a Date object into HTML datetime-local format: "YYYY-MM-DDTHH:mm".
 */
function toDateTimeLocalString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Generates default consultation slot times (tomorrow 10:00 AM – 10:30 AM).
 */
function getDefaultSlotTimes() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);

  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 30);

  return {
    start: toDateTimeLocalString(start),
    end: toDateTimeLocalString(end),
  };
}

/**
 * Zod validation schema aligned with FastAPI backend constraints:
 * - patient_id: mandatory integer
 * - provider_id: doctor doc_number string
 * - start_time: ISO datetime string, cannot be in past
 * - end_time: ISO datetime string, must be strictly after start_time
 * - reason_for_visit: 3-300 chars
 * - internal_notes: optional string
 */
const appointmentFormSchema = z
  .object({
    patient_id: z
      .number({
        message: "Please search and select a patient for this consultation",
      })
      .int()
      .positive("Please select a valid registered patient"),
    provider_id: z
      .string({
        message: "Please select an assigned medical provider",
      })
      .min(3, "Please select an assigned medical provider"),
    start_time: z.string().min(1, "Start date and time are required"),
    end_time: z.string().min(1, "End date and time are required"),
    reason_for_visit: z
      .string()
      .trim()
      .min(3, "Reason for visit must be at least 3 characters")
      .max(300, "Reason for visit cannot exceed 300 characters"),
    internal_notes: z
      .string()
      .trim()
      .max(500, "Internal notes cannot exceed 500 characters")
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (data) => {
      if (!data.start_time || !data.end_time) return true;
      const start = new Date(data.start_time);
      const end = new Date(data.end_time);
      return !isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start;
    },
    {
      message: "End time must be after start time",
      path: ["end_time"],
    }
  )
  .refine(
    (data) => {
      if (!data.start_time) return true;
      const start = new Date(data.start_time);
      // Allow 2-minute buffer for form filling
      const nowBuffer = new Date(Date.now() - 120000);
      return !isNaN(start.getTime()) && start >= nowBuffer;
    },
    {
      message: "Appointment start time cannot be in the past",
      path: ["start_time"],
    }
  );

type AppointmentFormData = z.infer<typeof appointmentFormSchema>;

export default function NewAppointmentPage() {
  const router = useRouter();
  const userRole = useCurrentUserRole();
  const isAuthorized = userRole === "ADMIN" || userRole === "RECEPTIONIST";

  // Patient Selection States
  const [patientSearch, setPatientSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [selectedPatientNumber, setSelectedPatientNumber] = React.useState<
    string | null
  >(null);

  const [globalError, setGlobalError] = React.useState<string | null>(null);

  // Debounce search query by 300ms
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(patientSearch.trim());
    }, 300);

    return () => clearTimeout(handler);
  }, [patientSearch]);

  // Query patient list for selection
  const { data: searchResults, isLoading: isSearchingPatients } = usePatients({
    page: 1,
    limit: 6,
    search: debouncedSearch || undefined,
  });

  // Query full record of selected patient to retrieve integer database ID
  const {
    data: selectedPatientDetail,
    isLoading: isLoadingSelectedPatient,
    isError: isPatientDetailError,
  } = usePatient(selectedPatientNumber || "", {
    enabled: Boolean(selectedPatientNumber),
  });

  // Query active providers for dropdown
  const { data: providers, isLoading: isLoadingProviders } = useProviders({
    skip: 0,
    limit: 100,
  });

  const activeProviders = React.useMemo(() => {
    return providers?.filter((p) => p.is_active) ?? [];
  }, [providers]);

  // Form setup
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    control,
    formState: { errors },
  } = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      patient_id: 0,
      provider_id: "",
      start_time: "",
      end_time: "",
      reason_for_visit: "",
      internal_notes: "",
    },
  });

  // Set default slot times on client mount to ensure Next.js prerender stability
  React.useEffect(() => {
    const slots = getDefaultSlotTimes();
    setValue("start_time", slots.start);
    setValue("end_time", slots.end);
  }, [setValue]);

  // Automatically update form patient_id when selectedPatientDetail loads
  React.useEffect(() => {
    if (selectedPatientDetail?.id) {
      setValue("patient_id", selectedPatientDetail.id, {
        shouldValidate: true,
      });
    }
  }, [selectedPatientDetail, setValue]);

  const { mutate: createAppointmentMutation, isPending } =
    useCreateAppointment();

  // Watch selected provider for preview
  const watchedProviderId = useWatch({
    control,
    name: "provider_id",
  });
  const selectedProvider = React.useMemo(() => {
    return activeProviders.find((p) => p.doc_number === watchedProviderId);
  }, [activeProviders, watchedProviderId]);

  const handleSelectPatient = (patient: PatientListItem) => {
    if (!patient.is_active) return;
    setSelectedPatientNumber(patient.patient_number);
    setPatientSearch("");
  };

  const handleClearPatient = () => {
    setSelectedPatientNumber(null);
    setValue("patient_id", 0, { shouldValidate: true });
  };

  const onSubmit = (formData: AppointmentFormData) => {
    if (!isAuthorized) {
      setGlobalError(
        "Access Denied: Only Administrators and Receptionists can book clinical appointments."
      );
      return;
    }

    if (!selectedPatientDetail || !selectedPatientDetail.is_active) {
      setGlobalError(
        "Invalid patient record. Please select an active patient from the registry."
      );
      return;
    }

    setGlobalError(null);

    const payload: AppointmentCreateInput = {
      patient_id: selectedPatientDetail.id,
      provider_id: formData.provider_id,
      start_time: new Date(formData.start_time).toISOString(),
      end_time: new Date(formData.end_time).toISOString(),
      reason_for_visit: formData.reason_for_visit.trim(),
      internal_notes: formData.internal_notes?.trim() || null,
    };

    createAppointmentMutation(payload, {
      onSuccess: (newAppointment) => {
        router.push(`/appointments/${newAppointment.id}`);
      },
      onError: (err) => {
        if (err.isValidationError && err.validationErrors) {
          // Map FastAPI 422 field errors
          Object.entries(err.validationErrors).forEach(([field, message]) => {
            setError(field as keyof AppointmentFormData, {
              type: "server",
              message,
            });
          });
          setGlobalError(
            "Validation failed. Please review the highlighted fields."
          );
        } else if (err.isForbidden) {
          setGlobalError(
            "Access Denied: Your staff account does not have permission to book appointments."
          );
        } else if (err.isConflict) {
          // Backend raises 409 Conflict for overlapping appointments
          setGlobalError(
            err.message ||
              "Time Slot Conflict: The selected patient or doctor already has an appointment during this time window."
          );
        } else {
          setGlobalError(
            err.message ||
              "An error occurred while booking the appointment. Please verify slot availability."
          );
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Shell Header Configuration */}
      <PageHeaderConfig
        title="Book Appointment"
        description="Schedule a clinical consultation with an assigned medical provider"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Appointments", href: "/appointments" },
          { label: "New Booking" },
        ]}
        headerActions={
          <Button asChild variant="outline" size="sm">
            <Link href="/appointments">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Appointments
            </Link>
          </Button>
        }
      />

      {/* Role Restriction Banner (if unauthorized) */}
      {!isAuthorized && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-3 p-4 text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">Staff Authorization Required</p>
              <p className="text-xs">
                Appointment booking is restricted to Clinic Administrators and
                Receptionists. Doctor accounts have read-only access to consultation schedules.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Global Error Banner */}
      {globalError && (
        <Card
          className="border-destructive/20 bg-destructive/5"
          role="alert"
          aria-live="assertive"
        >
          <CardContent className="flex items-center justify-between p-4 text-destructive">
            <div className="flex items-center gap-2.5 text-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{globalError}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGlobalError(null)}
              className="text-xs text-destructive hover:bg-destructive/10"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Dismiss error</span>
            </Button>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Step 1: Patient Selection Card */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-primary" />
              Step 1: Patient Selection <span className="text-destructive">*</span>
            </CardTitle>
            <CardDescription>
              Select an active registered patient from the clinic database
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedPatientDetail ? (
              // Selected Patient Summary Display
              <div className="p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-sm">
                          {selectedPatientDetail.name}
                        </span>
                        <Badge variant="outline" className="font-mono text-xs">
                          {selectedPatientDetail.patient_number}
                        </Badge>
                        <Badge variant="secondary" className="font-mono text-[11px]">
                          DB #{selectedPatientDetail.id}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Phone: {selectedPatientDetail.phone} • Gender:{" "}
                        {selectedPatientDetail.gender} • DOB:{" "}
                        {selectedPatientDetail.dob}
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClearPatient}
                    disabled={isPending || !isAuthorized}
                    className="text-xs shrink-0"
                  >
                    Change Patient
                  </Button>
                </div>
              </div>
            ) : (
              // Patient Search Input & Live Results
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search patient by name, phone, or PDC ID (e.g. PDC-000001)..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    disabled={isPending || !isAuthorized}
                    className="pl-9"
                    aria-label="Search patients"
                  />
                  {isSearchingPatients && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>

                {/* Patient Search Results Dropdown */}
                {debouncedSearch && searchResults && (
                  <div className="border border-border rounded-lg bg-card overflow-hidden shadow-xs divide-y divide-border">
                    {searchResults.length > 0 ? (
                      searchResults.map((patient: PatientListItem) => (
                        <div
                          key={patient.patient_number}
                          className={`p-3 flex items-center justify-between transition-colors ${
                            patient.is_active
                              ? "hover:bg-muted/50 cursor-pointer"
                              : "opacity-60 bg-muted/20 cursor-not-allowed"
                          }`}
                          onClick={() => {
                            if (patient.is_active) handleSelectPatient(patient);
                          }}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-xs text-foreground">
                                {patient.name}
                              </span>
                              <Badge
                                variant="outline"
                                className="font-mono text-[10px] px-1.5 py-0"
                              >
                                {patient.patient_number}
                              </Badge>
                              {!patient.is_active && (
                                <Badge variant="destructive" className="text-[10px]">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Phone: {patient.phone} • DOB: {patient.dob}
                            </p>
                          </div>

                          {patient.is_active ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectPatient(patient);
                              }}
                            >
                              Select
                              <ChevronRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          ) : (
                            <span className="text-[11px] text-destructive">
                              Inactive Record
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        No patients matching &quot;{debouncedSearch}&quot; found in the
                        registry.
                      </div>
                    )}
                  </div>
                )}

                {isLoadingSelectedPatient && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Resolving patient database ID...</span>
                  </div>
                )}

                {isPatientDetailError && (
                  <p className="text-xs text-destructive">
                    Failed to resolve patient record details. Please select another patient.
                  </p>
                )}

                {errors.patient_id && (
                  <p className="text-xs text-destructive">
                    {errors.patient_id.message}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Medical Provider Selection */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              Step 2: Medical Provider Selection <span className="text-destructive">*</span>
            </CardTitle>
            <CardDescription>
              Assign an active doctor or specialist to conduct this consultation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider_id">
                Select Medical Provider <span className="text-destructive">*</span>
              </Label>
              <select
                id="provider_id"
                disabled={isPending || !isAuthorized || isLoadingProviders}
                aria-invalid={Boolean(errors.provider_id)}
                aria-describedby={
                  errors.provider_id ? "provider-error" : undefined
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                {...register("provider_id")}
              >
                <option value="" disabled>
                  {isLoadingProviders
                    ? "Loading available providers..."
                    : "Choose an active provider..."}
                </option>
                {activeProviders.map((provider) => (
                  <option key={provider.id} value={provider.doc_number}>
                    Dr. {provider.name} ({provider.post} •{" "}
                    {provider.specialization}) — [{provider.doc_number}]
                  </option>
                ))}
              </select>
              {errors.provider_id && (
                <p id="provider-error" className="text-xs text-destructive">
                  {errors.provider_id.message}
                </p>
              )}
            </div>

            {/* Provider Preview Card */}
            {selectedProvider && (
              <div className="p-3 rounded-lg border border-border bg-card text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-foreground">
                    Dr. {selectedProvider.name}
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {selectedProvider.doc_number}
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  Qualification: {selectedProvider.post} • Specialization:{" "}
                  {selectedProvider.specialization}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 3: Consultation Schedule & Window */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Step 3: Consultation Schedule & Window <span className="text-destructive">*</span>
            </CardTitle>
            <CardDescription>
              Specify start and end time in Clinic Standard Time ({CLINIC_TIMEZONE})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Start Datetime */}
              <div className="space-y-2">
                <Label htmlFor="start_time">
                  Start Date & Time (IST) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="start_time"
                  type="datetime-local"
                  disabled={isPending || !isAuthorized}
                  aria-invalid={Boolean(errors.start_time)}
                  aria-describedby={
                    errors.start_time ? "start-time-error" : undefined
                  }
                  {...register("start_time")}
                />
                {errors.start_time && (
                  <p id="start-time-error" className="text-xs text-destructive">
                    {errors.start_time.message}
                  </p>
                )}
              </div>

              {/* End Datetime */}
              <div className="space-y-2">
                <Label htmlFor="end_time">
                  End Date & Time (IST) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="end_time"
                  type="datetime-local"
                  disabled={isPending || !isAuthorized}
                  aria-invalid={Boolean(errors.end_time)}
                  aria-describedby={
                    errors.end_time ? "end-time-error" : undefined
                  }
                  {...register("end_time")}
                />
                {errors.end_time && (
                  <p id="end-time-error" className="text-xs text-destructive">
                    {errors.end_time.message}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 4: Clinical Consultation Details */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Step 4: Clinical Consultation Details
            </CardTitle>
            <CardDescription>
              Primary visit purpose and optional confidential staff observations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Reason for Visit */}
            <div className="space-y-2">
              <Label htmlFor="reason_for_visit">
                Reason for Visit <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason_for_visit"
                placeholder="e.g. Routine hypertension checkup, follow-up on lab tests..."
                rows={3}
                disabled={isPending || !isAuthorized}
                aria-invalid={Boolean(errors.reason_for_visit)}
                aria-describedby={
                  errors.reason_for_visit ? "reason-error" : undefined
                }
                {...register("reason_for_visit")}
              />
              {errors.reason_for_visit && (
                <p id="reason-error" className="text-xs text-destructive">
                  {errors.reason_for_visit.message}
                </p>
              )}
            </div>

            {/* Internal Notes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="internal_notes"
                  className="flex items-center gap-1.5"
                >
                  <Lock className="h-3 w-3 text-amber-600" />
                  Internal Clinical Notes (Optional)
                </Label>
                <span className="text-[11px] text-muted-foreground italic">
                  Visible to clinic staff only
                </span>
              </div>
              <Textarea
                id="internal_notes"
                placeholder="Optional private notes for doctors or receptionists..."
                rows={2}
                disabled={isPending || !isAuthorized}
                aria-invalid={Boolean(errors.internal_notes)}
                aria-describedby={
                  errors.internal_notes ? "notes-error" : undefined
                }
                {...register("internal_notes")}
              />
              {errors.internal_notes && (
                <p id="notes-error" className="text-xs text-destructive">
                  {errors.internal_notes.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Submit Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
          <Button
            asChild
            type="button"
            variant="outline"
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            <Link href="/appointments">Cancel</Link>
          </Button>
          <Button
            type="submit"
            disabled={isPending || !isAuthorized || !selectedPatientDetail}
            className="w-full sm:w-auto"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Booking Consultation...
              </>
            ) : (
              <>
                <CalendarPlus className="h-4 w-4 mr-2" />
                Book Consultation
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
