"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  User as UserIcon,
  Stethoscope,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  Lock,
  ShieldCheck,
  XCircle,
  ExternalLink,
  ChevronRight,
  Hourglass,
  Pencil,
} from "lucide-react";
import {
  useAppointment,
  useUpdateAppointment,
} from "@/features/appointments/hooks/use-appointments";
import type { AppointmentStatus } from "@/types/appointment";
import {
  formatClinicDate,
  formatClinicDateTime,
  formatClinicTimeRange,
  formatAppointmentDuration,
  CLINIC_TIMEZONE,
} from "@/lib/datetime";
import { formatDoctorName } from "@/lib/utils";
import { isApiClientError } from "@/lib/api/errors";
import { PageHeaderConfig } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrescriptionEncounterCard } from "@/features/prescriptions/components/prescription-encounter-card";
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

interface AppointmentDetailPageProps {
  params: Promise<{ id: string }>;
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

/**
 * Loading skeleton component for appointment details.
 */
function AppointmentDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border border-border">
        <CardHeader className="space-y-2 pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-7 w-56 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              <div className="h-4 w-36 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
            </div>
            <div className="h-6 w-24 bg-slate-200 dark:bg-slate-700 animate-pulse rounded-full" />
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="h-5 w-44 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-24 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="h-5 w-36 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-32 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AppointmentDetailContent({
  appointmentId,
  rawId,
}: {
  appointmentId: number;
  rawId: string;
}) {
  const [isCancelDialogOpen, setIsCancelDialogOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const isValidId = Number.isSafeInteger(appointmentId) && appointmentId > 0;

  const {
    data: appointment,
    isLoading,
    isError,
    error,
    refetch,
  } = useAppointment(appointmentId, {
    enabled: isValidId,
  });

  const updateMutation = useUpdateAppointment();
  const isUpdating = updateMutation.isPending;

  const is404 = isApiClientError(error) && error.isNotFound;

  // Status transition handler
  const handleTransitionStatus = (newStatus: AppointmentStatus) => {
    if (!appointment) return;
    setActionError(null);

    updateMutation.mutate(
      {
        appointmentId: appointment.id,
        data: { status: newStatus },
      },
      {
        onSuccess: () => {
          setIsCancelDialogOpen(false);
        },
        onError: (err) => {
          setActionError(
            err.message ||
              `Failed to transition appointment to status "${newStatus}".`
          );
        },
      }
    );
  };

  // Render invalid ID state
  if (!isValidId) {
    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title="Invalid Appointment Reference"
          description="The requested appointment reference is not recognized."
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
                The appointment ID must be a strictly positive integer without
                extra characters. Malformed reference &quot;{rawId}&quot; is not
                recognized.
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

  // Render 404 state
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
                It may have been removed or the ID is incorrect.
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

  // Render generic loading or error state
  if (isLoading) {
    return <AppointmentDetailSkeleton />;
  }

  if (isError || !appointment) {
    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title="Error Loading Appointment"
          description="Unable to retrieve appointment record."
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
                {error?.message ||
                  "An unexpected network error occurred while communicating with the clinic server."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Try Again
              </Button>
              <Button asChild variant="ghost" size="sm" className="text-xs">
                <Link href="/appointments">
                  <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                  Back to Directory
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check valid status transition capabilities based on backend state machine
  const currentStatus = appointment.status;
  const isTerminal =
    currentStatus === "completed" ||
    currentStatus === "cancelled" ||
    currentStatus === "no_show";

  return (
    <div className="space-y-6">
      {/* Shell Header Configuration */}
      <PageHeaderConfig
        title={`Appointment #${appointment.id}`}
        description={`Clinical consultation scheduled for ${formatClinicDate(
          appointment.start_time
        )}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Appointments", href: "/appointments" },
          { label: `#${appointment.id}` },
        ]}
        headerActions={
          <div className="flex items-center gap-2">
            {!isTerminal && (
              <Button asChild size="sm">
                <Link href={`/appointments/${appointment.id}/edit`}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit & Reschedule
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/appointments">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Appointments
              </Link>
            </Button>
          </div>
        }
      />

      {/* Mutation / Action Error Banner */}
      {actionError && (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2.5 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{actionError}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActionError(null)}
              className="text-xs text-destructive hover:bg-destructive/10"
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Top Overview Card */}
      <Card className="border border-border">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <CardTitle className="text-xl font-bold tracking-tight text-foreground">
                  Consultation #{appointment.id}
                </CardTitle>
                {getStatusBadge(appointment.status)}
              </div>
              <CardDescription className="flex items-center gap-2 text-xs">
                <span>CareDesk Clinic Standard Time ({CLINIC_TIMEZONE})</span>
                <span>•</span>
                <span>Created {formatClinicDate(appointment.created_at)}</span>
              </CardDescription>
            </div>

            {/* Workflow Transition Action Buttons */}
            {!isTerminal && (
              <div className="flex items-center gap-2 flex-wrap">
                {currentStatus === "scheduled" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTransitionStatus("confirmed")}
                    disabled={isUpdating}
                    className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-xs"
                  >
                    {isUpdating ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                    )}
                    Confirm Appointment
                  </Button>
                )}

                {currentStatus === "confirmed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTransitionStatus("checked_in")}
                    disabled={isUpdating}
                    className="border-amber-300 text-amber-800 hover:bg-amber-50 text-xs"
                  >
                    {isUpdating ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
                    )}
                    Check In Patient
                  </Button>
                )}

                {currentStatus === "checked_in" && (
                  <Button
                    size="sm"
                    onClick={() => handleTransitionStatus("in_progress")}
                    disabled={isUpdating}
                    className="text-xs"
                  >
                    {isUpdating ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Stethoscope className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Start Consultation
                  </Button>
                )}

                {currentStatus === "in_progress" && (
                  <Button
                    size="sm"
                    onClick={() => handleTransitionStatus("completed")}
                    disabled={isUpdating}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
                  >
                    {isUpdating ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Complete Consultation
                  </Button>
                )}

                {/* Cancel Trigger Dialog */}
                <Dialog
                  open={isCancelDialogOpen}
                  onOpenChange={setIsCancelDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isUpdating}
                      className="text-destructive hover:bg-destructive/10 text-xs"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" />
                      Cancel Visit
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-5 w-5" />
                        Cancel Appointment #{appointment.id}?
                      </DialogTitle>
                      <DialogDescription className="space-y-2 pt-2 text-sm">
                        <p>
                          Are you sure you want to cancel this appointment for{" "}
                          <span className="font-semibold text-foreground">
                            {appointment.patient?.name ? `${appointment.patient.name} (${appointment.patient.patient_number})` : `Patient #${appointment.patient_id}`}
                          </span>{" "}
                          with{" "}
                          <span className="font-semibold text-foreground">
                            {formatDoctorName(appointment.provider.name)}
                          </span>
                          ?
                        </p>
                        <p className="text-xs text-muted-foreground bg-muted p-2.5 rounded-md">
                          Note: Marking this appointment as cancelled releases this time slot in the provider and patient schedules for new bookings. This transition cannot be undone.
                        </p>
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0 pt-2">
                      <DialogClose asChild>
                        <Button variant="outline" size="sm" disabled={isUpdating}>
                          Keep Appointment
                        </Button>
                      </DialogClose>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleTransitionStatus("cancelled")}
                        disabled={isUpdating}
                      >
                        {isUpdating && (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        )}
                        Confirm Cancellation
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Main Grid: Details (Left 2 cols) & Audit / Info (Right 1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Schedule & Timing Card */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Schedule & Time Slot
              </CardTitle>
              <CardDescription>
                Allocated clinical consultation window
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3.5 rounded-lg border border-border bg-card space-y-1">
                  <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Consultation Date
                  </span>
                  <p className="text-sm font-semibold text-foreground">
                    {formatClinicDate(appointment.start_time)}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-card space-y-1">
                  <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Time Slot (IST)
                  </span>
                  <p className="text-sm font-semibold text-foreground">
                    {formatClinicTimeRange(
                      appointment.start_time,
                      appointment.end_time
                    )}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-card space-y-1">
                  <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <Hourglass className="h-3.5 w-3.5" />
                    Duration
                  </span>
                  <p className="text-sm font-semibold text-foreground">
                    {formatAppointmentDuration(
                      appointment.start_time,
                      appointment.end_time
                    )}
                  </p>
                </div>
              </div>

              <div className="rounded-md bg-muted/40 p-3 border border-muted text-xs space-y-1">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Start Time:</span>
                  <span className="font-mono text-foreground">
                    {formatClinicDateTime(appointment.start_time)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>End Time:</span>
                  <span className="font-mono text-foreground">
                    {formatClinicDateTime(appointment.end_time)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Clinical Reason & Internal Notes Card */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Clinical Reason & Consultation Notes
              </CardTitle>
              <CardDescription>
                Visit purpose and staff-confidential observations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Reason for Visit */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Reason for Visit
                </span>
                <div className="p-3.5 rounded-lg bg-card border border-border text-sm leading-relaxed text-foreground">
                  {appointment.reason_for_visit}
                </div>
              </div>

              {/* Internal Staff Notes */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Lock className="h-3 w-3 text-amber-600" />
                    Internal Clinical Notes
                  </span>
                  <span className="text-[11px] text-muted-foreground italic">
                    Restricted to authenticated staff
                  </span>
                </div>
                <div className="p-3.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 text-sm leading-relaxed text-foreground">
                  {appointment.internal_notes ? (
                    <p className="whitespace-pre-wrap">
                      {appointment.internal_notes}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No internal notes recorded for this appointment.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Clinical Prescription (Rx) Encounter Record */}
          <PrescriptionEncounterCard appointment={appointment} />
        </div>

        {/* Sidebar: Patient & Provider Info (Right col) */}
        <div className="space-y-6">
          {/* Patient Card */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-primary" />
                Patient Record
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {appointment.patient ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-foreground">
                        {appointment.patient.name}
                      </h4>
                      <Badge variant="outline" className="font-mono text-xs">
                        {appointment.patient.patient_number}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      Database ID #{appointment.patient.id}
                    </p>
                  </div>

                  <Separator />

                  <Button asChild variant="outline" size="sm" className="w-full text-xs">
                    <Link
                      href={`/patients/${encodeURIComponent(
                        appointment.patient.patient_number
                      )}`}
                    >
                      <UserIcon className="h-3.5 w-3.5 mr-1.5" />
                      View Full Patient Profile
                      <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="p-3 rounded-lg border border-border bg-card space-y-1">
                    <span className="text-xs text-muted-foreground">Patient Identifier</span>
                    <p className="text-base font-bold text-foreground font-mono">
                      Patient #{appointment.patient_id}
                    </p>
                  </div>

                  <Button asChild variant="outline" size="sm" className="w-full text-xs">
                    <Link href="/patients">
                      <UserIcon className="h-3.5 w-3.5 mr-1.5" />
                      View in Patient Directory
                      <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                    </Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Provider Card */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-primary" />
                Assigned Medical Provider
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-foreground">
                    {formatDoctorName(appointment.provider.name)}
                  </h4>
                  <Badge variant="outline" className="font-mono text-xs">
                    {appointment.provider.doc_number}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {appointment.provider.post} • {appointment.provider.specialization}
                </p>
              </div>

              <Separator />

              <Button asChild variant="outline" size="sm" className="w-full text-xs">
                <Link
                  href={`/providers/${encodeURIComponent(
                    appointment.provider.doc_number
                  )}`}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  View Provider Profile
                  <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Audit Trail Card */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Record Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Appointment ID:</span>
                <span className="font-mono font-medium text-foreground">
                  #{appointment.id}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Booked On:</span>
                <span className="font-medium text-foreground">
                  {formatClinicDate(appointment.created_at)}
                </span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Last Updated:</span>
                <span className="font-medium text-foreground">
                  {formatClinicDate(appointment.updated_at)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Created by Staff:</span>
                <span className="font-mono text-foreground">
                  {appointment.created_by_id
                    ? `Staff #${appointment.created_by_id}`
                    : "System / Seed"}
                </span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Modified by Staff:</span>
                <span className="font-mono text-foreground">
                  {appointment.updated_by_id
                    ? `Staff #${appointment.updated_by_id}`
                    : "System / Seed"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AppointmentDetailWrapper({ params }: AppointmentDetailPageProps) {
  const resolvedParams = React.use(params);
  const rawId = resolvedParams?.id ?? "";

  // Strict integer check: only digits 1-9 followed by digits allowed, no whitespace or extra characters
  const isStrictInteger = /^[1-9]\d*$/.test(rawId);
  const appointmentId = isStrictInteger ? Number(rawId) : NaN;

  return (
    <AppointmentDetailContent
      appointmentId={appointmentId}
      rawId={rawId}
    />
  );
}

export default function AppointmentDetailPage({
  params,
}: AppointmentDetailPageProps) {
  return (
    <React.Suspense fallback={<AppointmentDetailSkeleton />}>
      <AppointmentDetailWrapper params={params} />
    </React.Suspense>
  );
}
