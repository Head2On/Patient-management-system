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
  User,
  ShieldCheck,
  MapPin,
  Clock,
  RefreshCw,
  Lock,
} from "lucide-react";
import {
  usePatient,
  useUpdatePatient,
} from "@/features/patients/hooks/use-patients";
import { PageHeaderConfig } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type { PatientUpdateInput } from "@/types/patient";

interface PatientEditPageProps {
  params: Promise<{ patient_number: string }>;
}

/**
 * Validation schema matching backend constraints:
 * Note: Aadhaar is immutable once registered and is not part of PatientUpdate schema.
 */
const patientEditSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(200, "Full name cannot exceed 200 characters"),
  phone: z
    .string()
    .trim()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number cannot exceed 15 digits")
    .regex(/^\d+$/, "Phone number must contain only digits"),
  dob: z
    .string()
    .min(1, "Date of birth is required")
    .refine((val) => {
      const parts = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!parts) return false;
      const year = parseInt(parts[1], 10);
      const month = parseInt(parts[2], 10);
      const day = parseInt(parts[3], 10);
      const d = new Date();
      d.setFullYear(year, month - 1, day);
      return (
        d.getFullYear() === year &&
        d.getMonth() === month - 1 &&
        d.getDate() === day
      );
    }, "Please enter a valid calendar date")
    .refine((val) => {
      const parts = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!parts) return true;
      const year = parseInt(parts[1], 10);
      const month = parseInt(parts[2], 10);
      const day = parseInt(parts[3], 10);
      const d = new Date();
      d.setFullYear(year, month - 1, day);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return d <= today;
    }, "Date of birth cannot be in the future"),
  gender: z.enum(["Female", "Male", "Other"], {
    message: "Please select a valid gender (Female, Male, or Other)",
  }),
  address: z
    .string()
    .trim()
    .min(5, "Address must be at least 5 characters")
    .max(300, "Address cannot exceed 300 characters"),
  chief_complaint: z
    .string()
    .trim()
    .min(3, "Chief complaint must be at least 3 characters")
    .max(300, "Chief complaint cannot exceed 300 characters"),
});

type PatientEditFormData = z.infer<typeof patientEditSchema>;

/**
 * Masks Aadhaar number to protect sensitive PII on the edit screen.
 */
function maskAadhaar(aadhaar: string | null | undefined): string {
  if (!aadhaar) return "Not provided";
  const sanitized = aadhaar.replace(/\s+/g, "");
  if (sanitized.length <= 4) {
    return "•••• •••• ••••";
  }
  const last4 = sanitized.slice(-4);
  return `•••• •••• ${last4}`;
}

/**
 * Loading skeleton component for patient edit page.
 */
function PatientEditSkeleton() {
  return (
    <div className="space-y-6 max-w-4xl">
      <Card className="border border-border">
        <CardHeader className="space-y-2 pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-6 w-44 bg-slate-200 animate-pulse rounded" />
              <div className="h-4 w-64 bg-slate-200 animate-pulse rounded" />
            </div>
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
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="h-4 w-32 bg-slate-200 animate-pulse rounded" />
              <div className="h-20 w-full bg-slate-200 animate-pulse rounded" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-32 bg-slate-200 animate-pulse rounded" />
              <div className="h-20 w-full bg-slate-200 animate-pulse rounded" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PatientEditContent({ patientNumber }: { patientNumber: string }) {
  const router = useRouter();
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  // 1. Fetch current patient record
  const {
    data: patient,
    isLoading,
    isError,
    error: fetchError,
    refetch,
  } = usePatient(patientNumber, {
    enabled: Boolean(patientNumber),
  });

  // 2. Patient update mutation hook
  const { mutate: updatePatientMutation, isPending: isSaving } = useUpdatePatient();

  // 3. Form initialization with React Hook Form
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<PatientEditFormData>({
    resolver: zodResolver(patientEditSchema),
    defaultValues: {
      name: "",
      phone: "",
      dob: "",
      gender: "" as unknown as "Female" | "Male" | "Other",
      address: "",
      chief_complaint: "",
    },
  });

  // 4. Prepopulate form fields when patient data is loaded (guarded to protect dirty edits on background refetch)
  React.useEffect(() => {
    if (patient && !isDirty) {
      reset({
        name: patient.name,
        phone: patient.phone,
        dob: patient.dob,
        gender: patient.gender as "Female" | "Male" | "Other",
        address: patient.address,
        chief_complaint: patient.chief_complaint,
      });
    }
  }, [patient, reset, isDirty]);

  const is404 = isApiClientError(fetchError) && fetchError.isNotFound;

  // 5. Submit handler
  const onSubmit = (formData: PatientEditFormData) => {
    setGlobalError(null);

    const updatePayload: PatientUpdateInput = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      dob: formData.dob,
      gender: formData.gender,
      address: formData.address.trim(),
      chief_complaint: formData.chief_complaint.trim(),
    };

    updatePatientMutation(
      {
        patientNumber,
        data: updatePayload,
      },
      {
        onSuccess: () => {
          // Redirect back to the updated patient's details page
          router.push(`/patients/${encodeURIComponent(patientNumber)}`);
        },
        onError: (err) => {
          // 1. Field-level validation errors (FastAPI 422)
          if (err.isValidationError && err.validationErrors) {
            Object.entries(err.validationErrors).forEach(([field, message]) => {
              setError(field as keyof PatientEditFormData, {
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
              "Permission denied. Patient updates are restricted to Admin and Receptionist staff."
            );
            return;
          }

          // 3. Conflict / Duplicate phone errors (FastAPI 409 or 400 with duplicate details)
          if (
            err.isConflict ||
            (err.status === 400 && String(err.detail).toLowerCase().includes("duplicate"))
          ) {
            setGlobalError(
              "Another patient with this phone number already exists in the system."
            );
            return;
          }

          // 4. Fallback API error message
          setGlobalError(err.message || "Failed to update patient record. Please try again.");
        },
      }
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeaderConfig
        title={patient ? `Edit ${patient.name}` : "Edit Patient"}
        description={
          patient
            ? `Update clinical file and contact details for ${patient.patient_number}`
            : "Update patient record"
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Patients", href: "/patients" },
          {
            label: patient?.patient_number || patientNumber || "Details",
            href: `/patients/${encodeURIComponent(patientNumber)}`,
          },
          { label: "Edit", href: `/patients/${encodeURIComponent(patientNumber)}/edit` },
        ]}
        headerActions={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={`/patients/${encodeURIComponent(patientNumber)}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to Patient Record
            </Link>
          </Button>
        }
      />

      {/* 1. Loading Skeleton */}
      {isLoading && <PatientEditSkeleton />}

      {/* 2. 404 / Not Found State */}
      {!isLoading && (is404 || (!patient && !isError)) && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg text-slate-900">
                Patient Record Not Found
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                No active patient file matches identifier{" "}
                <span className="font-mono font-medium text-slate-800">
                  {patientNumber || "—"}
                </span>
                . The record may have been deactivated or never existed.
              </p>
            </div>
            <div className="pt-2">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/patients">
                  <ArrowLeft className="h-4 w-4" />
                  Return to Patient Directory
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
                Failed to load patient record
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {fetchError instanceof Error
                  ? fetchError.message
                  : "An unexpected error occurred while communicating with the patient service."}
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

      {/* 4. Global Form-Level Error Banner */}
      {!isLoading && globalError && (
        <Card role="alert" aria-live="assertive" className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">{globalError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5. Populated Edit Form */}
      {!isLoading && patient && (
        <Card className="border-border">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  Edit Patient Details
                </CardTitle>
                <CardDescription>
                  Modify contact, demographic, or clinical admission information.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {patient.patient_number}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  ID: #{patient.id}
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Demographics & Contact */}
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
                      disabled={isSaving}
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

                  {/* Phone Number */}
                  <div className="space-y-2">
                    <Label htmlFor="phone">
                      Phone Number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="phone"
                      placeholder="e.g. 9876543210"
                      disabled={isSaving}
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

                  {/* Date of Birth */}
                  <div className="space-y-2">
                    <Label htmlFor="dob">
                      Date of Birth <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="dob"
                      type="date"
                      disabled={isSaving}
                      aria-invalid={Boolean(errors.dob)}
                      aria-describedby={errors.dob ? "dob-error" : undefined}
                      {...register("dob")}
                    />
                    {errors.dob && (
                      <p id="dob-error" className="text-xs text-destructive">
                        {errors.dob.message}
                      </p>
                    )}
                  </div>

                  {/* Gender */}
                  <div className="space-y-2">
                    <Label htmlFor="gender">
                      Gender <span className="text-destructive">*</span>
                    </Label>
                    <select
                      id="gender"
                      disabled={isSaving}
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
                      <p id="gender-error" className="text-xs text-destructive">
                        {errors.gender.message}
                      </p>
                    )}
                  </div>

                  {/* Read-Only Aadhaar (Masked per Security Rule) */}
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Aadhaar Number
                      </span>
                      <span className="text-xs flex items-center gap-1 text-slate-400">
                        <Lock className="h-3 w-3" /> Permanent Identifier (Non-editable)
                      </span>
                    </Label>
                    <div className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-muted/50 px-3 py-1 text-sm font-mono text-muted-foreground">
                      <span>{maskAadhaar(patient.aadhaar)}</span>
                      <Badge variant="outline" className="text-[10px] font-sans">
                        Immutable
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      National identifier cannot be modified after initial registration.
                    </p>
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
                      disabled={isSaving}
                      aria-invalid={Boolean(errors.address)}
                      aria-describedby={errors.address ? "address-error" : undefined}
                      {...register("address")}
                    />
                    {errors.address && (
                      <p id="address-error" className="text-xs text-destructive">
                        {errors.address.message}
                      </p>
                    )}
                  </div>

                  {/* Chief Complaint */}
                  <div className="space-y-2">
                    <Label htmlFor="chief_complaint">
                      Chief Complaint / Reason for Visit <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="chief_complaint"
                      placeholder="Describe symptoms, complaints, or reason for appointment"
                      rows={3}
                      disabled={isSaving}
                      aria-invalid={Boolean(errors.chief_complaint)}
                      aria-describedby={errors.chief_complaint ? "chief_complaint-error" : undefined}
                      {...register("chief_complaint")}
                    />
                    {errors.chief_complaint && (
                      <p id="chief_complaint-error" className="text-xs text-destructive">
                        {errors.chief_complaint.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Record Audit Footer */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground bg-slate-50/60 p-3 rounded-md border border-border/60">
                <Clock className="h-4 w-4 shrink-0" />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>
                    Created by staff: <strong>#{patient.created_by_id ?? "System"}</strong>
                  </span>
                  {patient.updated_by_id && (
                    <span>
                      Last updated by: <strong>#{patient.updated_by_id}</strong>
                    </span>
                  )}
                </div>
              </div>

              <Separator />

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button asChild variant="outline" disabled={isSaving}>
                  <Link href={`/patients/${encodeURIComponent(patientNumber)}`}>Cancel</Link>
                </Button>
                <Button type="submit" disabled={isSaving || !isDirty} className="gap-2">
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
      )}
    </div>
  );
}

function PatientEditWrapper({ params }: PatientEditPageProps) {
  const resolvedParams = React.use(params);
  const patientNumber = resolvedParams?.patient_number ?? "";

  return <PatientEditContent patientNumber={patientNumber} />;
}

export default function PatientEditPage({ params }: PatientEditPageProps) {
  return (
    <React.Suspense fallback={<PatientEditSkeleton />}>
      <PatientEditWrapper params={params} />
    </React.Suspense>
  );
}
