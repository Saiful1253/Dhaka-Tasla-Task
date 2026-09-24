"use client";

import { LogOut, Radio, UserRound } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/api/types";
import { useAuth } from "@/providers/auth-provider";

interface AppHeaderProps {
  user: User;
  sectionLabel: string;
}

export function AppHeader({ user, sectionLabel }: AppHeaderProps) {
  const { signOut } = useAuth();

  return (
    <header className="dispatch-grid border-b border-cyan/15 text-porcelain">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-5">
        <div className="flex items-center justify-between gap-4">
          <BrandMark inverse />
          <span className="inline-flex items-center gap-2 border border-cyan/25 bg-cyan/5 px-2.5 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-cyan lg:hidden">
            <Radio aria-hidden="true" className="h-3 w-3" />
            {sectionLabel}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="hidden min-w-0 sm:block lg:mr-5 lg:text-right">
            <p className="truncate font-display text-sm font-bold text-porcelain">
              {user.name}
            </p>
            <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.13em] text-cyan/60">
              {user.email}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 border border-porcelain/15 bg-porcelain/5 px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-porcelain">
            <UserRound aria-hidden="true" className="h-3.5 w-3.5 text-lime" />
            {user.role}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="border-porcelain/15 text-porcelain hover:bg-porcelain/10 hover:border-porcelain/25"
            leadingIcon={<LogOut aria-hidden="true" className="h-4 w-4" />}
            aria-label="Log out"
          >
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
