import { CircleDollarSign } from "lucide-react";

import { formatDistance, formatTaka } from "@/lib/format";

export interface FareValues {
  baseTaka: number;
  distanceTaka: number;
  discountTaka: number;
  totalTaka: number;
  distanceKm: number;
}

interface FareBreakdownProps {
  fare: FareValues;
  compact?: boolean;
  caption?: string;
  totalLabel?: string;
  className?: string;
}

export function FareBreakdown({
  fare,
  compact = false,
  caption = "Fare breakdown",
  totalLabel = "Final fare",
  className = "",
}: FareBreakdownProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-4 border-b border-ink/10 pb-3">
        <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/65">
          <CircleDollarSign aria-hidden="true" className="h-4 w-4" />
          {caption}
        </p>
        <p className="font-mono text-[10px] font-medium text-ink/65">
          {formatDistance(fare.distanceKm)}
        </p>
      </div>
      <dl className="mt-3 space-y-2.5">
        <div className="flex items-center justify-between gap-4 text-sm">
          <dt className="text-ink/60">Base fare</dt>
          <dd className="font-mono font-medium tabular-nums text-ink">
            {formatTaka(fare.baseTaka)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <dt className="text-ink/60">Distance fare</dt>
          <dd className="font-mono font-medium tabular-nums text-ink">
            {formatTaka(fare.distanceTaka)}
          </dd>
        </div>
        {fare.discountTaka > 0 ? (
          <div className="flex items-center justify-between gap-4 text-sm">
            <dt className="text-ink/60">Pool discount</dt>
            <dd className="font-mono font-medium tabular-nums text-[#2B6811]">
              −{formatTaka(fare.discountTaka)}
            </dd>
          </div>
        ) : null}
      </dl>
      <div
        className={`mt-4 flex items-end justify-between gap-4 border-t border-dashed border-ink/25 pt-4 ${
          compact ? "" : "sm:pt-5"
        }`}
      >
        <div>
          <p className="font-display text-xs font-bold uppercase tracking-[0.12em] text-ink/65">
            {totalLabel}
          </p>
          <p className="mt-1 text-[11px] text-ink/65">Whole Taka · no hidden split</p>
        </div>
        <p className="font-display text-3xl font-bold leading-none tracking-[-0.06em] tabular-nums text-ink sm:text-4xl">
          {formatTaka(fare.totalTaka)}
        </p>
      </div>
    </div>
  );
}
