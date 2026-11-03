"use client";

import * as React from "react";
import Link from "next/link";
import {
  Users,
  Calendar,
  Stethoscope,
  UserCog,
  Plus,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Activity,
  CalendarDays,
} from "lucide-react";
import { PageHeaderConfig } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePatients } from "@/features/patients/hooks/use-patients";
import { useAppointments } from "@/features/appointments/hooks/use-appointments";
import { useProviders } from "@/features/providers/hooks/use-providers";
import { useUsers } from "@/features/users/hooks/use-users";
import { formatDoctorName } from "@/lib/utils";
import {
  CLINIC_TIMEZONE,
  formatClinicDate,
  formatClinicTimeRange,
} from "@/lib/datetime";
import type { SessionUser } from "@/types/auth";
import type { AppointmentStatus } from "@/types/appointment";

// Supported roles according to backend RBAC schema
type Role = "ADMIN" | "RECEPTIONIST" | "DOCTOR";

interface MetricCardProps {
  title: string;
  count: number | string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  href: string;
  isLoading?: boolean;
}

function MetricCard({
  title,
  count,
  icon: Icon,
  description,
  href,
  isLoading,
}: MetricCardProps) {
  return (
    <Card className="hover:border-slate-300 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center text-slate-700">
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-20 bg-muted animate-pulse rounded" />
        ) : (
          <div className="text-2xl font-bold text-slate-900">{count}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
          <span className="truncate mr-2">{description}</span>
          <Link
            href={href}
            className="text-primary hover:underline inline-flex items-center gap-0.5 text-xs font-medium shrink-0"
          >
            View all
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

const emptySubscribe = () => () => {};

/**
 * Hook to safely read user session metadata from the client-side caredesk_user cookie.
 * React 19 compliant: returns a primitive string snapshot from useSyncExternalStore
 * to maintain snapshot reference stability, then parses and memoizes the SessionUser.
 */
function useCurrentSessionUser(): SessionUser | null | undefined {
  const rawCookie = React.useSyncExternalStore(
    emptySubscribe,
    () => {
      if (typeof document === "undefined") return undefined;
      const match = document.cookie.match(/(?:^|;\s*)caredesk_user=([^;]+)/);
      return match && match[1] ? match[1] : null;
    },
    () => undefined
  );

  return React.useMemo(() => {
    if (rawCookie === undefined) return undefined;
    if (rawCookie === null) return null;
    try {
      const parsed = JSON.parse(decodeURIComponent(rawCookie));
      if (
        parsed &&
        typeof parsed.id === "number" &&
        typeof parsed.role === "string"
      ) {
        return parsed as SessionUser;
      }
      return null;
    } catch {
      return null;
    }
  }, [rawCookie]);
}

function useClientFormattedDate(): string {
  return React.useSyncExternalStore(
    emptySubscribe,
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: CLINIC_TIMEZONE,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    () => ""
  );
}

function getClinicDateString(isoString: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: CLINIC_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(isoString));
  } catch {
    return "";
  }
}

function useTodayClinicDateString(): string {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => {
      try {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: CLINIC_TIMEZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
      } catch {
        return "";
      }
    },
    () => ""
  );
}

function renderStatusBadge(status: AppointmentStatus) {
  switch (status) {
    case "scheduled":
      return (
        <Badge variant="info" className="gap-1 capitalize">
          <Clock className="h-3 w-3" />
          Scheduled
        </Badge>
      );
    case "confirmed":
      return (
        <Badge variant="success" className="gap-1 capitalize">
          <CheckCircle2 className="h-3 w-3" />
          Confirmed
        </Badge>
      );
    case "checked_in":
      return (
        <Badge variant="warning" className="gap-1 capitalize">
          <Clock className="h-3 w-3" />
          Checked In
        </Badge>
      );
    case "in_progress":
      return (
        <Badge variant="secondary" className="gap-1 capitalize font-medium">
          In Consultation
        </Badge>
      );
    case "completed":
      return (
        <Badge variant="outline" className="gap-1 capitalize text-muted-foreground">
          Completed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="destructive" className="gap-1 capitalize">
          Cancelled
        </Badge>
      );
    case "no_show":
      return (
        <Badge variant="destructive" className="gap-1 capitalize">
          No Show
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function DashboardPage() {
  const sessionUser = useCurrentSessionUser();
  const realRole = (sessionUser?.role as Role) || "ADMIN";
  const [previewRole, setPreviewRole] = React.useState<Role | null>(null);

  // Effective role for rendering: if admin selected a preview, use it; otherwise use real authenticated role
  const activeRole: Role =
    sessionUser?.role === "ADMIN" && previewRole ? previewRole : realRole;

  const todayFormatted = useClientFormattedDate();
  const todayDateStr = useTodayClinicDateString();

  // 1. Fetch live active patients (up to 100 for operational overview)
  const {
    data: patients,
    isLoading: patientsLoading,
    refetch: refetchPatients,
  } = usePatients({ page: 1, limit: 100, is_active: true });

  // 2. Fetch live appointments (up to 100)
  const {
    data: appointments,
    isLoading: appointmentsLoading,
    isRefetching: appointmentsRefetching,
    refetch: refetchAppointments,
  } = useAppointments({ skip: 0, limit: 100 });

  // 3. Fetch live providers (up to 100)
  const {
    data: providers,
    isLoading: providersLoading,
  } = useProviders({ skip: 0, limit: 100 });

  // 4. Fetch live staff users (STRICTLY enabled for ADMIN session only to prevent 403 Forbidden)
  const {
    data: users,
    isLoading: usersLoading,
  } = useUsers(
    { skip: 0, limit: 100 },
    { enabled: sessionUser?.role === "ADMIN" }
  );

  const sessionProviderId = sessionUser?.provider_id;

  // Operational Appointment Filtering
  // If activeRole is DOCTOR and sessionUser is linked to a provider, doctor sees their assigned appointments
  const roleAppointments = React.useMemo(() => {
    if (!appointments) return [];
    if (activeRole === "DOCTOR" && sessionProviderId) {
      return appointments.filter(
        (a) => a.provider?.id === sessionProviderId
      );
    }
    return appointments;
  }, [appointments, activeRole, sessionProviderId]);

  // Today's appointments (Asia/Kolkata timezone match)
  const todayAppointments = React.useMemo(() => {
    return roleAppointments
      .filter((a) => getClinicDateString(a.start_time) === todayDateStr)
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
  }, [roleAppointments, todayDateStr]);

  // Upcoming appointments (dates after today)
  const upcomingAppointments = React.useMemo(() => {
    return roleAppointments
      .filter((a) => {
        const apptDate = getClinicDateString(a.start_time);
        return apptDate > todayDateStr;
      })
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
  }, [roleAppointments, todayDateStr]);

  // Active table view tab: "today" vs "upcoming"
  const [scheduleTab, setScheduleTab] = React.useState<"today" | "upcoming">(
    "today"
  );

  // Metric calculations
  const totalPatientsDisplay = React.useMemo(() => {
    if (patientsLoading) return "—";
    if (!patients) return 0;
    return patients.length >= 100 ? "100+" : patients.length;
  }, [patients, patientsLoading]);

  const activeProvidersCount = React.useMemo(() => {
    if (providersLoading || !providers) return 0;
    return providers.filter((p) => p.is_active).length;
  }, [providers, providersLoading]);

  const checkedInCount = React.useMemo(() => {
    return todayAppointments.filter((a) => a.status === "checked_in").length;
  }, [todayAppointments]);

  const inConsultationCount = React.useMemo(() => {
    return todayAppointments.filter((a) => a.status === "in_progress").length;
  }, [todayAppointments]);

  // Live status distribution breakdown across all active clinic appointments
  const statusCounts = React.useMemo(() => {
    const counts: Record<AppointmentStatus, number> = {
      scheduled: 0,
      confirmed: 0,
      checked_in: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
    };
    (appointments ?? []).forEach((appt) => {
      if (counts[appt.status] !== undefined) {
        counts[appt.status] += 1;
      }
    });
    return counts;
  }, [appointments]);

  const displayedAppointments =
    scheduleTab === "today" ? todayAppointments : upcomingAppointments.slice(0, 10);

  const handleRefresh = () => {
    refetchPatients();
    refetchAppointments();
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Shell Header Configuration */}
      <PageHeaderConfig
        title="Dashboard"
        description={
          todayFormatted
            ? `Today's clinic operations · ${todayFormatted}`
            : "Today's clinic operations"
        }
        headerActions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={appointmentsRefetching}
              className="gap-1.5 h-8 text-xs cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  appointmentsRefetching ? "animate-spin" : ""
                }`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            {/* Admin-only view preview switcher */}
            {sessionUser?.role === "ADMIN" && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-border">
                <span className="text-xs text-muted-foreground font-medium hidden sm:inline">
                  Preview:
                </span>
                <div className="flex rounded-md border border-border p-0.5 bg-secondary/50 text-xs">
                  {(["ADMIN", "RECEPTIONIST", "DOCTOR"] as const).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setPreviewRole(role === realRole ? null : role)}
                      className={`px-2 py-0.5 rounded-xs font-medium transition-colors cursor-pointer text-xs ${
                        activeRole === role
                          ? "bg-card text-slate-900 shadow-xs"
                          : "text-muted-foreground hover:text-slate-900"
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        }
      />

      {/* Welcome Heading Area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Welcome to CareDesk
          </h2>
          <p className="text-sm text-muted-foreground">
            Role: <span className="font-semibold text-slate-700">{activeRole}</span>{" "}
            {sessionUser?.phone ? `(${sessionUser.phone})` : ""} · Active clinical operations.
          </p>
        </div>

        {/* Permission-Driven Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {(activeRole === "ADMIN" || activeRole === "RECEPTIONIST") && (
            <>
              <Button asChild size="sm">
                <Link href="/patients/new">
                  <Plus className="h-4 w-4 mr-1" />
                  New Patient
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/appointments/new">
                  <Calendar className="h-4 w-4 mr-1" />
                  Schedule Appointment
                </Link>
              </Button>
            </>
          )}

          {activeRole === "ADMIN" && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/providers/new">
                  <Stethoscope className="h-4 w-4 mr-1" />
                  Add Provider
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/users/new">
                  <UserCog className="h-4 w-4 mr-1" />
                  Create Staff User
                </Link>
              </Button>
            </>
          )}

          {activeRole === "DOCTOR" && (
            <>
              <Button asChild size="sm">
                <Link href="/patients">
                  <Users className="h-4 w-4 mr-1" />
                  Find Patient Record
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/appointments">
                  <Calendar className="h-4 w-4 mr-1" />
                  My Schedule
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Metric Cards Grid (API Connected) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Patients"
          count={totalPatientsDisplay}
          icon={Users}
          description="Active clinical records"
          href="/patients"
          isLoading={patientsLoading}
        />
        <MetricCard
          title="Today's Appointments"
          count={todayAppointments.length}
          icon={Calendar}
          description={`${upcomingAppointments.length} upcoming scheduled`}
          href="/appointments"
          isLoading={appointmentsLoading}
        />
        {activeRole === "ADMIN" ? (
          <>
            <MetricCard
              title="Active Providers"
              count={activeProvidersCount}
              icon={Stethoscope}
              description="Doctors & consultants"
              href="/providers"
              isLoading={providersLoading}
            />
            <MetricCard
              title="Staff Accounts"
              count={users?.length ?? 0}
              icon={UserCog}
              description="System users & roles"
              href="/users"
              isLoading={usersLoading}
            />
          </>
        ) : (
          <>
            <MetricCard
              title="Checked In"
              count={checkedInCount}
              icon={CheckCircle2}
              description="Waiting in clinic lobby"
              href="/appointments"
              isLoading={appointmentsLoading}
            />
            <MetricCard
              title="In Consultation"
              count={inConsultationCount}
              icon={Clock}
              description="Active provider sessions"
              href="/appointments"
              isLoading={appointmentsLoading}
            />
          </>
        )}
      </div>

      {/* Main Operational Section: Appointments Schedule & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Appointments List (2 Columns) */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base font-semibold">
                Clinical Schedule
              </CardTitle>
              <CardDescription>
                {activeRole === "DOCTOR"
                  ? "Assigned patient consultations for your clinical shift."
                  : "Operational appointments scheduled in the CareDesk system."}
              </CardDescription>
            </div>

            {/* Segmented Schedule Filter Tabs */}
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200/80 bg-slate-100/60 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setScheduleTab("today")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md transition-all cursor-pointer ${
                    scheduleTab === "today"
                      ? "bg-white text-slate-900 shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-slate-900"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  Today ({todayAppointments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleTab("upcoming")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md transition-all cursor-pointer ${
                    scheduleTab === "upcoming"
                      ? "bg-white text-slate-900 shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-slate-900"
                  }`}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Upcoming ({upcomingAppointments.length})
                </button>
              </div>

              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/appointments">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px]">Time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Reason / Complaint</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Loading State */}
                {appointmentsLoading && (
                  <>
                    {[1, 2, 3, 4].map((i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="h-5 w-16 bg-muted animate-pulse rounded ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}

                {/* Populated List */}
                {!appointmentsLoading && displayedAppointments.length > 0 && (
                  displayedAppointments.map((appt) => (
                    <TableRow key={appt.id} className="hover:bg-slate-50/60 transition-colors">
                      <TableCell className="font-medium text-xs">
                        <div>{formatClinicTimeRange(appt.start_time, appt.end_time, false)}</div>
                        {scheduleTab === "upcoming" && (
                          <div className="text-[11px] text-muted-foreground font-normal">
                            {formatClinicDate(appt.start_time)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={
                            appt.patient?.patient_number
                              ? `/patients/${encodeURIComponent(appt.patient.patient_number)}`
                              : "/patients"
                          }
                          className="font-medium text-slate-900 hover:text-primary hover:underline text-sm block"
                        >
                          {appt.patient?.name ?? "Unknown Patient"}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {appt.patient?.patient_number ?? `#${appt.patient_id}`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={
                            appt.provider?.doc_number
                              ? `/providers/${encodeURIComponent(appt.provider.doc_number)}`
                              : "/providers"
                          }
                          className="font-medium text-slate-800 hover:text-primary hover:underline text-sm block"
                        >
                          {formatDoctorName(appt.provider?.name ?? "Provider")}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {appt.provider?.specialization ?? "General"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-700 line-clamp-1">
                          {appt.reason_for_visit}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {renderStatusBadge(appt.status)}
                      </TableCell>
                    </TableRow>
                  ))
                )}

                {/* Empty State */}
                {!appointmentsLoading && displayedAppointments.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-40 text-center text-muted-foreground text-sm"
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Calendar className="h-8 w-8 text-muted-foreground/50" />
                        <div className="font-medium text-slate-800">
                          {scheduleTab === "today"
                            ? "No appointments scheduled for today"
                            : "No upcoming appointments found"}
                        </div>
                        <p className="text-xs text-muted-foreground max-w-sm">
                          {scheduleTab === "today" && upcomingAppointments.length > 0
                            ? `There are ${upcomingAppointments.length} upcoming appointments booked in CareDesk.`
                            : "Book a new clinical session to see it scheduled here."}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {scheduleTab === "today" && upcomingAppointments.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setScheduleTab("upcoming")}
                              className="text-xs cursor-pointer"
                            >
                              View Upcoming ({upcomingAppointments.length})
                            </Button>
                          )}
                          {(activeRole === "ADMIN" || activeRole === "RECEPTIONIST") && (
                            <Button asChild size="sm" className="text-xs">
                              <Link href="/appointments/new">
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Book Appointment
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Operational Side Column (1 Column) */}
        <div className="space-y-6">
          {/* Live Status Breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">
                  Appointment Breakdown
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </div>
              <CardDescription>
                Live status across all scheduled sessions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Badge variant="info">scheduled</Badge>
                </span>
                <span className="font-semibold text-slate-800">
                  {statusCounts.scheduled}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Badge variant="success">confirmed</Badge>
                </span>
                <span className="font-semibold text-slate-800">
                  {statusCounts.confirmed}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Badge variant="warning">checked_in</Badge>
                </span>
                <span className="font-semibold text-slate-800">
                  {statusCounts.checked_in}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Badge variant="secondary">in_progress</Badge>
                </span>
                <span className="font-semibold text-slate-800">
                  {statusCounts.in_progress}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Badge variant="outline">completed</Badge>
                </span>
                <span className="font-semibold text-slate-800">
                  {statusCounts.completed}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Badge variant="destructive">cancelled</Badge>
                </span>
                <span className="font-semibold text-slate-800">
                  {statusCounts.cancelled}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Clinical Operational Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Clinical Workflow Guard
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p>
                  All patient registrations and bookings enforce authoritative
                  RBAC permissions from the FastAPI backend.
                </p>
              </div>
              <div className="pt-2 border-t border-border flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Timezone Standard</span>
                <span className="font-medium text-slate-700">{CLINIC_TIMEZONE} (IST)</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
