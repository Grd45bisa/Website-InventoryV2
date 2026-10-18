import type { Metadata } from "next";
import { getServerSessionContext } from "@/lib/auth/server-session";
import { InventoryRepository } from "@/lib/db/repositories/inventory-repository";
import { ProductsView } from "./products-view";
import type { Product } from "@/lib/demo/inventory-fixtures";

export const metadata: Metadata = {
  title: "Katalog Produk - Docuflow",
  description: "Daftar produk, SKU, satuan, dan pelacakan serial/non-serial per gudang aktif.",
};

export default async function ProductsPage() {
  const session = await getServerSessionContext();
  let initialProducts: Product[] = [];

  if (session) {
    try {
      const repo = new InventoryRepository();
      const records = repo.getProductsByOwner(session.context);
      initialProducts = records.map((r) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        barcode: r.barcode ?? undefined,
        category: r.category,
        tracking: r.trackingMode,
        unit: r.unit,
        minStock: r.minStock,
        description: r.description ?? undefined,
        warehouseId: r.warehouseId,
        stock: r.physicalStock ?? 0,
        status: r.status === "ARCHIVED" ? "INACTIVE" : r.status,
      }));
    } catch (err) {
      console.error("Gagal membaca katalog produk dari database SQLite:", err);
    }
  }

  return <ProductsView initialProducts={initialProducts} />;
}
