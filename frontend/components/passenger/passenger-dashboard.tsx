"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  LockKeyhole,
  MapPin,
  RefreshCw,
  Route,
  Search,
  Send,
  TicketCheck,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { LiveBookingActivity } from "@/components/passenger/live-booking-activity";
import { ManualAssignmentPanel } from "@/components/passenger/manual-assignment-panel";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DashboardSkeleton,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  NoticeBanner,
  ToastMessage,
} from "@/components/ui/feedback";
import { FareBreakdown } from "@/components/ui/fare-breakdown";
import { Field, selectClassName } from "@/components/ui/field";
import { RouteDisplay } from "@/components/ui/route-display";
import { SeatMeter } from "@/components/ui/seat-meter";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, getErrorCode } from "@/lib/api/client";
import type {
  Area,
  FareEstimate,
  PassengerPoolDetails,
  Ride,
} from "@/lib/api/types";
import { isTerminalRide } from "@/lib/api/types";
import { formatDateTime, formatTaka } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";

interface RideResponse {
  ride: Ride;
}

interface CancelResponse {
  ok: true;
  id: number;
  status: "CANCELLED";
}

interface HistoryDeleteResponse {
  ok: true;
  id?: number;
  deletedCount: number;
}

interface PoolDetailsResponse {
  pool: PassengerPoolDetails;
}

export function PassengerDashboard() {
  const { session } = useAuth();
  const { toast, showToast, dismissToast } = useToast();
  const [areas, setAreas] = useState<Area[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [selectedRideId, setSelectedRideId] = useState<number | null>(null);
  const [selectedPool, setSelectedPool] = useState<PassengerPoolDetails | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState<unknown>(null);
  const [poolRefresh, setPoolRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [seats, setSeats] = useState(1);
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [estimateKey, setEstimateKey] = useState<string | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimateRefresh, setEstimateRefresh] = useState(0);
  const [formError, setFormError] = useState<unknown>(null);
  const [formErrors, setFormErrors] = useState<{ pickup?: string; destination?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [pollError, setPollError] = useState<unknown>(null);
  const [pollingNow, setPollingNow] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [historyDeleteId, setHistoryDeleteId] = useState<number | null>(null);
  const [deleteAllHistoryOpen, setDeleteAllHistoryOpen] = useState(false);
  const [deletingHistory, setDeletingHistory] = useState(false);

  const selectedRide = useMemo(
    () => rides.find((ride) => ride.id === selectedRideId) ?? null,
    [rides, selectedRideId],
  );
  const currentEstimateKey =
    pickup && destination && pickup !== destination
      ? `${pickup}:${destination}:${seats}`
      : null;
  const estimateIsCurrent =
    Boolean(estimate) &&
    estimateKey === currentEstimateKey &&
    estimate?.pickup === areas.find((area) => String(area.id) === pickup)?.name &&
    estimate?.dest ===
      areas.find((area) => String(area.id) === destination)?.name &&
    estimate?.seats === seats;

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [areaData, rideData] = await Promise.all([
        apiFetch<{ areas: Area[] }>("/areas", { signal }),
        apiFetch<{ rides: Ride[] }>("/rides", { auth: true, signal }),
      ]);
      setAreas(areaData.areas);
      setRides(rideData.rides);
      setSelectedRideId((current) => {
        if (current && rideData.rides.some((ride) => ride.id === current)) return current;
        return (
          rideData.rides.find((ride) => !isTerminalRide(ride.status))?.id ??
          rideData.rides[0]?.id ??
          null
        );
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard]);

  useEffect(() => {
    setEstimate(null);
    setEstimateKey(null);
    if (!pickup || !destination || pickup === destination) {
      setEstimateError(
        pickup && destination && pickup === destination
          ? "Pickup and destination must be different."
          : null,
      );
      setEstimateLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setEstimateLoading(true);
      setEstimateError(null);
      try {
        const params = new URLSearchParams({
          pickup,
          dest: destination,
          seats: String(seats),
          poolSize: "1",
        });
        const data = await apiFetch<FareEstimate>(`/rides/estimate?${params.toString()}`, {
          signal: controller.signal,
        });
        setEstimate(data);
        setEstimateKey(`${pickup}:${destination}:${seats}`);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setEstimate(null);
        setEstimateKey(null);
        setEstimateError(
          error instanceof Error ? error.message : "Could not calculate this fare.",
        );
      } finally {
        if (!controller.signal.aborted) setEstimateLoading(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [destination, estimateRefresh, pickup, seats]);

  const refreshRides = useCallback(async () => {
    const data = await apiFetch<{ rides: Ride[] }>("/rides", { auth: true });
    setRides(data.rides);
    setSelectedRideId((current) => {
      if (current && data.rides.some((ride) => ride.id === current)) return current;
      return data.rides.find((ride) => !isTerminalRide(ride.status))?.id ?? data.rides[0]?.id ?? null;
    });
    return data.rides;
  }, []);

  const pollRide = useCallback(
    async (rideId: number) => {
      if (pollingNow) return;
      setPollingNow(true);
      try {
        const data = await apiFetch<RideResponse>(`/rides/${rideId}`, { auth: true });
        setRides((current) => {
          const exists = current.some((ride) => ride.id === data.ride.id);
          const next = exists
            ? current.map((ride) => (ride.id === data.ride.id ? data.ride : ride))
            : [data.ride, ...current];
          return [...next].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
        });
        setPollError(null);
        if (isTerminalRide(data.ride.status)) {
          try {
            await refreshRides();
          } catch {
            // The terminal response is already current; history retries on the next manual refresh.
          }
        }
      } catch (error) {
        setPollError(error);
      } finally {
        setPollingNow(false);
      }
    },
    [pollingNow, refreshRides],
  );

  useEffect(() => {
    if (!selectedRide || isTerminalRide(selectedRide.status)) return;

    const timeout = window.setTimeout(() => {
      void pollRide(selectedRide.id);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [pollRide, selectedRide]);

  const selectedPoolId = selectedRide?.pool?.id ?? null;
  useEffect(() => {
    // Do not carry a prior ride's manifest (or total) into a newly selected ride.
    setSelectedPool(null);
  }, [selectedPoolId]);
  useEffect(() => {
    if (!selectedPoolId) {
      setSelectedPool(null);
      setPoolError(null);
      return;
    }

    const controller = new AbortController();
    let disposed = false;
    const load = async (showLoading: boolean) => {
      if (showLoading) setPoolLoading(true);
      try {
        const data = await apiFetch<PoolDetailsResponse>(
          `/pools/${selectedPoolId}`,
          { auth: true, signal: controller.signal },
        );
        if (!disposed) {
          setSelectedPool(data.pool);
          setPoolError(null);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!disposed) setPoolError(error);
      } finally {
        if (!disposed && showLoading) setPoolLoading(false);
      }
    };

    void load(true);
    const interval = window.setInterval(() => void load(false), 5000);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [poolRefresh, selectedPoolId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: { pickup?: string; destination?: string } = {};
    if (!pickup) errors.pickup = "Choose your pickup area.";
    if (!destination) errors.destination = "Choose your destination area.";
    if (pickup && destination && pickup === destination) {
      errors.destination = "Choose a destination different from pickup.";
    }
    setFormErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;
    if (!estimateIsCurrent) {
      setFormError(
        new Error(
          "Wait for a successful fare estimate for this exact route and seat count before requesting the ride."
        )
      );
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiFetch<RideResponse>("/rides", {
        method: "POST",
        auth: true,
        body: {
          pickupAreaId: Number(pickup),
          destAreaId: Number(destination),
          seats,
        },
      });
      setRides((current) => [
        data.ride,
        ...current.filter((ride) => ride.id !== data.ride.id),
      ]);
      setSelectedRideId(data.ride.id);
      showToast({
        tone: "success",
        message: `Ride #${data.ride.id} is waiting for a driver to select it manually.`,
      });
    } catch (error) {
      setFormError(error);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmHistoryDeletion() {
    if (historyDeleteId === null || deletingHistory) return;
    setDeletingHistory(true);
    try {
      await apiFetch<HistoryDeleteResponse>(
        `/rides/history/${historyDeleteId}`,
        { method: "DELETE", auth: true },
      );
      setHistoryDeleteId(null);
      showToast({
        tone: "success",
        message: `Ride #${historyDeleteId} was removed from your history.`,
      });
      try {
        await refreshRides();
      } catch {
        // The confirmed removal remains visible locally if the refresh fails.
      }
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not remove this ride from history.",
        code: getErrorCode(error),
      });
    } finally {
      setDeletingHistory(false);
    }
  }

  async function confirmDeleteAllHistory() {
    if (deletingHistory) return;
    setDeletingHistory(true);
    try {
      const data = await apiFetch<HistoryDeleteResponse>("/rides/history", {
        method: "DELETE",
        auth: true,
      });
      setDeleteAllHistoryOpen(false);
      showToast({
        tone: "success",
        message:
          data.deletedCount === 1
            ? "1 completed ride was removed from your history."
            : `${data.deletedCount} completed rides were removed from your history.`,
      });
      try {
        await refreshRides();
      } catch {
        // Keep the local board usable if the follow-up read is unavailable.
      }
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not clear your ride history.",
        code: getErrorCode(error),
      });
    } finally {
      setDeletingHistory(false);
    }
  }

  async function confirmCancellation() {
    if (!selectedRide) return;
    setCancelling(true);
    try {
      const data = await apiFetch<CancelResponse>(`/rides/${selectedRide.id}`, {
        method: "DELETE",
        auth: true,
      });
      setRides((current) =>
        current.map((ride) =>
          ride.id === data.id ? { ...ride, status: "CANCELLED" as const } : ride,
        ),
      );
      setCancelOpen(false);
      showToast({
        tone: "success",
        message: `Ride #${data.id} was cancelled and its seats released.`,
      });
      try {
        await refreshRides();
      } catch {
        // Keep the confirmed cancellation visible if follow-up reads are unavailable.
      }
    } catch (error) {
      setCancelOpen(false);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not cancel this ride.",
        code: getErrorCode(error),
      });
      try {
        await refreshRides();
      } catch {
        // The original action error is the important one.
      }
    } finally {
      setCancelling(false);
    }
  }

  if (!session) return null;

  const canCancelSelected =
    selectedRide?.status === "REQUESTED" || selectedRide?.status === "MATCHED";
  const historyCount = rides.filter((ride) => isTerminalRide(ride.status)).length;
  const canDeleteAllHistory = historyCount > 0;
  const currentPoolMember = selectedPool?.members.find((member) => member.isMe) ?? null;
  const currentPoolTotalTaka =
    currentPoolMember?.myFareTaka ?? currentPoolMember?.myFare?.totalTaka ?? null;
  const currentPoolDiscountTaka = currentPoolMember?.myFare?.discountTaka ?? 0;
  const currentPoolHasDiscount = currentPoolDiscountTaka > 0;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <AppHeader user={session.user} sectionLabel="Passenger desk" />
      <main className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="mb-7 flex flex-col gap-4 border-b border-ink/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">Passenger request desk</span>
              <span className="h-1 w-1 bg-ink/30" />
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-[#2D6814]">
                Manual driver selection
              </span>
            </div>
            <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-[0.95] tracking-[-0.06em] sm:text-5xl lg:text-6xl">
              Request first. Get chosen.
            </h1>
          </div>
          <p className="max-w-sm text-sm leading-6 text-ink/60 sm:text-right">
            Send an unassigned request, wait for a driver to select you, and track every manual step.
          </p>
        </div>

        {loading ? (
          <DashboardSkeleton />
        ) : loadError ? (
          <ErrorState
            title="Your passenger board is unavailable"
            error={loadError}
            onRetry={() => void loadDashboard()}
          />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
              <section className="section-panel paper-grid overflow-hidden" aria-labelledby="request-heading">
                <div className="flex items-start justify-between gap-4 border-b border-ink/10 p-5 sm:p-6">
                  <div>
                    <p className="eyebrow">01 / New request</p>
                    <h2 id="request-heading" className="mt-2 font-display text-2xl font-bold tracking-[-0.045em]">
                      Plot your route
                    </h2>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center bg-ink text-lime">
                    <Route aria-hidden="true" className="h-5 w-5" />
                  </span>
                </div>

                <form className="p-5 sm:p-6" onSubmit={handleSubmit} noValidate>
                  {formError ? (
                    <NoticeBanner
                      tone="error"
                      title="Ride request was not sent"
                      message={formError instanceof Error ? formError.message : "Please check the route and try again."}
                      code={getErrorCode(formError)}
                      onDismiss={() => setFormError(null)}
                      className="mb-5"
                    />
                  ) : null}

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field id="pickup" label="Pickup area" required error={formErrors.pickup}>
                      <select
                        id="pickup"
                        value={pickup}
                        onChange={(event) => {
                          setPickup(event.target.value);
                          if (event.target.value === destination) setDestination("");
                        }}
                        className={selectClassName}
                        aria-invalid={Boolean(formErrors.pickup)}
                        aria-describedby={formErrors.pickup ? "pickup-error" : undefined}
                      >
                        <option value="">Choose pickup</option>
                        {areas.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      id="destination"
                      label="Destination area"
                      required
                      error={formErrors.destination}
                    >
                      <select
                        id="destination"
                        value={destination}
                        onChange={(event) => setDestination(event.target.value)}
                        className={selectClassName}
                        aria-invalid={Boolean(formErrors.destination)}
                        aria-describedby={formErrors.destination ? "destination-error" : undefined}
                      >
                        <option value="">Choose destination</option>
                        {areas.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <fieldset className="mt-5">
                    <legend className="font-display text-xs font-bold uppercase tracking-[0.13em] text-ink">
                      Seats needed
                    </legend>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {[1, 2, 3].map((seatCount) => (
                        <label key={seatCount} className="cursor-pointer">
                          <input
                            type="radio"
                            name="seats"
                            value={seatCount}
                            checked={seats === seatCount}
                            onChange={() => setSeats(seatCount)}
                            className="peer sr-only"
                          />
                          <span className="flex min-h-12 items-center justify-center gap-2 border border-ink/15 bg-porcelain font-mono text-sm font-semibold transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-porcelain hover:border-ink/45 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan">
                            <UserRound aria-hidden="true" className="h-4 w-4" />
                            {seatCount} {seatCount === 1 ? "seat" : "seats"}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="mt-6 border-t border-ink/10 pt-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="font-display text-xs font-bold uppercase tracking-[0.13em] text-ink">
                        Solo fare estimate
                      </p>
                      <button
                        type="button"
                        onClick={() => setEstimateRefresh((value) => value + 1)}
                        disabled={!pickup || !destination || pickup === destination}
                        className="inline-flex min-h-9 items-center gap-1.5 px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-ink/65 transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <RefreshCw
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 ${estimateLoading ? "animate-spin" : ""}`}
                        />
                        Refresh
                      </button>
                    </div>

                    {estimateError ? (
                      <NoticeBanner tone="warning" message={estimateError} />
                    ) : estimateLoading ? (
                      <div className="border border-ink/10 bg-paper/70 p-5" role="status" aria-label="Calculating fare">
                        <LoadingSkeleton className="h-3 w-24" />
                        <LoadingSkeleton className="mt-5 h-8 w-36" />
                        <div className="mt-5 grid grid-cols-2 gap-3">
                          <LoadingSkeleton className="h-16" />
                          <LoadingSkeleton className="h-16" />
                        </div>
                      </div>
                    ) : estimate ? (
                      <FareBreakdown
                        fare={estimate}
                        caption="Solo estimate"
                        totalLabel="Solo estimate"
                        className="border border-ink/10 bg-paper/70 p-5"
                      />
                    ) : (
                      <div className="border border-dashed border-ink/20 bg-paper/50 p-5 text-center">
                        <MapPin aria-hidden="true" className="mx-auto h-5 w-5 text-ink/35" />
                        <p className="mt-2 text-sm font-semibold text-ink/60">
                          Choose two different areas to calculate your fare.
                        </p>
                        <p className="mt-1 text-xs text-ink/65">The backend supplies every amount.</p>
                      </div>
                    )}
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    loading={submitting}
                    disabled={!estimateIsCurrent}
                    className="mt-6 w-full"
                    leadingIcon={<Send aria-hidden="true" className="h-4 w-4" />}
                  >
                    {estimateIsCurrent ? "Send request to driver" : "Waiting for current fare"}
                  </Button>
                  <p className="mt-3 text-center text-[11px] leading-5 text-ink/65" aria-live="polite">
                    {estimateIsCurrent
                      ? "This request stays unassigned until a driver manually selects it."
                      : "Submission unlocks only after this exact route and seat selection is estimated."}
                  </p>
                </form>
              </section>

              <section className="section-panel min-w-0 overflow-hidden" aria-labelledby="ride-status-heading">
                <div className="flex flex-col gap-3 border-b border-ink/10 bg-ink p-5 text-porcelain sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div>
                    <p className="dark-eyebrow">02 / Ride signal</p>
                    <h2 id="ride-status-heading" className="mt-2 font-display text-2xl font-bold tracking-[-0.045em]">
                      {selectedRide && !isTerminalRide(selectedRide.status)
                        ? "Current ride"
                        : "Selected ride"}
                    </h2>
                  </div>
                  {selectedRide ? (
                    <StatusBadge status={selectedRide.status} className="border-porcelain/20 bg-porcelain/10 text-porcelain before:bg-lime" />
                  ) : null}
                </div>

                {selectedRide ? (
                  <div className="p-5 sm:p-6">
                    <div className="grid gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(240px,0.7fr)]">
                      <div>
                        <div className="mb-5 flex items-center justify-between border-b border-dashed border-ink/20 pb-3">
                          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-ink/65">
                            Ride #{String(selectedRide.id).padStart(4, "0")}
                          </p>
                          <p className="flex items-center gap-1.5 font-mono text-[9px] font-medium text-ink/65">
                            <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                            {formatDateTime(selectedRide.createdAt)}
                          </p>
                        </div>
                        <RouteDisplay
                          pickup={selectedRide.pickupArea.name}
                          destination={selectedRide.destArea.name}
                          pickupLabel="Ride pickup"
                          destinationLabel="Final drop-off"
                        />
                        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-ink/10 pt-4">
                          <div>
                            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink/65">Seats requested</p>
                            <p className="mt-1 font-display text-lg font-bold">{selectedRide.seatsRequested}</p>
                          </div>
                          <div>
                            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink/65">Manifest</p>
                            <p className="mt-1 font-display text-lg font-bold">
                              {selectedRide.pool ? `#${selectedRide.pool.id}` : "Not assigned"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col">
                        {selectedRide.fare ? (
                          <FareBreakdown
                            fare={selectedRide.fare}
                            compact
                            caption="Your final fare"
                            totalLabel="Your final fare"
                          />
                        ) : (
                          <EmptyState
                            title="Fare unavailable"
                            message="This ride does not have a fare attached yet."
                            className="flex-1"
                          />
                        )}
                      </div>
                    </div>

                    {selectedRide.pool ? (
                      <section className="mt-6 border border-ink/15 bg-paper/65 p-4 sm:p-5" aria-labelledby="pool-manifest-heading">
                        <div className="flex flex-col gap-3 border-b border-ink/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="eyebrow">Shared manifest</p>
                            <h3 id="pool-manifest-heading" className="mt-1 font-display text-lg font-bold tracking-[-0.035em]">
                              Pool #{String(selectedRide.pool.id).padStart(3, "0")} · {selectedPool?.vehicle ?? "Loading vehicle"}
                            </h3>
                            <p className="mt-1 text-xs text-ink/65">
                              {selectedPool ? `${selectedPool.driver.name} is driving · routes are shared, fares stay private.` : "Loading the rider-only manifest."}
                            </p>
                          </div>
                          {selectedPool ? <StatusBadge status={selectedPool.status} compact /> : null}
                        </div>

                        {selectedPool && currentPoolMember && currentPoolTotalTaka !== null ? (
                          <div
                            className="mt-4 border border-ink/15 bg-ink p-4 text-porcelain sm:p-5"
                            aria-live="polite"
                            aria-atomic="true"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                              <div>
                                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-cyan/80">
                                  {currentPoolHasDiscount ? "YOUR DISCOUNTED TOTAL" : "YOUR FINAL TOTAL"}
                                </p>
                                <p className="mt-2 font-display text-4xl font-bold leading-none tracking-[-0.07em] tabular-nums text-porcelain sm:text-5xl">
                                  {formatTaka(currentPoolTotalTaka)}
                                </p>
                              </div>
                              {currentPoolHasDiscount ? (
                                <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-lime">
                                  You saved {formatTaka(currentPoolDiscountTaka)}
                                </p>
                              ) : null}
                            </div>
                            <p className="mt-3 border-t border-porcelain/15 pt-3 text-[11px] leading-5 text-porcelain/65">
                              {currentPoolHasDiscount
                                ? "Pool discount applied · your final amount"
                                : "No pool discount · your final amount"}
                            </p>
                          </div>
                        ) : null}

                        {poolLoading && !selectedPool ? (
                          <div className="mt-4 space-y-3" role="status" aria-label="Loading pool manifest">
                            <LoadingSkeleton className="h-3 w-32" />
                            <LoadingSkeleton className="h-12 w-full" />
                            <LoadingSkeleton className="h-12 w-full" />
                          </div>
                        ) : poolError ? (
                          <NoticeBanner
                            tone="warning"
                            title="Pool manifest could not refresh"
                            message={poolError instanceof Error ? poolError.message : "The live roster is unavailable."}
                            code={getErrorCode(poolError)}
                            className="mt-4"
                          >
                            <Button
                              variant="secondary"
                              size="sm"
                              className="mt-3"
                              onClick={() => setPoolRefresh((value) => value + 1)}
                              leadingIcon={<RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
                            >
                              Retry manifest
                            </Button>
                          </NoticeBanner>
                        ) : selectedPool ? (
                          <div className="mt-4 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                            <div className="border border-ink/10 bg-porcelain p-3">
                              <SeatMeter
                                taken={selectedPool.seatsTaken}
                                capacity={selectedPool.capacity}
                                label="Pool capacity"
                                lastSeatMessage="Final seat is in use"
                                compact
                              />
                              <p className="mt-3 flex items-center gap-1.5 text-[11px] leading-4 text-ink/65">
                                <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                                Other passenger fares are never returned.
                              </p>
                            </div>
                            <ul className="divide-y divide-ink/10 border border-ink/10 bg-porcelain px-3" aria-label="Passengers in your pool">
                              {selectedPool.members.map((member) => (
                                <li key={member.requestId} className="flex items-center justify-between gap-3 py-2.5">
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-bold text-ink">
                                      {member.passenger.name}{member.isMe ? " · you" : ""}
                                    </p>
                                    <p className="mt-0.5 truncate font-mono text-[8px] uppercase tracking-[0.1em] text-ink/65">
                                      {member.pickup} → {member.dest}
                                    </p>
                                  </div>
                                  <span className="shrink-0 font-mono text-[9px] font-semibold text-ink/65">
                                    {member.seats} {member.seats === 1 ? "seat" : "seats"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    <div className="mt-6 flex flex-col gap-3 border-t border-ink/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                      <p className="flex items-center gap-2 text-xs text-ink/65" aria-live="polite">
                        {isTerminalRide(selectedRide.status) ? (
                          <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-ink" />
                        ) : pollingNow ? (
                          <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin text-ink" />
                        ) : (
                          <CircleDot aria-hidden="true" className="h-4 w-4 animate-soft-pulse text-[#2D6814]" />
                        )}
                        {isTerminalRide(selectedRide.status)
                          ? "This status is final. The trip is no longer polled."
                          : pollingNow
                            ? "Checking the live status now…"
                            : "Live status refreshes every 5 seconds."}
                      </p>
                      {canCancelSelected ? (
                        <Button
                          variant="secondary"
                          onClick={() => setCancelOpen(true)}
                          leadingIcon={<XCircle aria-hidden="true" className="h-4 w-4 text-coral" />}
                        >
                          Cancel this ride
                        </Button>
                      ) : null}
                    </div>

                    {pollError ? (
                      <NoticeBanner
                        tone="warning"
                        title="Live updates paused"
                        message={pollError instanceof Error ? pollError.message : "The last status check failed."}
                        code={getErrorCode(pollError)}
                        className="mt-4"
                      >
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void pollRide(selectedRide.id)}
                          className="mt-3"
                          leadingIcon={<RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
                        >
                          Retry now
                        </Button>
                      </NoticeBanner>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState
                    title="No ride on your board yet"
                    message="Choose a pickup and destination to send your first driver-selection request."
                    icon={<Search aria-hidden="true" className="h-5 w-5" />}
                    className="m-5 border-0 bg-transparent"
                  />
                )}
              </section>
            </div>

            <LiveBookingActivity />

            <ManualAssignmentPanel ride={selectedRide} />

            <section className="section-panel overflow-hidden" aria-labelledby="history-heading">
              <div className="flex flex-col gap-3 border-b border-ink/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <p className="eyebrow">05 / Ride ledger</p>
                  <h2 id="history-heading" className="mt-2 font-display text-2xl font-bold tracking-[-0.045em]">
                    Your ride history
                  </h2>
                </div>
                <div className="flex flex-col items-start gap-3 sm:items-end">
                  <p className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-ink/65">
                    <CalendarDays aria-hidden="true" className="h-4 w-4" />
                    {rides.length} {rides.length === 1 ? "ride" : "rides"} · newest first
                  </p>
                  {canDeleteAllHistory ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDeleteAllHistoryOpen(true)}
                      disabled={deletingHistory}
                      leadingIcon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />}
                    >
                      Delete all history
                    </Button>
                  ) : null}
                </div>
              </div>

              {rides.length === 0 ? (
                <EmptyState
                  title="Your ledger is clear"
                  message="New requests and completed trips will appear here with your route, status, and fare."
                  icon={<TicketCheck aria-hidden="true" className="h-5 w-5" />}
                  className="m-5 border-0 bg-transparent"
                />
              ) : (
                <div className="divide-y divide-ink/10">
                  {rides.map((ride) => {
                    const active = ride.id === selectedRideId;
                    return (
                      <div
                        key={ride.id}
                        className={`group transition hover:bg-paper/70 ${
                          active ? "bg-lime/10" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedRideId(ride.id)}
                          className="grid w-full gap-4 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center sm:p-5"
                          aria-label={`View ride ${ride.id} from ${ride.pickupArea.name} to ${ride.destArea.name}`}
                          aria-pressed={active}
                        >
                          <div>
                            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-ink/65">
                              Ride ticket
                            </p>
                            <p className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">
                              #{String(ride.id).padStart(4, "0")}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-start gap-2 text-sm font-semibold text-ink">
                              <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink/65" />
                              <span className="break-words">
                                {ride.pickupArea.name}
                                <ArrowDownToLine aria-hidden="true" className="mx-2 inline h-3.5 w-3.5 -translate-y-px text-ink/35" />
                                {ride.destArea.name}
                              </span>
                            </div>
                            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.11em] text-ink/65">
                              {formatDateTime(ride.createdAt)} · {ride.seatsRequested}{" "}
                              {ride.seatsRequested === 1 ? "seat" : "seats"}
                            </p>
                          </div>
                          <div className="flex items-center justify-between gap-4 sm:justify-end">
                            <StatusBadge status={ride.status} compact />
                            <p className="min-w-20 text-right font-mono text-base font-semibold tabular-nums text-ink">
                              {ride.fare ? formatTaka(ride.fare.totalTaka) : "—"}
                            </p>
                          </div>
                        </button>
                        {isTerminalRide(ride.status) ? (
                          <div className="flex justify-end border-t border-ink/10 px-4 pb-3 sm:px-5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setHistoryDeleteId(ride.id)}
                              disabled={deletingHistory}
                              leadingIcon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />}
                            >
                              Remove from history
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={cancelOpen}
        title={`Cancel ride #${selectedRide?.id ?? ""}?`}
        description="This releases your held seats immediately. The cancellation cannot be undone."
        confirmLabel="Cancel ride"
        cancelLabel="Keep ride"
        busy={cancelling}
        onConfirm={() => void confirmCancellation()}
        onCancel={() => setCancelOpen(false)}
      />

      <ConfirmDialog
        open={historyDeleteId !== null}
        title={`Remove ride #${historyDeleteId ?? ""} from history?`}
        description="This hides this completed or cancelled ride from your personal history. Active rides cannot be removed."
        confirmLabel="Remove ride"
        cancelLabel="Keep history"
        busy={deletingHistory}
        onConfirm={() => void confirmHistoryDeletion()}
        onCancel={() => setHistoryDeleteId(null)}
      />

      <ConfirmDialog
        open={deleteAllHistoryOpen}
        title="Delete all completed history?"
        description="This removes every completed or cancelled ride from your personal history. Active and waiting rides stay untouched."
        confirmLabel="Delete all history"
        cancelLabel="Keep history"
        busy={deletingHistory}
        onConfirm={() => void confirmDeleteAllHistory()}
        onCancel={() => setDeleteAllHistoryOpen(false)}
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
