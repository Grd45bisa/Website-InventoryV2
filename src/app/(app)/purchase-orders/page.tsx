import React from "react";
import type { Metadata } from "next";
import { PurchaseOrdersView } from "./purchase-orders-view";
import { getServerSessionContext } from "@/lib/auth/server-session";
import { InventoryRepository, type PurchaseOrderRecord } from "@/lib/db/repositories/inventory-repository";
import type { Partner, Product } from "@/lib/demo/inventory-fixtures";

export const metadata: Metadata = {
  title: "Purchase Orders | Docuflow",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PurchaseOrdersPage() {
  const session = await getServerSessionContext();
  let initialOrders: PurchaseOrderRecord[] = [];
  let customers: Partner[] = [];
  let products: Product[] = [];
  let currentRole = "STAFF";
  let currentUserName = "Pengguna";

  if (session) {
    currentRole = session.context.role;
    currentUserName = session.user.fullName || session.context.email || "Sales";
    const repo = new InventoryRepository();
    initialOrders = repo.getPurchaseOrders(session.context);
    customers = repo.getCustomers(session.context);
    const dbProds = repo.getProductsByOwner(session.context);

    products = dbProds.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      warehouseId: p.warehouseId,
      warehouseName: session.context.warehouseName ?? "Gudang",
      category: p.category,
      tracking: p.trackingMode,
      trackingType: p.trackingMode,
      unit: p.unit,
      stock: p.physicalStock ?? 0,
      stockPhysical: p.physicalStock ?? 0,
      stockReserved: p.reservedStock ?? 0,
      stockAvailable: p.availableStock ?? 0,
      minStock: p.minStock,
      maxStock: p.minStock * 5,
      status: p.status === "ARCHIVED" ? "INACTIVE" : p.status,
    }));
  }

  return (
    <PurchaseOrdersView
      initialOrders={JSON.parse(JSON.stringify(initialOrders))}
      initialCustomers={JSON.parse(JSON.stringify(customers))}
      initialProducts={JSON.parse(JSON.stringify(products))}
      currentRole={currentRole}
      currentUserName={currentUserName}
    />
  );
}

