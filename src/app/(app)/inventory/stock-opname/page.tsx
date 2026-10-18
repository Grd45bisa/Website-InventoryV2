import type { Metadata } from "next";
import { StockOpnameView } from "./stock-opname-view";
import { getServerSessionContext } from "@/lib/auth/server-session";
import { InventoryRepository } from "@/lib/db/repositories/inventory-repository";
import type { StockOpnameSession } from "@/lib/demo/inventory-fixtures";

export const metadata: Metadata = {
  title: "Stock Opname - Docuflow",
  description: "Sesi penghitungan fisik stok, snapshot beku, rekonsiliasi, dan audit variance.",
};

export default async function StockOpnamePage() {
  const session = await getServerSessionContext();
  let initialSessions: StockOpnameSession[] = [];
  let warehouseId = "";
  let warehouseName = "";

  if (session) {
    const repo = new InventoryRepository();
    const rows = repo.getStockOpnameSessions(session.context);
    warehouseId = session.context.warehouseId ?? "";
    warehouseName = session.context.warehouseName ?? "";
    initialSessions = rows.map((r) => ({
      id: r.id,
      sessionNumber: r.sessionNumber,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName ?? warehouseName,
      scope: r.scope,
      status: r.status === "COUNTING" ? "IN_PROGRESS" : r.status === "REVIEW" ? "REVIEW" : "COMPLETED",
      createdAt: r.startedAt.replace("T", " ").slice(0, 16),
      createdBy: r.createdBy,
      snapshotFrozenAt: r.startedAt,
      notes: r.note ?? undefined,
      itemCount: r.itemCount,
      varianceCount: r.varianceCount,
    }));
  }

  return (
    <StockOpnameView
      initialSessions={initialSessions}
      activeWarehouseId={warehouseId}
      activeWarehouseName={warehouseName}
    />
  );
}

