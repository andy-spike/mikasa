import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

/**
 * The day, as the interface stamps it ("1 SEP 2026"). A fixed month table,
 * not the locale: ICU hands back "SEPT" for September in en-GB, and the
 * three-letter rhythm does not bend for one month.
 */
export function formatDayStamp(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
