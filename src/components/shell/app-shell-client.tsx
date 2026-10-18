"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { useActiveContext } from "@/lib/demo/active-context-provider";

export function AppShellClient({ children }: { children: ReactNode }) {
  const { identity, context, warehousesList, switchWarehouse } = useActiveContext();

  return (
    <AppShell
      identity={identity}
      context={context}
      warehouses={warehousesList}
      onSwitchWarehouse={switchWarehouse}
      isDemo={false}
    >
      {children}
    </AppShell>
  );
}
