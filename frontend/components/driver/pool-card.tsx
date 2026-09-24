"use client";

import {
  ArrowRight,
  CarFront,
  CheckCircle2,
  CircleDot,
  Clock3,
  Flag,
  History,
  MapPin,
  Play,
  Radio,
  Trash2,
  UsersRound,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SeatMeter } from "@/components/ui/seat-meter";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DriverPool, PoolStatus } from "@/lib/api/types";
import { formatDateTime, formatTaka } from "@/lib/format";

export type PoolAction = "arrived" | "start" | "complete" | "cancel";

interface PoolCardProps {
  pool: DriverPool;
  actionPending: string | null;
  onAction: (poolId: number, action: Exclude<PoolAction, "cancel">) => void;
  onCancel: (pool: DriverPool) => void;
  onDeleteHistory: (pool: DriverPool) => void;
}

interface NextAction {
  action: Exclude<PoolAction, "cancel">;
  label: string;
  Icon: typeof Flag;
}

const NEXT_ACTION: Partial<Record<PoolStatus, NextAction>> = {
  MATCHED: { action: "arrived", label: "Mark driver arrived", Icon: Flag },
  DRIVER_ARRIVED: { action: "start", label: "Start the ride", Icon: Play },
  STARTED: { action: "complete", label: "Complete the ride", Icon: CheckCircle2 },
};

export function PoolCard({
  pool,
  actionPending,
  onAction,
  onCancel,
  onDeleteHistory,
}: PoolCardProps) {
  const nextAction = NEXT_ACTION[pool.status];
  const remaining = pool.capacity - pool.seatsTaken;
  const NextIcon = nextAction?.Icon;

  return (
    <article className="manifest-card ticket-notch">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
        <div className="border-b border-ink/10 bg-paper/65 p-5 lg:border-b-0 lg:border-r lg:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-ink/65">
                Live dispatch manifest
              </p>
              <h3 className="mt-2 font-display text-3xl font-bold tracking-[-0.06em] text-ink">
                Pool #{String(pool.id).padStart(3, "0")}
              </h3>
            </div>
            <StatusBadge status={pool.status} />
          </div>

          <div className="mt-6 flex items-center gap-3 border-y border-dashed border-ink/20 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-ink text-lime">
              <CarFront aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold text-ink">{pool.vehicle.name}</p>
              <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-ink/65">
                {pool.vehicle.plate ?? "Vehicle plate unavailable"} · pool vehicle
              </p>
            </div>
            <p className="font-display text-2xl font-bold tracking-[-0.05em] text-ink">
              {pool.seatsTaken}
              <span className="text-sm text-ink/35">/{pool.capacity}</span>
            </p>
          </div>

          <SeatMeter
            taken={pool.seatsTaken}
            capacity={pool.capacity}
            label="Manifest capacity"
            lastSeatMessage="The vehicle’s last seat is held"
            className="mt-5"
          />

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="border border-ink/10 bg-porcelain p-3">
              <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-ink/65">
                Passengers
              </p>
              <p className="mt-1 flex items-center gap-1.5 font-display text-sm font-bold">
                <UsersRound aria-hidden="true" className="h-4 w-4" />
                {pool.members.length} onboard
              </p>
            </div>
            <div className="border border-ink/10 bg-porcelain p-3">
              <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-ink/65">
                Opened
              </p>
              <p className="mt-1 flex items-center gap-1.5 font-display text-sm font-bold">
                <Clock3 aria-hidden="true" className="h-4 w-4" />
                {formatDateTime(pool.createdAt)}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 pl-8 lg:p-6 lg:pl-9">
          <div className="flex items-center justify-between gap-3 border-b border-ink/10 pb-3">
            <div>
              <p className="eyebrow">Passenger roster</p>
              <p className="mt-1 text-xs text-ink/65">Driver manifest: routes and assigned fares. Passenger views keep other fares private.</p>
            </div>
            <span className="flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-ink/65">
              <Radio aria-hidden="true" className="h-3.5 w-3.5 text-[#2D6814]" />
              Manifest
            </span>
          </div>

          <ul className="divide-y divide-ink/10" aria-label="Passengers in this pool">
            {pool.members.map((member, index) => (
              <li key={member.requestId} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-ink/15 bg-paper font-mono text-[10px] font-semibold">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-bold text-ink">
                        {member.passenger.name}
                      </p>
                      <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-ink/65">
                        Request #{member.requestId} · {member.seats}{" "}
                        {member.seats === 1 ? "seat" : "seats"}
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">
                    {formatTaka(member.fareTaka)}
                  </p>
                </div>
                <div className="mt-3 flex items-start gap-2 border-l-2 border-cyan pl-3 text-xs font-semibold leading-5 text-ink/70">
                  <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink/35" />
                  <span className="break-words">
                    {member.pickup}
                    <ArrowRight aria-hidden="true" className="mx-1.5 inline h-3 w-3 text-ink/35" />
                    {member.dest}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <details className="group mt-2 border-y border-dashed border-ink/20 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-ink/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan">
              <span className="flex items-center gap-2">
                <History aria-hidden="true" className="h-3.5 w-3.5" />
                Event trail · {pool.events.length}
              </span>
              <span className="transition group-open:rotate-45" aria-hidden="true">+</span>
            </summary>
            <ol className="mt-3 space-y-2 border-l border-cyan/40 pl-3">
              {pool.events.map((event) => (
                <li key={event.id} className="relative text-[11px] leading-4 text-ink/65 before:absolute before:-left-[17px] before:top-1.5 before:h-1.5 before:w-1.5 before:bg-cyan">
                  <span className="font-semibold text-ink">
                    {event.fromStatus === "NONE"
                      ? "Pool opened"
                      : `${event.fromStatus} → ${event.toStatus}`}
                  </span>
                  <span className="ml-2 font-mono text-[9px] text-ink/60">
                    {formatDateTime(event.at)}
                  </span>
                  {event.note ? <span className="mt-0.5 block">{event.note}</span> : null}
                </li>
              ))}
            </ol>
          </details>

          <div className="mt-2 border-t border-dashed border-ink/20 pt-4">
            {nextAction && NextIcon ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-xs font-semibold text-ink/65">
                  <CircleDot
                    aria-hidden="true"
                    className={`h-4 w-4 ${pool.status === "STARTED" ? "text-cyan" : "text-[#2D6814]"}`}
                  />
                  {pool.status === "MATCHED"
                    ? remaining === 1
                      ? "Last seat is held. Move to pickup when ready."
                      : "Seats are held. Move to the first pickup."
                    : pool.status === "DRIVER_ARRIVED"
                      ? "Everyone is accounted for. Start when boarding is complete."
                      : "The ride is moving. Complete it at the destination."}
                </p>
                <Button
                  size="sm"
                  variant="lime"
                  loading={actionPending === `${pool.id}:${nextAction.action}`}
                  disabled={Boolean(actionPending)}
                  onClick={() => onAction(pool.id, nextAction.action)}
                  leadingIcon={<NextIcon aria-hidden="true" className="h-3.5 w-3.5" />}
                >
                  {nextAction.label}
                </Button>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-xs font-semibold text-ink/65">
                {pool.status === "COMPLETED" ? (
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[#2D6814]" />
                ) : (
                  <XCircle aria-hidden="true" className="h-4 w-4 text-[#8A281F]" />
                )}
                {pool.status === "COMPLETED"
                  ? "This manifest is closed and retained for history."
                  : "This manifest was cancelled and retained for history."}
              </p>
            )}

            {pool.status === "COMPLETED" || pool.status === "CANCELLED" ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                disabled={Boolean(actionPending)}
                onClick={() => onDeleteHistory(pool)}
                leadingIcon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />}
              >
                Remove from history
              </Button>
            ) : null}

            {pool.status === "MATCHED" ? (
              <button
                type="button"
                disabled={Boolean(actionPending)}
                onClick={() => onCancel(pool)}
                className="mt-3 inline-flex min-h-10 items-center gap-2 px-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8A281F] transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral disabled:opacity-40"
              >
                <XCircle aria-hidden="true" className="h-4 w-4" />
                Cancel matched pool
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
