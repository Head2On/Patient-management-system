"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ShieldAlert,
  ShieldCheck,
  Info,
  RefreshCw,
  User as UserIcon,
} from "lucide-react";
import { useUser, useUpdateUser } from "@/features/users/hooks/use-users";
import type { UserResponse, UserRole, SessionUser, UserUpdateRequest } from "@/types/auth";
import { isApiClientError, type ApiClientError } from "@/lib/api/errors";
import { PageHeaderConfig } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface UserEditPageProps {
  params: Promise<{ id: string }>;
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

/**
 * Zod validation schema for ordinary staff profile editing.
 * Enforces backend bounds:
 * - phone: 10-15 digits, digits-only
 * - email: optional valid email or empty string
 * - password: optional 8-72 chars (bcrypt limit) or empty string
 * - confirmPassword: matches password if password provided
 */
const userEditSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .min(10, "Phone number must be at least 10 digits")
      .max(15, "Phone number cannot exceed 15 digits")
      .regex(/^\d+$/, "Phone number must contain only digits"),
    email: z
      .string()
      .trim()
      .email("Please enter a valid email address")
      .or(z.literal(""))
      .optional(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password cannot exceed 72 characters (bcrypt limit)")
      .or(z.literal(""))
      .optional(),
    confirmPassword: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.confirmPassword && !data.password) {
        return false;
      }
      return true;
    },
    {
      message: "Please enter a new password first",
      path: ["password"],
    }
  )
  .refine(
    (data) => {
      if (data.password && data.password.length > 0) {
        return data.password === data.confirmPassword;
      }
      return true;
    },
    {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    }
  );

type UserEditFormData = z.infer<typeof userEditSchema>;

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
 * Loading skeleton component for the user edit view.
 */
function UserEditSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border border-border">
        <CardHeader className="space-y-2 pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-7 w-48 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
            </div>
            <div className="h-9 w-28 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
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
              <div className="h-10 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
              <div className="h-10 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
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

function UserEditForm({
  user,
  userId,
  isAdmin,
  isSelf,
}: {
  user: UserResponse;
  userId: number;
  isAdmin: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const updateMutation = useUpdateUser();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  // Deactivated user check: non-admins cannot update deactivated profiles
  const isDeactivatedNonAdmin = !user.is_active && !isAdmin;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isValid },
  } = useForm<UserEditFormData>({
    resolver: zodResolver(userEditSchema),
    mode: "onChange",
    defaultValues: {
      phone: user.phone,
      email: user.email || "",
      password: "",
      confirmPassword: "",
    },
  });

  // Keep form synchronized with background updates when not dirty
  React.useEffect(() => {
    if (user && !isDirty) {
      reset({
        phone: user.phone,
        email: user.email || "",
        password: "",
        confirmPassword: "",
      });
    }
  }, [user, isDirty, reset]);

  const onSubmit = (formData: UserEditFormData) => {
    if (isDeactivatedNonAdmin) return;
    setFormError(null);

    // Build partial update payload excluding unchanged or empty fields
    const payload: UserUpdateRequest = {};

    if (formData.phone !== user.phone) {
      payload.phone = formData.phone;
    }

    const normalizedEmail =
      formData.email && formData.email.trim().length > 0
        ? formData.email.trim()
        : null;
    if (normalizedEmail !== user.email) {
      payload.email = normalizedEmail;
    }

    if (formData.password && formData.password.length > 0) {
      payload.password = formData.password;
    }

    // Guard: if nothing changed, don't execute a redundant API call
    if (Object.keys(payload).length === 0) {
      router.push(`/users/${userId}`);
      return;
    }

    updateMutation.mutate(
      { userId, data: payload },
      {
        onSuccess: () => {
          router.push(`/users/${userId}`);
        },
        onError: (err: ApiClientError) => {
          // 1. Validation errors (HTTP 422)
          if (err.isValidationError && err.validationErrors) {
            Object.entries(err.validationErrors).forEach(([field, msg]) => {
              if (field === "phone" || field === "email" || field === "password") {
                setError(field as "phone" | "email" | "password", {
                  type: "server",
                  message: msg,
                });
              }
            });
            setFormError("Please correct the highlighted validation errors.");
            return;
          }

          // 2. Conflict / Duplicate phone errors (HTTP 400/409)
          const errorMsg = (err.message || "").toLowerCase();
          if (
            err.isConflict ||
            errorMsg.includes("already taken") ||
            errorMsg.includes("already exists") ||
            errorMsg.includes("phone number already registered")
          ) {
            setError("phone", {
              type: "server",
              message: "This phone number is already registered to another staff account.",
            });
            setFormError(
              "The specified phone number is already registered. Each staff account must have a unique phone number."
            );
            return;
          }

          // 3. Deactivated profile error
          if (errorMsg.includes("deactivated")) {
            setFormError(
              "Cannot update deactivated user profile. Contact an administrator to reactivate this account first."
            );
            return;
          }

          // 4. Forbidden (HTTP 403)
          if (err.isForbidden) {
            setFormError(
              "You do not have permission to update this staff profile. Non-administrator staff can only update their own profile."
            );
            return;
          }

          setFormError(err.message || "Failed to update staff profile. Please try again.");
        },
      }
    );
  };

  const isSaving = updateMutation.isPending;
  const backHref = `/users/${userId}`;
  const backLabel = "Cancel & Return";
  const pageTitle = isSelf ? "Edit My Profile" : `Edit Staff Profile #${userId}`;
  const breadcrumbs = isAdmin
    ? [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Staff Directory", href: "/users" },
        { label: `#${userId}`, href: `/users/${userId}` },
        { label: "Edit" },
      ]
    : [
        { label: "Dashboard", href: "/dashboard" },
        { label: "My Profile", href: `/users/${userId}` },
        { label: "Edit" },
      ];

  return (
    <div className="space-y-6">
      <PageHeaderConfig
        title={pageTitle}
        description="Update contact credentials and account security details."
        breadcrumbs={breadcrumbs}
        headerActions={
          <Button asChild variant="outline" size="sm">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              {backLabel}
            </Link>
          </Button>
        }
      />

      {/* Global Form Error Banner */}
      {formError && (
        <Card
          className="border-destructive/30 bg-destructive/10 text-destructive"
          role="alert"
          aria-live="assertive"
        >
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Profile Update Failed</p>
              <p className="text-xs">{formError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deactivated Notice for Non-Admins */}
      {isDeactivatedNonAdmin && (
        <Card
          className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
          role="alert"
        >
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Account Deactivated</p>
              <p className="text-xs">
                This account is currently deactivated. Deactivated user profiles cannot be
                updated by non-administrative staff. Please contact an administrator to reactivate
                the account.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form: Contact & Password Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Details Card */}
            <Card className="border border-border">
              <CardHeader className="pb-4 border-b border-border">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  Contact Information
                </CardTitle>
                <CardDescription>
                  Primary login phone identifier and optional email address.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {/* Phone */}
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm font-medium">
                    Phone Number (Login ID) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    disabled={isSaving || isDeactivatedNonAdmin}
                    placeholder="e.g. 9876543210"
                    {...register("phone")}
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
                    className={errors.phone ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {errors.phone ? (
                    <p id="phone-error" className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.phone.message}
                    </p>
                  ) : (
                    <p id="phone-hint" className="text-xs text-muted-foreground">
                      10–15 digits. Primary unique identity used for authentication.
                    </p>
                  )}
                </div>

                <Separator />

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    disabled={isSaving || isDeactivatedNonAdmin}
                    placeholder="e.g. staff@clinic.com"
                    {...register("email")}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "email-error" : "email-hint"}
                    className={errors.email ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {errors.email ? (
                    <p id="email-error" className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.email.message}
                    </p>
                  ) : (
                    <p id="email-hint" className="text-xs text-muted-foreground">
                      Optional communication address for notifications. Leave blank if none.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Password Change Card */}
            <Card className="border border-border">
              <CardHeader className="pb-4 border-b border-border">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  Change Password
                </CardTitle>
                <CardDescription>
                  Leave both fields blank if you do not wish to change your password.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {/* New Password */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      disabled={isSaving || isDeactivatedNonAdmin}
                      placeholder="Enter new password (min. 8 characters)"
                      {...register("password")}
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={errors.password ? "password-error" : "password-hint"}
                      className={
                        errors.password
                          ? "border-destructive focus-visible:ring-destructive pr-10"
                          : "pr-10"
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPassword((prev) => !prev)}
                      disabled={isSaving || isDeactivatedNonAdmin}
                      className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {errors.password ? (
                    <p id="password-error" className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.password.message}
                    </p>
                  ) : (
                    <p id="password-hint" className="text-xs text-muted-foreground">
                      Must be between 8 and 72 characters. Leave empty to keep existing password.
                    </p>
                  )}
                </div>

                <Separator />

                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">
                    Confirm New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      disabled={isSaving || isDeactivatedNonAdmin}
                      placeholder="Re-enter new password"
                      {...register("confirmPassword")}
                      aria-invalid={Boolean(errors.confirmPassword)}
                      aria-describedby={
                        errors.confirmPassword ? "confirmPassword-error" : undefined
                      }
                      className={
                        errors.confirmPassword
                          ? "border-destructive focus-visible:ring-destructive pr-10"
                          : "pr-10"
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      disabled={isSaving || isDeactivatedNonAdmin}
                      className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                      aria-label={
                        showConfirmPassword
                          ? "Hide confirmed password"
                          : "Show confirmed password"
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {errors.confirmPassword && (
                    <p
                      id="confirmPassword-error"
                      className="text-xs text-destructive flex items-center gap-1"
                    >
                      <AlertCircle className="h-3 w-3" />
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Card: Immutable Privileged Fields */}
          <div className="space-y-6">
            <Card className="border border-border">
              <CardHeader className="pb-4 border-b border-border">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Role & System Identity
                </CardTitle>
                <CardDescription>
                  Privileged roles and provider assignments are protected.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4 text-sm">
                {/* Database ID */}
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Database ID:</span>
                  <span className="font-mono font-medium text-foreground">
                    #{user.id}
                  </span>
                </div>

                <Separator />

                {/* Assigned Role */}
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Assigned Role
                  </span>
                  <div>{getRoleBadge(user.role)}</div>
                </div>

                <Separator />

                {/* Linked Provider */}
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Clinical Provider Link
                  </span>
                  {user.role === "DOCTOR" ? (
                    user.provider_id ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          Provider Record #{user.provider_id}
                        </Badge>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-500 font-medium">
                        No provider profile currently linked
                      </p>
                    )
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Not applicable (Doctor accounts only)
                    </p>
                  )}
                </div>

                <Separator />

                {/* Notice regarding separate administrative workflow */}
                <div className="p-3 rounded-md bg-muted/60 border border-border text-xs text-muted-foreground space-y-1.5">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Info className="h-3.5 w-3.5 text-primary" />
                    <span>Administrative Privilege Lock</span>
                  </div>
                  <p>
                    Staff roles and clinical provider linkages cannot be changed from this profile
                    screen. Role adjustments and provider linkages are managed exclusively through the
                    administrative workflow.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Form Submit & Cancel Actions Card */}
            <Card className="border border-border">
              <CardContent className="p-6 space-y-3">
                <Button
                  type="submit"
                  disabled={isSaving || !isDirty || !isValid || isDeactivatedNonAdmin}
                  className="w-full gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving Profile...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>

                <Button
                  asChild
                  variant="outline"
                  disabled={isSaving}
                  className="w-full"
                >
                  <Link href={backHref}>Cancel</Link>
                </Button>

                {!isDirty && (
                  <p className="text-xs text-center text-muted-foreground">
                    Modify phone, email, or password to enable saving.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

function UserEditContent({
  userId,
  rawId,
}: {
  userId: number;
  rawId: string;
}) {
  const sessionUser = useCurrentSessionUser();
  const isAdmin = sessionUser?.role === "ADMIN";
  const isSelf = sessionUser ? sessionUser.id === userId : false;

  const isValidId = Number.isSafeInteger(userId) && userId > 0;

  // Fail-closed check: if session is loaded and caller is neither ADMIN nor self, access is forbidden
  const isClientForbidden = sessionUser !== undefined && !isAdmin && !isSelf;

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

  const isForbidden =
    isClientForbidden || (isApiClientError(error) && error.isForbidden);
  const is404 = isApiClientError(error) && error.isNotFound;

  // 1. Invalid route reference
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

  // 2. Forbidden / Access Restricted
  if (isForbidden) {
    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title="Access Restricted"
          description="You do not have permission to edit this staff profile."
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
                You are not authorized to edit this staff profile. Non-administrator
                staff members can only edit their own user account.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard">
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Return to Dashboard
                </Link>
              </Button>
              {sessionUser && typeof sessionUser.id === "number" && (
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

  // 3. 404 Not Found
  if (is404) {
    const returnHref = isAdmin ? "/users" : "/dashboard";
    const returnLabel = isAdmin ? "Return to Staff Directory" : "Return to Dashboard";

    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title={`Staff Account #${userId} Not Found`}
          description="The requested staff user record does not exist."
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            ...(isAdmin ? [{ label: "Staff Directory", href: "/users" }] : []),
            { label: `#${userId}` },
          ]}
        />
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-muted-foreground/60" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Staff Account Not Found</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                No staff account was found with identifier #{userId}. It may have been
                removed or the identifier is incorrect.
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

  // 4. Generic Error
  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeaderConfig
          title="Error Loading Staff Profile"
          description="Unable to retrieve the staff account information."
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            ...(isAdmin ? [{ label: "Staff Directory", href: "/users" }] : []),
            { label: `#${userId}` },
          ]}
        />
        <Card className="border-border border-destructive/20 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-destructive">
                Unable to Load Account
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {error?.message ||
                  "A network or server error occurred while loading this staff profile."}
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

  // 5. Loading Skeleton
  if (isLoading || !user) {
    return <UserEditSkeleton />;
  }

  // 6. Form Loaded
  return (
    <UserEditForm
      user={user}
      userId={userId}
      isAdmin={Boolean(isAdmin)}
      isSelf={Boolean(isSelf)}
    />
  );
}

function UserEditWrapper({ params }: UserEditPageProps) {
  const resolvedParams = React.use(params);
  const rawId = resolvedParams?.id ?? "";

  const isStrictInteger = /^[1-9]\d*$/.test(rawId);
  const userId = isStrictInteger ? Number(rawId) : NaN;

  return (
    <UserEditContent
      userId={userId}
      rawId={rawId}
    />
  );
}

export default function UserEditPage({ params }: UserEditPageProps) {
  return (
    <React.Suspense fallback={<UserEditSkeleton />}>
      <UserEditWrapper params={params} />
    </React.Suspense>
  );
}
