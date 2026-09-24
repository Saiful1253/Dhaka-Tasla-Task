import type { RideStatus } from "@/lib/api/types";

export type StatusTone = "pending" | "active" | "moving" | "complete" | "danger";

export const STATUS_PRESENTATION: Record<
  RideStatus,
  { label: string; shortLabel: string; tone: StatusTone; marker: string }
> = {
  REQUESTED: {
    label: "Waiting for driver selection",
    shortLabel: "Waiting",
    tone: "pending",
    marker: "○",
  },
  MATCHED: {
    label: "Driver assigned",
    shortLabel: "Assigned",
    tone: "active",
    marker: "◆",
  },
  DRIVER_ARRIVED: {
    label: "Driver has arrived",
    shortLabel: "Arrived",
    tone: "active",
    marker: "◆",
  },
  STARTED: {
    label: "Ride in progress",
    shortLabel: "In motion",
    tone: "moving",
    marker: "→",
  },
  COMPLETED: {
    label: "Ride completed",
    shortLabel: "Completed",
    tone: "complete",
    marker: "✓",
  },
  CANCELLED: {
    label: "Ride cancelled",
    shortLabel: "Cancelled",
    tone: "danger",
    marker: "×",
  },
};
