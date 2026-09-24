import { RickshawIcon } from "@/components/rickshaw-icon";

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
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center border text-ink ${
          inverse ? "border-lime bg-lime" : "border-ink bg-ink"
        }`}
      >
        <RickshawIcon
          size={36}
          tone={inverse ? "inverse" : "brand"}
          className="h-9 w-9"
        />
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
