import React from "react";
import { Metadata } from "next";
import { getServerSessionContext } from "@/lib/auth/server-session";
import { InventoryRepository } from "@/lib/db/repositories/inventory-repository";
import { AuditLogView } from "./audit-log-view";
import type { AuditLogEntry } from "@/lib/demo/inventory-fixtures";

export const metadata: Metadata = {
  title: "Log Audit | Docuflow",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AuditLogPage() {
  const session = await getServerSessionContext();
  let initialLogs: AuditLogEntry[] = [];

  if (session) {
    try {
      const repo = new InventoryRepository();
      initialLogs = repo.getAuditLogs(session.context, 100);
    } catch (err) {
      console.error("Gagal membaca log audit dari SQLite:", err);
    }
  }

  return <AuditLogView initialLogs={initialLogs} />;
}
