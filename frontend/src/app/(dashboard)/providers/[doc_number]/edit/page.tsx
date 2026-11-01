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
  Stethoscope,
  Phone,
  Mail,
  Award,
  ShieldAlert,
  RefreshCw,
  Lock,
  User as UserIcon,
} from "lucide-react";
import {
  useProvider,
  useUpdateProvider,
} from "@/features/providers/hooks/use-providers";
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
import { isApiClientError } from "@/lib/api/errors";
import type { ProviderUpdateInput, PostType } from "@/types/provider";

interface ProviderEditPageProps {
  params: Promise<{ doc_number: string }>;
}

/**
 * Validation schema matching backend constraints:
 * - name: 2-300 chars
 * - specialization: 2-300 chars
 * - phone: 10-20 digits
 * - email: optional valid email (converted to null if empty)
 * - post: strictly "MD" or "MS" enum
 * Note: doc_number is immutable and excluded from ProviderUpdate.
 */
const providerEditSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(300, "Full name cannot exceed 300 characters"),
  specialization: z
    .string()
    .trim()
    .min(2, "Specialization must be at least 2 characters")
    .max(300, "Specialization cannot exceed 300 characters"),
  phone: z
    .string()
    .trim()
    .min(10, "Phone number must be at least 10 digits")
    .max(20, "Phone number cannot exceed 20 digits")
    .regex(/^\d+$/, "Phone number must contain only digits"),
  email: z
    .string()
    .trim()
    .email("Please provide a valid email address")
    .or(z.literal(""))
    .optional(),
  post: z.enum(["MD", "MS"], {
    message: "Please select a qualification post (MD or MS)",
  }),
});

type ProviderEditFormData = z.infer<typeof providerEditSchema>;

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
 * Loading skeleton component for provider edit page.
 */
function ProviderEditSkeleton() {
  return (
    <div className="space-y-6 max-w-4xl">
      <Card className="border border-border">
        <CardHeader className="space-y-2 pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-6 w-44 bg-slate-200 animate-pulse rounded" />
              <div className="h-4 w-64 bg-slate-200 animate-pulse rounded" />
            </div>
            <div className="h-6 w-20 bg-slate-200 animate-pulse rounded-full" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 bg-slate-200 animate-pulse rounded" />
                <div className="h-9 w-full bg-slate-200 animate-pulse rounded" />
              </div>
            ))}
          </div>
          <Separator />
          <div className="flex justify-end gap-3 pt-2">
            <div className="h-9 w-24 bg-slate-200 animate-pulse rounded" />
            <div className="h-9 w-32 bg-slate-200 animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProviderEditContent({ docNumber }: { docNumber: string }) {
  const router = useRouter();
  const userRole = useCurrentUserRole();
  const isAdmin = userRole === "ADMIN";

  const [globalError, setGlobalError] = React.useState<string | null>(null);

  // 1. Fetch current provider record
  const {
    data: provider,
    isLoading,
    isError,
    error: fetchError,
    refetch,
  } = useProvider(docNumber);

  // 2. Provider update mutation hook
  const { mutate: updateProviderMutation, isPending: isSaving } =
    useUpdateProvider();

  // 3. Form initialization with React Hook Form
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProviderEditFormData>({
    resolver: zodResolver(providerEditSchema),
    defaultValues: {
      name: "",
      specialization: "",
      phone: "",
      email: "",
      post: "" as unknown as PostType,
    },
  });

  // 4. Prepopulate form fields when provider data loads (protect dirty edits during background refetch)
  React.useEffect(() => {
    if (provider && !isDirty) {
      reset({
        name: provider.name,
        specialization: provider.specialization,
        phone: provider.phone,
        email: provider.email ?? "",
        post: provider.post,
      });
    }
  }, [provider, reset, isDirty]);

  const is404 = isApiClientError(fetchError) && fetchError.isNotFound;

  // 5. Submit handler
  const onSubmit = (formData: ProviderEditFormData) => {
    // Fail-closed guard: reject submission if not verified Admin
    if (!isAdmin) {
      setGlobalError(
        "Permission denied. Medical provider editing is restricted to Administrators."
      );
      return;
    }

    setGlobalError(null);

    // Contract strictness: exclude doc_number, id, is_active, audit fields (extra='forbid')
    const updatePayload: ProviderUpdateInput = {
      name: formData.name.trim(),
      specialization: formData.specialization.trim(),
      phone: formData.phone.trim(),
      email: formData.email?.trim() ? formData.email.trim() : null,
      post: formData.post,
    };

    updateProviderMutation(
      {
        docNumber,
        data: updatePayload,
      },
      {
        onSuccess: () => {
          // Redirect back to the updated provider profile
          router.push(`/providers/${encodeURIComponent(docNumber)}`);
        },
        onError: (err) => {
          // 1. Field-level validation errors (FastAPI 422)
          if (err.isValidationError && err.validationErrors) {
            Object.entries(err.validationErrors).forEach(([field, message]) => {
              setError(field as keyof ProviderEditFormData, {
                type: "server",
                message,
              });
            });
            setGlobalError("Please correct the highlighted fields and resubmit.");
            return;
          }

          // 2. Conflict / Duplicate phone (FastAPI 400 or 409)
          const errorMsg = err.message || "";
          if (
            err.isConflict ||
            errorMsg.toLowerCase().includes("phone") ||
            errorMsg.toLowerCase().includes("already registered")
          ) {
            setError("phone", {
              type: "server",
              message:
                "This phone number is already registered to another medical provider.",
            });
            setGlobalError(
              "A medical provider with this phone number is already registered."
            );
            return;
          }

          // 3. Permission denied (FastAPI 403)
          if (err.isForbidden) {
            setGlobalError(
              "Permission denied. Only Administrators have authorization to edit provider credentials."
            );
            return;
          }

          // 4. Record not found (FastAPI 404)
          if (err.isNotFound) {
            setGlobalError("The provider file you are trying to edit was not found.");
            return;
          }

          // 5. Generic network or server error
          setGlobalError(
            err.message ||
              "An unexpected error occurred while saving provider changes. Please try again."
          );
        },
      }
    );
  };

  return (
    <div className="space-y-6 max-w-4xl pb-10">
      <PageHeaderConfig
        title={provider ? `Edit ${provider.name}` : "Edit Provider"}
        description={
          provider
            ? `Update credentials and clinical information for Dr. ID: ${provider.doc_number}`
            : "Update medical provider profile credentials"
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Providers", href: "/providers" },
          {
            label: provider?.doc_number || docNumber || "Details",
            href: `/providers/${encodeURIComponent(docNumber)}`,
          },
          {
            label: "Edit",
            href: `/providers/${encodeURIComponent(docNumber)}/edit`,
          },
        ]}
        headerActions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={`/providers/${encodeURIComponent(docNumber)}`}>
                <ArrowLeft className="h-4 w-4" />
                Back to Profile
              </Link>
            </Button>
          </div>
        }
      />

      {/* 1. Loading Skeleton */}
      {isLoading && <ProviderEditSkeleton />}

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
                {fetchError instanceof Error
                  ? fetchError.message
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

      {/* 4. Edit Form Card */}
      {!isLoading && provider && (
        <div className="space-y-6">
          {/* Admin Role Safeguard Banner */}
          {!isAdmin && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2.5 text-amber-800 text-sm">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                Medical provider modification is restricted to <strong>Administrators</strong>. You have view-only access.
              </span>
            </div>
          )}

          {/* Inactive Status Banner */}
          {!provider.is_active && (
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2.5 text-slate-700 text-sm">
              <AlertCircle className="h-4 w-4 text-slate-500 shrink-0" />
              <span>
                This medical provider is currently marked as <strong>inactive</strong>. You can update their profile information below.
              </span>
            </div>
          )}

          {/* Permanent Identifier Card */}
          <Card className="border-border bg-slate-50/50">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {provider.name ? provider.name.charAt(0) : "D"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{provider.name}</span>
                    <Badge variant="outline" className="font-mono text-xs gap-1">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                      {provider.doc_number}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Doctor Number identifier is permanently locked to preserve consultation records and audit integrity.
                  </p>
                </div>
              </div>
              <div>
                {provider.is_active ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    Active Record
                  </Badge>
                ) : (
                  <Badge variant="secondary">Inactive Record</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Global Submission Error Alert */}
          {globalError && (
            <Card
              role="alert"
              aria-live="assertive"
              className="border-destructive/30 bg-destructive/5"
            >
              <CardContent className="p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-destructive">
                    Unable to save provider changes
                  </h4>
                  <p className="text-sm text-destructive/90">{globalError}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Main Edit Form Card */}
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-primary" />
                Provider Information & Qualifications
              </CardTitle>
              <CardDescription>
                Update doctor credentials and contact details. All fields marked with an asterisk (<span className="text-destructive">*</span>) are mandatory.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Section 1: Professional Information */}
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Stethoscope className="h-3.5 w-3.5" />
                    Professional Credentials
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Full Name */}
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="name">
                        Full Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        placeholder="e.g. Dr. Jane Smith"
                        disabled={isSaving || !isAdmin}
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={errors.name ? "name-error" : undefined}
                        {...register("name")}
                      />
                      {errors.name && (
                        <p id="name-error" className="text-xs text-destructive">
                          {errors.name.message}
                        </p>
                      )}
                    </div>

                    {/* Specialization */}
                    <div className="space-y-2">
                      <Label htmlFor="specialization">
                        Specialization <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="specialization"
                        placeholder="e.g. Cardiology, Pediatrics"
                        disabled={isSaving || !isAdmin}
                        aria-invalid={Boolean(errors.specialization)}
                        aria-describedby={errors.specialization ? "specialization-error" : undefined}
                        {...register("specialization")}
                      />
                      {errors.specialization && (
                        <p id="specialization-error" className="text-xs text-destructive">
                          {errors.specialization.message}
                        </p>
                      )}
                    </div>

                    {/* Qualification Post (MD / MS) */}
                    <div className="space-y-2">
                      <Label htmlFor="post" className="flex items-center gap-1.5">
                        <Award className="h-3.5 w-3.5 text-muted-foreground" />
                        Medical Post <span className="text-destructive">*</span>
                      </Label>
                      <select
                        id="post"
                        disabled={isSaving || !isAdmin}
                        aria-invalid={Boolean(errors.post)}
                        aria-describedby={errors.post ? "post-error" : undefined}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        {...register("post")}
                      >
                        <option value="" disabled>
                          Select Qualification
                        </option>
                        <option value="MD">MD (Doctor of Medicine)</option>
                        <option value="MS">MS (Master of Surgery)</option>
                      </select>
                      {errors.post && (
                        <p id="post-error" className="text-xs text-destructive">
                          {errors.post.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Section 2: Contact Information */}
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    Contact Information
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Primary Phone */}
                    <div className="space-y-2">
                      <Label htmlFor="phone">
                        Primary Phone Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="e.g. 9876543210 (10–20 digits)"
                        disabled={isSaving || !isAdmin}
                        aria-invalid={Boolean(errors.phone)}
                        aria-describedby={errors.phone ? "phone-error" : undefined}
                        {...register("phone")}
                      />
                      {errors.phone && (
                        <p id="phone-error" className="text-xs text-destructive">
                          {errors.phone.message}
                        </p>
                      )}
                    </div>

                    {/* Email Address */}
                    <div className="space-y-2">
                      <Label htmlFor="email" className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        Email Address <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="e.g. doctor@clinic.com"
                        disabled={isSaving || !isAdmin}
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? "email-error" : undefined}
                        {...register("email")}
                      />
                      {errors.email && (
                        <p id="email-error" className="text-xs text-destructive">
                          {errors.email.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Form Actions */}
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
                  <Button asChild variant="outline" type="button" disabled={isSaving}>
                    <Link href={`/providers/${encodeURIComponent(docNumber)}`}>
                      Cancel
                    </Link>
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSaving || !isAdmin || !isDirty}
                    className="gap-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving Changes...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ProviderEditWrapper({ params }: ProviderEditPageProps) {
  const resolvedParams = React.use(params);
  const docNumber = resolvedParams?.doc_number ?? "";

  return <ProviderEditContent docNumber={docNumber} />;
}

export default function ProviderEditPage({ params }: ProviderEditPageProps) {
  return (
    <React.Suspense fallback={<ProviderEditSkeleton />}>
      <ProviderEditWrapper params={params} />
    </React.Suspense>
  );
}
