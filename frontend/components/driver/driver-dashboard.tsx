"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BatteryCharging,
  CarFront,
  CheckCircle2,
  CircleDot,
  Clock3,
  Layers3,
  MapPin,
  Radio,
  RefreshCw,
  Route,
  UsersRound,
  WifiOff,
} from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { PoolCard, type PoolAction } from "@/components/driver/pool-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DashboardSkeleton,
  EmptyState,
  ErrorState,
  NoticeBanner,
  ToastMessage,
} from "@/components/ui/feedback";
import { SeatMeter } from "@/components/ui/seat-meter";
import { useToast } from "@/hooks/use-toast";
import { ApiError, apiFetch, getErrorCode } from "@/lib/api/client";
import type {
  DriverPool,
  DriverRequest,
  DriverVehicle,
  RawDriverPool,
} from "@/lib/api/types";
import {
  isTerminalPool,
  normalizeDriverPool,
} from "@/lib/api/types";
import { formatAge, formatTaka } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";

interface RequestsResponse {
  vehicle: DriverVehicle;
  requests: DriverRequest[];
}

interface PoolsResponse {
  pools: RawDriverPool[];
}

interface OnlineResponse {
  isOnline: boolean;
}

interface MutationResponse {
  poolId: number;
  status: string;
}

const ACTION_TOAST: Record<Exclude<PoolAction, "cancel">, string> = {
  arrived: "Driver-arrived status saved. The next step is starting the ride.",
  start: "Ride started. Every passenger can now follow the in-motion status.",
  complete: "Ride completed. The manifest is now closed.",
};

function getActionErrorTitle(error: unknown): string {
  switch (getErrorCode(error)) {
    case "INCOMPATIBLE":
      return "Requests do not share a corridor";
    case "NO_SEATS":
      return "Not enough seats for this selection";
    case "VEHICLE_OFFLINE":
      return "Vehicle needs to be online";
    case "ACTIVE_POOL_EXISTS":
      return "This vehicle already has an active pool";
    case "NETWORK_ERROR":
      return "Action result needs verification";
    case "TRANSACTION_TIMEOUT":
      return "Dispatch is busy";
    case "INVALID_TRANSITION":
    case "POOL_CLOSED":
    case "REQUEST_UNAVAILABLE":
    case "CANCEL_NOT_ALLOWED":
    case "TRANSACTION_RETRY":
      return "Dispatch state changed";
    default:
      return "Dispatch action could not be confirmed";
  }
}

function getActionErrorMessage(error: unknown): string {
  const base =
    error instanceof Error
      ? error.message
      : "The API did not confirm this dispatch action.";
  const code = getErrorCode(error);

  if (code === "NETWORK_ERROR") {
    return `${base} No success response was received. The board refreshes automatically; check its current state before retrying.`;
  }
  if (error instanceof ApiError && error.status === 409) {
    return `${base} The board refreshes automatically so you can act on the latest state.`;
  }
  return base;
}

export function DriverDashboard() {
  const { session } = useAuth();
  const { toast, showToast, dismissToast } = useToast();
  const [vehicle, setVehicle] = useState<DriverVehicle | null>(null);
  const [requests, setRequests] = useState<DriverRequest[]>([]);
  const [pools, setPools] = useState<DriverPool[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [refreshError, setRefreshError] = useState<unknown>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [cancelPool, setCancelPool] = useState<DriverPool | null>(null);

  const activePools = useMemo(
    () => pools.filter((pool) => !isTerminalPool(pool.status)),
    [pools],
  );
  const activePool = activePools[0] ?? null;
  const historicalPools = useMemo(
    () => pools.filter((pool) => isTerminalPool(pool.status)),
    [pools],
  );
  const selectedSeats = useMemo(
    () =>
      requests
        .filter((request) => selectedIds.has(request.id))
        .reduce((sum, request) => sum + request.seats, 0),
    [requests, selectedIds],
  );

  function requestBlockReason(request: DriverRequest): string | null {
    if (activePool) {
      if (activePool.status !== "MATCHED") {
        return `Pool #${activePool.id} is past the matching stage`;
      }
      if (!request.compatibility.fitsActivePool) {
        return "Different corridor from the active pool";
      }
      if (
        request.seats >
        Math.max(0, activePool.capacity - activePool.seatsTaken)
      ) {
        return "Not enough remaining seats in the active pool";
      }
      return null;
    }

    const selectedRequests = requests.filter((item) => selectedIds.has(item.id));
    const breaksPairing = selectedRequests.some(
      (selected) =>
        selected.id !== request.id &&
        (!selected.compatibility.compatibleRequestIds.includes(request.id) ||
          !request.compatibility.compatibleRequestIds.includes(selected.id)),
    );
    return breaksPairing ? "Does not share this selection's corridor" : null;
  }

  const applyBoard = useCallback(
    (requestData: RequestsResponse, poolData: PoolsResponse) => {
      setVehicle(requestData.vehicle);
      setRequests(requestData.requests);
      setPools(poolData.pools.map(normalizeDriverPool));
      const availableIds = new Set(
        requestData.requests
          .filter((request) =>
            request.compatibility.activePoolId
              ? request.compatibility.addableToActivePool
              : true,
          )
          .map((request) => request.id),
      );
      setSelectedIds((current) =>
        new Set([...current].filter((requestId) => availableIds.has(requestId))),
      );
    },
    [],
  );

  const loadBoard = useCallback(
    async (signal?: AbortSignal, quiet = false) => {
      if (!quiet) {
        setLoading(true);
        setLoadError(null);
        setRefreshError(null);
      }
      try {
        const [requestData, poolData] = await Promise.all([
          apiFetch<RequestsResponse>("/driver/requests", { auth: true, signal }),
          apiFetch<PoolsResponse>("/driver/pools", { auth: true, signal }),
        ]);
        applyBoard(requestData, poolData);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (quiet) throw error;
        setLoadError(error);
      } finally {
        if (!quiet && !signal?.aborted) setLoading(false);
      }
    },
    [applyBoard],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadBoard(controller.signal);
    return () => controller.abort();
  }, [loadBoard]);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadBoard(undefined, true).catch((error) => {
        setRefreshError(error);
      });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadBoard]);

  async function refreshAfterMutation() {
    try {
      await loadBoard(undefined, true);
      setRefreshError(null);
    } catch (error) {
      setRefreshError(error);
    }
  }

  async function handleOnlineToggle() {
    if (!vehicle || actionPending) return;
    setActionPending("online");
    setActionError(null);
    try {
      const data = await apiFetch<OnlineResponse>("/driver/online", {
        method: "POST",
        auth: true,
      });
      setVehicle((current) => (current ? { ...current, isOnline: data.isOnline } : current));
      showToast({
        tone: "success",
        message: data.isOnline
          ? `${vehicle.name} is online. Waiting passengers can now be selected manually.`
          : `${vehicle.name} is offline. New pool actions are paused.`,
      });
    } catch (error) {
      setActionError(error);
    } finally {
      setActionPending(null);
    }

    // Always reconcile after success, conflict, or an ambiguous network error.
    // A mutation response and its follow-up board read have separate outcomes.
    await refreshAfterMutation();
  }

  async function handleAssignPassengers() {
    const availableCapacity = activePool
      ? Math.max(0, activePool.capacity - activePool.seatsTaken)
      : vehicle?.capacity ?? 0;
    if (
      !vehicle?.isOnline ||
      selectedIds.size === 0 ||
      selectedSeats > availableCapacity ||
      (activePool && activePool.status !== "MATCHED")
    ) {
      return;
    }
    setActionPending(activePool ? `add:${activePool.id}` : "assign");
    setActionError(null);
    const selectedCount = selectedIds.size;
    try {
      const data = await apiFetch<{ pool: { id: number; seatsTaken: number } }>(
        activePool ? `/driver/pools/${activePool.id}/requests` : "/driver/pools",
        {
          method: "POST",
          auth: true,
          body: { requestIds: [...selectedIds] },
        },
      );
      setSelectedIds(new Set());
      showToast({
        tone: "success",
        message: activePool
          ? `${selectedCount} passenger(s) manually added to pool #${data.pool.id}; capacity is now ${data.pool.seatsTaken}/${activePool.capacity}.`
          : `Passengers assigned to pool #${data.pool.id} after your manual selection.`,
      });
    } catch (error) {
      setActionError(error);
    } finally {
      setActionPending(null);
    }

    await refreshAfterMutation();
  }

  async function handlePoolAction(
    poolId: number,
    action: Exclude<PoolAction, "cancel">,
  ) {
    if (actionPending) return;
    setActionPending(`${poolId}:${action}`);
    setActionError(null);
    try {
      await apiFetch<MutationResponse>(`/driver/pools/${poolId}/${action}`, {
        method: "POST",
        auth: true,
      });
      showToast({ tone: "success", message: ACTION_TOAST[action] });
    } catch (error) {
      setActionError(error);
    } finally {
      setActionPending(null);
    }

    await refreshAfterMutation();
  }

  async function confirmPoolCancellation() {
    if (!cancelPool || actionPending) return;
    const poolId = cancelPool.id;
    setActionPending(`${poolId}:cancel`);
    setActionError(null);
    try {
      await apiFetch<MutationResponse>(`/driver/pools/${poolId}/cancel`, {
        method: "POST",
        auth: true,
      });
      setCancelPool(null);
      showToast({
        tone: "success",
        message: `Pool #${poolId} cancelled and retained in dispatch history.`,
      });
    } catch (error) {
      setCancelPool(null);
      setActionError(error);
    } finally {
      setActionPending(null);
    }

    await refreshAfterMutation();
  }

  function toggleRequest(requestId: number) {
    setActionError(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(requestId)) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
  }

  if (!session) return null;

  const capacity = vehicle?.capacity ?? 0;
  const availableCapacity = activePool
    ? Math.max(0, activePool.capacity - activePool.seatsTaken)
    : capacity;
  const selectedOverCapacity = selectedSeats > availableCapacity;
  const createDisabled =
    !vehicle?.isOnline ||
    selectedIds.size === 0 ||
    selectedOverCapacity ||
    Boolean(activePool && activePool.status !== "MATCHED") ||
    Boolean(actionPending);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <AppHeader user={session.user} sectionLabel="Driver dispatch" />
      <main className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="mb-7 flex flex-col gap-4 border-b border-ink/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">Manual driver dispatch</span>
              <span className="h-1 w-1 bg-ink/30" />
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-[#2D6814]">
                Nothing books automatically
              </span>
            </div>
            <h1 className="mt-3 max-w-4xl font-display text-4xl font-bold leading-[0.95] tracking-[-0.06em] sm:text-5xl lg:text-6xl">
              Choose riders. Build the trip.
            </h1>
          </div>
          <div className="flex items-center gap-2 lg:justify-end">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-ink/65">
              Board refresh
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadBoard()}
              disabled={loading || Boolean(actionPending)}
              leadingIcon={<RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />}
            >
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <DashboardSkeleton />
        ) : loadError ? (
          <ErrorState
            title="The dispatch board is unavailable"
            error={loadError}
            onRetry={() => void loadBoard()}
          />
        ) : (
          <div className="space-y-6">
            {actionError ? (
              <NoticeBanner
                tone="error"
                title={getActionErrorTitle(actionError)}
                message={getActionErrorMessage(actionError)}
                code={getErrorCode(actionError)}
                onDismiss={() => setActionError(null)}
              />
            ) : null}

            {refreshError ? (
              <NoticeBanner
                tone="warning"
                title="Live board refresh paused"
                message={refreshError instanceof Error ? refreshError.message : "The latest dispatch board could not be loaded."}
                code={getErrorCode(refreshError)}
                onDismiss={() => setRefreshError(null)}
              >
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => void loadBoard()}
                  leadingIcon={<RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
                >
                  Refresh board
                </Button>
              </NoticeBanner>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(340px,0.66fr)_minmax(0,1.34fr)]">
              <section className="dispatch-grid flex min-h-[390px] flex-col justify-between overflow-hidden p-5 text-porcelain shadow-glow sm:p-6" aria-labelledby="vehicle-status-heading">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="dark-eyebrow">Vehicle signal</p>
                      <h2 id="vehicle-status-heading" className="mt-2 font-display text-3xl font-bold tracking-[-0.055em]">
                        {vehicle?.name ?? "Vehicle"}
                      </h2>
                    </div>
                    <span
                      className={`flex items-center gap-2 border px-2.5 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.13em] ${
                        vehicle?.isOnline
                          ? "border-lime bg-lime text-ink"
                          : "border-coral bg-coral/10 text-porcelain"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${vehicle?.isOnline ? "bg-ink" : "bg-coral"}`} />
                      {vehicle?.isOnline ? "Online" : "Offline"}
                    </span>
                  </div>

                  <div className="mt-8 flex items-end justify-between gap-4 border-b border-porcelain/10 pb-5">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-cyan/65">Tesla seats</p>
                      <p className="mt-1 font-display text-6xl font-bold leading-none tracking-[-0.08em] text-lime">
                        {capacity}
                      </p>
                    </div>
                    <CarFront aria-hidden="true" className="h-16 w-16 text-cyan/25" strokeWidth={1.2} />
                  </div>

                  <SeatMeter
                    taken={selectedSeats}
                    capacity={activePool ? availableCapacity : capacity}
                    label={activePool ? `Selected to add to pool #${activePool.id}` : "Selected for next pool"}
                    lastSeatMessage={activePool ? undefined : "This leaves the vehicle’s last seat"}
                    dark
                    className="mt-6"
                  />
                </div>

                <Button
                  size="lg"
                  variant={vehicle?.isOnline ? "secondary" : "lime"}
                  loading={actionPending === "online"}
                  disabled={Boolean(actionPending)}
                  onClick={() => void handleOnlineToggle()}
                  className={`mt-8 w-full ${vehicle?.isOnline ? "border-porcelain/20 bg-porcelain/5 text-porcelain hover:bg-porcelain/10" : ""}`}
                  leadingIcon={
                    vehicle?.isOnline ? (
                      <WifiOff aria-hidden="true" className="h-4 w-4 text-coral" />
                    ) : (
                      <Radio aria-hidden="true" className="h-4 w-4" />
                    )
                  }
                >
                  {vehicle?.isOnline ? "Go offline" : "Go online"}
                </Button>
                <p className="mt-3 text-center font-mono text-[8px] uppercase tracking-[0.13em] text-cyan/65">
                  Toggle is locked while the API is changing state
                </p>
              </section>

              <section className="section-panel paper-grid min-w-0 overflow-hidden" aria-labelledby="requests-heading">
                <div className="flex flex-col gap-4 border-b border-ink/10 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
                  <div>
                    <p className="eyebrow">Open request feed</p>
                    <h2 id="requests-heading" className="mt-2 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">
                      Choose passengers manually
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-ink/65">
                      {activePool
                        ? `Select passengers you want to add to pool #${activePool.id}. Nothing is assigned until you confirm.`
                        : "Check one or more passenger requests, then confirm. No passenger is assigned or pooled automatically."}
                    </p>
                  </div>
                  <div className="shrink-0 border border-ink/10 bg-porcelain px-3 py-2 text-right">
                    <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-ink/65">Open queue</p>
                    <p className="mt-0.5 font-display text-2xl font-bold tracking-[-0.05em]">{requests.length}</p>
                  </div>
                </div>

                {requests.length === 0 ? (
                  <EmptyState
                    title="The request queue is clear"
                    message="New passenger requests will wait here until you manually select them. Your active and closed manifests remain available below."
                    icon={<CheckCircle2 aria-hidden="true" className="h-5 w-5" />}
                    className="m-5 border-0 bg-transparent"
                  />
                ) : (
                  <div className="max-h-[610px] overflow-y-auto p-4 sm:p-5">
                    <div className="space-y-3">
                      {requests.map((request) => {
                        const selected = selectedIds.has(request.id);
                        const blockReason = requestBlockReason(request);
                        const disabled = Boolean(blockReason);
                        return (
                          <label
                            key={request.id}
                            className={`selection-scan block border p-4 transition focus-within:ring-2 focus-within:ring-cyan ${
                              disabled
                                ? "cursor-not-allowed border-ink/10 bg-paper/55 opacity-70"
                                : selected
                                  ? "cursor-pointer border-ink bg-lime/15 shadow-sm"
                                  : "cursor-pointer border-ink/10 bg-porcelain hover:border-ink/30"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={disabled}
                              aria-describedby={blockReason ? `request-fit-${request.id}` : undefined}
                              onChange={() => toggleRequest(request.id)}
                              className="sr-only"
                            />
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border ${
                                  selected
                                    ? "border-ink bg-ink text-lime"
                                    : "border-ink/25 bg-paper text-transparent"
                                }`}
                                aria-hidden="true"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-ink/65">
                                      Request #{String(request.id).padStart(4, "0")}
                                    </p>
                                    <h3 className="mt-1 font-display text-lg font-bold tracking-[-0.035em]">
                                      {request.passenger.name}
                                    </h3>
                                  </div>
                                  <div className="flex flex-col items-end gap-1.5">
                                    <span className="border border-ink/10 bg-paper px-2.5 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-ink/60">
                                      {request.seats} {request.seats === 1 ? "seat" : "seats"}
                                    </span>
                                    <span
                                      id={`request-fit-${request.id}`}
                                      className={`max-w-[220px] text-right font-mono text-[8px] font-semibold uppercase leading-3 tracking-[0.1em] ${
                                        blockReason ? "text-[#8A281F]" : "text-[#2D6814]"
                                      }`}
                                    >
                                      {blockReason ??
                                        (activePool
                                          ? `Fits pool #${activePool.id}`
                                          : "Compatible route")}
                                    </span>
                                  </div>
                                </div>

                                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                  <div className="flex min-w-0 items-start gap-2 border-l-2 border-cyan pl-3">
                                    <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink/35" />
                                    <p className="break-words text-sm font-semibold leading-5 text-ink/75">
                                      {request.pickup}
                                      <span className="mx-2 text-ink/30">→</span>
                                      {request.dest}
                                    </p>
                                  </div>
                                  <p className="font-mono text-lg font-semibold tabular-nums text-ink sm:text-right">
                                    {request.estimatedFareTaka === null ? "Fare pending" : formatTaka(request.estimatedFareTaka)}
                                  </p>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-ink/15 pt-2.5 font-mono text-[8px] font-medium uppercase tracking-[0.12em] text-ink/65">
                                  <span className="flex items-center gap-1.5">
                                    <Clock3 aria-hidden="true" className="h-3 w-3" />
                                    {formatAge(request.createdAt, now)}
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <UsersRound aria-hidden="true" className="h-3 w-3" />
                                    {request.seats} held
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <CircleDot aria-hidden="true" className="h-3 w-3 text-amber" />
                                    Waiting
                                  </span>
                                </div>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="border-t border-ink/10 bg-paper/75 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-ink/65">
                          Manual selection
                        </p>
                        <p className="font-mono text-sm font-semibold tabular-nums text-ink">
                          {activePool
                            ? `${activePool.seatsTaken}+${selectedSeats}/${activePool.capacity}`
                            : `${selectedSeats}/${capacity}`} seats
                        </p>
                      </div>
                      <div className="mt-2 h-2 border border-ink/20 bg-porcelain">
                        <div
                          className={`h-full ${selectedOverCapacity ? "bg-coral" : "bg-ink"}`}
                          style={{ width: `${Math.min(100, availableCapacity ? (selectedSeats / availableCapacity) * 100 : 0)}%` }}
                        />
                      </div>
                    </div>
                    <Button
                      variant="lime"
                      onClick={() => void handleAssignPassengers()}
                      loading={
                        actionPending === "assign" ||
                        (activePool
                          ? actionPending === `add:${activePool.id}`
                          : false)
                      }
                      disabled={createDisabled}
                      className="w-full shrink-0 sm:w-auto"
                      leadingIcon={<Layers3 aria-hidden="true" className="h-4 w-4" />}
                    >
                      {activePool ? `Assign to pool #${activePool.id}` : "Assign selected passengers"}
                    </Button>
                  </div>
                  <p className={`mt-3 text-xs leading-5 ${selectedOverCapacity ? "font-semibold text-[#8A281F]" : "text-ink/65"}`} aria-live="polite">
                    {!vehicle?.isOnline
                      ? "Go online before assigning passengers."
                      : activePool && activePool.status !== "MATCHED"
                        ? `Pool #${activePool.id} is past the matching stage; new passengers are locked out.`
                        : selectedIds.size === 0
                          ? activePool
                            ? `Select waiting passengers to add to pool #${activePool.id}.`
                            : "Select at least one passenger to create the manifest."
                          : selectedOverCapacity
                            ? `This selection needs ${selectedSeats} seats; only ${availableCapacity} can be added to the current manifest.`
                            : `${selectedIds.size} passenger${selectedIds.size === 1 ? "" : "s"} selected. Confirm to assign; the API then checks corridor and capacity.`}
                  </p>
                </div>
              </section>
            </div>

            <section aria-labelledby="active-pools-heading">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="eyebrow">04 / Active manifests</p>
                  <h2 id="active-pools-heading" className="mt-2 font-display text-3xl font-bold tracking-[-0.05em]">
                    Pools needing action
                  </h2>
                </div>
                <p className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-ink/65">
                  <BatteryCharging aria-hidden="true" className="h-4 w-4 text-[#2D6814]" />
                  Only the valid next action is shown
                </p>
              </div>

              {activePools.length === 0 ? (
                <EmptyState
                  title="No active manifest"
                  message="Select waiting passengers above and confirm the assignment to create the first manifest."
                  icon={<Route aria-hidden="true" className="h-5 w-5" />}
                />
              ) : (
                <div className="space-y-4">
                  {activePools.map((pool) => (
                    <PoolCard
                      key={pool.id}
                      pool={pool}
                      actionPending={actionPending}
                      onAction={(poolId, action) => void handlePoolAction(poolId, action)}
                      onCancel={setCancelPool}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="section-panel overflow-hidden" aria-labelledby="pool-history-heading">
              <div className="flex flex-col gap-3 border-b border-ink/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <p className="eyebrow">05 / Closed manifests</p>
                  <h2 id="pool-history-heading" className="mt-2 font-display text-2xl font-bold tracking-[-0.045em]">
                    Pool history
                  </h2>
                </div>
                <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-ink/65">
                  {historicalPools.length} closed {historicalPools.length === 1 ? "pool" : "pools"}
                </span>
              </div>

              {historicalPools.length === 0 ? (
                <EmptyState
                  title="No closed pools yet"
                  message="Completed and cancelled manifests remain here with the passenger roster and final capacity."
                  icon={<Clock3 aria-hidden="true" className="h-5 w-5" />}
                  className="m-5 border-0 bg-transparent"
                />
              ) : (
                <div className="space-y-4 p-4 sm:p-5">
                  {historicalPools.map((pool) => (
                    <PoolCard
                      key={pool.id}
                      pool={pool}
                      actionPending={actionPending}
                      onAction={(poolId, action) => void handlePoolAction(poolId, action)}
                      onCancel={setCancelPool}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={Boolean(cancelPool)}
        title={`Cancel pool #${cancelPool?.id ?? ""}?`}
        description="The backend only allows this while the pool is matched. The manifest will be retained in history."
        confirmLabel="Cancel pool"
        busy={actionPending === `${cancelPool?.id}:cancel`}
        onConfirm={() => void confirmPoolCancellation()}
        onCancel={() => setCancelPool(null)}
      />

      {toast ? (
        <ToastMessage
          message={toast.message}
          code={toast.code}
          tone={toast.tone}
          onDismiss={dismissToast}
        />
      ) : null}
    </div>
  );
}
