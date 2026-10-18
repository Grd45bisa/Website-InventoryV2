import React from "react";
import { Metadata } from "next";
import { WarehousesView } from "./warehouses-view";
import { getServerSessionContext } from "@/lib/auth/server-session";
import { InventoryRepository } from "@/lib/db/repositories/inventory-repository";
import type { Warehouse } from "@/lib/demo/inventory-fixtures";

export const metadata: Metadata = {
  title: "Master Gudang & Lokasi | Docuflow",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function WarehousesPage() {
  const session = await getServerSessionContext();
  let initialWarehouses: Warehouse[] = [];

  if (session) {
    const repo = new InventoryRepository();
    const rows = repo.getWarehouses(session.context);
    initialWarehouses = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      address: r.address ?? "",
      status: r.status,
    }));
  }

  return <WarehousesView initialWarehouses={initialWarehouses} />;
}

