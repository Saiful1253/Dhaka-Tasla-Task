"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch, getErrorCode, getErrorMessage } from "@/lib/api/client";
import type { MapLocation } from "@/lib/api/types";

export type DriverLocationStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unsupported"
  | "error";

interface LocationResponse {
  location: MapLocation & { updatedAt: string };
}

const LOCATION_SYNC_INTERVAL_MS = 10_000;
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 20_000,
};

/**
 * Shares a driver's browser GPS point while the vehicle is online. The local
 * marker follows every watchPosition callback immediately; writes to the API
 * are throttled so a moving phone does not flood the backend.
 */
export function useDriverLocation(isOnline: boolean) {
  const [location, setLocation] = useState<MapLocation | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<DriverLocationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const isOnlineRef = useRef(isOnline);
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef(0);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const stopWatching = useCallback(() => {
    if (
      watchIdRef.current !== null &&
      typeof navigator !== "undefined" &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const sharePosition = useCallback(
    (position: GeolocationPosition) => {
      if (!isOnlineRef.current) return;

      const nextLocation: MapLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      // This local state update is deliberately not throttled. The SVG marker
      // should move as soon as the browser produces a new GPS fix.
      setLocation(nextLocation);
      setStatus("active");
      setError(null);

      const now = Date.now();
      const shouldSync =
        lastSentAtRef.current === 0 ||
        now - lastSentAtRef.current >= LOCATION_SYNC_INTERVAL_MS;
      if (!shouldSync) return;

      lastSentAtRef.current = now;
      setLastUpdatedAt(new Date(now).toISOString());
      void apiFetch<LocationResponse>("/driver/location", {
        method: "POST",
        auth: true,
        body: nextLocation,
      })
        .then((result) => setLastUpdatedAt(result.location.updatedAt))
        .catch((requestError) => {
          lastSentAtRef.current = 0;
          if (getErrorCode(requestError) === "VEHICLE_OFFLINE") {
            stopWatching();
            setStatus("idle");
            return;
          }
          setError(getErrorMessage(requestError));
        });
    },
    [stopWatching],
  );

  const handleLocationError = useCallback(
    (locationError: GeolocationPositionError) => {
      stopWatching();
      if (locationError.code === locationError.PERMISSION_DENIED) {
        setStatus("denied");
        setError(
          "Location permission was denied. Enable it in browser settings to use nearby suggestions."
        );
        return;
      }
      setStatus("error");
      setError(
        locationError.code === locationError.TIMEOUT
          ? "Location request timed out. Try again when you have a clearer signal."
          : "Your location could not be determined. Try again."
      );
    },
    [stopWatching],
  );

  const enableLocation = useCallback(() => {
    if (!isOnline) {
      setStatus("idle");
      setError("Go online before sharing your location.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      setError("This browser does not provide GPS location.");
      return;
    }

    stopWatching();
    lastSentAtRef.current = 0;
    setStatus("requesting");
    setError(null);
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        sharePosition,
        handleLocationError,
        GEOLOCATION_OPTIONS
      );
    } catch {
      setStatus("error");
      setError("Live location could not be started in this browser.");
    }
  }, [handleLocationError, isOnline, sharePosition, stopWatching]);

  useEffect(() => {
    if (!isOnline) {
      stopWatching();
      lastSentAtRef.current = 0;
      setLocation(null);
      setLastUpdatedAt(null);
      setStatus("idle");
      setError(null);
    }
  }, [isOnline, stopWatching]);

  useEffect(() => () => stopWatching(), [stopWatching]);

  return {
    location,
    lastUpdatedAt,
    status,
    error,
    enableLocation,
  };
}
