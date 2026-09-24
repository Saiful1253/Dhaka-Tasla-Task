import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

import { LoaderCircle } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "lime" | "danger" | "ghost" | "inverse";
type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-porcelain border-ink hover:bg-ink-elevated hover:border-ink-elevated",
  secondary:
    "bg-porcelain text-ink border-ink/15 hover:border-ink/40 hover:bg-white",
  lime: "bg-lime text-ink border-lime hover:bg-[#D4F78C] hover:border-[#D4F78C]",
  danger:
    "bg-coral text-ink border-coral hover:bg-[#F47B70] hover:border-[#F47B70]",
  ghost: "bg-transparent text-ink border-transparent hover:bg-ink/5",
  inverse:
    "border-porcelain/25 bg-porcelain/10 text-porcelain hover:border-cyan/70 hover:bg-porcelain/20",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3 py-2 text-xs",
  md: "min-h-11 px-4 py-2.5 text-sm",
  lg: "min-h-12 px-5 py-3 text-sm",
  icon: "h-11 w-11 p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className = "",
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      leadingIcon,
      trailingIcon,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center gap-2 border font-display font-semibold tracking-[-0.01em] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          leadingIcon
        )}
        {children}
        {!loading && trailingIcon}
      </button>
    );
  },
);
