import type { PoolStatus, RideStatus } from "@/lib/api/types";

const BENGALI_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function formatTaka(value: number): string {
  const number = Math.max(0, Math.round(value));
  return `৳${String(number)
    .split("")
    .map((digit) => BENGALI_DIGITS[Number(digit)])
    .join("")}`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-BD", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-BD", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatAge(value: string, now: number): string {
  const created = new Date(value).getTime();
  if (Number.isNaN(created) || now <= created) return "just now";
  const seconds = Math.floor((now - created) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function formatDistance(value: number): string {
  return `${value.toFixed(1)} km`;
}

export function titleCaseStatus(status: RideStatus | PoolStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
