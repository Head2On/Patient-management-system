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
  Stethoscope,
  Phone,
  Mail,
  Award,
  ShieldAlert,
} from "lucide-react";
import { useCreateProvider } from "@/features/providers/hooks/use-providers";
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
import type { ProviderCreateInput, PostType } from "@/types/provider";

/**
 * Validation schema aligned with backend FastAPI model constraints:
 * - name: 2-300 chars
 * - specialization: 2-300 chars
 * - phone: 10-20 digits
 * - email: optional valid email address (converted to null if empty)
 * - post: strictly "MD" or "MS" enum
 */
const providerFormSchema = z.object({
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

type ProviderFormData = z.infer<typeof providerFormSchema>;

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

export default function NewProviderPage() {
  const router = useRouter();
  const userRole = useCurrentUserRole();
  const isAdmin = userRole === "ADMIN";

  const [globalError, setGlobalError] = React.useState<string | null>(null);

  const { mutate: createProviderMutation, isPending } = useCreateProvider();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProviderFormData>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: {
      name: "",
      specialization: "",
      phone: "",
      email: "",
      post: "" as unknown as PostType,
    },
  });

  const onSubmit = (formData: ProviderFormData) => {
    // Fail-closed guard: reject submission if not verified Admin
    if (!isAdmin) {
      setGlobalError(
        "Permission denied. Medical provider registration is restricted to Administrators."
      );
      return;
    }

    setGlobalError(null);

    const payload: ProviderCreateInput = {
      name: formData.name.trim(),
      specialization: formData.specialization.trim(),
      phone: formData.phone.trim(),
      email: formData.email?.trim() ? formData.email.trim() : null,
      post: formData.post,
    };

    createProviderMutation(payload, {
      onSuccess: (newProvider) => {
        // Redirect to the newly created provider's profile view
        router.push(`/providers/${encodeURIComponent(newProvider.doc_number)}`);
      },
      onError: (err) => {
        // 1. Field-level validation errors (FastAPI 422)
        if (err.isValidationError && err.validationErrors) {
          Object.entries(err.validationErrors).forEach(([field, message]) => {
            setError(field as keyof ProviderFormData, {
              type: "server",
              message,
            });
          });
          setGlobalError("Please correct the highlighted fields and resubmit.");
          return;
        }

        // 2. Permission errors (FastAPI 403)
        if (err.isForbidden) {
          setGlobalError(
            "Permission denied. Medical provider registration is restricted to Administrators."
          );
          return;
        }

        // 3. Conflict / Duplicate errors (FastAPI 400 or 409)
        const errorDetail = String(err.detail || err.message || "").toLowerCase();
        if (err.isConflict || (err.status === 400 && (errorDetail.includes("already registered") || errorDetail.includes("already exists")))) {
          if (errorDetail.includes("phone")) {
            setError("phone", {
              type: "server",
              message: "This phone number is already registered to another provider.",
            });
            setGlobalError("A provider with this phone number is already registered.");
            return;
          }
          setGlobalError(err.message || "A provider with matching credentials already exists.");
          return;
        }

        // 4. Other API errors
        setGlobalError(err.message || "Failed to register provider. Please try again.");
      },
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeaderConfig
        title="Add Medical Provider"
        description="Register a new clinic physician or specialist"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Providers", href: "/providers" },
          { label: "Add Provider", href: "/providers/new" },
        ]}
        headerActions={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/providers">
              <ArrowLeft className="h-4 w-4" />
              Back to Directory
            </Link>
          </Button>
        }
      />

      {/* Role-Based Fail-Closed Guard Notice for Non-Admins */}
      {!isAdmin && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="flex items-center gap-3 p-4 text-amber-800">
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">Administrator Access Required:</span> Provider registration is restricted to clinic administrators. You may view existing records from the directory.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accessible Global Form Submission Error Banner */}
      {globalError && (
        <Card
          role="alert"
          aria-live="assertive"
          className="border-destructive/30 bg-destructive/5"
        >
          <CardContent className="flex items-start gap-3 p-4 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">Registration Failed</h4>
              <p className="text-sm text-destructive/90">{globalError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Registration Form Card */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Provider Credentials & Profile
          </CardTitle>
          <CardDescription>
            All fields marked with an asterisk (<span className="text-destructive">*</span>) are mandatory. The doctor ID number will be generated automatically upon registration.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                    disabled={isPending || !isAdmin}
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
                    disabled={isPending || !isAdmin}
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
                    disabled={isPending || !isAdmin}
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

            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                Contact Information
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Phone Number */}
                <div className="space-y-2">
                  <Label htmlFor="phone">
                    Primary Phone Number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="e.g. 9876543210 (10–20 digits)"
                    disabled={isPending || !isAdmin}
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
                    placeholder="e.g. dr.smith@clinic.com"
                    disabled={isPending || !isAdmin}
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

            {/* Form Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-border">
              <Button asChild variant="outline" size="sm">
                <Link href="/providers">Cancel</Link>
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending || !isAdmin}
                className="gap-1.5"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registering Provider...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Register Provider
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
