"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import type { ActiveSecurityContext, UserRole } from "@/lib/types/auth";
import { DEMO_CONTEXT } from "./shell-fixture";
import { FIXTURE_WAREHOUSES, type Warehouse } from "./inventory-fixtures";
import { switchContextAction } from "@/lib/auth/actions";

export interface ActiveContextValue {
  identity: { fullName: string; email?: string };
  context: ActiveSecurityContext;
  switchRole: (role: UserRole) => void;
  switchWarehouse: (warehouseId: string | null) => void;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  activeWarehouseId: string;
  setActiveWarehouseId: (warehouseId: string) => void;
  activeWarehouse: Warehouse | undefined;
  warehousesList: Warehouse[];
}

const ActiveContext = createContext<ActiveContextValue | null>(null);

export interface ActiveContextProviderProps {
  children: ReactNode;
  initialIdentity?: { fullName: string; email?: string };
  initialContext?: ActiveSecurityContext;
  availableWarehouses?: Array<{ id: string; name: string }>;
}

export function ActiveContextProvider({
  children,
  initialIdentity,
  initialContext,
  availableWarehouses,
}: ActiveContextProviderProps) {
  const [context, setContext] = useState<ActiveSecurityContext>(
    initialContext ?? DEMO_CONTEXT
  );

  const initialContextKey = initialContext
    ? JSON.stringify([
        initialContext.userId,
        initialContext.ownerId,
        initialContext.warehouseId,
        initialContext.role,
        initialContext.grantId,
      ])
    : null;
  const [syncedContextKey, setSyncedContextKey] = useState(initialContextKey);
  if (initialContext && initialContextKey !== syncedContextKey) {
    setSyncedContextKey(initialContextKey);
    setContext(initialContext);
  }

  const [, startTransition] = useTransition();

  const identity = initialIdentity ?? {
    fullName: initialContext ? "Pengguna Terotentikasi" : "Tamu",
  };

  const warehousesList: Warehouse[] = availableWarehouses
    ? availableWarehouses.map((w) => ({
        id: w.id,
        name: w.name,
        code: w.id.toUpperCase(),
        address: "Gudang Aktif Operasional",
        status: "ACTIVE" as const,
      }))
    : FIXTURE_WAREHOUSES;

  function switchRole(newRole: UserRole) {
    const defaultWh = newRole === "SALES" ? null : warehousesList[0];
    const updated: ActiveSecurityContext = {
      ...context,
      role: newRole,
      isSuperAdminOnBehalf: newRole === "SUPER_ADMIN",
      grantId: newRole === "SUPER_ADMIN" ? "sa-grant-active" : null,
      warehouseId: defaultWh ? defaultWh.id : null,
      warehouseName: defaultWh ? defaultWh.name : null,
    };

    setContext(updated);

    startTransition(() => {
      void switchContextAction(updated.ownerId, updated.warehouseId);
    });
  }

  function switchWarehouse(whId: string | null) {
    let updated: ActiveSecurityContext;
    if (!whId) {
      updated = { ...context, warehouseId: null, warehouseName: null };
    } else {
      const found = warehousesList.find((w) => w.id === whId);
      updated = {
        ...context,
        warehouseId: found ? found.id : null,
        warehouseName: found ? found.name : null,
      };
    }

    setContext(updated);

    startTransition(() => {
      void switchContextAction(updated.ownerId, updated.warehouseId);
    });
  }

  const activeWarehouse = warehousesList.find((w) => w.id === context.warehouseId);

  return (
    <ActiveContext.Provider
      value={{
        identity,
        context,
        switchRole,
        switchWarehouse,
        currentRole: context.role,
        setCurrentRole: switchRole,
        activeWarehouseId: context.warehouseId || warehousesList[0]?.id || "wh-01",
        setActiveWarehouseId: (id: string) => switchWarehouse(id),
        activeWarehouse,
        warehousesList,
      }}
    >
      {children}
    </ActiveContext.Provider>
  );
}

export function useActiveContext() {
  const ctx = useContext(ActiveContext);
  if (!ctx) {
    throw new Error("useActiveContext harus berada di dalam ActiveContextProvider");
  }
  return ctx;
}
