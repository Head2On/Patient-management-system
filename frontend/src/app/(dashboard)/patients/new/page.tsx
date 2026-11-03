"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  UserPlus,
  Loader2,
  AlertCircle,
  User,
  ShieldCheck,
  MapPin,
} from "lucide-react";
import { useCreatePatient } from "@/features/patients/hooks/use-patients";
import { PageHeaderConfig } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { patientFormSchema, type PatientFormData } from "@/features/patients/schemas";
import type { PatientCreateInput } from "@/types/patient";


export default function NewPatientPage() {
  const router = useRouter();
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  const { mutate: createPatientMutation, isPending } = useCreatePatient();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      dob: "",
      gender: "" as unknown as "Female" | "Male" | "Other",
      address: "",
      chief_complaint: "",
      aadhaar: "",
    },
  });

  const onSubmit = (formData: PatientFormData) => {
    setGlobalError(null);

    // Normalize empty or whitespace Aadhaar to null before sending
    const normalizedAadhaar = formData.aadhaar?.trim()
      ? formData.aadhaar.trim().replace(/\s+/g, "")
      : null;

    const payload: PatientCreateInput = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      dob: formData.dob,
      gender: formData.gender,
      address: formData.address.trim(),
      chief_complaint: formData.chief_complaint.trim(),
      aadhaar: normalizedAadhaar,
    };

    createPatientMutation(payload, {
      onSuccess: (newPatient) => {
        // Redirect to the newly created patient's record
        router.push(`/patients/${encodeURIComponent(newPatient.patient_number)}`);
      },
      onError: (err) => {
        // 1. Field-level validation errors (FastAPI 422)
        if (err.isValidationError && err.validationErrors) {
          Object.entries(err.validationErrors).forEach(([field, message]) => {
            setError(field as keyof PatientFormData, {
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
            "Permission denied. Patient registration is restricted to Admin and Receptionist staff."
          );
          return;
        }

        // 3. Conflict / Duplicate errors (FastAPI 409 or 400 with duplicate details)
        if (err.isConflict || (err.status === 400 && String(err.detail).toLowerCase().includes("duplicate"))) {
          setGlobalError(
            "A patient with this phone number or Aadhaar number already exists in the system."
          );
          return;
        }

        // 4. Other API errors
        setGlobalError(err.message || "Failed to register patient. Please try again.");
      },
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeaderConfig
        title="Register New Patient"
        description="Enter patient demographic, contact, and clinical admission details"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Patients", href: "/patients" },
          { label: "New Patient", href: "/patients/new" },
        ]}
        headerActions={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/patients">
              <ArrowLeft className="h-4 w-4" />
              Back to Directory
            </Link>
          </Button>
        }
      />

      {/* Global Form-Level Error Banner */}
      {globalError && (
        <Card role="alert" aria-live="assertive" className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">{globalError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Registration Form Card */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Patient Information
          </CardTitle>
          <CardDescription>
            All fields marked with an asterisk (<span className="text-destructive">*</span>) are mandatory.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Demographic & Contact Details */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Demographics & Contact
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Full Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="e.g. John Doe"
                    disabled={isPending}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? "name-error" : undefined}
                    {...register("name")}
                  />
                  {errors.name && (
                    <p id="name-error" className="text-xs text-destructive">{errors.name.message}</p>
                  )}
                </div>

                {/* Phone Number */}
                <div className="space-y-2">
                  <Label htmlFor="phone">
                    Phone Number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="phone"
                    placeholder="e.g. 9876543210"
                    disabled={isPending}
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? "phone-error" : undefined}
                    {...register("phone")}
                  />
                  {errors.phone && (
                    <p id="phone-error" className="text-xs text-destructive">{errors.phone.message}</p>
                  )}
                </div>

                {/* Date of Birth */}
                <div className="space-y-2">
                  <Label htmlFor="dob">
                    Date of Birth <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="dob"
                    type="date"
                    disabled={isPending}
                    aria-invalid={Boolean(errors.dob)}
                    aria-describedby={errors.dob ? "dob-error" : undefined}
                    {...register("dob")}
                  />
                  {errors.dob && (
                    <p id="dob-error" className="text-xs text-destructive">{errors.dob.message}</p>
                  )}
                </div>

                {/* Gender */}
                <div className="space-y-2">
                  <Label htmlFor="gender">
                    Gender <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="gender"
                    disabled={isPending}
                    aria-invalid={Boolean(errors.gender)}
                    aria-describedby={errors.gender ? "gender-error" : undefined}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    {...register("gender")}
                  >
                    <option value="" disabled>
                      Select Gender
                    </option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                  {errors.gender && (
                    <p id="gender-error" className="text-xs text-destructive">{errors.gender.message}</p>
                  )}
                </div>

                {/* Aadhaar (Optional) */}
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="aadhaar" className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    Aadhaar Number <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
                  </Label>
                  <Input
                    id="aadhaar"
                    placeholder="12-digit national ID (leave blank if not available)"
                    disabled={isPending}
                    aria-invalid={Boolean(errors.aadhaar)}
                    aria-describedby={errors.aadhaar ? "aadhaar-error" : "aadhaar-desc"}
                    {...register("aadhaar")}
                  />
                  {errors.aadhaar ? (
                    <p id="aadhaar-error" className="text-xs text-destructive">{errors.aadhaar.message}</p>
                  ) : (
                    <p id="aadhaar-desc" className="text-xs text-muted-foreground">
                      Must be unique if registered. Will be masked on display.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Address & Clinical Details */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Address & Clinical Admission
              </h4>

              <div className="space-y-4">
                {/* Residential Address */}
                <div className="space-y-2">
                  <Label htmlFor="address">
                    Residential Address <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="address"
                    placeholder="Street address, locality, city, state, postal code"
                    rows={3}
                    disabled={isPending}
                    aria-invalid={Boolean(errors.address)}
                    aria-describedby={errors.address ? "address-error" : undefined}
                    {...register("address")}
                  />
                  {errors.address && (
                    <p id="address-error" className="text-xs text-destructive">{errors.address.message}</p>
                  )}
                </div>

                {/* Chief Complaint */}
                <div className="space-y-2">
                  <Label htmlFor="chief_complaint">
                    Chief Complaint / Primary Reason for Visit <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="chief_complaint"
                    placeholder="Describe symptoms, complaints, or reason for appointment"
                    rows={3}
                    disabled={isPending}
                    aria-invalid={Boolean(errors.chief_complaint)}
                    aria-describedby={errors.chief_complaint ? "chief_complaint-error" : undefined}
                    {...register("chief_complaint")}
                  />
                  {errors.chief_complaint && (
                    <p id="chief_complaint-error" className="text-xs text-destructive">{errors.chief_complaint.message}</p>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Form Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button asChild variant="outline" disabled={isPending}>
                <Link href="/patients">Cancel</Link>
              </Button>
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registering Patient...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Register Patient
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
