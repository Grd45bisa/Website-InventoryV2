import React, { Suspense } from "react";
import type { Metadata } from "next";
import { DocumentsView } from "./documents-view";
import { getServerSessionContext } from "@/lib/auth/server-session";
import { InventoryRepository } from "@/lib/db/repositories/inventory-repository";
import type { CommercialDocument, Partner } from "@/lib/demo/inventory-fixtures";

export const metadata: Metadata = {
  title: "Dokumen & Invoice | Docuflow",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ createFromPo?: string }>;
}) {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-text-muted">Memuat dokumen...</div>}>
      <DocumentsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DocumentsContent({
  searchParams,
}: {
  searchParams?: Promise<{ createFromPo?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const initialCreateFromPoId = resolvedParams?.createFromPo;

  const session = await getServerSessionContext();
  let initialDocuments: CommercialDocument[] = [];
  let initialPartners: Partner[] = [];
  let initialPurchaseOrders: Array<{
    id: string;
    poNumber: string;
    customerId: string;
    customerName?: string;
    status: string;
    salesPic?: string | null;
    notes?: string | null;
    invoiceId?: string | null;
    invoiceNumber?: string | null;
    lines: Array<{
      id: string;
      productId?: string | null;
      productName?: string;
      rawProductName: string;
      sku?: string;
      orderedQty: number;
      orderedUnit: string;
      targetQty: number;
      fulfilledQty: number;
      unitPrice: number;
      mappingStatus: string;
    }>;
  }> = [];

  if (session) {
    const repo = new InventoryRepository();
    const docRows = repo.getCommercialDocuments(session.context);
    initialPartners = repo.getCustomers(session.context);
    const poRows = repo.getPurchaseOrders(session.context);

    // Ambil PO yang sudah disetujui (CONFIRMED, PARTIALLY_FULFILLED, FULFILLED)
    initialPurchaseOrders = poRows
      .filter((po) => po.status === "CONFIRMED" || po.status === "PARTIALLY_FULFILLED" || po.status === "FULFILLED")
      .map((po) => ({
        id: po.id,
        poNumber: po.poNumber,
        customerId: po.customerId,
        customerName: po.customerName,
        status: po.status,
        salesPic: po.salesPic,
        notes: po.notes,
        invoiceId: po.invoiceId,
        invoiceNumber: po.invoiceNumber,
        lines: po.lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          productName: l.productName,
          rawProductName: l.rawProductName,
          sku: l.sku,
          orderedQty: l.orderedQty,
          orderedUnit: l.orderedUnit,
          targetQty: l.targetQty,
          fulfilledQty: l.fulfilledQty,
          unitPrice: l.unitPrice,
          mappingStatus: l.mappingStatus,
        })),
      }));

    const productRows = repo.getProductsByOwner(session.context);
    const initialProducts = productRows.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
    }));

    initialDocuments = docRows.map((doc) => {
      let paymentStatus: CommercialDocument["paymentStatus"] = "UNPAID";
      if (doc.documentType === "SURAT_JALAN" || doc.documentType === "SAMPLE") {
        paymentStatus = "NOT_APPLICABLE";
      } else if (doc.status === "PAID" || (doc.totalAmount > 0 && doc.paidAmount >= doc.totalAmount)) {
        paymentStatus = "PAID";
      } else if (doc.paidAmount > 0) {
        paymentStatus = "PARTIAL";
      } else {
        paymentStatus = "UNPAID";
      }

      return {
        id: doc.id,
        docNumber: doc.documentNumber,
        type: doc.documentType as CommercialDocument["type"],
        date: doc.documentDate,
        dueDate: doc.dueDate,
        poReference: doc.poNumber ?? undefined,
        partnerName: doc.customerName ?? "Pelanggan",
        customerId: doc.customerId,
        subtotal: doc.subtotal,
        itemDiscount: doc.itemDiscount,
        documentDiscount: doc.docNominalDiscount,
        pointsRedeemed: doc.pointsRedeemed,
        total: doc.totalAmount,
        paidAmount: doc.paidAmount,
        printCount: doc.printCount,
        paymentStatus,
        notes: doc.notes ?? undefined,
        status: doc.status,
      };
    });

    return (
      <DocumentsView
        key={initialCreateFromPoId || "documents-view-default"}
        initialDocuments={JSON.parse(JSON.stringify(initialDocuments))}
        initialPartners={JSON.parse(JSON.stringify(initialPartners))}
        initialPurchaseOrders={JSON.parse(JSON.stringify(initialPurchaseOrders))}
        initialProducts={JSON.parse(JSON.stringify(initialProducts))}
        initialCreateFromPoId={initialCreateFromPoId}
      />
    );
  }

  return (
    <DocumentsView
      initialDocuments={[]}
      initialPartners={[]}
      initialPurchaseOrders={[]}
      initialProducts={[]}
    />
  );
}

