import type { RideStatus } from "@/lib/api/types";
import { STATUS_PRESENTATION } from "@/lib/statuses";

interface StatusBadgeProps {
  status: RideStatus;
  compact?: boolean;
  className?: string;
}

const toneClasses: Record<keyof typeof STATUS_PRESENTATION, string> = {
  REQUESTED:
    "border-amber/60 bg-amber/15 text-[#67430A] before:bg-amber",
  MATCHED: "border-lime/70 bg-lime/20 text-ink before:bg-lime",
  DRIVER_ARRIVED: "border-cyan/70 bg-cyan/15 text-[#07464A] before:bg-cyan",
  STARTED: "border-cyan bg-cyan/20 text-[#063F43] before:bg-cyan",
  COMPLETED:
    "border-ink/20 bg-ink/5 text-ink/70 before:bg-ink/50",
  CANCELLED:
    "border-coral/60 bg-coral/10 text-[#84271F] before:bg-coral",
};

export function StatusBadge({
  status,
  compact = false,
  className = "",
}: StatusBadgeProps) {
  const presentation = STATUS_PRESENTATION[status];

  return (
    <span
      className={`inline-flex w-fit items-center gap-2 border px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.11em] before:mr-0.5 before:h-1.5 before:w-1.5 before:rounded-full before:content-[''] ${toneClasses[status]} ${className}`}
    >
      <span aria-hidden="true">{presentation.marker}</span>
      {compact ? presentation.shortLabel : presentation.label}
    </span>
  );
}
