interface SeatMeterProps {
  taken: number;
  capacity: number;
  label?: string;
  lastSeatMessage?: string;
  dark?: boolean;
  compact?: boolean;
  className?: string;
}

export function SeatMeter({
  taken,
  capacity,
  label = "Seat meter",
  lastSeatMessage,
  dark = false,
  compact = false,
  className = "",
}: SeatMeterProps) {
  const safeCapacity = Math.max(0, capacity);
  const safeTaken = Math.min(Math.max(0, taken), safeCapacity);
  const seats = Array.from({ length: safeCapacity }, (_, index) => index);
  const remaining = safeCapacity - safeTaken;

  return (
    <div className={className}>
      <div
        className={`flex items-center justify-between gap-4 ${
          dark ? "text-porcelain" : "text-ink"
        }`}
      >
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] opacity-65">
          {label}
        </p>
        <p className="font-mono text-sm font-semibold tabular-nums tracking-[-0.04em]">
          {safeTaken}/{safeCapacity}
        </p>
      </div>
      <div
        className={`mt-2 grid gap-1.5 ${compact ? "grid-cols-3" : ""}`}
        style={{ gridTemplateColumns: `repeat(${safeCapacity}, minmax(0, 1fr))` }}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeCapacity}
        aria-valuenow={safeTaken}
        aria-valuetext={`${safeTaken} of ${safeCapacity} seats taken`}
      >
        {seats.map((seat) => {
          const occupied = seat < safeTaken;
          return (
            <span
              key={seat}
              className={`relative flex h-2 overflow-hidden border ${
                dark
                  ? occupied
                    ? "border-lime bg-lime"
                    : "border-cyan/35 bg-cyan/5"
                  : occupied
                    ? "border-ink bg-ink"
                    : "border-ink/20 bg-transparent"
              }`}
            >
              {occupied ? (
                <span className="absolute inset-y-0 left-0 w-1/2 bg-cyan" />
              ) : null}
            </span>
          );
        })}
      </div>
      {lastSeatMessage && remaining === 1 ? (
        <p className={`mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${dark ? "text-lime" : "text-ink"}`}>
          {lastSeatMessage}
        </p>
      ) : null}
    </div>
  );
}
