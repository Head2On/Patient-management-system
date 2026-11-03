"use client";

import * as React from "react";
import { Printer, X, Calendar } from "lucide-react";
import type { Prescription } from "@/types/prescription";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { formatDoctorName } from "@/lib/utils";
import { formatClinicDate } from "@/lib/datetime";

interface PrintablePrescriptionSlipProps {
  prescription: Prescription;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrintablePrescriptionSlip({
  prescription,
  open,
  onOpenChange,
}: PrintablePrescriptionSlipProps) {
  const handlePrint = () => {
    if (typeof document === "undefined" || typeof window === "undefined") return;

    // Add isolation class to body for print media styling
    document.body.classList.add("printing-slip");

    const cleanup = () => {
      document.body.classList.remove("printing-slip");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);
    window.print();

    // Fallback cleanup in case afterprint does not fire in some browsers
    setTimeout(cleanup, 2000);
  };

  const doctorName = prescription.provider?.name
    ? formatDoctorName(prescription.provider.name)
    : `Doctor #${prescription.provider_id}`;

  const patientName = prescription.patient?.name || `Patient #${prescription.patient_id}`;
  const patientNumber = prescription.patient?.patient_number || `P-${prescription.patient_id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 border border-border">
        {/* Modal Controls (Hidden in Print) */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/40 no-print sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className="font-serif font-black text-lg text-primary">℞</span>
            <span className="text-sm font-semibold text-foreground">
              Clinical Prescription Slip Preview
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
              <Printer className="h-3.5 w-3.5" />
              Print Slip (A4)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              <X className="h-3.5 w-3.5" />
              Close
            </Button>
          </div>
        </div>

        {/* Printable Slip Canvas */}
        <div
          id="caredesk-prescription-slip"
          className="p-8 bg-white text-slate-900 font-sans space-y-6"
        >
          {/* Clinic Brand Header */}
          <div className="border-b-2 border-slate-900 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                  CareDesk Multispecialty Clinic
                </h1>
                <p className="text-xs text-slate-600 font-medium">
                  Center for Comprehensive Clinical Care & Family Health
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Plot 42, Health City Avenue, Sector 5 • New Delhi - 110001
                </p>
                <p className="text-xs text-slate-500">
                  Tel: +91 (011) 2345-6789 • 24x7 Emergency: +91 (011) 2345-9999
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block px-2.5 py-1 text-[11px] font-mono font-bold tracking-wider uppercase border border-slate-900 rounded bg-slate-50">
                  Official Medical Record
                </span>
                <p className="text-xs font-mono text-slate-600 mt-2">
                  Rx ID: #{prescription.id}
                </p>
                <p className="text-xs text-slate-600">
                  Visit #{prescription.appointment_id}
                </p>
              </div>
            </div>
          </div>

          {/* Doctor & Patient Information Banner */}
          <div className="grid grid-cols-2 gap-6 p-4 bg-slate-50 border border-slate-200 rounded-md text-xs">
            {/* Doctor Column */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                Attending Physician
              </span>
              <p className="text-sm font-bold text-slate-900">{doctorName}</p>
              <p className="text-slate-700">
                {prescription.provider?.post || "Consultant Physician"}
                {prescription.provider?.specialization
                  ? ` • ${prescription.provider.specialization}`
                  : ""}
              </p>
              <p className="text-slate-500 font-mono text-[11px]">
                Reg / Doc No: {prescription.provider?.doc_number || `DOC-${prescription.provider_id}`}
              </p>
            </div>

            {/* Patient Column */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                Patient Details
              </span>
              <p className="text-sm font-bold text-slate-900">{patientName}</p>
              <p className="text-slate-700">
                Patient MRN:{" "}
                <span className="font-mono font-semibold">{patientNumber}</span>
              </p>
              <p className="text-slate-500">
                Consultation Date:{" "}
                <span className="font-semibold text-slate-700">
                  {formatClinicDate(prescription.created_at)}
                </span>
              </p>
            </div>
          </div>

          {/* Vitals Ribbon (if available) */}
          {prescription.vitals &&
            Object.values(prescription.vitals).some((v) => v !== null && v !== undefined && v !== "") && (
              <div className="p-3 border border-slate-200 rounded-md bg-white">
                <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block mb-1.5">
                  Recorded Clinical Vitals
                </span>
                <div className="grid grid-cols-5 gap-2 text-xs">
                  {prescription.vitals.blood_pressure && (
                    <div className="p-1.5 bg-slate-50 rounded border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">Blood Pressure</span>
                      <span className="font-semibold text-slate-900">
                        {prescription.vitals.blood_pressure}
                      </span>
                    </div>
                  )}
                  {prescription.vitals.pulse && (
                    <div className="p-1.5 bg-slate-50 rounded border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">Pulse Rate</span>
                      <span className="font-semibold text-slate-900">
                        {prescription.vitals.pulse} bpm
                      </span>
                    </div>
                  )}
                  {prescription.vitals.temperature && (
                    <div className="p-1.5 bg-slate-50 rounded border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">Temperature</span>
                      <span className="font-semibold text-slate-900">
                        {prescription.vitals.temperature}
                      </span>
                    </div>
                  )}
                  {prescription.vitals.weight && (
                    <div className="p-1.5 bg-slate-50 rounded border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">Weight</span>
                      <span className="font-semibold text-slate-900">
                        {prescription.vitals.weight}
                      </span>
                    </div>
                  )}
                  {prescription.vitals.spo2 && (
                    <div className="p-1.5 bg-slate-50 rounded border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">SpO2 Oxygen</span>
                      <span className="font-semibold text-slate-900">
                        {prescription.vitals.spo2}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Clinical Diagnosis & Symptoms */}
          <div className="space-y-2">
            <div className="p-3 bg-slate-50/70 border-l-4 border-slate-900 rounded-r-md">
              <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block">
                Provisional / Clinical Diagnosis
              </span>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {prescription.diagnosis}
              </p>
              {prescription.symptoms && (
                <p className="text-xs text-slate-600 mt-1 italic">
                  Symptoms: {prescription.symptoms}
                </p>
              )}
            </div>
          </div>

          {/* ℞ Symbol & Medication Table */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-300 pb-1">
              <span className="text-2xl font-serif font-black text-slate-900">℞</span>
              <span className="text-xs font-bold tracking-wider uppercase text-slate-700">
                Prescribed Medications & Dosages
              </span>
            </div>

            <table className="w-full text-left text-xs border border-slate-200">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="py-2 px-2.5 w-8 text-center">#</th>
                  <th className="py-2 px-3">Medicine & Strength</th>
                  <th className="py-2 px-3">Dosage</th>
                  <th className="py-2 px-3">Frequency</th>
                  <th className="py-2 px-3">Duration</th>
                  <th className="py-2 px-3">Special Instructions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {prescription.medications.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-2.5 text-center font-mono text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {item.name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-800">
                      {item.dosage}
                    </td>
                    <td className="py-2.5 px-3 text-slate-800">
                      {item.frequency}
                    </td>
                    <td className="py-2.5 px-3 text-slate-800">
                      {item.duration}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 italic">
                      {item.instructions || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Clinical Advice & Lifestyle Instructions */}
          {prescription.advice && (
            <div className="p-3 border border-slate-200 rounded-md bg-slate-50/50 space-y-1">
              <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block">
                Dietary & General Clinical Advice
              </span>
              <p className="text-xs text-slate-800 whitespace-pre-line leading-relaxed">
                {prescription.advice}
              </p>
            </div>
          )}

          {/* Follow-up Date */}
          {prescription.follow_up_date && (
            <div className="flex items-center gap-2 p-2.5 bg-amber-50/70 border border-amber-200 rounded text-xs text-amber-900">
              <Calendar className="h-4 w-4 text-amber-700 shrink-0" />
              <span>
                Recommended follow-up review on:{" "}
                <span className="font-bold">
                  {formatClinicDate(prescription.follow_up_date)}
                </span>
              </span>
            </div>
          )}

          {/* Doctor Signature & Authentication Footer */}
          <div className="pt-8 mt-6 border-t border-slate-300">
            <div className="flex justify-between items-end">
              <div className="text-[10px] text-slate-500 max-w-sm space-y-0.5">
                <p>• Take medications exactly as prescribed with plain water.</p>
                <p>• In case of any adverse allergic reaction, stop medication and report immediately.</p>
                <p>• Generated electronically via CareDesk Patient Management System.</p>
              </div>

              <div className="text-right space-y-1">
                <div className="w-48 border-b border-slate-800 mb-2"></div>
                <p className="text-xs font-bold text-slate-900">{doctorName}</p>
                <p className="text-[11px] text-slate-600">
                  {prescription.provider?.post || "Consultant Physician"}
                </p>
                <p className="text-[10px] text-slate-500 font-mono">
                  Authorized Clinical Signature
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
