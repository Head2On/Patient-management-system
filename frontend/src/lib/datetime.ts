/**
 * CareDesk Clinic Timezone and DateTime Utilities
 * Standardized to Asia/Kolkata (IST, UTC+05:30) for clinical operations.
 */

export const CLINIC_TIMEZONE = "Asia/Kolkata";

/**
 * Formats an ISO datetime string into a localized date string in the clinic's timezone.
 * Example: "Mon, Nov 2, 2026"
 */
export function formatClinicDate(isoString: string): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: CLINIC_TIMEZONE,
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d);
  } catch {
    return isoString;
  }
}

/**
 * Formats an ISO datetime string into a full date and time string in the clinic's timezone.
 * Example: "Monday, November 2, 2026, 10:00 AM IST"
 */
export function formatClinicDateTime(isoString: string): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: CLINIC_TIMEZONE,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(d);
  } catch {
    return isoString;
  }
}

/**
 * Formats start and end ISO datetimes into a localized time range in the clinic's timezone.
 * Example: "10:00 AM – 10:30 AM IST"
 */
export function formatClinicTimeRange(
  startIso: string,
  endIso: string,
  includeTimeZone = true
): string {
  if (!startIso) return "—";
  try {
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : null;
    if (isNaN(start.getTime())) return startIso;

    if (!end || isNaN(end.getTime())) {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: CLINIC_TIMEZONE,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        ...(includeTimeZone ? { timeZoneName: "short" as const } : {}),
      }).format(start);
    }

    const shortFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: CLINIC_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const endFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: CLINIC_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...(includeTimeZone ? { timeZoneName: "short" as const } : {}),
    });

    const startStr = shortFormatter.format(start);
    const endStr = endFormatter.format(end);

    return `${startStr} – ${endStr}`;
  } catch {
    return startIso;
  }
}

/**
 * Calculates and formats the duration between start and end ISO datetimes.
 * Example: "30 mins" or "1 hr 15 mins"
 */
export function formatAppointmentDuration(
  startIso: string,
  endIso: string
): string {
  if (!startIso || !endIso) return "—";
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const diffMs = end.getTime() - start.getTime();
    if (isNaN(diffMs) || diffMs <= 0) return "—";

    const totalMinutes = Math.round(diffMs / (1000 * 60));
    if (totalMinutes < 60) {
      return `${totalMinutes} mins`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours} hr ${mins} mins` : `${hours} hr`;
  } catch {
    return "—";
  }
}

/**
 * Converts an ISO datetime string into the HTML datetime-local format ("YYYY-MM-DDTHH:mm")
 * explicitly in the clinic timezone (Asia/Kolkata).
 */
export function isoToClinicDateTimeLocal(isoString: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: CLINIC_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(d);
    const getPart = (type: string) =>
      parts.find((p) => p.type === type)?.value || "";

    const year = getPart("year");
    const month = getPart("month");
    const day = getPart("day");
    let hour = getPart("hour");
    if (hour === "24") hour = "00";
    const minute = getPart("minute");

    return `${year}-${month}-${day}T${hour}:${minute}`;
  } catch {
    return "";
  }
}

/**
 * Converts an HTML datetime-local string ("YYYY-MM-DDTHH:mm") into an ISO 8601 string
 * by attaching the Asia/Kolkata UTC offset (+05:30).
 */
export function clinicDateTimeLocalToIso(localString: string): string {
  if (!localString) return "";
  try {
    const trimmed = localString.slice(0, 16);
    const d = new Date(`${trimmed}:00+05:30`);
    if (isNaN(d.getTime())) return "";
    return d.toISOString();
  } catch {
    return "";
  }
}
