import type { Metadata } from "next";
import { getServerSessionContext } from "@/lib/auth/server-session";
import { InventoryRepository } from "@/lib/db/repositories/inventory-repository";
import { CustomersView } from "./customers-view";
import type { Partner } from "@/lib/demo/inventory-fixtures";

export const metadata: Metadata = {
  title: "Master Pelanggan - Docuflow",
  description: "Daftar pelanggan yang dibagikan pada lingkup Owner dan digunakan untuk PO.",
};

export default async function CustomersPage() {
  const session = await getServerSessionContext();
  let initialCustomers: Partner[] = [];

  if (session) {
    try {
      const repo = new InventoryRepository();
      initialCustomers = repo.getCustomers(session.context);
    } catch (err) {
      console.error("Gagal membaca daftar pelanggan dari SQLite:", err);
    }
  }

  return <CustomersView initialCustomers={JSON.parse(JSON.stringify(initialCustomers))} />;
}
