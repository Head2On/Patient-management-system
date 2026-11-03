import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a provider's name to guarantee a single, consistent "Dr." prefix
 * without duplicating prefixes if the name already contains "Dr.", "Dr", or multiple "Dr." prefixes.
 * Examples:
 *   "Dr. Rahul Sharma"    -> "Dr. Rahul Sharma"
 *   "Dr. Dr. Rahul"       -> "Dr. Rahul"
 *   "Rahul Sharma"        -> "Dr. Rahul Sharma"
 *   "dr. jane smith"      -> "Dr. jane smith"
 */
export function formatDoctorName(name?: string | null): string {
  if (!name) return "";
  const cleaned = name.trim().replace(/^(dr\.?\s*)+/i, "").trim();
  return `Dr. ${cleaned}`;
}
