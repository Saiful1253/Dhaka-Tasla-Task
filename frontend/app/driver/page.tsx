import type { Metadata } from "next";

import { RequireRole } from "@/components/auth/require-role";
import { DriverDashboard } from "@/components/driver/driver-dashboard";

export const metadata: Metadata = {
  title: "Driver dispatch board",
};

export default function DriverPage() {
  return (
    <RequireRole role="driver">
      <DriverDashboard />
    </RequireRole>
  );
}
