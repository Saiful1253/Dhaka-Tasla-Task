import type { ReactNode } from "react";

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  children,
  className = "",
}: FieldProps) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-end justify-between gap-3">
        <label
          htmlFor={id}
          className="font-display text-xs font-bold uppercase tracking-[0.13em] text-ink"
        >
          {label}
          {required ? <span className="ml-1 text-coral">*</span> : null}
        </label>
        {hint ? (
          <span id={`${id}-hint`} className="text-xs text-ink/65">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-sm font-medium text-[#A62D25]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClassName =
  "min-h-12 w-full rounded-none border border-ink/20 bg-porcelain px-3.5 py-3 font-body text-[15px] text-ink outline-none transition placeholder:text-ink/60 hover:border-ink/40 focus:border-ink focus:ring-2 focus:ring-cyan/45";

export const selectClassName = `${inputClassName} cursor-pointer appearance-none bg-[linear-gradient(45deg,transparent_50%,#081A1F_50%),linear-gradient(135deg,#081A1F_50%,transparent_50%)] bg-[position:calc(100%-18px)_21px,calc(100%-13px)_21px] bg-[size:5px_5px,5px_5px] bg-no-repeat pr-10`;
