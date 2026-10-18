"use client";

import React, { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PurchaseOrderRecord, PurchaseOrderLineRecord, PurchaseOrderStatus } from "@/lib/db/repositories/inventory-repository";
import type { Partner, Product } from "@/lib/demo/inventory-fixtures";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Alert, FeedbackState } from "@/components/ui/feedback";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Select, Textarea } from "@/components/ui/form-fields";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import {
  PlusIcon,
  CloseIcon,
  UsersIcon,
  DocumentIcon,
  ClipboardIcon,
  CheckCircleIcon,
  InfoIcon,
} from "@/components/ui/icons";
import {
  approvePurchaseOrderAction,
  rejectPurchaseOrderAction,
  updatePurchaseOrderSalesPicAction,
  mapPurchaseOrderLineAction,
  createAndMapProductForPoLineAction,
} from "@/lib/inventory/actions";
import { PoCreateDialog } from "./po-create-dialog";

const PAGE_SIZE = 50;

/**
 * Format total kuantitas fisik dalam Lusin dan sisa PCS (tanpa desimal/koma).
 * Contoh: 720 PCS -> 60 Lusin (720 PCS)
 *         90 PCS  -> 7 Lusin + 6 PCS (90 PCS)
 *         10 PCS  -> 10 PCS
 */
function formatLusinPcs(totalPcs: number, includeTotalPcs = true): string {
  if (totalPcs <= 0) return "0 PCS";
  const lusin = Math.floor(totalPcs / 12);
  const sisaPcs = totalPcs % 12;

  let text = "";
  if (lusin > 0 && sisaPcs > 0) {
    text = `${lusin} Lusin + ${sisaPcs} PCS`;
  } else if (lusin > 0) {
    text = `${lusin} Lusin`;
  } else {
    text = `${sisaPcs} PCS`;
  }

  if (includeTotalPcs && lusin > 0) {
    return `${text} (${totalPcs} PCS)`;
  }
  return text;
}

export interface PurchaseOrdersViewProps {
  initialOrders?: PurchaseOrderRecord[];
  initialCustomers?: Partner[];
  initialProducts?: Product[];
  currentRole?: string;
  currentUserName?: string;
}

export function PurchaseOrdersView({
  initialOrders = [],
  initialCustomers = [],
  initialProducts = [],
  currentRole = "STAFF",
  currentUserName = "Sales",
}: PurchaseOrdersViewProps) {
  const router = useRouter();
  const [orders, setOrders] = useState<PurchaseOrderRecord[]>(initialOrders);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  // Status & Feedback
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderRecord | null>(null);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isEditPicOpen, setIsEditPicOpen] = useState(false);
  const [newSalesPic, setNewSalesPic] = useState("");

  // Product Mapping Modals
  const [mappingLine, setMappingLine] = useState<{ poId: string; line: PurchaseOrderLineRecord } | null>(null);
  const [selectedCatalogProductId, setSelectedCatalogProductId] = useState("");
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [newProdSku, setNewProdSku] = useState("");
  const [newProdCategory, setNewProdCategory] = useState("Umum");
  const [newProdTracking, setNewProdTracking] = useState<"SERIAL" | "NON_SERIAL">("NON_SERIAL");
  const [newProdUnit, setNewProdUnit] = useState("pcs");

  const isOwnerOrSuperAdmin = currentRole === "OWNER" || currentRole === "SUPER_ADMIN";

  const customers = useMemo(() => initialCustomers, [initialCustomers]);
  const products = useMemo(() => initialProducts, [initialProducts]);

  // Lookup pelanggan & kalkulasi kuantitas fisik untuk detail PO terpilih
  const selectedCustomerObj = useMemo(() => {
    if (!selectedOrder) return null;
    return customers.find((c) => c.id === selectedOrder.customerId) || null;
  }, [selectedOrder, customers]);

  const { detailLusin, detailPcs, detailPhysicalPcs, detailFulfilledPhysicalPcs } = useMemo(() => {
    if (!selectedOrder) return { detailLusin: 0, detailPcs: 0, detailPhysicalPcs: 0, detailFulfilledPhysicalPcs: 0 };
    let lusin = 0;
    let pcs = 0;
    let phys = 0;
    let fulfilledPhys = 0;
    for (const l of selectedOrder.lines) {
      const qty = Number(l.orderedQty) || 0;
      if (l.orderedUnit === "Lusin") {
        lusin += qty;
      } else {
        pcs += qty;
      }
      phys += Number(l.targetQty) || 0;
      fulfilledPhys += Number(l.fulfilledQty) || 0;
    }
    return {
      detailLusin: lusin,
      detailPcs: pcs,
      detailPhysicalPcs: phys,
      detailFulfilledPhysicalPcs: fulfilledPhys,
    };
  }, [selectedOrder]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((po) => {
      const q = search.toLowerCase();
      const matchSearch =
        po.poNumber.toLowerCase().includes(q) ||
        (po.customerName && po.customerName.toLowerCase().includes(q)) ||
        (po.salesPic && po.salesPic.toLowerCase().includes(q)) ||
        po.lines.some(
          (l) =>
            (Boolean(l.productName) && l.productName!.toLowerCase().includes(q)) ||
            (Boolean(l.rawProductName) && l.rawProductName.toLowerCase().includes(q)) ||
            (Boolean(l.sku) && l.sku!.toLowerCase().includes(q))
        );
      const matchStatus = statusFilter === "ALL" || po.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedOrders = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, safePage]);

  // Status Badge Component
  // Status Badge Component (Ringkas & Efisien)
  const getStatusBadge = (status: PurchaseOrderStatus) => {
    switch (status) {
      case "PENDING_APPROVAL":
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Menunggu
          </span>
        );
      case "CONFIRMED":
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-info bg-info-soft/60 border border-info/30 px-2 py-0.5 rounded-full whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-info" />
            Konfirmasi
          </span>
        );
      case "PARTIALLY_FULFILLED":
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-warning-text bg-warning-soft/60 border border-warning/30 px-2 py-0.5 rounded-full whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-warning" />
            Parsial
          </span>
        );
      case "FULFILLED":
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success bg-success-soft/60 border border-success/30 px-2 py-0.5 rounded-full whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Selesai
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-danger bg-danger-soft/60 border border-danger/30 px-2 py-0.5 rounded-full whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-danger" />
            Ditolak
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-muted bg-surface-muted border border-border-default px-2 py-0.5 rounded-full whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-text-muted" />
            Batal
          </span>
        );
      case "DRAFT":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-muted bg-surface-muted border border-border-default px-2 py-0.5 rounded-full whitespace-nowrap">
            {status}
          </span>
        );
    }
  };

  // Setujui PO (Owner / SuperAdmin)
  const handleApprovePo = (poId: string) => {
    if (isPending) return;
    setErrorMessage(null);
    setStatusMessage(null);

    startTransition(async () => {
      const res = await approvePurchaseOrderAction(poId);
      if (!res.success || !res.po) {
        setErrorMessage(res.error || "Gagal menyetujui Purchase Order.");
        return;
      }

      setOrders((prev) => prev.map((p) => (p.id === poId ? res.po! : p)));
      if (selectedOrder?.id === poId) {
        setSelectedOrder(res.po);
      }
      setStatusMessage(`Purchase Order ${res.po.poNumber} berhasil disetujui.`);
    });
  };

  // Tolak PO (Owner / SuperAdmin)
  const handleRejectPo = () => {
    if (isPending) return;
    if (!selectedOrder) return;
    setErrorMessage(null);
    setStatusMessage(null);

    startTransition(async () => {
      const res = await rejectPurchaseOrderAction(selectedOrder.id, rejectionReason);
      if (!res.success || !res.po) {
        setErrorMessage(res.error || "Gagal menolak Purchase Order.");
        return;
      }

      setOrders((prev) => prev.map((p) => (p.id === selectedOrder.id ? res.po! : p)));
      setSelectedOrder(res.po);
      setIsRejectOpen(false);
      setRejectionReason("");
      setStatusMessage(`Purchase Order ${res.po.poNumber} telah ditolak.`);
    });
  };

  // Ubah PIC Sales
  const handleUpdateSalesPic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !newSalesPic.trim()) return;

    startTransition(async () => {
      const res = await updatePurchaseOrderSalesPicAction(selectedOrder.id, newSalesPic.trim());
      if (!res.success) {
        setErrorMessage(res.error || "Gagal mengubah PIC Sales.");
        return;
      }

      setOrders((prev) =>
        prev.map((p) => (p.id === selectedOrder.id ? { ...p, salesPic: newSalesPic.trim() } : p))
      );
      setSelectedOrder((prev) => (prev ? { ...prev, salesPic: newSalesPic.trim() } : null));
      setIsEditPicOpen(false);
      setStatusMessage(`PIC Sales berhasil diubah menjadi ${newSalesPic.trim()}.`);
    });
  };

  // Petakan ke Produk Katalog yang Ada
  const handleMapToCatalog = () => {
    if (isPending) return;
    if (!mappingLine || !selectedCatalogProductId) return;

    startTransition(async () => {
      const res = await mapPurchaseOrderLineAction({
        poId: mappingLine.poId,
        lineId: mappingLine.line.id,
        productId: selectedCatalogProductId,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Gagal memetakan produk.");
        return;
      }

      const catProd = products.find((p) => p.id === selectedCatalogProductId);

      // Perbarui state lokal
      setOrders((prev) =>
        prev.map((po) => {
          if (po.id !== mappingLine.poId) return po;
          return {
            ...po,
            lines: po.lines.map((l) =>
              l.id === mappingLine.line.id
                ? {
                  ...l,
                  productId: selectedCatalogProductId,
                  productName: catProd?.name || l.rawProductName,
                  sku: catProd?.sku,
                  mappingStatus: "MAPPED" as const,
                }
                : l
            ),
          };
        })
      );

      if (selectedOrder && selectedOrder.id === mappingLine.poId) {
        setSelectedOrder((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            lines: prev.lines.map((l) =>
              l.id === mappingLine.line.id
                ? {
                  ...l,
                  productId: selectedCatalogProductId,
                  productName: catProd?.name || l.rawProductName,
                  sku: catProd?.sku,
                  mappingStatus: "MAPPED" as const,
                }
                : l
            ),
          };
        });
      }

      setMappingLine(null);
      setSelectedCatalogProductId("");
      setStatusMessage(`Baris pesanan berhasil dipetakan ke produk katalog ${catProd?.name || ""}.`);
    });
  };

  // Jadikan Produk Baru di Master Katalog
  const handleConvertToCatalog = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    if (!mappingLine || !newProdName.trim() || !newProdSku.trim()) return;

    startTransition(async () => {
      const res = await createAndMapProductForPoLineAction({
        poId: mappingLine.poId,
        lineId: mappingLine.line.id,
        name: newProdName.trim(),
        sku: newProdSku.trim(),
        category: newProdCategory.trim() || "Umum",
        trackingMode: newProdTracking,
        unit: newProdUnit.trim() || "pcs",
      });

      if (!res.success) {
        setErrorMessage(res.error || "Gagal membuat produk katalog baru.");
        return;
      }

      const createdProductId = res.productId;
      const createdProductName = res.name || newProdName.trim();
      const createdProductSku = res.sku || newProdSku.trim();

      // Perbarui state lokal
      setOrders((prev) =>
        prev.map((po) => {
          if (po.id !== mappingLine.poId) return po;
          return {
            ...po,
            lines: po.lines.map((l) =>
              l.id === mappingLine.line.id
                ? {
                  ...l,
                  productId: createdProductId,
                  productName: createdProductName,
                  sku: createdProductSku,
                  mappingStatus: "CONVERTED_TO_CATALOG" as const,
                }
                : l
            ),
          };
        })
      );

      if (selectedOrder && selectedOrder.id === mappingLine.poId) {
        setSelectedOrder((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            lines: prev.lines.map((l) =>
              l.id === mappingLine.line.id
                ? {
                  ...l,
                  productId: createdProductId,
                  productName: createdProductName,
                  sku: createdProductSku,
                  mappingStatus: "CONVERTED_TO_CATALOG" as const,
                }
                : l
            ),
          };
        });
      }

      setIsConvertOpen(false);
      setMappingLine(null);
      setStatusMessage(`Produk '${newProdName.trim()}' (${newProdSku.trim()}) berhasil ditambahkan ke katalog master dan dipetakan.`);
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders (PO)"
        description="Daftar pesanan pelanggan dan status pemenuhan barang."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setErrorMessage(null);
              setIsCreateOpen(true);
            }}
          >
            <PlusIcon className="h-4 w-4" />
            Buat PO Baru
          </Button>
        }
      />

      {/* Info Alur Ringkas */}
      <div className="rounded-md border border-border-default bg-surface-subtle px-3 py-2 text-xs text-text-secondary flex flex-wrap items-center justify-between gap-2">
        <span><strong>Alur:</strong> Pesanan Sales &rarr; Persetujuan Owner &rarr; Pemenuhan Goods Out</span>
        <span className="font-medium text-text-muted">Konversi: 1 Lusin = 12 PCS</span>
      </div>

      {statusMessage && (
        <Alert variant="success" title="Berhasil" description={statusMessage} />
      )}

      {errorMessage && (
        <Alert variant="danger" title="Perhatian" description={errorMessage} />
      )}

      {/* Toolbar Filter & Pencarian */}
      <ListToolbar
        searchPlaceholder="Cari nomor PO, pelanggan, PIC Sales, atau nama item..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={
          <div className="w-56">
            <label htmlFor="po-status-filter" className="sr-only">Status Pemenuhan</label>
            <Select
              id="po-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Semua Status</option>
              <option value="PENDING_APPROVAL">Menunggu Persetujuan</option>
              <option value="CONFIRMED">Terkonfirmasi</option>
              <option value="PARTIALLY_FULFILLED">Parsial</option>
              <option value="FULFILLED">Selesai (Fulfilled)</option>
              <option value="REJECTED">Ditolak</option>
              <option value="CANCELLED">Dibatalkan</option>
            </Select>
          </div>
        }
      />

      {/* Desktop Table View */}
      <div className="hidden md:block rounded border border-border-default bg-surface-card overflow-hidden">
        <table className="w-full text-left text-xs text-text-secondary border-collapse">
          <thead className="bg-surface-subtle text-text-muted border-b border-border-default uppercase font-medium">
            <tr>
              <th className="p-3">Nomor PO</th>
              <th className="p-3">Pelanggan</th>
              <th className="p-3">Tanggal</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-text-muted">
                  Tidak ada Purchase Order yang cocok dengan kriteria filter.
                </td>
              </tr>
            ) : (
              pagedOrders.map((po) => {
                return (
                  <tr
                    key={po.id}
                    onClick={() => setSelectedOrder(po)}
                    className="hover:bg-surface-subtle/80 transition-colors cursor-pointer select-none"
                    title={`Klik untuk melihat detail ${po.poNumber}`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-text-primary hover:text-primary transition-colors">
                          {po.poNumber}
                        </span>
                        {po.invoiceId && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20"
                            title={`Invoice terbit: ${po.invoiceNumber}`}
                          >
                            Inv: {po.invoiceNumber}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-medium text-text-primary">{po.customerName}</td>
                    <td className="p-3 text-text-muted font-mono">{po.orderDate}</td>
                    <td className="p-3">{getStatusBadge(po.status)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View (Mobile-First) */}
      <div className="md:hidden space-y-3">
        {filteredOrders.length === 0 ? (
          <FeedbackState
            title="Tidak Ada Data PO"
            description="Tidak ada Purchase Order yang cocok dengan filter."
          />
        ) : (
          pagedOrders.map((po) => {
            const totalTarget = po.lines.reduce((acc, i) => acc + i.targetQty, 0);
            const totalFulfilled = po.lines.reduce((acc, i) => acc + i.fulfilledQty, 0);
            const unmappedCount = po.lines.filter((l) => l.mappingStatus === "UNMAPPED").length;

            return (
              <div
                key={po.id}
                onClick={() => setSelectedOrder(po)}
                className="p-4 rounded border border-border-default bg-surface-card space-y-3 cursor-pointer hover:border-primary/50 transition-colors select-none"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-semibold text-text-primary">{po.poNumber}</span>
                    {po.invoiceId && (
                      <span className="text-[10px] font-mono font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        Inv: {po.invoiceNumber}
                      </span>
                    )}
                  </div>
                  {getStatusBadge(po.status)}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-text-primary">{po.customerName}</span>
                  <span className="text-[11px] text-text-muted bg-surface-subtle px-1.5 py-0.5 rounded border border-border-default">
                    PIC: {po.salesPic || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-text-muted font-mono">
                  <span>Tgl: {po.orderDate}</span>
                  <span className="font-semibold text-text-primary">
                    Rp {po.totalAmount.toLocaleString("id-ID")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-text-secondary border-t border-border-default pt-2">
                  <div>
                    <span>Pemenuhan: <strong>{totalFulfilled}/{totalTarget}</strong></span>
                    {unmappedCount > 0 && (
                      <span className="ml-2 text-danger font-medium text-[10px]">
                        ({unmappedCount} non-katalog)
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-primary font-medium flex items-center gap-1">
                    Lihat Rincian &rarr;
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Paginasi */}
      {filteredOrders.length > 0 && (
        <div className="rounded-lg border border-border bg-surface">
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filteredOrders.length}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL DETAIL PURCHASE ORDER                                          */}
      {/* ==================================================================== */}
      {/* ==================================================================== */}
      {/* MODAL DETAIL PURCHASE ORDER (BENTO GRID EXPANSIVE LAYOUT)           */}
      {/* ==================================================================== */}
      <Dialog
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        size="wide"
        hideTitle={true}
        title={`Detail Purchase Order: ${selectedOrder?.poNumber || ""}`}
      >
        {selectedOrder && (
          <div className="flex flex-col h-full max-h-[calc(100dvh-64px)] max-lg:max-h-none max-lg:h-dvh overflow-hidden">
            {/* ==================================================================== */}
            {/* HEADER MODAL (FIXED)                                                 */}
            {/* ==================================================================== */}
            <div className="flex-shrink-0 flex items-start justify-between gap-3 border-b border-border-default px-4 sm:px-6 py-3 sm:py-4 bg-surface-card">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="hidden lg:inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary-soft text-primary">
                    <DocumentIcon size={16} />
                  </span>
                  <h2 className="text-sm sm:text-base font-bold text-text-primary truncate">
                    <span className="hidden lg:inline">Detail Purchase Order: </span>
                    {selectedOrder.poNumber}
                  </h2>
                  <div>{getStatusBadge(selectedOrder.status)}</div>
                </div>
                <p className="hidden lg:block text-xs text-text-secondary mt-0.5">
                  ID: <span className="font-mono text-[11px]">{selectedOrder.id}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors cursor-pointer"
                aria-label="Tutup modal"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            {/* ==================================================================== */}
            {/* BODY MODAL (SINGLE UNIFIED SCROLL CONTAINER)                        */}
            {/* ==================================================================== */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">
              {/* Alert Status Alur Persetujuan & Aksi Lanjutan */}
              {selectedOrder.status === "PENDING_APPROVAL" && (
                <div className="p-3.5 rounded-xl border border-warning/40 bg-warning/10 text-xs text-text-primary space-y-2">
                  <div className="font-semibold text-warning-text flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                      <span>Pesanan ini memerlukan persetujuan Owner</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-xs h-7 border-primary text-primary hover:bg-primary-soft font-medium"
                        onClick={() => {
                          const poId = selectedOrder.id;
                          setSelectedOrder(null);
                          router.push(`/inventory/goods-out?poId=${poId}`);
                        }}
                        title="Buka Goods Out dengan referensi pesanan PO ini di panel samping"
                      >
                        Proses Goods Out
                      </Button>
                      {isOwnerOrSuperAdmin && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            className="bg-success hover:bg-success/90 text-white text-xs h-7"
                            disabled={isPending}
                            loading={isPending}
                            loadingLabel="Menyetujui..."
                            onClick={() => handleApprovePo(selectedOrder.id)}
                          >
                            Setujui PO
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="border-danger text-danger hover:bg-danger/10 text-xs h-7"
                            disabled={isPending}
                            onClick={() => {
                              setRejectionReason("");
                              setIsRejectOpen(true);
                            }}
                          >
                            Tolak PO
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-text-secondary text-[11px]">
                    Setelah disetujui, pesanan dapat diteruskan ke modul Goods Out untuk reservasi dan pengeluaran fisik barang.
                  </div>
                </div>
              )}

              {selectedOrder.status === "FULFILLED" && (
                <div className="p-3.5 rounded-xl border border-success/40 bg-success/10 text-xs text-text-primary space-y-2">
                  <div className="font-semibold text-success flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5">
                      <CheckCircleIcon size={15} />
                      <span>Pesanan Telah Terpenuhi Seluruhnya</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-xs h-7 border-border-default text-text-secondary hover:bg-surface-muted font-medium"
                        onClick={() => {
                          const poId = selectedOrder.id;
                          setSelectedOrder(null);
                          router.push(`/inventory/goods-out?poId=${poId}`);
                        }}
                        title="Lihat riwayat pemenuhan pesanan ini di panel Goods Out"
                      >
                        Lihat di Goods Out
                      </Button>
                    </div>
                  </div>
                  <div className="text-text-secondary text-[11px]">
                    Seluruh kuantitas item pesanan telah dikeluarkan melalui transaksi Goods Out.
                  </div>
                </div>
              )}

              {(selectedOrder.status === "CONFIRMED" || selectedOrder.status === "PARTIALLY_FULFILLED") && (
                <div className="p-3.5 rounded-xl border border-success/40 bg-success/10 text-xs text-text-primary space-y-2">
                  <div className="font-semibold text-success flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5">
                      <CheckCircleIcon size={15} />
                      <span>PO Telah Disetujui — Siap Diproses</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedOrder.invoiceId ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-xs h-7 border-emerald-600 dark:border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 font-medium inline-flex items-center gap-1.5"
                          onClick={() => {
                            const invoiceId = selectedOrder.invoiceId;
                            setSelectedOrder(null);
                            window.location.href = `/documents/${invoiceId}`;
                          }}
                          title={`Lihat invoice ${selectedOrder.invoiceNumber}`}
                        >
                          <DocumentIcon size={13} />
                          Lihat Invoice
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-xs h-7 border-primary text-primary hover:bg-primary-soft font-medium"
                          onClick={() => {
                            const poId = selectedOrder.id;
                            setSelectedOrder(null);
                            window.location.href = `/documents?createFromPo=${poId}`;
                          }}
                          title="Terbitkan tagihan Invoice dari PO ini"
                        >
                          Buat Invoice
                        </Button>
                      )}
                      <Button
                        variant="primary"
                        size="sm"
                        className="text-xs h-7 bg-primary text-white hover:bg-primary/90"
                        onClick={() => {
                          const poId = selectedOrder.id;
                          setSelectedOrder(null);
                          router.push(`/inventory/goods-out?poId=${poId}`);
                        }}
                      >
                        Proses Goods Out
                      </Button>
                    </div>
                  </div>
                  <div className="text-text-secondary text-[11px]">
                    {selectedOrder.invoiceId ? (
                      <span>
                        Invoice telah dibuat: <strong className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">{selectedOrder.invoiceNumber}</strong>. Klik tombol <strong>Lihat Invoice</strong> untuk langsung membuka rincian dokumen.
                      </span>
                    ) : (
                      <span>
                        Teruskan pesanan ini ke modul Dokumen untuk penyiapan tagihan Invoice atau ke Goods Out untuk pengeluaran barang fisik.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {selectedOrder.status === "REJECTED" && (
                <div className="p-3.5 rounded-xl border border-danger/40 bg-danger/10 text-xs text-danger space-y-1">
                  <div className="font-semibold">Pesanan Telah Ditolak</div>
                  {selectedOrder.rejectionReason && (
                    <div>Alasan penolakan: &ldquo;{selectedOrder.rejectionReason}&rdquo;</div>
                  )}
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────────── */}
              {/* BENTO GRID ROW 1: PELANGGAN & INFORMASI PESANAN                    */}
              {/* ─────────────────────────────────────────────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Card A: Pelanggan */}
                <div className="rounded-xl border border-border-default bg-surface-card p-4 space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary-soft text-primary">
                          <UsersIcon size={14} />
                        </span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                          Pelanggan
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono bg-surface-muted px-2 py-0.5 rounded text-text-secondary border border-border-default">
                        {selectedCustomerObj?.code || "PELANGGAN"}
                      </span>
                    </div>

                    <div className="mt-3 p-3 rounded-lg bg-surface-subtle border border-border-default space-y-1.5">
                      <div className="text-sm font-bold text-text-primary">
                        {selectedOrder.customerName || "Pelanggan Tanpa Nama"}
                      </div>
                      {selectedCustomerObj && (
                        <div className="text-[11px] text-text-muted space-y-0.5">
                          {selectedCustomerObj.ownerName && (
                            <div>Pemilik: <span className="text-text-secondary">{selectedCustomerObj.ownerName}</span></div>
                          )}
                          {selectedCustomerObj.phone && (
                            <div>Telepon: <span className="text-text-secondary font-mono">{selectedCustomerObj.phone}</span></div>
                          )}
                          {selectedCustomerObj.address && (
                            <div>Alamat: <span className="text-text-secondary">{selectedCustomerObj.address}</span></div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card B: Informasi Pesanan & PIC Sales */}
                <div className="rounded-xl border border-border-default bg-surface-card p-4 space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary-soft text-primary">
                          <DocumentIcon size={14} />
                        </span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                          Informasi Pesanan
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                        <span>PIC:</span>
                        <strong className="text-text-primary font-semibold">
                          {selectedOrder.salesPic || "—"}
                        </strong>
                        {isOwnerOrSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewSalesPic(selectedOrder.salesPic || "");
                              setIsEditPicOpen(true);
                            }}
                            className="text-primary hover:underline text-[10px] font-medium ml-1 cursor-pointer"
                          >
                            (Ubah)
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="p-2.5 rounded-lg bg-surface-subtle border border-border-default">
                        <div className="text-[10px] text-text-muted uppercase tracking-wider">Tanggal Pesanan</div>
                        <div className="text-xs font-semibold text-text-primary mt-0.5">
                          {selectedOrder.orderDate}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-surface-subtle border border-border-default">
                        <div className="text-[10px] text-text-muted uppercase tracking-wider">Nomor PO</div>
                        <div className="text-xs font-mono font-bold text-text-primary mt-0.5">
                          {selectedOrder.poNumber}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 p-2.5 rounded-lg bg-surface-subtle border border-border-default flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-text-muted uppercase tracking-wider">Status Invoice</div>
                        <div className="text-xs font-semibold text-text-primary mt-0.5 flex items-center gap-1.5">
                          {selectedOrder.invoiceId ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-mono font-bold flex items-center gap-1">
                              <CheckCircleIcon size={12} />
                              {selectedOrder.invoiceNumber}
                            </span>
                          ) : (
                            <span className="text-text-muted font-normal">Belum Diterbitkan</span>
                          )}
                        </div>
                      </div>
                      {selectedOrder.invoiceId && (
                        <button
                          type="button"
                          onClick={() => {
                            const invoiceId = selectedOrder.invoiceId;
                            setSelectedOrder(null);
                            window.location.href = `/documents/${invoiceId}`;
                          }}
                          className="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                        >
                          Buka Invoice &rarr;
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-2 rounded-md bg-surface-muted border border-border-subtle text-[11px] text-text-muted flex items-center justify-between">
                    <span>Aturan Konversi:</span>
                    <span className="font-medium text-text-secondary">
                      1 Lusin = 12 PCS
                    </span>
                  </div>
                </div>
              </div>

              {/* ─────────────────────────────────────────────────────────────────── */}
              {/* BENTO GRID ROW 2: DAFTAR PRODUK / ITEM PESANAN                     */}
              {/* ─────────────────────────────────────────────────────────────────── */}
              <div className="rounded-xl border border-border-default bg-surface-card p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border-subtle">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                      Produk / Item yang Dipesan
                    </h3>
                    <span className="shrink-0 whitespace-nowrap text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-surface-muted text-text-secondary border border-border-default">
                      {selectedOrder.lines.length} Item
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-text-muted">Total Fisik:</span>
                    <span className="font-mono font-bold text-text-primary">
                      {formatLusinPcs(detailPhysicalPcs)}
                    </span>
                    {detailFulfilledPhysicalPcs > 0 && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                        (Terpenuhi: {formatLusinPcs(detailFulfilledPhysicalPcs, detailLusin > 0)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Compact Item Table / List */}
                <div className="rounded-lg border border-border-default bg-surface overflow-hidden">
                  <div className="max-h-64 sm:max-h-72 overflow-y-auto overflow-x-auto">
                    <table className="w-full text-left text-xs text-text-secondary border-collapse min-w-[500px]">
                      <thead className="bg-surface-subtle text-text-muted border-b border-border-default uppercase font-medium text-[11px] sticky top-0 z-10">
                        <tr>
                          <th className="p-2.5 w-20">Item</th>
                          <th className="p-2.5">Produk</th>
                          <th className="p-2.5 text-right w-36 sm:w-44">Kuantitas</th>
                          <th className="p-2.5 text-center w-36">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {selectedOrder.lines.map((item, idx) => {
                          const isFulfilled = item.fulfilledQty >= item.targetQty;
                          const isPartiallyFulfilled = item.fulfilledQty > 0 && item.fulfilledQty < item.targetQty;

                          return (
                            <tr key={item.id} className="hover:bg-surface-subtle/60 transition-colors">
                              <td className="p-2.5 font-semibold text-text-muted whitespace-nowrap">
                                Item #{idx + 1}
                              </td>
                              <td className="p-2.5">
                                <div className="font-medium text-text-primary">
                                  {item.productName || item.rawProductName}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {!item.sku && (
                                    <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                                      Non-Katalog
                                    </span>
                                  )}
                                  {item.unitPrice > 0 && (
                                    <span className="text-[10px] text-text-muted font-mono">
                                      • @ Rp {item.unitPrice.toLocaleString("id-ID")}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-2.5 text-right whitespace-nowrap">
                                <div className="font-mono font-bold text-text-primary">
                                  {item.orderedQty} {item.orderedUnit}
                                </div>
                                {item.orderedUnit === "Lusin" && (
                                  <div className="text-[10px] text-text-muted font-mono">
                                    ({item.targetQty} PCS)
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5 text-center whitespace-nowrap">
                                {isFulfilled ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                    Selesai
                                  </span>
                                ) : isPartiallyFulfilled ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                    {item.orderedUnit === "Lusin"
                                      ? `Parsial (${formatLusinPcs(item.fulfilledQty, false)} / ${item.orderedQty} Lusin)`
                                      : `Parsial (${item.fulfilledQty}/${item.targetQty} ${item.orderedUnit})`}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium text-text-secondary bg-surface-muted border border-border-default">
                                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted shrink-0" />
                                    Belum Diproses
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Card Catatan jika ada */}
              {selectedOrder.notes && (
                <div className="rounded-xl border border-border-default bg-surface-card p-4 space-y-2">
                  <div className="flex items-center gap-2 pb-2 border-b border-border-subtle">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <ClipboardIcon size={14} />
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                      Catatan Pesanan
                    </h3>
                  </div>
                  <p className="text-xs text-text-secondary whitespace-pre-wrap">
                    {selectedOrder.notes}
                  </p>
                </div>
              )}
            </div>

            {/* ==================================================================== */}
            {/* FOOTER MODAL (FIXED)                                                 */}
            {/* ==================================================================== */}
            <div className="flex-shrink-0 flex items-center justify-between border-t border-border-default px-6 py-3 bg-surface-card flex-wrap gap-3">
              <div className="text-xs text-text-secondary">
                {selectedOrder.totalAmount > 0 ? (
                  <span>
                    Total Nilai PO:{" "}
                    <strong className="text-text-primary font-mono text-sm">
                      Rp {selectedOrder.totalAmount.toLocaleString("id-ID")}
                    </strong>
                  </span>
                ) : (
                  <span className="text-[11px] text-text-muted">
                    Total Kuantitas: <strong className="font-mono text-text-primary">{formatLusinPcs(detailPhysicalPcs)}</strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(selectedOrder.status === "CONFIRMED" || selectedOrder.status === "PARTIALLY_FULFILLED" || selectedOrder.status === "FULFILLED") && (
                  <>
                    {selectedOrder.invoiceId ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-xs h-8 border-emerald-600 dark:border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 font-medium inline-flex items-center gap-1.5"
                        onClick={() => {
                          const invoiceId = selectedOrder.invoiceId;
                          setSelectedOrder(null);
                          window.location.href = `/documents/${invoiceId}`;
                        }}
                        title={`Buka invoice ${selectedOrder.invoiceNumber}`}
                      >
                        <DocumentIcon size={14} />
                        Lihat Invoice
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-xs h-8 border-primary text-primary hover:bg-primary-soft font-medium"
                        onClick={() => {
                          const poId = selectedOrder.id;
                          setSelectedOrder(null);
                          window.location.href = `/documents?createFromPo=${poId}`;
                        }}
                        title="Terbitkan tagihan Invoice dari PO ini"
                      >
                        Buat Invoice
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-xs h-8 border-border-strong text-text-primary hover:bg-surface-muted font-medium"
                      onClick={() => {
                        const poId = selectedOrder.id;
                        setSelectedOrder(null);
                        router.push(`/inventory/goods-out?poId=${poId}`);
                      }}
                      title="Proses pengeluaran barang di Goods Out"
                    >
                      Goods Out
                    </Button>
                  </>
                )}
                {isOwnerOrSuperAdmin && selectedOrder.status === "PENDING_APPROVAL" && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="text-xs h-8 bg-success hover:bg-success/90 text-white font-medium"
                    disabled={isPending}
                    onClick={() => handleApprovePo(selectedOrder.id)}
                  >
                    Setujui PO
                  </Button>
                )}
                <Button variant="secondary" size="sm" className="h-8" onClick={() => setSelectedOrder(null)}>
                  Tutup
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* ==================================================================== */}
      {/* MODAL UBAH PIC SALES                                                 */}
      {/* ==================================================================== */}
      <Dialog
        isOpen={isEditPicOpen}
        onClose={() => setIsEditPicOpen(false)}
        title="Ubah PIC Sales"
        description="Perbarui nama penanggung jawab pesanan penjualan."
      >
        <form onSubmit={handleUpdateSalesPic} className="space-y-4">
          <FormField id="edit-pic-sales" label="Nama PIC Sales Baru" isRequired>
            <Input
              id="edit-pic-sales"
              value={newSalesPic}
              onChange={(e) => setNewSalesPic(e.target.value)}
              placeholder="Contoh: Rian Pratama, Siti Nurhaliza"
              required
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
            <Button variant="secondary" type="button" onClick={() => setIsEditPicOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" type="submit" disabled={isPending || !newSalesPic.trim()}>
              {isPending ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ==================================================================== */}
      {/* MODAL TOLAK PURCHASE ORDER                                           */}
      {/* ==================================================================== */}
      <Dialog
        isOpen={isRejectOpen}
        onClose={() => setIsRejectOpen(false)}
        title="Tolak Purchase Order"
        description={`Konfirmasi penolakan pesanan ${selectedOrder?.poNumber || ""}.`}
        isConfirm={true}
      >
        <div className="space-y-4">
          <FormField id="reject-reason" label="Alasan Penolakan (Opsional)">
            <Textarea
              id="reject-reason"
              rows={3}
              placeholder="Contoh: Harga tidak disetujui, kuota minimum tidak terpenuhi, atau stok pabrik kosong..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
            <Button variant="secondary" type="button" onClick={() => setIsRejectOpen(false)}>
              Batal
            </Button>
            <Button
              variant="danger"
              type="button"
              disabled={isPending}
              loading={isPending}
              loadingLabel="Memproses..."
              onClick={handleRejectPo}
            >
              Tolak Purchase Order
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ==================================================================== */}
      {/* MODAL PETAKAN BARIS PO KE PRODUK KATALOG YANG SUDAH ADA               */}
      {/* ==================================================================== */}
      <Dialog
        isOpen={Boolean(mappingLine && !isConvertOpen)}
        onClose={() => setMappingLine(null)}
        title="Petakan Item Pesanan ke Katalog"
        description={`Item Pesanan: "${mappingLine?.line.rawProductName || ""}"`}
      >
        <div className="space-y-4">
          <FormField id="select-catalog-product" label="Pilih Produk dari Master Katalog" isRequired>
            <Select
              id="select-catalog-product"
              value={selectedCatalogProductId}
              onChange={(e) => setSelectedCatalogProductId(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) — Stok: {p.stock} {p.unit}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="text-xs text-text-secondary bg-surface-subtle p-3 rounded border border-border-default">
            Setelah dipetakan, sistem akan mengaitkan pesanan ini dengan SKU master katalog yang dipilih untuk pemenuhan fisik di gudang.
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
            <Button variant="secondary" onClick={() => setMappingLine(null)}>
              Batal
            </Button>
            <Button
              variant="primary"
              disabled={isPending || !selectedCatalogProductId}
              loading={isPending}
              loadingLabel="Memproses..."
              onClick={handleMapToCatalog}
            >
              Tautkan ke Produk Ini
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ==================================================================== */}
      {/* MODAL JADIKAN PRODUK BARU DI KATALOG                                 */}
      {/* ==================================================================== */}
      <Dialog
        isOpen={isConvertOpen}
        onClose={() => setIsConvertOpen(false)}
        title="Daftarkan Produk Baru ke Master Katalog"
        description="Item pesanan belum ada di database. Masukkan detail produk untuk mendaftarkannya ke katalog resmi."
      >
        <form onSubmit={handleConvertToCatalog} className="space-y-3">
          <FormField id="new-prod-name" label="Nama Produk" isRequired>
            <Input
              id="new-prod-name"
              value={newProdName}
              onChange={(e) => setNewProdName(e.target.value)}
              required
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField id="new-prod-sku" label="Kode SKU" isRequired>
              <Input
                id="new-prod-sku"
                value={newProdSku}
                onChange={(e) => setNewProdSku(e.target.value.toUpperCase())}
                placeholder="SKU-XXXX"
                className="font-mono"
                required
              />
            </FormField>
            <FormField id="new-prod-category" label="Kategori">
              <Input
                id="new-prod-category"
                value={newProdCategory}
                onChange={(e) => setNewProdCategory(e.target.value)}
                placeholder="Elektronik, Pakaian..."
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField id="new-prod-tracking" label="Pelacakan Stok">
              <Select
                id="new-prod-tracking"
                value={newProdTracking}
                onChange={(e) => setNewProdTracking(e.target.value as "SERIAL" | "NON_SERIAL")}
              >
                <option value="NON_SERIAL">Non-Serial (Kuantitas Standar)</option>
                <option value="SERIAL">Serial Number (SN Unik)</option>
              </Select>
            </FormField>
            <FormField id="new-prod-unit" label="Satuan Fisik">
              <Input
                id="new-prod-unit"
                value={newProdUnit}
                onChange={(e) => setNewProdUnit(e.target.value)}
                placeholder="pcs, unit, kg..."
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border-default">
            <Button variant="secondary" type="button" onClick={() => setIsConvertOpen(false)}>
              Batal
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isPending || !newProdName.trim() || !newProdSku.trim()}
              loading={isPending}
              loadingLabel="Mendaftarkan..."
            >
              Daftarkan &amp; Petakan
            </Button>
          </div>
        </form>
      </Dialog>

      {/* MODAL BUAT PO BARU (ENTERPRISE / MULTI-LINE / MOBILE-RESPONSIVE) */}
      <PoCreateDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        customers={customers}
        products={products}
        currentRole={currentRole}
        currentUserName={currentUserName}
        onCreated={(newPo: PurchaseOrderRecord, message?: string) => {
          setOrders((prev) => [newPo, ...prev]);
          if (message) setStatusMessage(message);
        }}
      />
    </div>
  );
}
