"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  Radio,
  RefreshCw,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  NoticeBanner,
} from "@/components/ui/feedback";
import { SeatMeter } from "@/components/ui/seat-meter";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch, getErrorCode, getErrorMessage } from "@/lib/api/client";
import type {
  JoinPoolResponse,
  OpenPool,
  OpenPoolsResponse,
  Ride,
} from "@/lib/api/types";
import { formatAge, formatDateTime } from "@/lib/format";

const POLL_INTERVAL_MS = 5000;

interface JoinPoolPanelProps {
  ride: Ride | null;
  onJoined: (poolId: number) => void | Promise<void>;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function capacityCopy(pool: OpenPool, ride: Ride): string {
  if (pool.remainingSeats === 0) {
    return "The last seat is already held. This request remains safe and unassigned.";
  }
  if (ride.seatsRequested > pool.remainingSeats) {
    return `${pool.remainingSeats} seat${pool.remainingSeats === 1 ? "" : "s"} remain; this request needs ${ride.seatsRequested}.`;
  }
  if (pool.remainingSeats === 1) {
    return "One final seat is open. Joining is first come, first served.";
  }
  return `${pool.remainingSeats} seats remain in this open manifest.`;
}

export function JoinPoolPanel({ ride, onJoined }: JoinPoolPanelProps) {
  const [snapshot, setSnapshot] = useState<OpenPoolsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [joinError, setJoinError] = useState<unknown>(null);
  const [joiningPoolId, setJoiningPoolId] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const mounted = useRef(true);
  const canDiscover = ride?.status === "REQUESTED";

  const load = useCallback(
    async (quiet = false, signal?: AbortSignal) => {
      if (!canDiscover) return;
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);
      try {
        const data = await apiFetch<OpenPoolsResponse>("/pools/open", {
          auth: true,
          signal,
        });
        if (!mounted.current || signal?.aborted) return;
        setSnapshot(data);
        setNow(Date.now());
      } catch (error) {
        if (!isAbortError(error) && mounted.current && !signal?.aborted) {
          setLoadError(error);
        }
      } finally {
        if (mounted.current && !signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [canDiscover],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!canDiscover) {
      setSnapshot(null);
      setLoadError(null);
      return;
    }
    const controller = new AbortController();
    void load(false, controller.signal);
    const pollTimer = window.setInterval(() => void load(true), POLL_INTERVAL_MS);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      controller.abort();
      window.clearInterval(pollTimer);
      window.clearInterval(clockTimer);
    };
  }, [canDiscover, load]);

  const compatiblePools = useMemo(() => {
    if (!ride || !snapshot) return [];
    return snapshot.pools.filter((pool) => pool.compatibleRequestIds.includes(ride.id));
  }, [ride, snapshot]);

  async function handleJoin(pool: OpenPool) {
    if (!ride || joiningPoolId !== null) return;
    setJoiningPoolId(pool.id);
    setJoinError(null);
    try {
      await apiFetch<JoinPoolResponse>(`/pools/${pool.id}/join`, {
        method: "POST",
        auth: true,
        body: { requestId: ride.id },
      });
      await onJoined(pool.id);
    } catch (error) {
      if (mounted.current) setJoinError(error);
      try {
        await load(true);
      } catch {
        // Preserve the original join error if the follow-up read also fails.
      }
    } finally {
      if (mounted.current) setJoiningPoolId(null);
    }
  }

  return (
    <section className="section-panel overflow-hidden" aria-labelledby="join-pool-heading">
      <div className="flex flex-col gap-4 border-b border-ink/10 bg-ink p-5 text-porcelain sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="dark-eyebrow text-cyan">05 / Open pool invitations</p>
          <h2 id="join-pool-heading" className="mt-2 font-display text-2xl font-bold tracking-[-0.05em] sm:text-3xl">
            Join a pool before the last seat goes
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-porcelain/70">
            Passenger self-service complements manual driver selection. The API checks ownership, corridor compatibility, vehicle availability, and capacity.
          </p>
        </div>
        {canDiscover ? (
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <Button
              variant="secondary"
              size="sm"
              loading={refreshing}
              onClick={() => void load(true)}
              className="border-porcelain/20 bg-porcelain/5 text-porcelain hover:border-porcelain/35 hover:bg-porcelain/10"
              leadingIcon={<RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
            >
              Refresh pools
            </Button>
            {snapshot ? (
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-porcelain/60">
                Updated {formatAge(snapshot.refreshedAt, now || Date.now())}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="p-5 sm:p-6">
        {!ride ? (
          <EmptyState
            title="No waiting request to join"
            message="Create a ride request first. Once it is waiting, compatible open pools will appear here."
            icon={<UsersRound aria-hidden="true" className="h-5 w-5" />}
          />
        ) : !canDiscover ? (
          <NoticeBanner
            tone="info"
            title="Pool joining is closed for this ride"
            message="Joining is available only while your request is still waiting. A matched or terminal ride is already attached to its manifest."
          />
        ) : (
          <>
            <div className="flex items-start gap-3 border border-cyan/50 bg-cyan/10 p-4 text-[#073E42]">
              <LockKeyhole aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm leading-6">
                <span className="font-display font-bold">Your seat, your choice.</span>{" "}
                Open pools show route and capacity only. Joining is atomic: if another passenger takes the last seat first, your request stays waiting.
              </p>
            </div>

            {joinError ? (
              <NoticeBanner
                tone={getErrorCode(joinError) === "NO_SEATS" ? "warning" : "error"}
                title={getErrorCode(joinError) === "NO_SEATS" ? "That seat was taken first" : "Could not join this pool"}
                message={getErrorMessage(joinError)}
                code={getErrorCode(joinError)}
                onDismiss={() => setJoinError(null)}
                className="mt-5"
              />
            ) : null}

            {loadError ? (
              snapshot ? (
                <NoticeBanner
                  tone="warning"
                  title="Open-pool board could not refresh"
                  message={getErrorMessage(loadError)}
                  code={getErrorCode(loadError)}
                  onDismiss={() => setLoadError(null)}
                  className="mt-5"
                />
              ) : (
                <div className="mt-5">
                  <ErrorState title="Open pools are unavailable" error={loadError} onRetry={() => void load()} />
                </div>
              )
            ) : null}

            {loading && !snapshot ? (
              <div className="mt-5 grid gap-4 lg:grid-cols-2" role="status" aria-label="Loading open pools">
                {[0, 1].map((row) => (
                  <div key={row} className="border border-ink/10 bg-porcelain p-5">
                    <div className="flex items-center justify-between gap-3">
                      <LoadingSkeleton className="h-4 w-24" />
                      <LoadingSkeleton className="h-5 w-16" />
                    </div>
                    <LoadingSkeleton className="mt-5 h-7 w-2/3" />
                    <LoadingSkeleton className="mt-3 h-4 w-1/2" />
                    <LoadingSkeleton className="mt-6 h-12 w-full" />
                  </div>
                ))}
              </div>
            ) : null}

            {!loading && snapshot && compatiblePools.length === 0 && !loadError ? (
              <EmptyState
                title="No compatible open pool yet"
                message="Keep your request waiting. A driver can add you manually, or a compatible pool will appear here when one opens."
                icon={<Radio aria-hidden="true" className="h-5 w-5" />}
                className="mt-5"
              />
            ) : null}

            {compatiblePools.length > 0 ? (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {compatiblePools.map((pool) => (
                  <OpenPoolCard
                    key={pool.id}
                    pool={pool}
                    ride={ride}
                    joining={joiningPoolId === pool.id}
                    disabled={joiningPoolId !== null}
                    checkedAt={snapshot?.refreshedAt}
                    onJoin={() => void handleJoin(pool)}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function OpenPoolCard({
  pool,
  ride,
  joining,
  disabled,
  checkedAt,
  onJoin,
}: {
  pool: OpenPool;
  ride: Ride;
  joining: boolean;
  disabled: boolean;
  checkedAt?: string;
  onJoin: () => void;
}) {
  const canJoin = pool.joinableRequestIds.includes(ride.id);
  const isFull = pool.remainingSeats === 0;
  return (
    <article className="flex flex-col border border-ink/15 bg-porcelain shadow-paper">
      <div className="flex items-start justify-between gap-4 border-b border-ink/10 p-5">
        <div>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-ink/65">Open manifest · #{String(pool.id).padStart(3, "0")}</p>
          <h3 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">{pool.vehicle.name}</h3>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink/65">{pool.vehicle.plate ?? "Plate not listed"} · {pool.memberCount} passenger{pool.memberCount === 1 ? "" : "s"}</p>
        </div>
        <StatusBadge status={pool.status} compact />
      </div>
      <div className="flex-1 p-5">
        {pool.route ? (
          <div className="flex items-start gap-2 border-l-2 border-cyan pl-3">
            <span className="min-w-0 text-sm font-semibold leading-5 text-ink/75">
              {pool.route.pickup}
              <ArrowRight aria-hidden="true" className="mx-1.5 inline h-3.5 w-3.5 text-ink/35" />
              {pool.route.destination}
            </span>
          </div>
        ) : <p className="text-sm text-ink/65">Route corridor is still forming.</p>}
        <SeatMeter taken={pool.seatsTaken} capacity={pool.capacity} label="Live capacity" lastSeatMessage="Last seat is available" className="mt-5" />
        <p className={`mt-2 text-xs leading-5 ${isFull ? "font-semibold text-[#8A281F]" : "text-ink/65"}`}>{capacityCopy(pool, ride)}</p>
        <p className="mt-3 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink/60"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />Live pool · checked {formatDateTime(checkedAt ?? new Date().toISOString())}</p>
      </div>
      <div className="border-t border-ink/10 bg-paper/60 p-4">
        <Button
          variant={canJoin ? "lime" : "secondary"}
          className="w-full"
          loading={joining}
          disabled={!canJoin || disabled}
          onClick={onJoin}
          leadingIcon={canJoin ? <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> : <LockKeyhole aria-hidden="true" className="h-4 w-4" />}
        >
          {isFull ? "Pool full" : canJoin ? "Join this pool" : "Not joinable yet"}
        </Button>
        <p className="mt-2 text-center text-[10px] leading-4 text-ink/60">{isFull ? "A 409 keeps your request waiting; no seat is consumed." : "The server confirms the seat atomically."}</p>
      </div>
    </article>
  );
}
