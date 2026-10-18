import type { Metadata } from "next";
import { getServerSessionContext } from "@/lib/auth/server-session";
import { InventoryRepository } from "@/lib/db/repositories/inventory-repository";
import { GoodsInView, type GoodsInViewProps } from "./goods-in-view";
import type { GoodsInTransaction, Partner } from "@/lib/demo/inventory-fixtures";

export const metadata: Metadata = {
  title: "Barang Masuk (Goods In) - Docuflow",
  description: "Penerimaan barang masuk dari pemasok, status pending, dan intake nomor seri.",
};

export default async function GoodsInPage() {
  const session = await getServerSessionContext();
  let initialTransactions: GoodsInTransaction[] = [];
  let suppliers: Partner[] = [];
  let products: NonNullable<GoodsInViewProps["initialProducts"]> = [];
  let initialConversionUnit: "pcs" | "lusin" = "pcs";

  if (session) {
    try {
      const repo = new InventoryRepository();
      initialTransactions = repo.getGoodsInList(session.context);
      suppliers = repo.getSuppliers(session.context);
      products = repo.getProductsByOwner(session.context).map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        tracking: p.trackingMode,
        unit: p.unit,
        warehouseId: p.warehouseId,
      }));
      if (session.context.warehouseId) {
        initialConversionUnit = repo.getWarehouseConversionDisplayUnit(
          session.context,
          session.context.warehouseId
        );
      }
    } catch (err) {
      console.error("Gagal membaca data Goods In dari SQLite:", err);
    }
  }

  return (
    <GoodsInView
      initialTransactions={initialTransactions}
      initialSuppliers={suppliers}
      initialProducts={products}
      initialConversionUnit={initialConversionUnit}
    />
  );
}
