import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

export function formatSwissDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    return format(parseISO(dateStr), "dd.MM.yyyy", { locale: de });
  } catch {
    return dateStr;
  }
}

export function formatSwissDateTime(
  dateStr: string | null | undefined
): string {
  if (!dateStr) return "-";
  try {
    return format(parseISO(dateStr), "dd.MM.yyyy HH:mm", { locale: de });
  } catch {
    return dateStr;
  }
}

export function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "-";
  return timeStr.substring(0, 5);
}
