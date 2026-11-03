"use client";

import * as React from "react";
import {
  FileText,
  Printer,
  Pencil,
  Plus,
  HeartPulse,
  Pill,
  Calendar,
  Stethoscope,
} from "lucide-react";
import type { Appointment } from "@/types/appointment";
import { useAppointmentPrescription } from "@/features/prescriptions/hooks/use-prescriptions";
import { useCurrentSessionUser } from "@/lib/auth/use-session";
import { formatClinicDate } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PrescriptionFormDialog } from "./prescription-form-dialog";
import { PrintablePrescriptionSlip } from "./printable-prescription-slip";

interface PrescriptionEncounterCardProps {
  appointment: Appointment;
}

export function PrescriptionEncounterCard({
  appointment,
}: PrescriptionEncounterCardProps) {
  const sessionUser = useCurrentSessionUser();
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [isPrintOpen, setIsPrintOpen] = React.useState(false);

  const {
    data: prescription,
    isLoading,
    refetch,
  } = useAppointmentPrescription(appointment.id);

  // Authorize issuing/editing:
  // Must be Admin, OR the assigned Doctor to this appointment.
  const isAssignedDoctor =
    sessionUser?.role === "DOCTOR" &&
    sessionUser?.provider_id === appointment.provider.id;
  const isAdmin = sessionUser?.role === "ADMIN";
  const isDoctorOrAdmin = isAdmin || isAssignedDoctor;

  const isEligibleStatus =
    appointment.status === "in_progress" || appointment.status === "completed";

  const canManagePrescription = isDoctorOrAdmin && isEligibleStatus;

  if (isLoading) {
    return (
      <Card className="border border-border">
        <CardHeader className="pb-3">
          <div className="h-5 w-44 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
        </CardHeader>
        <CardContent>
          <div className="h-28 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl font-serif font-black text-primary">℞</span>
                <CardTitle className="text-base font-semibold text-foreground">
                  Clinical Prescription (℞)
                </CardTitle>
                {prescription ? (
                  <Badge variant="success">Prescribed</Badge>
                ) : (
                  <Badge variant="outline">Not Issued</Badge>
                )}
              </div>
              <CardDescription>
                {prescription
                  ? `Clinical encounter record #${prescription.id} issued on ${formatClinicDate(
                      prescription.created_at
                    )}`
                  : "Medications, dosages, vitals, and clinical instructions for this visit"}
              </CardDescription>
            </div>

            {/* Header Action Buttons */}
            {prescription && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPrintOpen(true)}
                  className="text-xs gap-1.5"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Rx Slip
                </Button>

                {canManagePrescription && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFormOpen(true)}
                    className="text-xs gap-1.5"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Prescription
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {prescription ? (
            <div className="space-y-4">
              {/* Diagnosis & Symptoms Box */}
              <div className="p-3.5 rounded-lg border border-border bg-card space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Stethoscope className="h-3.5 w-3.5 text-primary" />
                    Diagnosis
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {prescription.diagnosis}
                </p>
                {prescription.symptoms && (
                  <p className="text-xs text-muted-foreground italic">
                    Symptoms: {prescription.symptoms}
                  </p>
                )}
              </div>

              {/* Vitals Ribbon */}
              {prescription.vitals &&
                Object.values(prescription.vitals).some(
                  (v) => v !== null && v !== undefined && v !== ""
                ) && (
                  <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <HeartPulse className="h-3.5 w-3.5 text-rose-500" />
                      Recorded Vitals
                    </span>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {prescription.vitals.blood_pressure && (
                        <span className="px-2.5 py-1 rounded bg-background border border-border">
                          BP:{" "}
                          <strong className="text-foreground">
                            {prescription.vitals.blood_pressure}
                          </strong>
                        </span>
                      )}
                      {prescription.vitals.pulse && (
                        <span className="px-2.5 py-1 rounded bg-background border border-border">
                          Pulse:{" "}
                          <strong className="text-foreground">
                            {prescription.vitals.pulse} bpm
                          </strong>
                        </span>
                      )}
                      {prescription.vitals.temperature && (
                        <span className="px-2.5 py-1 rounded bg-background border border-border">
                          Temp:{" "}
                          <strong className="text-foreground">
                            {prescription.vitals.temperature}
                          </strong>
                        </span>
                      )}
                      {prescription.vitals.weight && (
                        <span className="px-2.5 py-1 rounded bg-background border border-border">
                          Weight:{" "}
                          <strong className="text-foreground">
                            {prescription.vitals.weight}
                          </strong>
                        </span>
                      )}
                      {prescription.vitals.spo2 && (
                        <span className="px-2.5 py-1 rounded bg-background border border-border">
                          SpO2:{" "}
                          <strong className="text-foreground">
                            {prescription.vitals.spo2}%
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                )}

              {/* Prescribed Medications Table */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Pill className="h-3.5 w-3.5 text-primary" />
                  Prescribed Medications ({prescription.medications.length})
                </span>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold">
                      <tr>
                        <th className="py-2 px-3 w-8 text-center">#</th>
                        <th className="py-2 px-3">Medicine & Strength</th>
                        <th className="py-2 px-3">Dosage</th>
                        <th className="py-2 px-3">Frequency</th>
                        <th className="py-2 px-3">Duration</th>
                        <th className="py-2 px-3">Instructions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {prescription.medications.map((item, idx) => (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="py-2.5 px-3 text-center text-muted-foreground font-mono">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-foreground">
                            {item.name}
                          </td>
                          <td className="py-2.5 px-3 text-foreground">
                            {item.dosage}
                          </td>
                          <td className="py-2.5 px-3 text-foreground">
                            {item.frequency}
                          </td>
                          <td className="py-2.5 px-3 text-foreground">
                            {item.duration}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground italic">
                            {item.instructions || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Advice & Follow-Up */}
              {(prescription.advice || prescription.follow_up_date) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  {prescription.advice && (
                    <div className="p-3 rounded-lg border border-border bg-card space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Clinical Advice
                      </span>
                      <p className="text-xs text-foreground whitespace-pre-line leading-relaxed">
                        {prescription.advice}
                      </p>
                    </div>
                  )}

                  {prescription.follow_up_date && (
                    <div className="p-3 rounded-lg border border-border bg-card space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Follow-Up Review
                      </span>
                      <p className="text-xs font-semibold text-foreground">
                        {formatClinicDate(prescription.follow_up_date)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Prescription Not Issued Yet */
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 rounded-lg border border-dashed border-border bg-muted/20">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <span className="font-serif font-black text-lg">℞</span>
              </div>

              <div className="space-y-1 max-w-md">
                <h4 className="text-sm font-semibold text-foreground">
                  No Clinical Prescription Recorded
                </h4>
                <p className="text-xs text-muted-foreground">
                  {isEligibleStatus
                    ? "This encounter is active or completed. Authorized doctors can issue a clinical prescription with diagnosis, vitals, and medication instructions."
                    : appointment.status === "cancelled" || appointment.status === "no_show"
                    ? "Consultation was cancelled or recorded as no-show. Prescriptions cannot be issued."
                    : "Prescriptions can be generated once the consultation is started (in progress) or completed."}
                </p>
              </div>

              {canManagePrescription && (
                <Button
                  size="sm"
                  onClick={() => setIsFormOpen(true)}
                  className="gap-1.5 text-xs mt-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Issue Prescription (℞)
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prescription Form Dialog */}
      <PrescriptionFormDialog
        appointmentId={appointment.id}
        initialPrescription={prescription}
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSuccess={() => {
          refetch();
        }}
      />

      {/* Printable Slip Dialog */}
      {prescription && (
        <PrintablePrescriptionSlip
          prescription={prescription}
          open={isPrintOpen}
          onOpenChange={setIsPrintOpen}
        />
      )}
    </>
  );
}
