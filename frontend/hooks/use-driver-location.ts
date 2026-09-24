"use client";

import { useCallback, useEffect, useState } from "react";

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

const LOCATION_REFRESH_MS = 30_000;
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15_000,
  timeout: 15_000,
};

/**
 * Shares a driver's browser GPS point while the vehicle is online. The hook is
 * intentionally permission-driven: the driver explicitly enables location
 * sharing, then the point is refreshed every 30 seconds.
 */
export function useDriverLocation(isOnline: boolean) {
  const [location, setLocation] = useState<MapLocation | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<DriverLocationStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const sharePosition = useCallback((position: GeolocationPosition) => {
    const nextLocation: MapLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
    setLocation(nextLocation);
    setStatus("active");
    setError(null);

    void apiFetch<LocationResponse>("/driver/location", {
      method: "POST",
      auth: true,
      body: nextLocation,
    })
      .then((result) => setLastUpdatedAt(result.location.updatedAt))
      .catch((requestError) => {
        if (getErrorCode(requestError) === "VEHICLE_OFFLINE") {
          setStatus("idle");
          return;
        }
        setError(getErrorMessage(requestError));
      });
  }, []);

  const handleLocationError = useCallback((locationError: GeolocationPositionError) => {
    if (locationError.code === locationError.PERMISSION_DENIED) {
      setStatus("denied");
      setError("Location permission was denied. Enable it in browser settings to use nearby suggestions.");
      return;
    }
    setStatus("error");
    setError(
      locationError.code === locationError.TIMEOUT
        ? "Location request timed out. Try again when you have a clearer signal."
        : "Your location could not be determined. Try again."
    );
  }, []);

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

    setStatus("requesting");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      sharePosition,
      handleLocationError,
      GEOLOCATION_OPTIONS
    );
  }, [handleLocationError, isOnline, sharePosition]);

  useEffect(() => {
    if (!isOnline) {
      setLocation(null);
      setLastUpdatedAt(null);
      setStatus("idle");
      setError(null);
      return;
    }
    if (status !== "active" || typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    const refreshLocation = () => {
      navigator.geolocation.getCurrentPosition(
        sharePosition,
        () => undefined,
        GEOLOCATION_OPTIONS
      );
    };
    const intervalId = window.setInterval(refreshLocation, LOCATION_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [isOnline, sharePosition, status]);

  return {
    location,
    lastUpdatedAt,
    status,
    error,
    enableLocation,
  };
}
