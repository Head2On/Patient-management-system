"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Activity,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

/**
 * Validation schema aligned strictly with backend UserLogin schema:
 * - Phone: Digits only, 10 to 15 digits (app/schemas/user.py)
 * - Password: Non-empty string (backend validates credentials)
 */
const loginSchema = z.object({
  phone: z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .regex(/^\d{10,15}$/, "Phone number must contain between 10 and 15 digits"),
  password: z
  .string()
  .min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Validates and sanitizes the redirection target to prevent open redirect vulnerabilities.
 */
function getSafeRedirectUrl(rawNext: string | null): string {
  if (!rawNext) return "/dashboard";
  // Disallow scheme, protocol-relative, and backslash bypasses
  if (
    !rawNext.startsWith("/") ||
    rawNext.startsWith("//") ||
    rawNext.startsWith("/\\") ||
    rawNext.includes("://")
  ) {
    return "/dashboard";
  }
  // Disallow redirecting directly back to the login page
  if (rawNext === "/login" || rawNext.startsWith("/login?")) {
    return "/dashboard";
  }
  return rawNext;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phone: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setAuthError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          phone: data.phone,
          password: data.password,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401) {
          setAuthError(result?.detail || "Invalid phone number or password");
        } else if (response.status === 429) {
          setAuthError("Too many login attempts. Please try again later.");
        } else if (result?.detail) {
          setAuthError(typeof result.detail === "string" ? result.detail : "Authentication failed");
        } else {
          setAuthError("An error occurred during sign in. Please try again.");
        }
        return;
      }

      // Safe destination redirect (respecting `?next=` when arriving from protected routes)
      const targetUrl = getSafeRedirectUrl(searchParams.get("next"));
      router.push(targetUrl);
      router.refresh();
    } catch (err) {
      console.error("Login request error:", err);
      setAuthError("Unable to reach the authentication service. Please check your connection.");
    }
  };

  return (
    <Card className="w-full border-slate-200 shadow-sm bg-white">
      <CardHeader className="space-y-2 text-center pb-6">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-700 text-white shadow-xs">
            <Activity className="size-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">CareDesk</span>
        </div>
        <CardTitle className="text-2xl font-semibold tracking-tight text-slate-900">
          Welcome back
        </CardTitle>
        <CardDescription className="text-sm text-slate-500">
          Sign in to access your clinic workspace.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {authError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50/80 p-3 text-sm text-red-800 animate-in fade-in-50 duration-200"
            >
              <AlertCircle className="size-4 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1 font-medium">{authError}</div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              inputMode="numeric"
              placeholder="Enter your phone number"
              disabled={isSubmitting}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "phone-error" : undefined}
              {...register("phone")}
            />
            {errors.phone && (
              <p id="phone-error" className="text-xs font-medium text-destructive mt-1">
                {errors.phone.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                disabled={isSubmitting}
                className="pr-10"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={isSubmitting}
                className="absolute right-1 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" className="text-xs font-medium text-destructive mt-1">
                {errors.password.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-medium h-10 mt-2 cursor-pointer"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="pt-2 pb-6 flex justify-center border-t border-slate-100 mt-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="size-3.5 text-slate-400" />
          <span>Secure clinic staff access</span>
        </div>
      </CardFooter>
    </Card>
  );
}
