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
  AlertCircle,
  Loader2,
  X,
  Lock,
  Hourglass,
  Save,
  CheckCircle2,
} from "lucide-react";
import {
  useAppointment,
  useUpdateAppointment,
} from "@/features/appointments/hooks/use-appointments";
import { useProviders } from "@/features/providers/hooks/use-providers";
import type { AppointmentUpdateInput } from "@/types/appointment";
import {
  isoToClinicDateTimeLocal,
  clinicDateTimeLocalToIso,
  formatClinicDate,
  formatAppointmentDuration,
  CLINIC_TIMEZONE,
} from "@/lib/datetime";
import { formatDoctorName } from "@/lib/utils";
import { isApiClientError } from "@/lib/api/errors";
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

interface AppointmentEditPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Zod validation schema for appointment updates:
 * - provider_id: doctor doc_number string
 * - start_time: datetime-local string
 * - end_time: datetime-local string (must be after start_time)
 * - reason_for_visit: 3-300 chars
 * - internal_notes: optional string
 */
const appointmentEditSchema = z
  .object({
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
      const start = new Date(clinicDateTimeLocalToIso(data.start_time));
      const end = new Date(clinicDateTimeLocalToIso(data.end_time));
      return !isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start;
    },
    {
      message: "End time must be after start time",
      path: ["end_time"],
    }
  );

type AppointmentEditFormData = z.infer<typeof appointmentEditSchema>;

/**
 * Loading skeleton for appointment edit page.
 */
function AppointmentEditSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border border-border">
        <CardHeader className="space-y-2 pb-4">
          <div className="h-7 w-64 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
          <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
        </CardHeader>
      </Card>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="border border-border">
            <CardHeader className="pb-3">
              <div className="h-5 w-40 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-16 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AppointmentEditContent({
  appointmentId,
  rawId,
}: {
  appointmentId: number;
  rawId: string;
}) {
  const router = useRouter();
  const isValidId = Number.isSafeInteger(appointmentId) && appointmentId > 0;

  const [globalError, setGlobalError] = React.useState<string | null>(null);

  // Fetch appointment record
  const {
    data: appointment,
    isLoading: isLoadingAppointment,
    isError: isAppointmentError,
    error: appointmentError,
    refetch,
  } = useAppointment(appointmentId, {
    enabled: isValidId,
  });

  // Fetch active providers for selection
  const { data: providers, isLoading: isLoadingProviders } = useProviders({
    skip: 0,
    limit: 100,
  });

  const activeProviders = React.useMemo(() => {
    return providers?.filter((p) => p.is_active) ?? [];
  }, [providers]);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<AppointmentEditFormData>({
    resolver: zodResolver(appointmentEditSchema),
    defaultValues: {
      provider_id: "",
      start_time: "",
      end_time: "",
      reason_for_visit: "",
      internal_notes: "",
    },
  });

  // Check if terminal lifecycle state
  const isTerminal =
    appointment?.status === "completed" ||
    appointment?.status === "cancelled" ||
    appointment?.status === "no_show";

  // Prepopulate form when appointment loads (guarded by !isDirty to preserve user edits)
  React.useEffect(() => {
    if (appointment && !isDirty) {
      reset({
        provider_id: appointment.provider.doc_number,
        start_time: isoToClinicDateTimeLocal(appointment.start_time),
        end_time: isoToClinicDateTimeLocal(appointment.end_time),
        reason_for_visit: appointment.reason_for_visit,
        internal_notes: appointment.internal_notes || "",
      });
    }
  }, [appointment, isDirty, reset]);

  // Watch selected provider for preview
  const watchedProviderId = useWatch({
    control,
    name: "provider_id",
  });
  const selectedProvider = React.useMemo(() => {
    return activeProviders.find((p) => p.doc_number === watchedProviderId);
  }, [activeProviders, watchedProviderId]);

  // Watch start and end times for dynamic duration preview
  const watchedStartTime = useWatch({ control, name: "start_time" });
  const watchedEndTime = useWatch({ control, name: "end_time" });

  const dynamicDuration = React.useMemo(() => {
    if (!watchedStartTime || !watchedEndTime) return null;
    const startIso = clinicDateTimeLocalToIso(watchedStartTime);
    const endIso = clinicDateTimeLocalToIso(watchedEndTime);
    return formatAppointmentDuration(startIso, endIso);
  }, [watchedStartTime, watchedEndTime]);

  const updateMutation = useUpdateAppointment();
  const isPending = updateMutation.isPending;

  // Invalid ID state
  if (!isValidId) {
    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title="Invalid Appointment Reference"
          description="The requested appointment reference is invalid."
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Appointments", href: "/appointments" },
            { label: rawId ? `Invalid (${rawId})` : "Invalid" },
          ]}
        />
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-muted-foreground/60" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold">
                Invalid Appointment Reference
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                The appointment ID must be a strictly positive integer. Malformed
                reference &quot;{rawId}&quot; cannot be processed.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/appointments">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Return to Appointments Directory
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 404 Not Found state
  const is404 = isApiClientError(appointmentError) && appointmentError.isNotFound;
  if (is404) {
    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title={`Appointment #${appointmentId} Not Found`}
          description="The requested appointment record does not exist."
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Appointments", href: "/appointments" },
            { label: `#${appointmentId}` },
          ]}
        />
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-muted-foreground/60" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Appointment Not Found</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                No clinical consultation was found with reference #{appointmentId}.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/appointments">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Appointments
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoadingAppointment) {
    return <AppointmentEditSkeleton />;
  }

  if (isAppointmentError || !appointment) {
    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title="Error Loading Appointment"
          description="Unable to retrieve appointment record for editing."
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Appointments", href: "/appointments" },
            { label: "Error" },
          ]}
        />
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-destructive">
                Failed to Retrieve Record
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {appointmentError?.message ||
                  "An unexpected error occurred while communicating with the clinic server."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="text-xs"
              >
                Try Again
              </Button>
              <Button asChild variant="ghost" size="sm" className="text-xs">
                <Link href="/appointments">Back to Directory</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const onSubmit = (formData: AppointmentEditFormData) => {
    if (isTerminal) {
      setGlobalError(
        `Cannot edit an appointment with terminal status "${appointment.status}".`
      );
      return;
    }

    setGlobalError(null);

    // Build update payload - strictly respects backend AppointmentUpdate schema (extra='forbid')
    // Status is deliberately omitted so rescheduling does not change appointment status.
    const startIso = clinicDateTimeLocalToIso(formData.start_time);
    const endIso = clinicDateTimeLocalToIso(formData.end_time);

    const payload: AppointmentUpdateInput = {
      provider_id: formData.provider_id,
      start_time: startIso,
      end_time: endIso,
      reason_for_visit: formData.reason_for_visit.trim(),
      internal_notes: formData.internal_notes?.trim() || null,
    };

    updateMutation.mutate(
      {
        appointmentId: appointment.id,
        data: payload,
      },
      {
        onSuccess: () => {
          router.push(`/appointments/${appointment.id}`);
        },
        onError: (err) => {
          if (err.isForbidden) {
            setGlobalError(
              "Access Denied: You do not have permission to modify this appointment record."
            );
          } else if (err.isConflict) {
            setGlobalError(
              err.message ||
                "Time Slot Conflict: The selected patient or doctor already has an appointment during this time window."
            );
          } else if (err.isValidationError && err.validationErrors) {
            Object.entries(err.validationErrors).forEach(([field, message]) => {
              setError(field as keyof AppointmentEditFormData, {
                type: "server",
                message,
              });
            });
            setGlobalError(
              "Validation failed. Please review the highlighted fields."
            );
          } else {
            setGlobalError(
              err.message ||
                "Failed to update appointment. Please verify slot availability."
            );
          }
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Shell Header Configuration */}
      <PageHeaderConfig
        title={`Edit Appointment #${appointment.id}`}
        description={`Reschedule or update consultation details for ${formatClinicDate(
          appointment.start_time
        )}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Appointments", href: "/appointments" },
          { label: `#${appointment.id}`, href: `/appointments/${appointment.id}` },
          { label: "Edit" },
        ]}
        headerActions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/appointments/${appointment.id}`}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Cancel & Return
            </Link>
          </Button>
        }
      />

      {/* Terminal Status Locked Banner */}
      {isTerminal && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-3 p-4 text-amber-800 dark:text-amber-300">
            <Lock className="h-5 w-5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">Consultation Record Locked</p>
              <p className="text-xs">
                This appointment has reached its terminal lifecycle status (
                <span className="font-semibold">{appointment.status}</span>) and
                cannot be rescheduled or edited. Completed and cancelled records are
                preserved for clinical audit integrity.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Global Error Alert */}
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
        {/* Patient Reference Card (Immutable) */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-primary" />
              Patient Identity (Locked)
            </CardTitle>
            <CardDescription>
              Patient assignment is permanent and cannot be modified after initial booking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-3.5 rounded-lg border border-border bg-muted/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-sm font-semibold text-foreground font-mono">
                    Patient #{appointment.patient_id}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Original consultation recipient
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs font-normal gap-1.5 self-start sm:self-center">
                <Lock className="h-3 w-3 text-muted-foreground" />
                Immutable Identity
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Medical Provider Selection */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              Assigned Medical Provider <span className="text-destructive">*</span>
            </CardTitle>
            <CardDescription>
              Reassign to another active provider or keep current doctor
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider_id">
                Medical Provider <span className="text-destructive">*</span>
              </Label>
              <select
                id="provider_id"
                disabled={isPending || isTerminal || isLoadingProviders}
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
                    {formatDoctorName(provider.name)} ({provider.post} •{" "}
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
                    {formatDoctorName(selectedProvider.name)}
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

        {/* Schedule & Timing (Rescheduling) */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Reschedule Consultation Window <span className="text-destructive">*</span>
            </CardTitle>
            <CardDescription>
              Adjust consultation slot in Clinic Standard Time ({CLINIC_TIMEZONE})
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
                  disabled={isPending || isTerminal}
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
                  disabled={isPending || isTerminal}
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

            {/* Dynamic Duration Preview */}
            {dynamicDuration && dynamicDuration !== "—" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-md border border-muted">
                <Hourglass className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>
                  Calculated consultation duration:{" "}
                  <strong className="text-foreground">{dynamicDuration}</strong>
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clinical Reason & Internal Notes */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Clinical Consultation Details
            </CardTitle>
            <CardDescription>
              Update visit purpose and staff confidential notes
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
                rows={3}
                disabled={isPending || isTerminal}
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
                placeholder="Optional private observations or follow-up notes..."
                rows={2}
                disabled={isPending || isTerminal}
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
            <Link href={`/appointments/${appointment.id}`}>Cancel</Link>
          </Button>
          <Button
            type="submit"
            disabled={isPending || isTerminal || !isDirty}
            className="w-full sm:w-auto"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving Changes...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function AppointmentEditWrapper({ params }: AppointmentEditPageProps) {
  const resolvedParams = React.use(params);
  const rawId = resolvedParams?.id ?? "";

  // Strict integer check
  const isStrictInteger = /^[1-9]\d*$/.test(rawId);
  const appointmentId = isStrictInteger ? Number(rawId) : NaN;

  return (
    <AppointmentEditContent appointmentId={appointmentId} rawId={rawId} />
  );
}

export default function AppointmentEditPage({ params }: AppointmentEditPageProps) {
  return (
    <React.Suspense fallback={<AppointmentEditSkeleton />}>
      <AppointmentEditWrapper params={params} />
    </React.Suspense>
  );
}
