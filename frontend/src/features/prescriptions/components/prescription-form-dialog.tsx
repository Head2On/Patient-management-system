"use client";

import * as React from "react";
import { Plus, Trash2, Loader2, AlertCircle, Stethoscope, HeartPulse, Pill, FileText, Calendar } from "lucide-react";
import type {
  Prescription,
  MedicationItem,
  PrescriptionCreateInput,
  PrescriptionUpdateInput,
} from "@/types/prescription";
import {
  useCreatePrescription,
  useUpdatePrescription,
} from "@/features/prescriptions/hooks/use-prescriptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PrescriptionFormDialogProps {
  appointmentId: number;
  initialPrescription?: Prescription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (prescription: Prescription) => void;
}

const DEFAULT_MEDICATION: MedicationItem = {
  name: "",
  dosage: "1 Tablet",
  frequency: "Twice daily (BD)",
  duration: "5 days",
  instructions: "After meals",
};

interface InnerFormProps {
  appointmentId: number;
  initialPrescription?: Prescription | null;
  onClose: () => void;
  onSuccess?: (prescription: Prescription) => void;
}

function PrescriptionFormInner({
  appointmentId,
  initialPrescription,
  onClose,
  onSuccess,
}: InnerFormProps) {
  const isEditing = Boolean(initialPrescription);

  const [diagnosis, setDiagnosis] = React.useState(
    initialPrescription?.diagnosis ?? ""
  );
  const [symptoms, setSymptoms] = React.useState(
    initialPrescription?.symptoms ?? ""
  );
  const [bp, setBp] = React.useState(
    initialPrescription?.vitals?.blood_pressure ?? ""
  );
  const [pulse, setPulse] = React.useState<string>(
    initialPrescription?.vitals?.pulse !== undefined &&
      initialPrescription?.vitals?.pulse !== null
      ? String(initialPrescription.vitals.pulse)
      : ""
  );
  const [temp, setTemp] = React.useState(
    initialPrescription?.vitals?.temperature ?? ""
  );
  const [weight, setWeight] = React.useState(
    initialPrescription?.vitals?.weight ?? ""
  );
  const [spo2, setSpo2] = React.useState<string>(
    initialPrescription?.vitals?.spo2 !== undefined &&
      initialPrescription?.vitals?.spo2 !== null
      ? String(initialPrescription.vitals.spo2)
      : ""
  );
  const [advice, setAdvice] = React.useState(
    initialPrescription?.advice ?? ""
  );
  const [followUpDate, setFollowUpDate] = React.useState(
    initialPrescription?.follow_up_date ?? ""
  );
  const [medications, setMedications] = React.useState<MedicationItem[]>(() => {
    if (
      initialPrescription?.medications &&
      initialPrescription.medications.length > 0
    ) {
      return initialPrescription.medications.map((m) => ({ ...m }));
    }
    return [{ ...DEFAULT_MEDICATION }];
  });
  const [formError, setFormError] = React.useState<string | null>(null);

  const createMutation = useCreatePrescription();
  const updateMutation = useUpdatePrescription();
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleAddMedication = () => {
    setMedications((prev) => [...prev, { ...DEFAULT_MEDICATION }]);
  };

  const handleRemoveMedication = (index: number) => {
    if (medications.length <= 1) return;
    setMedications((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMedicationChange = (
    index: number,
    field: keyof MedicationItem,
    value: string
  ) => {
    setMedications((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
      return updated;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    const trimmedDiagnosis = diagnosis.trim();
    if (!trimmedDiagnosis) {
      setFormError("Clinical Diagnosis is required.");
      return;
    }

    if (medications.length === 0) {
      setFormError("At least one prescribed medication is required.");
      return;
    }

    for (let i = 0; i < medications.length; i++) {
      const item = medications[i];
      if (!item.name.trim()) {
        setFormError(`Medication #${i + 1} requires a medicine name.`);
        return;
      }
      if (!item.dosage.trim()) {
        setFormError(`Medication #${i + 1} (${item.name}) requires a dosage.`);
        return;
      }
    }

    // Prepare vitals
    const pulseNum = pulse.trim() ? parseInt(pulse.trim(), 10) : null;
    const spo2Num = spo2.trim() ? parseInt(spo2.trim(), 10) : null;

    const hasAnyVitals =
      bp.trim() ||
      pulseNum !== null ||
      temp.trim() ||
      weight.trim() ||
      spo2Num !== null;

    const vitalsPayload = hasAnyVitals
      ? {
          blood_pressure: bp.trim() || null,
          pulse: pulseNum,
          temperature: temp.trim() || null,
          weight: weight.trim() || null,
          spo2: spo2Num,
        }
      : null;

    if (isEditing && initialPrescription) {
      const updateData: PrescriptionUpdateInput = {
        diagnosis: trimmedDiagnosis,
        symptoms: symptoms.trim() || null,
        vitals: vitalsPayload,
        medications: medications.map((m) => ({
          name: m.name.trim(),
          dosage: m.dosage.trim(),
          frequency: m.frequency.trim(),
          duration: m.duration.trim(),
          instructions: m.instructions?.trim() || null,
        })),
        advice: advice.trim() || null,
        follow_up_date: followUpDate.trim() || null,
      };

      updateMutation.mutate(
        {
          prescriptionId: initialPrescription.id,
          data: updateData,
        },
        {
          onSuccess: (updated) => {
            onClose();
            onSuccess?.(updated);
          },
          onError: (err) => {
            setFormError(err.message || "Failed to update prescription.");
          },
        }
      );
    } else {
      const createData: PrescriptionCreateInput = {
        appointment_id: appointmentId,
        diagnosis: trimmedDiagnosis,
        symptoms: symptoms.trim() || null,
        vitals: vitalsPayload,
        medications: medications.map((m) => ({
          name: m.name.trim(),
          dosage: m.dosage.trim(),
          frequency: m.frequency.trim(),
          duration: m.duration.trim(),
          instructions: m.instructions?.trim() || null,
        })),
        advice: advice.trim() || null,
        follow_up_date: followUpDate.trim() || null,
      };

      createMutation.mutate(createData, {
        onSuccess: (created) => {
          onClose();
          onSuccess?.(created);
        },
        onError: (err) => {
          setFormError(err.message || "Failed to issue prescription.");
        },
      });
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-primary font-bold text-lg">
          <span className="font-serif font-black text-xl">℞</span>
          {isEditing ? "Edit Clinical Prescription" : "Issue New Prescription (℞)"}
        </DialogTitle>
        <DialogDescription>
          {isEditing
            ? `Update clinical findings and prescribed medications for Encounter #${appointmentId}.`
            : `Record medical diagnosis, vitals, and medication instructions for Encounter #${appointmentId}.`}
        </DialogDescription>
      </DialogHeader>

      {formError && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 pt-2">
        {/* Section 1: Clinical Diagnosis & Symptoms */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border pb-1">
            <Stethoscope className="h-3.5 w-3.5" />
            Diagnosis & Clinical Observations
          </h3>

          <div className="space-y-1.5">
            <Label htmlFor="rx-diagnosis" className="text-xs font-medium">
              Clinical Diagnosis <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rx-diagnosis"
              placeholder="e.g. Acute Upper Respiratory Tract Infection, Type 2 Diabetes"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              disabled={isSubmitting}
              className="text-sm"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rx-symptoms" className="text-xs font-medium">
              Presenting Symptoms / Chief Complaints
            </Label>
            <Textarea
              id="rx-symptoms"
              placeholder="e.g. Low-grade fever for 3 days, dry cough, throat irritation..."
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              disabled={isSubmitting}
              rows={2}
              className="text-xs"
            />
          </div>
        </div>

        {/* Section 2: Clinical Vitals */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border pb-1">
            <HeartPulse className="h-3.5 w-3.5" />
            Patient Vitals (Optional)
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label htmlFor="vital-bp" className="text-[11px] text-muted-foreground">
                BP (mmHg)
              </Label>
              <Input
                id="vital-bp"
                placeholder="120/80"
                value={bp}
                onChange={(e) => setBp(e.target.value)}
                disabled={isSubmitting}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="vital-pulse" className="text-[11px] text-muted-foreground">
                Pulse (bpm)
              </Label>
              <Input
                id="vital-pulse"
                type="number"
                placeholder="72"
                value={pulse}
                onChange={(e) => setPulse(e.target.value)}
                disabled={isSubmitting}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="vital-temp" className="text-[11px] text-muted-foreground">
                Temp (°F / °C)
              </Label>
              <Input
                id="vital-temp"
                placeholder="98.6 F"
                value={temp}
                onChange={(e) => setTemp(e.target.value)}
                disabled={isSubmitting}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="vital-weight" className="text-[11px] text-muted-foreground">
                Weight (kg)
              </Label>
              <Input
                id="vital-weight"
                placeholder="70 kg"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                disabled={isSubmitting}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="vital-spo2" className="text-[11px] text-muted-foreground">
                SpO2 (%)
              </Label>
              <Input
                id="vital-spo2"
                type="number"
                placeholder="98"
                value={spo2}
                onChange={(e) => setSpo2(e.target.value)}
                disabled={isSubmitting}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Medication Items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Pill className="h-3.5 w-3.5" />
              Prescribed Medications (℞) <span className="text-destructive">*</span>
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddMedication}
              disabled={isSubmitting}
              className="h-7 text-xs gap-1"
            >
              <Plus className="h-3 w-3" />
              Add Medicine
            </Button>
          </div>

          <div className="space-y-3">
            {medications.map((item, index) => (
              <div
                key={index}
                className="p-3 rounded-lg border border-border bg-card space-y-3 relative group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <span className="font-serif">℞</span> #{index + 1}
                  </span>
                  {medications.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveMedication(index)}
                      disabled={isSubmitting}
                      className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                      title="Remove medicine"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Medicine Name & Strength <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="e.g. Amoxicillin 500mg, Paracetamol 650mg"
                      value={item.name}
                      onChange={(e) =>
                        handleMedicationChange(index, "name", e.target.value)
                      }
                      disabled={isSubmitting}
                      className="h-8 text-xs"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Dosage <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="e.g. 1 Tablet, 5ml"
                      value={item.dosage}
                      onChange={(e) =>
                        handleMedicationChange(index, "dosage", e.target.value)
                      }
                      disabled={isSubmitting}
                      className="h-8 text-xs"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Frequency
                    </Label>
                    <Input
                      placeholder="e.g. Twice daily (BD), TID"
                      value={item.frequency}
                      onChange={(e) =>
                        handleMedicationChange(index, "frequency", e.target.value)
                      }
                      disabled={isSubmitting}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Duration
                    </Label>
                    <Input
                      placeholder="e.g. 5 days, 2 weeks, Ongoing"
                      value={item.duration}
                      onChange={(e) =>
                        handleMedicationChange(index, "duration", e.target.value)
                      }
                      disabled={isSubmitting}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Special Instructions
                    </Label>
                    <Input
                      placeholder="e.g. Take after meals, with plenty of water"
                      value={item.instructions || ""}
                      onChange={(e) =>
                        handleMedicationChange(index, "instructions", e.target.value)
                      }
                      disabled={isSubmitting}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: Clinical Advice & Follow-Up */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border pb-1">
            <FileText className="h-3.5 w-3.5" />
            Advice & Follow-Up Schedule
          </h3>

          <div className="space-y-1.5">
            <Label htmlFor="rx-advice" className="text-xs font-medium">
              Dietary & General Clinical Advice
            </Label>
            <Textarea
              id="rx-advice"
              placeholder="e.g. Adequate bed rest, avoid oily food, warm saline gargles..."
              value={advice}
              onChange={(e) => setAdvice(e.target.value)}
              disabled={isSubmitting}
              rows={2}
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="rx-followup" className="text-xs font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Follow-Up Review Date (Optional)
            </Label>
            <Input
              id="rx-followup"
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              disabled={isSubmitting}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-border gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {isEditing ? "Save Prescription Changes" : "Issue & Sign Prescription (℞)"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function PrescriptionFormDialog({
  appointmentId,
  initialPrescription,
  open,
  onOpenChange,
  onSuccess,
}: PrescriptionFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {open && (
          <PrescriptionFormInner
            key={initialPrescription?.id ? `rx-${initialPrescription.id}` : `new-${appointmentId}`}
            appointmentId={appointmentId}
            initialPrescription={initialPrescription}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
