"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  Phone,
  Mail,
  User as UserIcon,
  AlertCircle,
  RefreshCw,
  Clock,
  Stethoscope,
  Award,
  Trash2,
  UserCheck,
  Loader2,
} from "lucide-react";
import {
  useProvider,
  useDeactivateProvider,
  useReactivateProvider,
} from "@/features/providers/hooks/use-providers";
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

interface ProviderDetailPageProps {
  params: Promise<{ doc_number: string }>;
}

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
 * Loading skeleton component for provider details.
 */
function ProviderDetailSkeleton() {
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
                  <div className="h-3.5 w-24 bg-slate-200 animate-pulse rounded" />
                  <div className="h-5 w-32 bg-slate-200 animate-pulse rounded" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardHeader className="pb-3">
            <div className="h-5 w-32 bg-slate-200 animate-pulse rounded" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-20 bg-slate-200 animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProviderDetailContent({ docNumber }: { docNumber: string }) {
  const userRole = useCurrentUserRole();
  const isAdmin = userRole === "ADMIN";

  const [isDeactivateOpen, setIsDeactivateOpen] = React.useState(false);
  const [isReactivateOpen, setIsReactivateOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const {
    data: provider,
    isLoading,
    isError,
    error,
    refetch,
  } = useProvider(docNumber, {
    enabled: Boolean(docNumber),
  });

  const deactivateMutation = useDeactivateProvider();
  const reactivateMutation = useReactivateProvider();

  const isMutating =
    deactivateMutation.isPending || reactivateMutation.isPending;

  const is404 = isApiClientError(error) && error.isNotFound;

  const handleDeactivate = () => {
    if (!isAdmin || !provider) return;
    setActionError(null);

    deactivateMutation.mutate(provider.doc_number, {
      onSuccess: () => {
        setIsDeactivateOpen(false);
        refetch();
      },
      onError: (err) => {
        if (err.isForbidden) {
          setActionError(
            "Access Denied: Only Administrators can deactivate medical provider files."
          );
        } else if (err.isNotFound) {
          setActionError(
            "Medical provider record not found in the database."
          );
        } else {
          setActionError(
            err.message || "Failed to deactivate medical provider record."
          );
        }
      },
    });
  };

  const handleReactivate = () => {
    if (!isAdmin || !provider) return;
    setActionError(null);

    reactivateMutation.mutate(provider.doc_number, {
      onSuccess: () => {
        setIsReactivateOpen(false);
        refetch();
      },
      onError: (err) => {
        if (err.isForbidden) {
          setActionError(
            "Access Denied: Only Administrators can reactivate medical provider files."
          );
        } else if (err.isNotFound) {
          setActionError(
            "Medical provider record not found in the database."
          );
        } else {
          setActionError(
            err.message || "Failed to reactivate medical provider record."
          );
        }
      },
    });
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeaderConfig
        title={provider ? provider.name : "Provider Profile"}
        description={
          provider
            ? `Viewing medical provider profile for ${provider.doc_number}`
            : "Medical provider credentials and clinical profile"
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Providers", href: "/providers" },
          {
            label: provider?.doc_number || docNumber || "Details",
            href: `/providers/${encodeURIComponent(docNumber)}`,
          },
        ]}
        headerActions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/providers">
                <ArrowLeft className="h-4 w-4" />
                Back to Directory
              </Link>
            </Button>

            {isAdmin && provider && (
              <>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link
                    href={`/providers/${encodeURIComponent(
                      provider.doc_number
                    )}/edit`}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit Provider
                  </Link>
                </Button>

                {/* Deactivate Dialog (Only for Active Providers) */}
                {provider.is_active && (
                  <Dialog
                    open={isDeactivateOpen}
                    onOpenChange={(open) => {
                      setIsDeactivateOpen(open);
                      if (open) setActionError(null);
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isMutating}
                        className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                      >
                        <Trash2 className="h-4 w-4" />
                        Deactivate
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Deactivate Medical Provider</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to deactivate{" "}
                          <span className="font-semibold text-slate-900">
                            Dr. {provider.name}
                          </span>{" "}
                          (
                          <span className="font-mono text-slate-800">
                            {provider.doc_number}
                          </span>
                          )?
                        </DialogDescription>
                      </DialogHeader>

                      <div className="text-xs text-muted-foreground bg-muted/50 p-3.5 rounded-md border border-border space-y-1.5">
                        <p className="font-medium text-slate-800">
                          Important consequences:
                        </p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>
                            The provider file will be archived and marked as{" "}
                            <strong>inactive</strong>.
                          </li>
                          <li>
                            Staff will no longer be able to schedule new clinic
                            consultations with this provider.
                          </li>
                          <li>
                            All past appointment records, patient charts, and
                            audit trails remain permanently preserved.
                          </li>
                          <li>
                            An Administrator can reactivate this provider at any
                            time.
                          </li>
                        </ul>
                      </div>

                      {actionError && (
                        <div
                          role="alert"
                          aria-live="assertive"
                          className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md"
                        >
                          {actionError}
                        </div>
                      )}

                      <DialogFooter className="gap-2 sm:gap-0">
                        <DialogClose asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={deactivateMutation.isPending}
                          >
                            Cancel
                          </Button>
                        </DialogClose>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deactivateMutation.isPending}
                          onClick={handleDeactivate}
                        >
                          {deactivateMutation.isPending ? (
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

                {/* Reactivate Dialog (Only for Inactive Providers) */}
                {!provider.is_active && (
                  <Dialog
                    open={isReactivateOpen}
                    onOpenChange={(open) => {
                      setIsReactivateOpen(open);
                      if (open) setActionError(null);
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isMutating}
                        className="gap-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
                      >
                        <UserCheck className="h-4 w-4" />
                        Reactivate
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reactivate Medical Provider</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to restore active status for{" "}
                          <span className="font-semibold text-slate-900">
                            Dr. {provider.name}
                          </span>{" "}
                          (
                          <span className="font-mono text-slate-800">
                            {provider.doc_number}
                          </span>
                          )?
                        </DialogDescription>
                      </DialogHeader>

                      <div className="text-xs text-muted-foreground bg-muted/50 p-3.5 rounded-md border border-border space-y-1.5">
                        <p className="font-medium text-slate-800">
                          What happens next:
                        </p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>
                            The provider file will be marked as{" "}
                            <strong>active</strong> in the clinic directory.
                          </li>
                          <li>
                            Staff will immediately be able to book clinic
                            appointments and assign patients to this provider.
                          </li>
                        </ul>
                      </div>

                      {actionError && (
                        <div
                          role="alert"
                          aria-live="assertive"
                          className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md"
                        >
                          {actionError}
                        </div>
                      )}

                      <DialogFooter className="gap-2 sm:gap-0">
                        <DialogClose asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={reactivateMutation.isPending}
                          >
                            Cancel
                          </Button>
                        </DialogClose>
                        <Button
                          size="sm"
                          disabled={reactivateMutation.isPending}
                          onClick={handleReactivate}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          {reactivateMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                              Reactivating...
                            </>
                          ) : (
                            "Confirm Reactivation"
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

      {/* Global Action Error Alert Banner */}
      {actionError && provider && (
        <Card
          role="alert"
          aria-live="assertive"
          className="border-destructive/30 bg-destructive/5"
        >
          <CardContent className="p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-destructive font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-xs text-destructive/80 hover:text-destructive underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </CardContent>
        </Card>
      )}

      {/* 1. Loading Skeleton */}
      {isLoading && <ProviderDetailSkeleton />}

      {/* 2. 404 / Not Found State */}
      {!isLoading && (is404 || (!provider && !isError)) && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <UserIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg text-slate-900">
                Provider Record Not Found
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                No medical provider file matches identifier{" "}
                <span className="font-mono font-medium text-slate-800">
                  {docNumber || "—"}
                </span>
                . The provider may have never been registered or the ID is incorrect.
              </p>
            </div>
            <div className="pt-2">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/providers">
                  <ArrowLeft className="h-4 w-4" />
                  Return to Providers Directory
                </Link>
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
                Failed to load provider profile
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {error instanceof Error
                  ? error.message
                  : "An unexpected error occurred while communicating with the provider service."}
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

      {/* 4. Populated Provider Record */}
      {!isLoading && provider && (
        <div className="space-y-6">
          {/* Inactive Notification Banner */}
          {!provider.is_active && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-amber-800 text-sm">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>
                  This medical provider record is currently <strong>inactive</strong>. Inactive providers cannot take new clinic consultations.
                </span>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isMutating}
                  onClick={() => {
                    setActionError(null);
                    setIsReactivateOpen(true);
                  }}
                  className="bg-white hover:bg-amber-100/50 border-amber-300 text-amber-900 shrink-0 text-xs h-8"
                >
                  <UserCheck className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                  Reactivate Record
                </Button>
              )}
            </div>
          )}

          {/* Header Card */}
          <Card className="border-border">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
                      {provider.name}
                    </CardTitle>
                    {provider.is_active ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                  <CardDescription className="flex items-center gap-2 text-sm">
                    <span className="font-mono font-medium text-slate-700">
                      Doctor ID: {provider.doc_number}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500">
                      Internal ID: #{provider.id}
                    </span>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Professional & Contact Information (2 Cols) */}
            <Card className="md:col-span-2 border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  Clinical & Professional Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Specialization */}
                  <div className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Specialization
                    </span>
                    <p className="text-base font-medium text-slate-900">
                      {provider.specialization}
                    </p>
                  </div>

                  {/* Medical Qualification Post */}
                  <div className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Award className="h-3 w-3" />
                      Qualification Post
                    </span>
                    <div className="pt-0.5">
                      <Badge variant="outline" className="font-semibold text-xs px-2.5 py-0.5">
                        {provider.post} ({provider.post === "MD" ? "Doctor of Medicine" : "Master of Surgery"})
                      </Badge>
                    </div>
                  </div>

                  {/* Primary Phone */}
                  <div className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      Primary Phone
                    </span>
                    <p className="text-sm font-mono font-medium text-slate-800">
                      {provider.phone}
                    </p>
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      Email Address
                    </span>
                    <p className="text-sm text-slate-700">
                      {provider.email || (
                        <span className="text-muted-foreground italic text-xs">
                          Not provided
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System & Audit Information (1 Col) */}
            <div className="space-y-6">
              <Card className="border-border bg-slate-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Record Audit Trail
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs text-muted-foreground">
                  <div className="flex justify-between items-center">
                    <span>Registered By Staff ID:</span>
                    <span className="font-mono font-medium text-slate-700">
                      {provider.created_by_id ? `#${provider.created_by_id}` : "System"}
                    </span>
                  </div>
                  {provider.updated_by_id && (
                    <div className="flex justify-between items-center">
                      <span>Last Modified By:</span>
                      <span className="font-mono font-medium text-slate-700">
                        #{provider.updated_by_id}
                      </span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span>Database ID:</span>
                    <span className="font-mono font-medium text-slate-700">
                      #{provider.id}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderDetailWrapper({ params }: ProviderDetailPageProps) {
  const resolvedParams = React.use(params);
  const docNumber = resolvedParams?.doc_number ?? "";

  return <ProviderDetailContent docNumber={docNumber} />;
}

export default function ProviderDetailPage({ params }: ProviderDetailPageProps) {
  return (
    <React.Suspense fallback={<ProviderDetailSkeleton />}>
      <ProviderDetailWrapper params={params} />
    </React.Suspense>
  );
}
