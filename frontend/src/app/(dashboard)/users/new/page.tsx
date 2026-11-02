"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  UserPlus,
  Loader2,
  AlertCircle,
  Phone,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldAlert,
  Stethoscope,
  Briefcase,
  CheckCircle2,
} from "lucide-react";
import { useCreateUser } from "@/features/users/hooks/use-users";
import { useProviders } from "@/features/providers/hooks/use-providers";
import { PageHeaderConfig } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { UserRole, UserCreateRequest } from "@/types/auth";

/**
 * Validation schema aligned with backend FastAPI model constraints:
 * - phone: 10-15 digits, digits only
 * - email: optional valid email or null
 * - password: 8-72 characters (bcrypt limit)
 * - confirmPassword: must match password
 * - role: "ADMIN" | "DOCTOR" | "RECEPTIONIST"
 * - provider_id: required integer when role is DOCTOR; must be null otherwise
 */
const createUserFormSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .min(10, "Phone number must be at least 10 digits")
      .max(15, "Phone number cannot exceed 15 digits")
      .regex(/^\d+$/, "Phone number must contain only numeric digits"),
    email: z
      .string()
      .trim()
      .email("Please provide a valid email address")
      .or(z.literal(""))
      .optional(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password cannot exceed 72 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    role: z.enum(["ADMIN", "DOCTOR", "RECEPTIONIST"], {
      message: "Please select an authorized staff role",
    }),
    provider_id: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine(
    (data) => {
      if (data.role === "DOCTOR") {
        return Boolean(data.provider_id && data.provider_id.trim() !== "");
      }
      return true;
    },
    {
      message: "Doctor accounts must be linked to an active clinical provider profile",
      path: ["provider_id"],
    }
  );

type CreateUserFormData = z.infer<typeof createUserFormSchema>;

const emptySubscribe = () => () => {};

/**
 * Hook to safely read user role from the client-side caredesk_user metadata cookie.
 */
function useCurrentUserRole(): string | null | undefined {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => {
      if (typeof document === "undefined") return undefined;
      const match = document.cookie.match(/(?:^|;\s*)caredesk_user=([^;]+)/);
      if (!match || !match[1]) return null;
      try {
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        return typeof parsed.role === "string" ? parsed.role : null;
      } catch {
        return null;
      }
    },
    () => undefined
  );
}

export default function NewUserPage() {
  const router = useRouter();
  const userRole = useCurrentUserRole();
  const isAdmin = userRole === "ADMIN";

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  const createUserMutation = useCreateUser();

  // Fetch active providers for Doctor linkage selection
  const { data: providers, isLoading: isLoadingProviders } = useProviders({
    skip: 0,
    limit: 100,
  });

  const activeProviders = React.useMemo(() => {
    return providers?.filter((p) => p.is_active) ?? [];
  }, [providers]);

  const [selectedRole, setSelectedRole] = React.useState<UserRole>("RECEPTIONIST");

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      phone: "",
      email: "",
      password: "",
      confirmPassword: "",
      role: "RECEPTIONIST",
      provider_id: "",
    },
    mode: "onTouched",
  });

  // Non-administrator access guard (Fail closed)
  if (userRole === undefined) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <PageHeaderConfig
          title="Access Restricted"
          description="Administrative privileges required"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Staff Directory", href: "/users" },
            { label: "Create Staff" },
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
                Only Administrators can provision and register new staff user accounts.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Return to Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const onSubmit = async (data: CreateUserFormData) => {
    setGlobalError(null);

    const payload: UserCreateRequest = {
      phone: data.phone.trim(),
      email: data.email && data.email.trim() ? data.email.trim() : null,
      password: data.password,
      role: data.role as UserRole,
      provider_id:
        data.role === "DOCTOR" && data.provider_id
          ? parseInt(data.provider_id, 10)
          : null,
    };

    createUserMutation.mutate(payload, {
      onSuccess: (createdUser) => {
        router.push(`/users/${createdUser.id}`);
      },
      onError: (err) => {
        const errorDetail = err.message || "";

        if (
          errorDetail.toLowerCase().includes("phone number already") ||
          errorDetail.toLowerCase().includes("phone") && errorDetail.toLowerCase().includes("exist")
        ) {
          setError("phone", {
            type: "manual",
            message: "A staff account with this phone number already exists.",
          });
        } else if (
          errorDetail.toLowerCase().includes("provider is already linked") ||
          errorDetail.toLowerCase().includes("another user account")
        ) {
          setError("provider_id", {
            type: "manual",
            message: "This clinical provider profile is already linked to another staff account.",
          });
        } else if (errorDetail.toLowerCase().includes("provider must exist and be active")) {
          setError("provider_id", {
            type: "manual",
            message: "The selected provider profile must exist and be in active status.",
          });
        } else {
          setGlobalError(
            errorDetail || "An unexpected error occurred while creating the staff user account."
          );
        }
      },
    });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeaderConfig
        title="Create Staff User"
        description="Provision a new staff account with system credentials and role authorization."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Staff Directory", href: "/users" },
          { label: "Create Staff" },
        ]}
        headerActions={
          <Button asChild variant="outline" size="sm">
            <Link href="/users">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Staff Directory
            </Link>
          </Button>
        }
      />

      {globalError && (
        <Card className="border-destructive/30 bg-destructive/5" role="alert">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">
                Failed to create staff account
              </p>
              <p className="text-xs text-muted-foreground">{globalError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card className="border-border">
          <CardHeader className="pb-4 border-b border-border">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              Staff Account Information
            </CardTitle>
            <CardDescription>
              Configure login credentials, contact info, and role permissions.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            {/* Phone Number (Login ID) */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium">
                Primary Phone Number (Login ID) <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="e.g. 9876543210"
                  className="pl-9 font-mono text-sm"
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? "phone-error" : "phone-help"}
                  {...register("phone")}
                />
              </div>
              <p id="phone-help" className="text-xs text-muted-foreground">
                10 to 15 digits. Serves as the unique username during authentication.
              </p>
              {errors.phone && (
                <p id="phone-error" className="text-xs text-destructive flex items-center gap-1 font-medium">
                  <AlertCircle className="h-3 w-3" />
                  {errors.phone.message}
                </p>
              )}
            </div>

            {/* Email Address */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email Address <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="e.g. staff@hospital.com"
                  className="pl-9 text-sm"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p id="email-error" className="text-xs text-destructive flex items-center gap-1 font-medium">
                  <AlertCircle className="h-3 w-3" />
                  {errors.email.message}
                </p>
              )}
            </div>

            <Separator />

            {/* Password Credentials */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min 8 characters"
                    className="pl-9 pr-10 text-sm font-mono"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" className="text-xs text-destructive flex items-center gap-1 font-medium">
                    <AlertCircle className="h-3 w-3" />
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Repeat password"
                    className="pl-9 pr-10 text-sm font-mono"
                    aria-invalid={Boolean(errors.confirmPassword)}
                    aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
                    {...register("confirmPassword")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p id="confirmPassword-error" className="text-xs text-destructive flex items-center gap-1 font-medium">
                    <AlertCircle className="h-3 w-3" />
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Role Selection */}
            <div className="space-y-3">
              <Label htmlFor="role" className="text-sm font-medium">
                Staff Role & Authorization Scope <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <select
                  id="role"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  aria-invalid={Boolean(errors.role)}
                  {...register("role", {
                    onChange: (e) => {
                      const newRole = e.target.value as UserRole;
                      setSelectedRole(newRole);
                      if (newRole !== "DOCTOR") {
                        setValue("provider_id", "");
                      }
                    },
                  })}
                >
                  <option value="RECEPTIONIST">Receptionist (Front-desk and patient management)</option>
                  <option value="DOCTOR">Doctor (Clinical consultations and patient files)</option>
                  <option value="ADMIN">Administrator (Full clinic configuration & staff management)</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Role controls dashboard capabilities, route accessibility, and API mutation permissions.
              </p>
              {errors.role && (
                <p className="text-xs text-destructive flex items-center gap-1 font-medium">
                  <AlertCircle className="h-3 w-3" />
                  {errors.role.message}
                </p>
              )}
            </div>

            {/* Doctor Provider Linkage (Conditional) */}
            {selectedRole === "DOCTOR" && (
              <div className="p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-3">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  <Label htmlFor="provider_id" className="text-sm font-medium text-foreground">
                    Link Clinical Provider Profile <span className="text-destructive">*</span>
                  </Label>
                </div>

                <p className="text-xs text-muted-foreground">
                  Doctor user accounts must be linked to an active clinical provider record for appointment scheduling and consultation tracking.
                </p>

                <div className="relative">
                  <select
                    id="provider_id"
                    disabled={isLoadingProviders}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    aria-invalid={Boolean(errors.provider_id)}
                    {...register("provider_id")}
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
                </div>

                {activeProviders.length === 0 && !isLoadingProviders && (
                  <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded border border-amber-200 dark:border-amber-800 flex items-center justify-between">
                    <span>No active providers found. Create a provider first.</span>
                    <Button asChild size="sm" variant="outline" className="h-6 text-xs">
                      <Link href="/providers/new">Register Provider</Link>
                    </Button>
                  </div>
                )}

                {errors.provider_id && (
                  <p className="text-xs text-destructive flex items-center gap-1 font-medium">
                    <AlertCircle className="h-3 w-3" />
                    {errors.provider_id.message}
                  </p>
                )}
              </div>
            )}
          </CardContent>

          <div className="border-t border-border px-6 py-4 flex items-center justify-end gap-3 bg-muted/20">
            <Button asChild variant="outline" size="sm" disabled={isSubmitting || createUserMutation.isPending}>
              <Link href="/users">Cancel</Link>
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || createUserMutation.isPending}
              className="gap-1.5"
            >
              {isSubmitting || createUserMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Create Staff Account
                </>
              )}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
