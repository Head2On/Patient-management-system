"use client";

import * as React from "react";
import Link from "next/link";
import {
  Printer,
  Stethoscope,
  Calendar,
  Pill,
  ChevronRight,
} from "lucide-react";
import type { Prescription } from "@/types/prescription";
import { usePatientPrescriptions } from "@/features/prescriptions/hooks/use-prescriptions";
import { formatClinicDate } from "@/lib/datetime";
import { formatDoctorName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PrintablePrescriptionSlip } from "./printable-prescription-slip";

interface PatientPrescriptionsListProps {
  patientId: number;
}

export function PatientPrescriptionsList({
  patientId,
}: PatientPrescriptionsListProps) {
  const [selectedPrescription, setSelectedPrescription] =
    React.useState<Prescription | null>(null);

  const {
    data: prescriptions,
    isLoading,
    isError,
  } = usePatientPrescriptions(patientId);

  if (isLoading) {
    return (
      <Card className="border border-border">
        <CardHeader className="pb-3">
          <div className="h-5 w-44 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-16 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
          <div className="h-16 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !prescriptions || prescriptions.length === 0) {
    return (
      <Card className="border border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <span className="font-serif font-black text-lg text-primary">℞</span>
            Clinical Prescriptions & Medical Records
          </CardTitle>
          <CardDescription>
            Historical consultations, medications, and advice
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-2 rounded-lg border border-dashed border-border bg-muted/20">
            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <Pill className="h-4 w-4" />
            </div>
            <p className="text-xs text-muted-foreground">
              No clinical prescriptions recorded for this patient yet.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <span className="font-serif font-black text-lg text-primary">℞</span>
                Prescription History ({prescriptions.length})
              </CardTitle>
              <CardDescription>
                Chronological list of clinical encounters and prescriptions
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {prescriptions.map((rx) => {
            const docName = rx.provider?.name
              ? formatDoctorName(rx.provider.name)
              : `Doctor #${rx.provider_id}`;

            return (
              <div
                key={rx.id}
                className="p-4 rounded-lg border border-border bg-card hover:bg-muted/10 transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-foreground">
                      {rx.diagnosis}
                    </span>
                    <Badge variant="outline" className="text-[11px] font-mono">
                      Rx #{rx.id}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Stethoscope className="h-3 w-3 text-primary" />
                      {docName}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatClinicDate(rx.created_at)}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-mono">
                      Visit #{rx.appointment_id}
                    </span>
                  </div>

                  {/* Medications preview */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {rx.medications.map((m, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-muted text-muted-foreground font-medium"
                      >
                        {m.name} ({m.dosage})
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPrescription(rx)}
                    className="text-xs gap-1.5"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print Slip
                  </Button>

                  <Button asChild variant="ghost" size="sm" className="text-xs">
                    <Link href={`/appointments/${rx.appointment_id}`}>
                      Visit Details
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Printable Slip Preview Modal */}
      {selectedPrescription && (
        <PrintablePrescriptionSlip
          prescription={selectedPrescription}
          open={Boolean(selectedPrescription)}
          onOpenChange={(open) => {
            if (!open) setSelectedPrescription(null);
          }}
        />
      )}
    </>
  );
}
