import React from "react";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import {
  FIXTURE_OPNAME_SESSIONS,
  FIXTURE_OPNAME_ITEMS,
  type StockOpnameSession,
  type StockOpnameCountItem,
} from "@/lib/demo/inventory-fixtures";
import { getServerSessionContext } from "@/lib/auth/server-session";
import { InventoryRepository } from "@/lib/db/repositories/inventory-repository";
import { StockOpnameDetailView } from "./stock-opname-detail-view";

export const metadata: Metadata = {
  title: "Detail Sesi Stock Opname | Docuflow",
  robots: {
    index: false,
    follow: false,
  },
};

export function generateStaticParams() {
  return FIXTURE_OPNAME_SESSIONS.map((session) => ({
    id: session.id,
  }));
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StockOpnameDetailPage({ params }: PageProps) {
  const { id } = await params;
  const authSession = await getServerSessionContext();

  if (authSession) {
    try {
      const repo = new InventoryRepository();
      const detail = repo.getStockOpnameSessionDetail(authSession.context, id);
      if (detail) {
        const mappedSession: StockOpnameSession = {
          id: detail.session.id,
          sessionNumber: detail.session.sessionNumber,
          warehouseId: detail.session.warehouseId,
          warehouseName: detail.session.warehouseName ?? "Gudang",
          scope: detail.session.scope,
          scopeDetail: detail.session.title ?? undefined,
          status:
            detail.session.status === "COUNTING"
              ? "IN_PROGRESS"
              : detail.session.status === "REVIEW"
              ? "REVIEW"
              : "COMPLETED",
          createdAt: detail.session.startedAt.replace("T", " ").slice(0, 16),
          createdBy: detail.session.createdBy,
          snapshotFrozenAt: detail.session.snapshotAt ?? detail.session.startedAt,
          notes: detail.session.note ?? undefined,
          itemCount: detail.lines.length,
          varianceCount: detail.session.varianceCount,
        };

        const mappedItems: StockOpnameCountItem[] = detail.lines.map((l) => ({
          id: l.id,
          sessionId: l.sessionId,
          productId: l.productId,
          productName: l.productName,
          sku: l.sku,
          tracking: l.trackingMode,
          snapshotQty: l.snapshotQty,
          countedQty: l.countedQty,
          variance: l.varianceQty,
          unit: l.unit,
          scannedSerials: l.scannedSerials ?? [],
          unknownSerials: [],
          status:
            l.varianceQty === 0
              ? "MATCH"
              : l.varianceQty > 0
              ? "SURPLUS"
              : "DEFICIT",
        }));

        const isCancelled = detail.session.status === "CANCELLED";
        const isClosed = detail.session.status === "COMPLETED" || detail.session.status === "ADJUSTED" || isCancelled;
        const isNotAssigned = authSession.context.warehouseId !== detail.session.warehouseId && authSession.context.role !== "OWNER";
        const isReadOnly = isClosed || isNotAssigned;

        return (
          <StockOpnameDetailView
            session={{ ...mappedSession, isCancelled }}
            initialItems={mappedItems}
            initialAreas={detail.areas}
            isReadOnly={isReadOnly}
          />
        );
      }
    } catch {
      // Fallback ke fixtures jika bukan ID database atau untuk pengujian UI statis
    }
  }

  const session = FIXTURE_OPNAME_SESSIONS.find((s) => s.id === id);

  if (!session) {
    notFound();
  }

  const items = FIXTURE_OPNAME_ITEMS.filter((i) => i.sessionId === id);

  return <StockOpnameDetailView session={session} initialItems={items} />;
}

