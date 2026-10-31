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

// Supported roles according to backend RBAC schema
type Role = "ADMIN" | "RECEPTIONIST" | "DOCTOR";

interface MetricCardProps {
  title: string;
  count: number | string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  href: string;
}

function MetricCard({
  title,
  count,
  icon: Icon,
  description,
  href,
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
        <div className="text-2xl font-bold text-slate-900">{count}</div>
        <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
          <span>{description}</span>
          <Link
            href={href}
            className="text-primary hover:underline inline-flex items-center gap-0.5 text-xs font-medium"
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

function useClientFormattedDate(): string {
  return React.useSyncExternalStore(
    emptySubscribe,
    () =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    () => ""
  );
}

export default function DashboardPage() {
  // Current active view role (defaults to ADMIN structure until connected to auth session)
  const [activeRole, setActiveRole] = React.useState<Role>("ADMIN");

  const todayFormatted = useClientFormattedDate();

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
            {/* Temporary role preview switcher for layout testing */}
            <span className="text-xs text-muted-foreground font-medium hidden sm:inline">
              Preview Mode:
            </span>
            <div className="flex rounded-md border border-border p-0.5 bg-secondary/50 text-xs">
              {(["ADMIN", "RECEPTIONIST", "DOCTOR"] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setActiveRole(role)}
                  className={`px-2.5 py-1 rounded-xs font-medium transition-colors cursor-pointer ${
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
        }
      />

      {/* Welcome Heading Area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Welcome to CareDesk
          </h2>
          <p className="text-sm text-muted-foreground">
            Role: <span className="font-semibold text-slate-700">{activeRole}</span> · Ready for clinical patient workflows.
          </p>
        </div>

        {/* Permission-Driven Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {(activeRole === "ADMIN" || activeRole === "RECEPTIONIST") && (
            <>
              <Button asChild size="sm">
                <Link href="/patients/new">
                  <Plus className="h-4 w-4" />
                  New Patient
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/appointments/new">
                  <Calendar className="h-4 w-4" />
                  Schedule Appointment
                </Link>
              </Button>
            </>
          )}

          {activeRole === "ADMIN" && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/providers/new">
                  <Stethoscope className="h-4 w-4" />
                  Add Provider
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/users/new">
                  <UserCog className="h-4 w-4" />
                  Create Staff User
                </Link>
              </Button>
            </>
          )}

          {activeRole === "DOCTOR" && (
            <Button asChild size="sm">
              <Link href="/patients">
                <Users className="h-4 w-4" />
                Find Patient Record
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Metric Cards Grid (API Contract Supported) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Patients"
          count="—"
          icon={Users}
          description="Registered clinical records"
          href="/patients"
        />
        <MetricCard
          title="Today's Appointments"
          count="—"
          icon={Calendar}
          description="Scheduled sessions"
          href="/appointments"
        />
        {activeRole === "ADMIN" ? (
          <>
            <MetricCard
              title="Active Providers"
              count="—"
              icon={Stethoscope}
              description="Doctors & consultants"
              href="/providers"
            />
            <MetricCard
              title="Staff Accounts"
              count="—"
              icon={UserCog}
              description="System users & roles"
              href="/users"
            />
          </>
        ) : (
          <>
            <MetricCard
              title="Checked In"
              count="—"
              icon={CheckCircle2}
              description="Waiting in clinic lobby"
              href="/appointments"
            />
            <MetricCard
              title="In Consultation"
              count="—"
              icon={Clock}
              description="Active provider sessions"
              href="/appointments"
            />
          </>
        )}
      </div>

      {/* Main Operational Section: Today's Appointments & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Appointments List (2 Columns) */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">
                Today&apos;s Appointments
              </CardTitle>
              <CardDescription>
                {activeRole === "DOCTOR"
                  ? "Assigned patient appointments for your shift."
                  : "Clinical appointments booked for today."}
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/appointments">View calendar</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Reason / Complaint</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Empty State placeholder until real API connection in Stage 6 */}
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-32 text-center text-muted-foreground text-sm"
                  >
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Calendar className="h-6 w-6 text-muted-foreground/60" />
                      <span>No appointments loaded yet.</span>
                      <span className="text-xs text-muted-foreground/80">
                        Connects to FastAPI endpoints in the next stage.
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent Activity / Status Breakdown (1 Column) */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Appointment Status Guide
              </CardTitle>
              <CardDescription>
                Available appointment states
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Scheduled</span>
                <Badge variant="info">scheduled</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Confirmed</span>
                <Badge variant="success">confirmed</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Checked In</span>
                <Badge variant="warning">checked_in</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Completed</span>
                <Badge variant="outline">completed</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Cancelled</span>
                <Badge variant="destructive">cancelled</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Clinical Workflow Guard
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p>
                  All patient registrations and bookings enforce authoritative
                  RBAC permissions from the FastAPI backend.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
