"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import type { Role } from "@/lib/api/types";
import { useAuth } from "@/providers/auth-provider";

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { session, hydrated } = useAuth();
  const router = useRouter();
  const allowed = session?.user.role === role;

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      router.replace("/");
    } else if (!allowed) {
      router.replace(session.user.role === "driver" ? "/driver" : "/passenger");
    }
  }, [allowed, hydrated, router, session]);

  if (!hydrated || !session || !allowed) {
    return (
      <main className="dispatch-grid flex min-h-screen items-center justify-center px-4 text-porcelain">
        <div className="text-center" role="status" aria-label="Restoring your session">
          <span className="mx-auto flex h-12 w-12 items-center justify-center border border-cyan/30 bg-cyan/5">
            <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-lime" />
          </span>
          <p className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan/70">
            Restoring your seat
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
