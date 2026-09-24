import { ArrowDown } from "lucide-react";

interface RouteDisplayProps {
  pickup: string;
  destination: string;
  pickupLabel?: string;
  destinationLabel?: string;
  compact?: boolean;
  inverse?: boolean;
  className?: string;
}

export function RouteDisplay({
  pickup,
  destination,
  pickupLabel = "Pickup",
  destinationLabel = "Destination",
  compact = false,
  inverse = false,
  className = "",
}: RouteDisplayProps) {
  return (
    <ol
      className={`route-display ${compact ? "route-display--compact" : ""} ${
        inverse ? "route-display--inverse" : ""
      } ${className}`}
      aria-label={`Route from ${pickup} to ${destination}`}
    >
      <li className="route-endpoint">
        <span
          aria-hidden="true"
          className={`route-node route-node--start ${inverse ? "route-node--inverse" : ""}`}
        />
        <div className="min-w-0">
          <p
            className={`font-mono text-[9px] font-semibold uppercase tracking-[0.18em] ${
              inverse ? "text-cyan/70" : "text-ink/65"
            }`}
          >
            {pickupLabel}
          </p>
          <p
            className={`mt-1 break-words font-display font-bold leading-[1.05] tracking-[-0.04em] ${
              compact ? "text-xl" : "text-3xl sm:text-4xl"
            } ${inverse ? "text-porcelain" : "text-ink"}`}
          >
            {pickup}
          </p>
        </div>
      </li>
      <li className="route-connector" aria-hidden="true">
        <span className="route-connector__track">
          <span className="route-connector__pulse" />
        </span>
        <ArrowDown className="route-connector__arrow" />
      </li>
      <li className="route-endpoint">
        <span
          aria-hidden="true"
          className={`route-node route-node--end ${inverse ? "route-node--inverse" : ""}`}
        />
        <div className="min-w-0">
          <p
            className={`font-mono text-[9px] font-semibold uppercase tracking-[0.18em] ${
              inverse ? "text-lime/70" : "text-ink/65"
            }`}
          >
            {destinationLabel}
          </p>
          <p
            className={`mt-1 break-words font-display font-bold leading-[1.05] tracking-[-0.04em] ${
              compact ? "text-xl" : "text-3xl sm:text-4xl"
            } ${inverse ? "text-porcelain" : "text-ink"}`}
          >
            {destination}
          </p>
        </div>
      </li>
    </ol>
  );
}
