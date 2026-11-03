import { z } from "zod";

/**
 * Validation schema aligned with backend FastAPI model constraints:
 * - name: 2-200 chars
 * - phone: 10-15 digits
 * - dob: valid date string, must not be in the future
 * - gender: non-empty selection (Male, Female, Other)
 * - address: 5-300 chars
 * - chief_complaint: 3-300 chars
 * - aadhaar: optional 12-digit number (normalized before submission)
 */
export const patientFormSchema = z.object({
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
  aadhaar: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => !val || /^\d{12}$/.test(val.replace(/\s+/g, "")),
      "Aadhaar number must be exactly 12 digits"
    ),
});

export type PatientFormData = z.infer<typeof patientFormSchema>;
