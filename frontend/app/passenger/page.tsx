import type { Metadata } from "next";

import { RequireRole } from "@/components/auth/require-role";
import { PassengerDashboard } from "@/components/passenger/passenger-dashboard";

export const metadata: Metadata = {
  title: "Passenger command center",
};

export default function PassengerPage() {
  return (
    <RequireRole role="passenger">
      <PassengerDashboard />
    </RequireRole>
  );
}
