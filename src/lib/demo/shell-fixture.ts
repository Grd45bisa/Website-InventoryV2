import type { ActiveSecurityContext } from "@/lib/types/auth";

/**
 * FIXTURE DEMO FASE 2 - BUKAN DATA NYATA.
 * Dipakai hanya agar shell dapat ditinjau secara visual sebelum auth/session
 * (TASK-010/011, BLOCKED) tersedia. Layout yang memakai fixture ini wajib menampilkan
 * banner demo. Ganti dengan konteks hasil `evaluateSecurityContext` di sisi server
 * setelah session tersedia; jangan dibawa ke produksi.
 */
export const DEMO_IDENTITY = { fullName: "Pengguna Demo" } as const;

export const DEMO_CONTEXT: ActiveSecurityContext = {
  userId: "demo-user",
  email: "demo@example.invalid",
  ownerId: "demo-owner",
  ownerName: "Owner Demo",
  warehouseId: "demo-warehouse",
  warehouseName: "Gudang Demo",
  role: "OWNER",
  isSuperAdminOnBehalf: false,
  grantId: null,
};
