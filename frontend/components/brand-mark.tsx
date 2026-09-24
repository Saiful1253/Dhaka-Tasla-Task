import { Zap } from "lucide-react";

interface BrandMarkProps {
  inverse?: boolean;
  compact?: boolean;
  className?: string;
}

export function BrandMark({
  inverse = false,
  compact = false,
  className = "",
}: BrandMarkProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center border ${
          inverse
            ? "border-lime bg-lime text-ink"
            : "border-ink bg-ink text-lime"
        }`}
      >
        <Zap aria-hidden="true" className="h-5 w-5 fill-current" strokeWidth={1.6} />
        <span
          className={`absolute -right-1 -top-1 h-2 w-2 ${
            inverse ? "bg-cyan" : "bg-lime"
          }`}
        />
      </span>
      <div className="min-w-0">
        <p
          className={`font-display text-[15px] font-bold leading-none tracking-[-0.035em] ${
            inverse ? "text-porcelain" : "text-ink"
          }`}
        >
          Dhaka Tesla Pool
        </p>
        {!compact ? (
          <p
            className={`mt-1 font-mono text-[8px] font-semibold uppercase tracking-[0.21em] ${
              inverse ? "text-cyan/70" : "text-ink/65"
            }`}
          >
            Shared-seat dispatch
          </p>
        ) : null}
      </div>
    </div>
  );
}
