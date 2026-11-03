import { z } from "zod";

/**
 * Validation schema aligned with backend FastAPI model constraints:
 * - name: 2-300 chars, trimmed
 * - specialization: 2-300 chars, trimmed
 * - phone: 10-20 chars, digits, spaces, hyphens, '+', parentheses; at least 10 digits
 * - email: optional valid email address (converted to null if empty)
 * - post: strictly "MD" or "MS" enum
 */
export const providerFormSchema = z.object({
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
    .min(10, "Phone number must be at least 10 characters")
    .max(20, "Phone number cannot exceed 20 characters")
    .regex(
      /^[0-9+\-() ]+$/,
      "Phone number can only contain digits, spaces, hyphens, '+', and parentheses"
    )
    .refine(
      (val) => (val.match(/\d/g) || []).length >= 10,
      "Phone number must contain at least 10 digits"
    ),
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

export type ProviderFormData = z.infer<typeof providerFormSchema>;
