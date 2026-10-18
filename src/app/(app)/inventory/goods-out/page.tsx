import React, { Suspense } from "react";
import type { Metadata } from "next";
import { getServerSessionContext } from "@/lib/auth/server-session";
import { InventoryRepository, type AvailableSerialItem } from "@/lib/db/repositories/inventory-repository";
import { GoodsOutView, type GoodsOutViewProps } from "./goods-out-view";
import type { GoodsOutTransaction, Partner } from "@/lib/demo/inventory-fixtures";

export const metadata: Metadata = {
  title: "Barang Keluar (Goods Out) - Docuflow",
  description: "Pengeluaran barang, reservasi pending, dan pemenuhan pengiriman gudang tunggal.",
};

export default function GoodsOutPage({
  searchParams,
}: {
  searchParams?: Promise<{ poId?: string }>;
}) {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-text-muted">Memuat data barang keluar...</div>}>
      <GoodsOutContent searchParams={searchParams} />
    </Suspense>
  );
}

async function GoodsOutContent({
  searchParams,
}: {
  searchParams?: Promise<{ poId?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const initialSelectedPoId = resolvedParams?.poId;

  const session = await getServerSessionContext();
  let initialTransactions: GoodsOutTransaction[] = [];
  let customers: Partner[] = [];
  let products: NonNullable<GoodsOutViewProps["initialProducts"]> = [];
  let purchaseOrders: NonNullable<GoodsOutViewProps["initialPurchaseOrders"]> = [];
  let initialSerials: AvailableSerialItem[] = [];

  if (session) {
    try {
      const repo = new InventoryRepository();
      initialTransactions = repo.getGoodsOutList(session.context);
      customers = repo.getCustomers(session.context);
      purchaseOrders = repo
        .getPurchaseOrders(session.context)
        .filter((po) => po.status !== "CANCELLED" && po.status !== "REJECTED")
        .map((po) => ({
          id: po.id,
          poNumber: po.poNumber,
          orderDate: po.orderDate,
          customerId: po.customerId,
          customerName: po.customerName,
          salesPic: po.salesPic,
          notes: po.notes,
          status: po.status,
          lines: po.lines.map((l) => ({
            id: l.id,
            productId: l.productId || "",
            productName: l.productName || l.rawProductName,
            rawProductName: l.rawProductName,
            sku: l.sku || "",
            orderedQty: l.orderedQty,
            orderedUnit: l.orderedUnit,
            mappingStatus: l.mappingStatus,
            targetQty: l.targetQty,
            fulfilledQty: l.fulfilledQty,
            unitPrice: l.unitPrice,
          })),
        }));
      products = repo.getProductsByOwner(session.context).map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        tracking: p.trackingMode,
        unit: p.unit,
        warehouseId: p.warehouseId,
        stock: p.physicalStock ?? 0,
        availableStock: p.availableStock ?? 0,
      }));
      initialSerials = repo.getAvailableSerialsByWarehouse(
        session.context,
        session.context.warehouseId ?? undefined
      );
    } catch (err) {
      console.error("Gagal membaca data Goods Out dari SQLite:", err);
    }
  }

  return (
    <GoodsOutView
      initialTransactions={initialTransactions}
      initialCustomers={customers}
      initialProducts={products}
      initialPurchaseOrders={purchaseOrders}
      initialSerials={initialSerials}
      initialSelectedPoId={initialSelectedPoId}
    />
  );
}
