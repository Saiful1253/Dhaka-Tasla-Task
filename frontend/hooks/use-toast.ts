"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ToastState {
  message: string;
  code?: string;
  tone: "success" | "error";
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const showToast = useCallback((nextToast: ToastState) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setToast(nextToast);
    timerRef.current = window.setTimeout(() => setToast(null), 4800);
  }, []);

  const dismissToast = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  return { toast, showToast, dismissToast };
}
