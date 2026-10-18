import type { Metadata } from "next";
import { getServerSessionContext } from "@/lib/auth/server-session";
import { InventoryRepository } from "@/lib/db/repositories/inventory-repository";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = {
  title: "Dasbor Operasi - Docuflow",
  description: "Gambaran operasional inventaris multi-Owner dan multi-gudang berdasarkan role.",
};

export default async function DashboardPage() {
  const session = await getServerSessionContext();
  let initialSummary = undefined;

  if (session) {
    try {
      const repo = new InventoryRepository();
      initialSummary = repo.getDashboardSummary(session.context);
    } catch (err) {
      console.error("Gagal membaca ringkasan dasbor dari SQLite:", err);
    }
  }

  return <DashboardView initialSummary={initialSummary} />;
}
