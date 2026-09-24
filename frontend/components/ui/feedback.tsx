import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Info,
  RotateCcw,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-soft-pulse rounded-sm bg-ink/10 ${className}`}
      aria-hidden="true"
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading dashboard">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4 border border-ink/10 bg-porcelain p-5 shadow-paper">
          <LoadingSkeleton className="h-4 w-28" />
          <LoadingSkeleton className="h-12 w-4/5" />
          <LoadingSkeleton className="h-4 w-2/3" />
        </div>
        <div className="space-y-4 border border-ink/10 bg-porcelain p-5 shadow-paper">
          <LoadingSkeleton className="h-4 w-24" />
          <LoadingSkeleton className="h-32 w-full" />
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-4 border border-ink/10 bg-porcelain p-5">
          <LoadingSkeleton className="h-5 w-40" />
          <LoadingSkeleton className="h-12 w-full" />
          <LoadingSkeleton className="h-12 w-full" />
        </div>
        <div className="space-y-4 border border-ink/10 bg-porcelain p-5">
          <LoadingSkeleton className="h-5 w-36" />
          <LoadingSkeleton className="h-32 w-full" />
        </div>
      </div>
      <span className="sr-only">Loading live ride data…</span>
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

export function ErrorState({
  title = "We could not load this board",
  error,
  onRetry,
  compact = false,
  className = "",
}: ErrorStateProps) {
  const message = getDisplayError(error);
  const code = getDisplayCode(error);

  return (
    <div
      role="alert"
      className={`border border-coral/50 bg-coral/10 ${
        compact ? "p-4" : "p-5 sm:p-6"
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center bg-coral text-ink">
          <AlertTriangle aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-bold text-ink">{title}</h2>
            {code ? (
              <span className="border border-coral/40 bg-porcelain/70 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.1em] text-[#84271F]">
                {code}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-ink/70">{message}</p>
          {onRetry ? (
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={onRetry}
              leadingIcon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />}
            >
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  message: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  message,
  action,
  icon,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`border border-dashed border-ink/25 bg-porcelain/60 p-6 text-center ${
        className ?? ""
      }`}
    >
      <span className="mx-auto flex h-11 w-11 items-center justify-center border border-ink/15 bg-paper text-ink">
        {icon ?? <Inbox aria-hidden="true" className="h-5 w-5" />}
      </span>
      <h3 className="mt-4 font-display text-lg font-bold tracking-[-0.025em] text-ink">
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink/60">
        {message}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

interface NoticeBannerProps {
  tone?: "info" | "success" | "warning" | "error";
  title?: string;
  message: string;
  code?: string;
  onDismiss?: () => void;
  className?: string;
  children?: ReactNode;
}

const noticeTone = {
  info: "border-cyan/60 bg-cyan/10 text-[#073E42]",
  success: "border-lime bg-lime/20 text-ink",
  warning: "border-amber bg-amber/15 text-[#5C3A06]",
  error: "border-coral bg-coral/10 text-[#76231D]",
};

export function NoticeBanner({
  tone = "info",
  title,
  message,
  code,
  onDismiss,
  className = "",
  children,
}: NoticeBannerProps) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertTriangle : Info;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 border p-4 ${noticeTone[tone]} ${className}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {title ? <p className="font-display text-sm font-bold">{title}</p> : null}
          {code ? (
            <span className="border border-current/30 bg-porcelain/50 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.1em]">
              {code}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-6 text-ink/75">{message}</p>
        {children ? <div className="mt-1">{children}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center text-ink transition hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

interface ToastMessageProps {
  message: string;
  code?: string;
  tone?: "success" | "error";
  onDismiss: () => void;
}

export function ToastMessage({
  message,
  code,
  tone = "success",
  onDismiss,
}: ToastMessageProps) {
  return (
    <div className="pointer-events-auto fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:w-[360px]">
      <div
        role="status"
        aria-live="polite"
        className={`flex items-start gap-3 border p-4 shadow-paper ${
          tone === "error"
            ? "border-coral bg-[#FFF0ED] text-ink"
            : "border-lime bg-ink text-porcelain"
        }`}
      >
        {tone === "error" ? (
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#8A281F]" />
        ) : (
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-lime" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">{message}</p>
          {code ? (
            <p className="mt-1 font-mono text-[10px] tracking-[0.1em] opacity-60">
              {code}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="flex h-8 w-8 items-center justify-center opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function getDisplayError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred. Please retry.";
}

function getDisplayCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}
