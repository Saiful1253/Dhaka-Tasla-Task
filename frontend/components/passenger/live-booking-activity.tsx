"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Clock3,
  LockKeyhole,
  RefreshCw,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, LoadingSkeleton, NoticeBanner } from "@/components/ui/feedback";
import { RouteDisplay } from "@/components/ui/route-display";
import { apiFetch, getErrorCode, getErrorMessage } from "@/lib/api/client";
import type { RideActivity, RideActivityResponse } from "@/lib/api/types";
import { formatAge, formatDateTime } from "@/lib/format";

const POLL_INTERVAL_MS = 5000;

type LoadMode = "initial" | "quiet" | "manual";

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  );
}

function activityLabel(activityId: string): string {
  // Keep the compact display readable while retaining an opaque, non-sequential
  // identifier in the response contract.
  return `ANON-${activityId.replace(/^act_/, "").slice(-8).toUpperCase()}`;
}

/**
 * A deliberately separate read model for the passenger activity board. It
 * polls quietly, keeps the last good snapshot on transient failures, and never
 * owns a passenger assignment action.
 */
export function LiveBookingActivity() {
  const [activity, setActivity] = useState<RideActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleSnapshot, setStaleSnapshot] = useState(false);
  const [now, setNow] = useState(0);
  const loadRef = useRef<((mode: LoadMode) => Promise<void>) | null>(null);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    const controller = new AbortController();
    setNow(Date.now());

    const load = async (mode: LoadMode): Promise<void> => {
      if (disposed || controller.signal.aborted || inFlight) return;
      inFlight = true;
      if (mode === "initial") setLoading(true);
      if (mode === "manual") setRefreshing(true);
      setError(null);

      try {
        const data = await apiFetch<RideActivityResponse>("/rides/activity", {
          auth: true,
          signal: controller.signal,
        });
        if (disposed || controller.signal.aborted) return;
        setActivity(data);
        setError(null);
        setStaleSnapshot(false);
        setNow(Date.now());
      } catch (requestError) {
        if (disposed || controller.signal.aborted || isAbortError(requestError)) {
          return;
        }
        setError(requestError);
        setStaleSnapshot(true);
      } finally {
        inFlight = false;
        if (!disposed && !controller.signal.aborted) {
          if (mode === "initial") setLoading(false);
          if (mode === "manual") setRefreshing(false);
        }
      }
    };

    loadRef.current = load;
    void load("initial");
    const pollTimer = window.setInterval(() => {
      void load("quiet");
    }, POLL_INTERVAL_MS);
    const clockTimer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => {
      disposed = true;
      controller.abort();
      if (loadRef.current === load) loadRef.current = null;
      window.clearInterval(pollTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  const requests = activity?.requests ?? [];
  const hasSnapshot = activity !== null;
  const statusText = loading
    ? "Loading live booking activity…"
    : refreshing
      ? "Refreshing live booking activity…"
      : !hasSnapshot && staleSnapshot
        ? "Live activity is unavailable; retry when ready"
        : staleSnapshot
          ? "Last refresh failed; showing the last snapshot"
          : error
            ? "Live activity is unavailable; retry when ready"
            : "Live updates every 5 seconds";

  return (
    <section
      className="section-panel overflow-hidden"
      aria-labelledby="live-booking-activity-heading"
      aria-busy={loading || refreshing}
    >
      <div className="dispatch-grid flex flex-col gap-5 border-b border-cyan/15 p-5 text-porcelain sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="dark-eyebrow text-cyan">03 / Live booking activity</p>
          <h2
            id="live-booking-activity-heading"
            className="mt-2 font-display text-2xl font-bold tracking-[-0.05em] sm:text-3xl"
          >
            Other passengers booking now
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-porcelain/85">
            A read-only signal of requests still waiting for manual driver selection. See
            the route, not the person; nobody is assigned from this board.
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <div
            className="flex items-baseline gap-2"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="font-mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan">
              Live total
            </span>
            <span className="font-display text-3xl font-bold leading-none tracking-[-0.06em] text-lime tabular-nums">
              {activity ? activity.activeCount : "—"}
            </span>
            {!activity ? <span className="sr-only">Awaiting first live total</span> : null}
          </div>
          <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.12em] text-porcelain/80">
            {activity ? (
              <time dateTime={activity.refreshedAt}>
                Updated {formatAge(activity.refreshedAt, now)}
              </time>
            ) : (
              "Waiting for first snapshot"
            )}
          </p>
          <Button
            variant="inverse"
            size="md"
            loading={refreshing}
            disabled={loading}
            onClick={() => void loadRef.current?.("manual")}
            aria-label="Refresh live booking activity"
            leadingIcon={
              <RefreshCw
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
            }
          >
            Refresh board
          </Button>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3 border border-cyan/50 bg-cyan/10 p-4 text-[#073E42]">
          <LockKeyhole aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm leading-6">
            <span className="font-display font-bold">Privacy boundary:</span>{" "}
            anonymous requests only. Names, emails, fares, and private activity
            history are never shown here.
          </p>
        </div>

        <p
          className="mt-4 flex items-center gap-2 font-mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.13em] text-ink/80"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <Activity aria-hidden="true" className="h-3.5 w-3.5 text-[#2D6814]" />
          {statusText}
        </p>

        {error ? (
          <NoticeBanner
            tone={hasSnapshot ? "warning" : "error"}
            title={hasSnapshot ? "Live activity could not refresh" : "Live activity is unavailable"}
            message={getErrorMessage(error)}
            code={getErrorCode(error)}
            onDismiss={hasSnapshot ? () => setError(null) : undefined}
            className="mt-5"
          >
            <Button
              variant="secondary"
              size="md"
              onClick={() => void loadRef.current?.("manual")}
              className="mt-3"
              leadingIcon={<RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
            >
              Retry activity
            </Button>
          </NoticeBanner>
        ) : null}

        {loading && !hasSnapshot ? (
          <div className="mt-5 space-y-3" role="status" aria-label="Loading live booking activity">
            {[0, 1, 2].map((row) => (
              <div key={row} className="border border-ink/10 bg-porcelain p-4">
                <div className="flex items-center justify-between gap-3">
                  <LoadingSkeleton className="h-3 w-28" />
                  <LoadingSkeleton className="h-3 w-16" />
                </div>
                <LoadingSkeleton className="mt-5 h-6 w-3/5" />
                <LoadingSkeleton className="mt-2 h-6 w-2/5" />
              </div>
            ))}
            <span className="sr-only">Loading other passengers’ live requests…</span>
          </div>
        ) : null}

        {!hasSnapshot && !loading && !error ? (
          <NoticeBanner
            tone="error"
            title="Live activity is unavailable"
            message="No live snapshot has been confirmed yet. Retry to check the current board."
            className="mt-5"
          >
            <Button
              variant="secondary"
              size="md"
              onClick={() => void loadRef.current?.("manual")}
              className="mt-3"
              leadingIcon={<RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
            >
              Retry activity
            </Button>
          </NoticeBanner>
        ) : null}

        {hasSnapshot ? (
          requests.length === 0 ? (
            !loading ? (
              <EmptyState
                title={staleSnapshot ? "Last snapshot had no requests" : "No other requests right now"}
                message={
                  staleSnapshot
                    ? "The last successful refresh showed no requests. Refresh again to confirm the current board."
                    : "The board is quiet. A new anonymous route will appear here as soon as it is requested."
                }
                icon={<Activity aria-hidden="true" className="h-5 w-5" />}
                className="mt-5"
              />
            ) : null
          ) : (
            <>
              <div className="mt-6 flex flex-col gap-1 border-b border-ink/10 pb-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="eyebrow">Newest signals</p>
                  <h3 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">
                    {activeLabel(activity.activeCount)}
                  </h3>
                </div>
                <p className="font-mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/65">
                  {activity.activeCount > requests.length
                    ? `Showing newest ${requests.length}`
                    : "All active requests shown"}
                </p>
              </div>

              <ul className="divide-y divide-ink/10" aria-label="Anonymous live booking requests">
                {requests.map((request) => (
                  <ActivityRow key={request.activityId} request={request} now={now} />
                ))}
              </ul>
            </>
          )
        ) : null}
      </div>
    </section>
  );
}

function ActivityRow({ request, now }: { request: RideActivity; now: number }) {
  return (
    <li className="animate-reveal py-5">
      <div className="grid gap-5 lg:max-w-[62rem] lg:grid-cols-[minmax(17rem,24rem)_minmax(10rem,14rem)_9rem] lg:items-start lg:gap-6">
        <div className="order-2 min-w-0 lg:order-1">
          <RouteDisplay
            pickup={request.pickup}
            destination={request.destination}
            pickupLabel="Pickup"
            destinationLabel="Destination"
            compact
            labelClassName="text-[10px] sm:text-[11px]"
            className="mt-0 lg:max-w-[24rem]"
          />
        </div>

        <div className="order-1 flex min-w-0 flex-col gap-2 lg:order-2 lg:border-l lg:border-ink/10 lg:pl-5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-ink/70 sm:text-[11px]">
            {activityLabel(request.activityId)}
          </p>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink/70 sm:text-[11px]">
            Requested{" "}
            <time
              dateTime={request.createdAt}
              title={formatDateTime(request.createdAt)}
              className="text-ink"
            >
              {formatAge(request.createdAt, now)}
            </time>
          </p>
        </div>

        <div className="order-3 flex items-end border-t border-ink/10 pt-4 lg:block lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink/70 sm:text-[11px]">
              Seats requested
            </p>
            <p className="mt-1 flex items-center gap-2 font-display text-xl font-bold tracking-[-0.04em] text-ink">
              <UsersRound aria-hidden="true" className="h-4 w-4 text-ink/50" />
              {request.seats} {request.seats === 1 ? "seat" : "seats"}
            </p>
          </div>
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink/70 sm:text-[11px] lg:mt-5">
            <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
            Live request
          </p>
        </div>
      </div>
    </li>
  );
}

function activeLabel(activeCount: number): string {
  return `${activeCount} active ${activeCount === 1 ? "request" : "requests"}`;
}
