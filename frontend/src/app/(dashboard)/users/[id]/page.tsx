"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  ShieldAlert,
  User as UserIcon,
  Phone,
  Mail,
  Calendar,
  Clock,
  Stethoscope,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Hash,
  Pencil,
  RotateCcw,
  Trash2,
  Shield,
  Loader2,
  Sliders,
} from "lucide-react";
import {
  useUser,
  useAdminUpdateUser,
  useDeactivateUser,
  useReactivateUser,
} from "@/features/users/hooks/use-users";
import { useProviders } from "@/features/providers/hooks/use-providers";
import type { UserRole, SessionUser, UserAdminUpdateRequest } from "@/types/auth";
import { formatClinicDateTime } from "@/lib/datetime";
import { isApiClientError } from "@/lib/api/errors";
import { PageHeaderConfig } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";

interface UserDetailPageProps {
  params: Promise<{ id: string }>;
}

const emptySubscribe = () => () => {};

/**
 * Hook to safely read user session metadata from the client-side caredesk_user cookie.
 * React 19 compliant: returns a primitive string snapshot from useSyncExternalStore
 * to maintain snapshot reference stability, then parses and memoizes the SessionUser.
 * Returns undefined during SSR, null if cookie missing/invalid, or SessionUser object.
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

/**
 * Maps staff user role to design-system badge styling.
 */
function getRoleBadge(role: UserRole) {
  switch (role) {
    case "ADMIN":
      return (
        <Badge
          variant="default"
          className="bg-purple-600 hover:bg-purple-700 text-white font-medium"
        >
          Administrator
        </Badge>
      );
    case "DOCTOR":
      return (
        <Badge variant="info" className="font-medium">
          Doctor
        </Badge>
      );
    case "RECEPTIONIST":
      return (
        <Badge variant="secondary" className="font-medium">
          Receptionist
        </Badge>
      );
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}

/**
 * Maps account active status to design-system badge styling.
 */
function getStatusBadge(isActive: boolean) {
  if (isActive) {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" />
      Inactive
    </Badge>
  );
}

/**
 * Helper to describe staff roles clearly in the user interface.
 */
function getRoleDescription(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "Full administrative access. Can manage staff accounts, clinical providers, patients, and appointments.";
    case "DOCTOR":
      return "Clinical provider access. Views patient records and assigned consultations.";
    case "RECEPTIONIST":
      return "Front desk operational access. Manages patient registration and appointment scheduling.";
    default:
      return "Standard clinic staff privileges.";
  }
}

/**
 * Loading skeleton component for user details.
 */
function UserDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border border-border">
        <CardHeader className="space-y-2 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
              <div className="space-y-2">
                <div className="h-7 w-48 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
                <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              </div>
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
              <div className="h-28 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="h-5 w-36 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-28 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function UserDetailContent({
  userId,
  rawId,
}: {
  userId: number;
  rawId: string;
}) {
  const sessionUser = useCurrentSessionUser();
  const isAdmin = sessionUser?.role === "ADMIN";
  const isReceptionist = sessionUser?.role === "RECEPTIONIST";
  const isSelf = sessionUser ? sessionUser.id === userId : false;

  const isValidId = Number.isSafeInteger(userId) && userId > 0;

  // Client-side fail-closed check: if session is loaded and caller is neither ADMIN nor self, access is forbidden
  const isClientForbidden = sessionUser !== undefined && !isAdmin && !isSelf;

  // Allow query if ID is valid and not definitively forbidden on the client
  const isQueryEnabled = isValidId && !isClientForbidden;

  const {
    data: user,
    isLoading,
    isError,
    error,
    refetch,
  } = useUser(userId, {
    enabled: isQueryEnabled,
  });

  // Providers list for Doctor linkage
  const { data: providers, isLoading: isLoadingProviders } = useProviders(
    { skip: 0, limit: 100 }
  );

  const activeProviders = React.useMemo(() => {
    return providers?.filter((p) => p.is_active || p.id === user?.provider_id) ?? [];
  }, [providers, user?.provider_id]);

  // Lifecycle & Admin Mutations
  const adminUpdateMutation = useAdminUpdateUser();
  const deactivateMutation = useDeactivateUser();
  const reactivateMutation = useReactivateUser();

  // Dialog States
  const [isPrivilegesOpen, setIsPrivilegesOpen] = React.useState(false);
  const [isDeactivateOpen, setIsDeactivateOpen] = React.useState(false);
  const [isReactivateOpen, setIsReactivateOpen] = React.useState(false);

  // Form states for Admin Privileges Modal
  const [editRole, setEditRole] = React.useState<UserRole>("RECEPTIONIST");
  const [editProviderId, setEditProviderId] = React.useState<string>("");
  const [privilegeError, setPrivilegeError] = React.useState<string | null>(null);

  // Feedback Notifications
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Synchronize edit dialog state with current user data when opened
  const handleOpenPrivileges = () => {
    if (user) {
      setEditRole(user.role);
      setEditProviderId(user.provider_id ? String(user.provider_id) : "");
      setPrivilegeError(null);
    }
    setIsPrivilegesOpen(true);
  };

  const isForbidden =
    isClientForbidden || (isApiClientError(error) && error.isForbidden);
  const is404 = isApiClientError(error) && error.isNotFound;

  // 1. Render invalid route parameter state
  if (!isValidId) {
    const returnHref = isAdmin ? "/users" : "/dashboard";
    const returnLabel = isAdmin ? "Return to Staff Directory" : "Return to Dashboard";

    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title="Invalid Staff Reference"
          description="The requested staff reference is not recognized."
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            ...(isAdmin ? [{ label: "Staff Directory", href: "/users" }] : []),
            { label: rawId ? `Invalid (${rawId})` : "Invalid" },
          ]}
        />
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-muted-foreground/60" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold">
                Invalid Staff Reference
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                The staff ID must be a strictly positive integer without extra
                characters. Malformed reference &quot;{rawId}&quot; is not recognized.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={returnHref}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                {returnLabel}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. Render 403 Forbidden / Access Restricted state
  if (isForbidden) {
    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title="Access Restricted"
          description="You do not have permission to view this staff account."
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Staff" },
            { label: "Access Restricted" },
          ]}
        />
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center border border-amber-200 dark:border-amber-800">
              <ShieldAlert className="h-6 w-6 text-amber-600 dark:text-amber-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Access Restricted</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                You are not authorized to view this staff profile. Non-administrator
                staff members can only view their own user account.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard">
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Return to Dashboard
                </Link>
              </Button>
              {sessionUser && typeof sessionUser.id === "number" && sessionUser.id !== userId && (
                <Button asChild size="sm">
                  <Link href={`/users/${sessionUser.id}`}>
                    <UserIcon className="h-4 w-4 mr-1.5" />
                    View My Profile
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. Render 404 Not Found state
  if (is404) {
    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title="Staff Account Not Found"
          description="The requested staff user record does not exist."
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            ...(isAdmin ? [{ label: "Staff Directory", href: "/users" }] : []),
            { label: `Not Found (#${userId})` },
          ]}
        />
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <UserIcon className="h-10 w-10 text-muted-foreground/60" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Staff Account Not Found</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                No user profile matches staff ID #{userId}. The account may have
                been permanently removed or never provisioned.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={isAdmin ? "/users" : "/dashboard"}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                {isAdmin ? "Return to Staff Directory" : "Return to Dashboard"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 4. Render unexpected error state
  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title="Staff Profile Error"
          description="Failed to load staff account data."
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            ...(isAdmin ? [{ label: "Staff Directory", href: "/users" }] : []),
            { label: `#${userId}` },
          ]}
        />
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-destructive">
                Error Loading Staff Account
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {error?.message ||
                  "An unexpected error occurred while communicating with the staff user service."}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={isAdmin ? "/users" : "/dashboard"}>
                  {isAdmin ? "Return to Directory" : "Return to Dashboard"}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 5. Render loading skeleton while fetching
  if (isLoading || !user) {
    return <UserDetailSkeleton />;
  }

  // 6. Loaded state permissions
  const backHref = isAdmin ? "/users" : "/dashboard";
  const backLabel = isAdmin ? "Back to Staff Directory" : "Back to Dashboard";
  const pageTitle = isSelf ? "My Profile" : `Staff Member #${user.id}`;
  const breadcrumbs = isAdmin
    ? [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Staff Directory", href: "/users" },
        { label: `#${user.id} (${user.phone})` },
      ]
    : [
        { label: "Dashboard", href: "/dashboard" },
        { label: "My Profile" },
      ];

  const canEdit = Boolean(isAdmin || (isSelf && user.is_active));
  const canManagePrivileges = isAdmin;
  const canDeactivate =
    (isAdmin || isReceptionist) && !isSelf && !(isReceptionist && user.role === "ADMIN");
  const canReactivate =
    (isAdmin || isReceptionist) && !(isReceptionist && user.role === "ADMIN");

  // Handlers for Privileged Actions
  const handleSavePrivileges = () => {
    setPrivilegeError(null);
    if (editRole === "DOCTOR" && (!editProviderId || editProviderId.trim() === "")) {
      setPrivilegeError("Doctor accounts must be linked to an active clinical provider profile.");
      return;
    }

    const payload: UserAdminUpdateRequest = {
      role: editRole,
      provider_id: editRole === "DOCTOR" ? parseInt(editProviderId, 10) : null,
    };

    adminUpdateMutation.mutate(
      { userId: user.id, data: payload },
      {
        onSuccess: () => {
          setIsPrivilegesOpen(false);
          setActionSuccess("Administrative privileges updated successfully.");
          setTimeout(() => setActionSuccess(null), 5000);
        },
        onError: (err) => {
          setPrivilegeError(
            err.message || "Failed to update staff role and provider assignment."
          );
        },
      }
    );
  };

  const handleConfirmDeactivate = () => {
    setActionError(null);
    deactivateMutation.mutate(user.id, {
      onSuccess: () => {
        setIsDeactivateOpen(false);
        setActionSuccess(`Staff account #${user.id} (${user.phone}) has been deactivated.`);
        setTimeout(() => setActionSuccess(null), 5000);
      },
      onError: (err) => {
        setActionError(
          err.message || "Failed to deactivate staff account. Please verify permissions."
        );
      },
    });
  };

  const handleConfirmReactivate = () => {
    setActionError(null);
    reactivateMutation.mutate(user.id, {
      onSuccess: () => {
        setIsReactivateOpen(false);
        setActionSuccess(`Staff account #${user.id} (${user.phone}) has been reactivated successfully.`);
        setTimeout(() => setActionSuccess(null), 5000);
      },
      onError: (err) => {
        setActionError(
          err.message || "Failed to reactivate staff account. Please verify permissions."
        );
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeaderConfig
        title={pageTitle}
        description="Staff user account, credentials, and access authorization profile."
        breadcrumbs={breadcrumbs}
        headerActions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild variant="outline" size="sm">
              <Link href={backHref}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                {backLabel}
              </Link>
            </Button>

            {/* Admin Privileges Modal Trigger */}
            {canManagePrivileges && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenPrivileges}
                className="gap-1.5 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/40"
              >
                <Shield className="h-4 w-4" />
                Privileges
              </Button>
            )}

            {/* Edit Profile */}
            {canEdit && (
              <Button asChild size="sm">
                <Link href={`/users/${user.id}/edit`}>
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Edit Profile
                </Link>
              </Button>
            )}

            {/* Deactivation Trigger */}
            {user.is_active && canDeactivate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeactivateOpen(true)}
                className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 dark:border-rose-900/40"
              >
                <Trash2 className="h-4 w-4" />
                Deactivate
              </Button>
            )}

            {/* Reactivation Trigger */}
            {!user.is_active && canReactivate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReactivateOpen(true)}
                className="gap-1.5 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                <RotateCcw className="h-4 w-4" />
                Reactivate
              </Button>
            )}
          </div>
        }
      />

      {/* Success Notification Banner */}
      {actionSuccess && (
        <Card
          className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200"
          role="status"
          aria-live="polite"
        >
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-sm font-medium">{actionSuccess}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActionSuccess(null)}
              className="text-xs h-7 text-emerald-700 hover:text-emerald-900"
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Global Error Banner */}
      {actionError && (
        <Card className="border-destructive/30 bg-destructive/5" role="alert">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm font-medium text-destructive">{actionError}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActionError(null)}
              className="text-xs h-7 text-destructive hover:text-destructive"
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Header Summary Banner */}
      <Card className="border border-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-lg border border-primary/20 shrink-0">
              <UserIcon className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold tracking-tight text-foreground font-mono">
                  {user.phone}
                </h2>
                {getRoleBadge(user.role)}
                {getStatusBadge(user.is_active)}
                {isSelf && (
                  <Badge
                    variant="outline"
                    className="border-primary/40 bg-primary/5 text-primary text-xs"
                  >
                    Current Session
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                CareDesk Staff Account Reference #{user.id}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Account & Profile Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border border-border">
            <CardHeader className="pb-4 border-b border-border">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Account & Authentication Details
              </CardTitle>
              <CardDescription>
                Primary credentials, contact information, and role authorization.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Phone */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Phone className="h-3.5 w-3.5" />
                    Primary Phone (Login ID)
                  </div>
                  <p className="text-base font-semibold text-foreground font-mono">
                    {user.phone}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Unique identity used for system authentication and account verification.
                  </p>
                </div>
              </div>

              <Separator />

              {/* Email */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Mail className="h-3.5 w-3.5" />
                    Email Address
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {user.email || (
                      <span className="text-muted-foreground italic">
                        No email address registered
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Optional secondary communication address for notifications.
                  </p>
                </div>
              </div>

              <Separator />

              {/* Role & Permissions */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Assigned Role & Authorization
                  </div>
                  <div>{getRoleBadge(user.role)}</div>
                  <p className="text-xs text-muted-foreground max-w-lg">
                    {getRoleDescription(user.role)}
                  </p>
                </div>
                {canManagePrivileges && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenPrivileges}
                    className="h-8 text-xs shrink-0 gap-1"
                  >
                    <Sliders className="h-3 w-3" />
                    Change Role
                  </Button>
                )}
              </div>

              <Separator />

              {/* Linked Provider */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Stethoscope className="h-3.5 w-3.5" />
                    Clinical Provider Link
                  </div>
                  {user.role === "DOCTOR" ? (
                    user.provider_id ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="font-mono text-xs">
                          Provider Record #{user.provider_id}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-medium">
                          Provider profile linked
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-500 font-medium">
                        No provider profile currently linked. Doctor accounts must be linked to an active provider.
                      </p>
                    )
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Not applicable. Clinical provider linkage is exclusively assigned to Doctor accounts.
                    </p>
                  )}
                </div>
                {canManagePrivileges && user.role === "DOCTOR" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenPrivileges}
                    className="h-8 text-xs shrink-0 gap-1"
                  >
                    <Stethoscope className="h-3 w-3" />
                    Change Provider
                  </Button>
                )}
              </div>

              <Separator />

              {/* Account Status */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Account Status
                  </div>
                  <div>{getStatusBadge(user.is_active)}</div>
                  <p className="text-xs text-muted-foreground">
                    {user.is_active
                      ? "Account is active. Staff member can log in and perform authorized operations."
                      : "Account is inactive. Staff member cannot log in and API requests are blocked."}
                  </p>
                </div>
                {user.is_active && canDeactivate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDeactivateOpen(true)}
                    className="h-8 text-xs shrink-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Deactivate
                  </Button>
                )}
                {!user.is_active && canReactivate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsReactivateOpen(true)}
                    className="h-8 text-xs shrink-0 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reactivate
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* System Audit & Metadata */}
        <div className="space-y-6">
          <Card className="border border-border">
            <CardHeader className="pb-4 border-b border-border">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Hash className="h-4 w-4 text-primary" />
                Record Audit Trail
              </CardTitle>
              <CardDescription>
                System identification and timestamp tracking.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4 text-sm">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Database User ID:</span>
                <span className="font-mono font-medium text-foreground">
                  #{user.id}
                </span>
              </div>

              <Separator />

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Account Created:</span>
                </div>
                <p className="text-xs font-medium text-foreground pl-5">
                  {formatClinicDateTime(user.created_at)}
                </p>
              </div>

              <Separator />

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Last Modified:</span>
                </div>
                <p className="text-xs font-medium text-foreground pl-5">
                  {user.updated_at
                    ? formatClinicDateTime(user.updated_at)
                    : "Never updated"}
                </p>
              </div>

              <Separator />

              <div className="flex justify-between items-center text-muted-foreground">
                <span>Access Level:</span>
                <span className="font-mono text-xs font-semibold text-foreground">
                  {user.role}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 1. Admin Privileges Dialog (Role & Provider Linkage) */}
      <Dialog open={isPrivilegesOpen} onOpenChange={setIsPrivilegesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              Manage Staff Role & Privileges
            </DialogTitle>
            <DialogDescription>
              Assign role and linked clinical provider for staff account #{user.id} ({user.phone}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {privilegeError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{privilegeError}</span>
              </div>
            )}

            {/* Role Select */}
            <div className="space-y-2">
              <Label htmlFor="privilege-role" className="text-sm font-medium">
                Authorized Role
              </Label>
              <select
                id="privilege-role"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as UserRole)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ADMIN">Administrator (Full clinic configuration & staff management)</option>
                <option value="DOCTOR">Doctor (Clinical consultations and patient files)</option>
                <option value="RECEPTIONIST">Receptionist (Front-desk and patient management)</option>
              </select>
            </div>

            {/* Provider Linkage for Doctor */}
            {editRole === "DOCTOR" ? (
              <div className="p-3 bg-primary/5 rounded-md border border-primary/20 space-y-2">
                <Label htmlFor="privilege-provider" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Stethoscope className="h-3.5 w-3.5 text-primary" />
                  Linked Clinical Provider Profile
                </Label>
                <select
                  id="privilege-provider"
                  value={editProviderId}
                  onChange={(e) => setEditProviderId(e.target.value)}
                  disabled={isLoadingProviders}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">
                    {isLoadingProviders
                      ? "Loading clinical providers..."
                      : activeProviders.length === 0
                      ? "No active clinical providers available"
                      : "Select an active clinical provider..."}
                  </option>
                  {activeProviders.map((provider) => (
                    <option key={provider.id} value={String(provider.id)}>
                      {provider.name} ({provider.doc_number}) — {provider.specialization} [{provider.post}]
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Each doctor user account must be linked to a unique clinical provider profile.
                </p>
              </div>
            ) : (
              user.provider_id !== null && (
                <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded border border-amber-200 dark:border-amber-800">
                  Switching from Doctor will automatically remove the provider linkage (Provider #{user.provider_id}).
                </div>
              )
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsPrivilegesOpen(false)}
              disabled={adminUpdateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSavePrivileges}
              disabled={adminUpdateMutation.isPending}
              className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
            >
              {adminUpdateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Privileges"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Deactivate Account Confirmation Dialog */}
      <Dialog open={isDeactivateOpen} onOpenChange={setIsDeactivateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Trash2 className="h-5 w-5 text-rose-600" />
              Deactivate Staff Account
            </DialogTitle>
            <DialogDescription>
              Confirm account deactivation for staff member #{user.id} ({user.phone}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-muted-foreground">
            <div className="p-3 bg-muted/60 rounded-md border border-border space-y-1">
              <p className="font-semibold text-foreground text-sm font-mono">{user.phone}</p>
              <p className="text-xs text-muted-foreground">Role: {user.role}</p>
            </div>

            <div className="space-y-1.5">
              <p className="font-medium text-foreground">What happens upon deactivation:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>The staff member is immediately prevented from logging in.</li>
                <li>Any active authentication sessions will be invalidated.</li>
                <li>Historical clinical records and audit logs remain strictly preserved.</li>
                <li>Authorized administrators can reactivate this profile at any time.</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDeactivateOpen(false)}
              disabled={deactivateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmDeactivate}
              disabled={deactivateMutation.isPending}
              className="gap-1.5"
            >
              {deactivateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deactivating...
                </>
              ) : (
                "Confirm Deactivation"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Reactivate Account Confirmation Dialog */}
      <Dialog open={isReactivateOpen} onOpenChange={setIsReactivateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <RotateCcw className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Reactivate Staff Account
            </DialogTitle>
            <DialogDescription>
              Confirm restoration of account access for staff member #{user.id} ({user.phone}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-muted-foreground">
            <div className="p-3 bg-muted/60 rounded-md border border-border space-y-1">
              <p className="font-semibold text-foreground text-sm font-mono">{user.phone}</p>
              <p className="text-xs text-muted-foreground">Role: {user.role}</p>
            </div>

            <div className="space-y-1.5">
              <p className="font-medium text-foreground">What happens upon reactivation:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>The staff member immediately regains login capability with their existing credentials.</li>
                <li>Their previous role and assigned provider linkage remain intact.</li>
                <li>The account status in the staff directory is restored to Active.</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsReactivateOpen(false)}
              disabled={reactivateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmReactivate}
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

function UserDetailWrapper({ params }: UserDetailPageProps) {
  const resolvedParams = React.use(params);
  const rawId = resolvedParams?.id ?? "";

  // Strict integer check: only digits 1-9 followed by digits allowed, no whitespace or extra characters
  const isStrictInteger = /^[1-9]\d*$/.test(rawId);
  const userId = isStrictInteger ? Number(rawId) : NaN;

  return (
    <UserDetailContent
      userId={userId}
      rawId={rawId}
    />
  );
}

export default function UserDetailPage({
  params,
}: UserDetailPageProps) {
  return (
    <React.Suspense fallback={<UserDetailSkeleton />}>
      <UserDetailWrapper params={params} />
    </React.Suspense>
  );
}
