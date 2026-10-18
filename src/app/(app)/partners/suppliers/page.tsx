import type { Metadata } from "next";
import { getServerSessionContext } from "@/lib/auth/server-session";
import { InventoryRepository } from "@/lib/db/repositories/inventory-repository";
import { SuppliersView } from "./suppliers-view";
import type { Partner } from "@/lib/demo/inventory-fixtures";

export const metadata: Metadata = {
  title: "Master Pemasok - Docuflow",
  description: "Daftar pemasok terdaftar untuk penerimaan transaksi Goods In.",
};

export default async function SuppliersPage() {
  const session = await getServerSessionContext();
  let initialSuppliers: Partner[] = [];

  if (session) {
    try {
      const repo = new InventoryRepository();
      initialSuppliers = repo.getSuppliers(session.context);
    } catch (err) {
      console.error("Gagal membaca daftar pemasok dari SQLite:", err);
    }
  }

  return <SuppliersView initialSuppliers={JSON.parse(JSON.stringify(initialSuppliers))} />;
}
