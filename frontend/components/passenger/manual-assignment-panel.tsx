"use client";

import {
  CheckCircle2,
  Clock3,
  Hand,
  MapPin,
  ShieldCheck,
  TicketCheck,
} from "lucide-react";

import { EmptyState } from "@/components/ui/feedback";
import { StatusBadge } from "@/components/ui/status-badge";
import { isTerminalRide, type Ride } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

interface ManualAssignmentPanelProps {
  ride: Ride | null;
}

function assignmentMessage(ride: Ride): string {
  switch (ride.status) {
    case "REQUESTED":
      return "Your request is queued. It stays unbooked until a driver manually selects it.";
    case "MATCHED":
      return "A driver selected your request and reserved the seat. The trip will not start automatically.";
    case "DRIVER_ARRIVED":
      return "Your driver has arrived. Boarding and the next step remain under driver control.";
    case "STARTED":
      return "The trip is now moving under the driver's manual control.";
    case "COMPLETED":
      return "This manually assigned trip is complete and retained in your history.";
    case "CANCELLED":
      return "This request was cancelled and is no longer available for assignment.";
  }
}

export function ManualAssignmentPanel({ ride }: ManualAssignmentPanelProps) {
  const driverAssigned =
    ride?.status === "MATCHED" || ride?.status === "DRIVER_ARRIVED";
  const tripStarted = ride?.status === "STARTED" || ride?.status === "COMPLETED";

  return (
    <section
      className="overflow-hidden border border-ink/15 bg-porcelain shadow-paper"
      aria-labelledby="manual-assignment-heading"
    >
      <div className="dispatch-grid flex flex-col gap-4 border-b border-cyan/15 p-5 text-porcelain sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="dark-eyebrow">04 / Driver selection</p>
          <h2
            id="manual-assignment-heading"
            className="mt-2 font-display text-2xl font-bold tracking-[-0.05em] sm:text-3xl"
          >
            The driver chooses who rides.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-porcelain/65">
            Every seat is confirmed by the API. A driver must select your waiting
            request manually; passengers never claim a stranger's pool themselves.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2 border border-lime/50 bg-lime/10 px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-lime">
          <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          No auto-booking
        </span>
      </div>

      <div className="p-5 sm:p-6">
        {ride ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
            <div className="border border-ink/15 bg-paper/70 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-ink/65">
                    Assignment ticket
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold tracking-[-0.05em]">
                    Ride #{String(ride.id).padStart(4, "0")}
                  </p>
                </div>
                <StatusBadge status={ride.status} compact />
              </div>
              <div className="mt-4 flex items-start gap-2 border-l-2 border-cyan pl-3">
                <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink/40" />
                <p className="text-sm font-semibold leading-5 text-ink/75">
                  {ride.pickupArea.name}
                  <span className="mx-2 text-ink/30">→</span>
                  {ride.destArea.name}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ink/15 pt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-ink/65">
                <span>{ride.seatsRequested} seat{ride.seatsRequested === 1 ? "" : "s"}</span>
                <span>{formatDateTime(ride.createdAt)}</span>
              </div>
              <p className="mt-4 text-xs leading-5 text-ink/65" aria-live="polite">
                {assignmentMessage(ride)}
              </p>
            </div>

            <ol className="grid gap-3" aria-label="Manual assignment progress">
              <li className="flex items-start gap-3 border border-[#2D6814]/30 bg-[#2D6814]/5 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-ink text-lime">
                  <TicketCheck aria-hidden="true" className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-display text-sm font-bold">1. Request queued</p>
                  <p className="mt-1 text-xs leading-5 text-ink/65">
                    Your route is visible only as a waiting request.
                  </p>
                </div>
                <CheckCircle2 aria-label="Complete" className="ml-auto h-4 w-4 shrink-0 text-[#2D6814]" />
              </li>
              <li className={`flex items-start gap-3 border p-4 ${driverAssigned ? "border-[#2D6814]/30 bg-[#2D6814]/5" : "border-ink/15 bg-paper/55"}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${driverAssigned ? "bg-ink text-lime" : "border border-ink/15 bg-porcelain text-ink/45"}`}>
                  {driverAssigned ? (
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <Hand aria-hidden="true" className="h-4 w-4" />
                  )}
                </span>
                <div>
                  <p className="font-display text-sm font-bold">2. Driver selects passenger</p>
                  <p className="mt-1 text-xs leading-5 text-ink/65">
                    {driverAssigned
                      ? "The driver confirmed your seat on the manifest."
                      : "Wait for a driver to select your compatible request."}
                  </p>
                </div>
                {driverAssigned ? (
                  <CheckCircle2 aria-label="Complete" className="ml-auto h-4 w-4 shrink-0 text-[#2D6814]" />
                ) : (
                  <Clock3 aria-label="Pending" className="ml-auto h-4 w-4 shrink-0 text-ink/35" />
                )}
              </li>
              <li className={`flex items-start gap-3 border p-4 ${tripStarted ? "border-[#2D6814]/30 bg-[#2D6814]/5" : "border-ink/15 bg-paper/55"}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${tripStarted ? "bg-ink text-lime" : "border border-ink/15 bg-porcelain text-ink/45"}`}>
                  {tripStarted ? (
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <Clock3 aria-hidden="true" className="h-4 w-4" />
                  )}
                </span>
                <div>
                  <p className="font-display text-sm font-bold">3. Driver starts the trip</p>
                  <p className="mt-1 text-xs leading-5 text-ink/65">
                    {tripStarted
                      ? "The driver started the manually assigned trip."
                      : "The request will not start running on its own."}
                  </p>
                </div>
                {tripStarted ? (
                  <CheckCircle2 aria-label="Complete" className="ml-auto h-4 w-4 shrink-0 text-[#2D6814]" />
                ) : (
                  <Clock3 aria-label="Pending" className="ml-auto h-4 w-4 shrink-0 text-ink/35" />
                )}
              </li>
            </ol>
          </div>
        ) : (
          <EmptyState
            title="No request is waiting for assignment"
            message="Send a ride request first. It will remain unbooked until a driver manually selects it."
            icon={<Hand aria-hidden="true" className="h-5 w-5" />}
            className="border-0 bg-transparent"
          />
        )}

        <div className="mt-5 flex items-start gap-2 border-t border-dashed border-ink/15 pt-4 text-xs leading-5 text-ink/65">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#2D6814]" />
          <p>
            {ride && isTerminalRide(ride.status)
              ? "This assignment is closed. Its final status remains visible in your private history."
              : "Wait for the assigned driver to select compatible passengers and confirm every seat. This passenger board never books a request."}
          </p>
        </div>
      </div>
    </section>
  );
}
