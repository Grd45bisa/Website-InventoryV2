"use client";

import React, { useState, useMemo, useTransition } from "react";
import { useActiveContext } from "@/lib/demo/active-context-provider";
import {
  ReturnItem,
  Partner,
  Product,
  FIXTURE_RETURNS,
  FIXTURE_PARTNERS,
  FIXTURE_PRODUCTS,
} from "@/lib/demo/inventory-fixtures";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Alert, FeedbackState } from "@/components/ui/feedback";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Select, Textarea } from "@/components/ui/form-fields";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { PlusIcon, EyeIcon } from "@/components/ui/icons";

const PAGE_SIZE = 50;
import {
  createInventoryReturnAction,
  approveAndReceiveReturnAction,
} from "@/lib/inventory/actions";

export interface ReturnsViewProps {
  initialReturns?: ReturnItem[];
  initialPartners?: Partner[];
  initialProducts?: Product[];
}

export function ReturnsView({
  initialReturns = [],
  initialPartners = [],
  initialProducts = [],
}: ReturnsViewProps) {
  const { currentRole, activeWarehouseId, activeWarehouse } = useActiveContext();
  const [returns, setReturns] = useState<ReturnItem[]>(
    initialReturns.length > 0 ? initialReturns : FIXTURE_RETURNS
  );
  const partners = useMemo(
    () => (initialPartners.length > 0 ? initialPartners : FIXTURE_PARTNERS.filter((p) => p.type === "CUSTOMER")),
    [initialPartners]
  );
  const products = useMemo(
    () => (initialProducts.length > 0 ? initialProducts : FIXTURE_PRODUCTS),
    [initialProducts]
  );

  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  // Modal State
  const [selectedReturn, setSelectedReturn] = useState<ReturnItem | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Form State Buat Retur
  const [customerId, setCustomerId] = useState(partners[0]?.id || "");
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<ReturnItem["reason"]>("SALAH_KIRIM");
  const [condition, setCondition] = useState<"BAIK" | "RUSAK">("BAIK");
  const [serialNumbers, setSerialNumbers] = useState("");
  const [notes, setNotes] = useState("");
  const [returnError, setReturnError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Evaluasi baseline reopen_source_qty sesuai LOCKED rule:
  // SALAH_KIRIM, PEMBATALAN, SALAH_INPUT = true; CACAT, LAINNYA = false
  const willReopenQty =
    reason === "SALAH_KIRIM" || reason === "PEMBATALAN" || reason === "SALAH_INPUT";

  const filteredReturns = useMemo(() => {
    return returns.filter((ret) => {
      // Isolasi gudang jika staff/sales
      if (currentRole !== "OWNER" && ret.warehouseId !== activeWarehouseId) {
        return false;
      }

      const matchSearch =
        ret.returnNumber.toLowerCase().includes(search.toLowerCase()) ||
        ret.sourceReference.toLowerCase().includes(search.toLowerCase()) ||
        ret.partnerName.toLowerCase().includes(search.toLowerCase());

      const matchReason = reasonFilter === "ALL" || ret.reason === reasonFilter;
      const matchStatus = statusFilter === "ALL" || ret.status === statusFilter;

      return matchSearch && matchReason && matchStatus;
    });
  }, [returns, currentRole, activeWarehouseId, search, reasonFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredReturns.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedReturns = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredReturns.slice(start, start + PAGE_SIZE);
  }, [filteredReturns, safePage]);

  const handleCreateReturn = (e: React.FormEvent) => {
    e.preventDefault();
    setReturnError(null);

    const cust = partners.find((p) => p.id === customerId) || partners[0];
    if (!cust) {
      setReturnError("Pelanggan harus dipilih.");
      return;
    }

    const prod = products.find((p) => p.id === productId) || products[0];
    if (!prod) {
      setReturnError("Produk harus dipilih.");
      return;
    }

    const parsedSerials = serialNumbers
      .split(/[\n,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const newNumber = `RET-${Date.now().toString().slice(-6)}`;

    if (isPending) return;

    startTransition(async () => {
      const res = await createInventoryReturnAction({
        warehouseId: activeWarehouseId,
        customerId: cust.id,
        returnNumber: newNumber,
        returnDate: new Date().toISOString().slice(0, 10),
        reason,
        notes: notes.trim() || undefined,
        lines: [
          {
            productId: prod.id,
            quantity: Number(quantity) || 1,
            unit: prod.unit || "unit",
            condition,
            returnedSerials: parsedSerials.length > 0 ? parsedSerials : undefined,
          },
        ],
      });

      if (!res.success) {
        setReturnError(res.error || "Gagal membuat dokumen retur.");
        return;
      }

      const created = res.returnRecord;
      const willReopen = reason === "SALAH_KIRIM" || reason === "PEMBATALAN" || reason === "SALAH_INPUT";
      const newReturn: ReturnItem = {
        id: created?.id || `ret-${Date.now()}`,
        returnNumber: created?.returnNumber || newNumber,
        sourceReference: "GO-LANGSUNG",
        warehouseId: activeWarehouseId,
        warehouseName: activeWarehouse?.name || "Gudang Aktif",
        date: created?.returnDate || new Date().toISOString().slice(0, 10),
        partnerName: cust.name,
        reason,
        reopenSourceQty: willReopen,
        status: "PENDING_REVIEW",
        notes: notes.trim() || undefined,
        items: [
          {
            productId: prod.id,
            productName: prod.name,
            qty: Number(quantity) || 1,
            unit: prod.unit || "unit",
            condition,
            serialNumbers: parsedSerials.length > 0 ? parsedSerials : undefined,
          },
        ],
      };

      setReturns((prev) => [newReturn, ...prev]);
      setIsCreateOpen(false);
      setStatusMessage(
        `Pengajuan retur ${newReturn.returnNumber} berhasil dibuat dengan status DRAFT / Menunggu Review (belum mengubah stok fisik sebelum penerimaan barang).`
      );
    });
  };

  const handleApproveAndReceive = (ret: ReturnItem) => {
    if (isPending) return;
    setReturnError(null);
    startTransition(async () => {
      const res = await approveAndReceiveReturnAction(ret.id);
      if (!res.success) {
        setReturnError(res.error || "Gagal memproses penerimaan fisik retur.");
        return;
      }

      setReturns((prev) =>
        prev.map((item) =>
          item.id === ret.id ? { ...item, status: "APPROVED" } : item
        )
      );

      if (selectedReturn?.id === ret.id) {
        setSelectedReturn((prev) => (prev ? { ...prev, status: "APPROVED" } : null));
      }

      setStatusMessage(
        `Retur ${ret.returnNumber} resmi disetujui & diterima fisik. Mutasi ledger fisik RETURN_IN_POSTED telah dicatat di database.${ret.reopenSourceQty ? " Kuota pemenuhan pesanan dibuka kembali." : ""}`
      );
    });
  };

  const getReasonBadge = (r: ReturnItem["reason"]) => {
    switch (r) {
      case "SALAH_KIRIM":
        return <Badge variant="warning">Salah Kirim</Badge>;
      case "PEMBATALAN":
        return <Badge variant="neutral">Pembatalan</Badge>;
      case "SALAH_INPUT":
        return <Badge variant="info">Salah Input</Badge>;
      case "CACAT":
        return <Badge variant="danger">Barang Cacat/Rusak</Badge>;
      case "LAINNYA":
        return <Badge variant="outline">Lainnya</Badge>;
      default:
        return <Badge variant="neutral">{r}</Badge>;
    }
  };

  const getStatusBadge = (s: ReturnItem["status"]) => {
    switch (s) {
      case "PENDING_REVIEW":
        return <Badge variant="warning">Menunggu Review</Badge>;
      case "APPROVED":
        return <Badge variant="success">Disetujui</Badge>;
      case "REJECTED":
        return <Badge variant="danger">Ditolak</Badge>;
      default:
        return <Badge variant="neutral">{s}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Retur Barang"
        description="Pencatatan pengembalian barang, alasan retur, dan evaluasi kuantitas sumber pemenuhan (reopen source qty)."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
          >
            <PlusIcon className="h-4 w-4" />
            Buat Pengajuan Retur
          </Button>
        }
      />

      <div className="rounded border border-info/30 bg-surface-subtle p-3 text-xs text-text-secondary space-y-1">
        <div className="font-semibold text-text-primary">Kebijakan Reopen Source Qty (RPD §7.8 & §10.6):</div>
        <div>
          1. <strong className="text-text-primary">SALAH_KIRIM, PEMBATALAN, SALAH_INPUT</strong> = Kuota sumber dibuka kembali (<span className="text-success font-semibold">reopen = true</span>).
        </div>
        <div>
          2. <strong className="text-text-primary">CACAT, LAINNYA</strong> = Kuota sumber tidak dibuka (<span className="text-danger font-semibold">reopen = false</span>).
        </div>
        <div>
          3. Retur tidak memodifikasi saldo ledger secara langsung. Penyesuaian stok fisik hanya melalui transaksi resmi setelah approval.
        </div>
      </div>

      {statusMessage && (
        <Alert
          variant="success"
          title="Berhasil"
          description={statusMessage}
        />
      )}

      {/* Toolbar Filter */}
      <ListToolbar
        searchPlaceholder="Cari nomor retur, referensi sumber, atau mitra..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={
          <div className="flex gap-2">
            <div className="w-40">
              <label htmlFor="ret-reason-filter" className="sr-only">Alasan Retur</label>
              <Select
                id="ret-reason-filter"
                value={reasonFilter}
                onChange={(e) => setReasonFilter(e.target.value)}
              >
                <option value="ALL">Semua Alasan</option>
                <option value="SALAH_KIRIM">Salah Kirim</option>
                <option value="PEMBATALAN">Pembatalan</option>
                <option value="SALAH_INPUT">Salah Input</option>
                <option value="CACAT">Cacat / Rusak</option>
                <option value="LAINNYA">Lainnya</option>
              </Select>
            </div>
            <div className="w-40">
              <label htmlFor="ret-status-filter" className="sr-only">Status Review</label>
              <Select
                id="ret-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Semua Status</option>
                <option value="PENDING_REVIEW">Menunggu Review</option>
                <option value="APPROVED">Disetujui</option>
                <option value="REJECTED">Ditolak</option>
              </Select>
            </div>
          </div>
        }
      />


      {/* Desktop Table View */}
      <div className="hidden md:block rounded border border-border-default bg-surface-card overflow-hidden">
        <table className="w-full text-left text-xs text-text-secondary border-collapse">
          <thead className="bg-surface-subtle text-text-muted border-b border-border-default uppercase font-medium">
            <tr>
              <th className="p-3">Nomor Retur</th>
              <th className="p-3">Referensi Sumber</th>
              <th className="p-3">Mitra Terkait</th>
              <th className="p-3">Gudang</th>
              <th className="p-3">Alasan Retur</th>
              <th className="p-3 text-center">Reopen Kuota</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {filteredReturns.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-text-muted">
                  Tidak ada data retur yang cocok dengan kriteria filter.
                </td>
              </tr>
            ) : (
              pagedReturns.map((ret) => (
                <tr key={ret.id} className="hover:bg-surface-subtle/50 transition-colors">
                  <td className="p-3 font-mono font-semibold text-text-primary">{ret.returnNumber}</td>
                  <td className="p-3 font-mono text-text-muted">{ret.sourceReference}</td>
                  <td className="p-3 font-medium text-text-primary">{ret.partnerName}</td>
                  <td className="p-3 text-text-muted">{ret.warehouseName}</td>
                  <td className="p-3">{getReasonBadge(ret.reason)}</td>
                  <td className="p-3 text-center">
                    <Badge variant={ret.reopenSourceQty ? "success" : "neutral"} size="sm">
                      {ret.reopenSourceQty ? "YA (Reopen)" : "TIDAK"}
                    </Badge>
                  </td>
                  <td className="p-3">{getStatusBadge(ret.status)}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {ret.status === "PENDING_REVIEW" && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleApproveAndReceive(ret)}
                          disabled={isPending}
                          loading={isPending}
                          loadingLabel="Memposting..."
                        >
                          Terima Fisik & Posting
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedReturn(ret)}
                        aria-label={`Lihat detail ${ret.returnNumber}`}
                      >
                        <EyeIcon className="h-4 w-4" />
                        Detail
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredReturns.length === 0 ? (
          <FeedbackState
            title="Tidak Ada Data Retur"
            description="Tidak ada dokumen retur yang cocok dengan filter."
          />
        ) : (
          pagedReturns.map((ret) => (
            <div
              key={ret.id}
              className="p-4 rounded border border-border-default bg-surface-card space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-text-primary">{ret.returnNumber}</span>
                {getStatusBadge(ret.status)}
              </div>
              <div className="text-sm font-medium text-text-primary">{ret.partnerName}</div>
              <div className="flex items-center justify-between text-xs text-text-muted font-mono">
                <span>Sumber: {ret.sourceReference}</span>
                <span>Tgl: {ret.date}</span>
              </div>
              <div className="flex items-center justify-between text-xs border-t border-border-default pt-2">
                <div>{getReasonBadge(ret.reason)}</div>
                <div className="flex items-center gap-1">
                  {ret.status === "PENDING_REVIEW" && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleApproveAndReceive(ret)}
                      disabled={isPending}
                      loading={isPending}
                      loadingLabel="Memposting..."
                    >
                      Terima Fisik
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedReturn(ret)}
                  >
                    Detail Retur
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Paginasi Retur (Maksimal 50 Data per Halaman) */}
      {filteredReturns.length > 0 && (
        <div className="rounded-lg border border-border bg-surface">
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filteredReturns.length}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Modal Detail Retur */}
      <Dialog
        isOpen={Boolean(selectedReturn)}
        onClose={() => setSelectedReturn(null)}
        title={`Detail Dokumen Retur: ${selectedReturn?.returnNumber || ""}`}
        description={`Sumber: ${selectedReturn?.sourceReference || ""} | Gudang: ${selectedReturn?.warehouseName || ""}`}
      >
        {selectedReturn && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded bg-surface-subtle border border-border-default">
              <span className="text-xs text-text-secondary">Status Evaluasi:</span>
              {getStatusBadge(selectedReturn.status)}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded border border-border-default bg-surface-card">
                <div className="text-text-muted">Alasan Pengembalian:</div>
                <div className="mt-1 font-semibold text-text-primary">{selectedReturn.reason}</div>
              </div>
              <div className="p-3 rounded border border-border-default bg-surface-card">
                <div className="text-text-muted">Reopen Source Qty:</div>
                <div className="mt-1 font-semibold text-text-primary">
                  {selectedReturn.reopenSourceQty
                    ? "YA (Kuota Pesanan Dibuka Kembali)"
                    : "TIDAK (Kuota Tetap Terpotong)"}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-primary">Item yang Diretur:</div>
              <div className="rounded border border-border-default overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-surface-subtle text-text-muted uppercase">
                    <tr>
                      <th className="p-2.5">Produk</th>
                      <th className="p-2.5 text-center">Kuantitas</th>
                      <th className="p-2.5">Kondisi Fisik</th>
                      <th className="p-2.5">Nomor Seri (SN)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default">
                    {selectedReturn.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-medium text-text-primary">{item.productName}</td>
                        <td className="p-2.5 text-center font-mono">
                          {item.qty} {item.unit}
                        </td>
                        <td className="p-2.5">
                          <Badge variant={item.condition === "BAIK" ? "success" : "danger"} size="sm">
                            {item.condition}
                          </Badge>
                        </td>
                        <td className="p-2.5 font-mono text-[11px] text-text-muted">
                          {item.serialNumbers && item.serialNumbers.length > 0
                            ? item.serialNumbers.join(", ")
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedReturn.notes && (
              <div className="text-xs text-text-secondary bg-surface-subtle p-3 rounded border border-border-default">
                <span className="font-semibold text-text-primary">Catatan:</span> {selectedReturn.notes}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
              {selectedReturn.status === "PENDING_REVIEW" && (
                <Button
                  variant="primary"
                  onClick={() => handleApproveAndReceive(selectedReturn)}
                  disabled={isPending}
                  loading={isPending}
                  loadingLabel="Memposting..."
                >
                  Terima Fisik & Posting Stok ke Ledger
                </Button>
              )}
              <Button variant="secondary" onClick={() => setSelectedReturn(null)}>
                Tutup
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Modal Buat Pengajuan Retur */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Buat Pengajuan Retur Baru"
        description="Pencatatan pengembalian barang dan penetapan kebijakan kuantitas sumber."
      >
        <form onSubmit={handleCreateReturn} className="space-y-4">
          {returnError && (
            <Alert variant="danger" title="Kesalahan Form" description={returnError} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField id="ret-partner" label="Pelanggan" isRequired>
              <Select
                id="ret-partner"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField id="ret-product" label="Produk yang Dikembalikan" isRequired>
              <Select
                id="ret-product"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField id="ret-qty" label="Jumlah Retur" isRequired>
              <Input
                id="ret-qty"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="font-mono text-xs"
                required
              />
            </FormField>

            <FormField id="ret-reason" label="Alasan Retur" isRequired>
              <Select
                id="ret-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value as ReturnItem["reason"])}
              >
                <option value="SALAH_KIRIM">Salah Kirim (Reopen: YA)</option>
                <option value="PEMBATALAN">Pembatalan (Reopen: YA)</option>
                <option value="SALAH_INPUT">Salah Input (Reopen: YA)</option>
                <option value="CACAT">Barang Cacat/Rusak (Reopen: TIDAK)</option>
                <option value="LAINNYA">Lainnya (Reopen: TIDAK)</option>
              </Select>
            </FormField>

            <FormField id="ret-condition" label="Kondisi Fisik" isRequired>
              <Select
                id="ret-condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value as "BAIK" | "RUSAK")}
              >
                <option value="BAIK">Kondisi Baik (Available)</option>
                <option value="RUSAK">Kondisi Cacat (Quarantine)</option>
              </Select>
            </FormField>
          </div>

          <FormField id="ret-serials" label="Nomor Seri (Serial Number) - Jika Serial Tracking">
            <Input
              id="ret-serials"
              placeholder="Contoh: SN-TEST-001, SN-TEST-002"
              value={serialNumbers}
              onChange={(e) => setSerialNumbers(e.target.value)}
              className="font-mono text-xs"
            />
          </FormField>

          <div className="p-3 rounded bg-surface-subtle border border-border-default text-xs space-y-1">
            <div className="font-semibold text-text-primary">
              Efek Terhadap Kuantitas Sumber & Stok (RPD §10.6):
            </div>
            <div className={willReopenQty ? "text-success font-medium" : "text-text-muted"}>
              {willReopenQty
                ? "✓ Alasan ini membuka kembali alokasi pengiriman pada PO/Goods Out terkait (reopen_source_qty = true)."
                : "✗ Alasan ini TIDAK membuka kembali alokasi pengiriman (barang cacat/klaim garansi)."}
            </div>
            <div className="text-text-secondary">
              Penerimaan fisik akan langsung mencatat mutasi ledger <strong>RETURN_IN_POSTED</strong> (+{quantity} stok fisik).
            </div>
          </div>

          <FormField id="ret-notes" label="Catatan Alasan / Bukti Foto">
            <Textarea
              id="ret-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Deskripsi kerusakan atau kronologi kesalahan pengiriman..."
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
            <Button
              variant="secondary"
              type="button"
              disabled={isPending}
              onClick={() => setIsCreateOpen(false)}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isPending}
              loading={isPending}
              loadingLabel="Memproses..."
            >
              Ajukan Dokumen Retur
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
