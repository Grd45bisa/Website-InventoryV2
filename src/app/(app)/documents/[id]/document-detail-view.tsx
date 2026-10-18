"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { CommercialDocumentDetailRecord } from "@/lib/db/repositories/inventory-repository";
import { Button } from "@/components/ui/button";
import { Badge, Alert } from "@/components/ui/feedback";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { FormField, Input, Select } from "@/components/ui/form-fields";
import {
  ChevronLeftIcon,
  PrinterIcon,
  PencilIcon,
  DocumentIcon,
  TruckIcon,
  ReceiptIcon,
  EyeIcon,
  PlusIcon,
  CheckCircleIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/ui/icons";
import {
  recordDocumentPrintAction,
  deleteDocumentPaymentAction,
} from "@/lib/inventory/actions";
import { useToast } from "@/components/ui/toast";
import type { DocumentEditOptions } from "@/lib/db/repositories/inventory-repository";
import { DocumentEditDialog } from "./document-edit-dialog";
import { PaymentRecordDialog } from "../payment-record-dialog";
import { PaymentProofViewerDialog } from "../payment-proof-viewer-dialog";

interface DocumentDetailViewProps {
  initialDocument: CommercialDocumentDetailRecord;
  /** Ditentukan server; UI hanya mencerminkan. Server tetap memvalidasi saat menyimpan. */
  canEdit?: boolean;
  editOptions?: DocumentEditOptions | null;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function DocumentDetailView({
  initialDocument,
  canEdit = false,
  editOptions = null,
}: DocumentDetailViewProps) {
  const [doc, setDoc] = useState<CommercialDocumentDetailRecord>(initialDocument);
  const [payments, setPayments] = useState(initialDocument.payments);
  const [isPending, startTransition] = useTransition();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // Modal Pembayaran & Bukti Bayar State
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedPaymentForProof, setSelectedPaymentForProof] = useState<CommercialDocumentDetailRecord["payments"][number] | null>(null);
  const [paymentSwitchNotice, setPaymentSwitchNotice] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  const toast = useToast();
  // Payment Delete State
  const [paymentToDelete, setPaymentToDelete] = useState<CommercialDocumentDetailRecord["payments"][number] | null>(null);
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);

  const handleConfirmDeletePayment = async () => {
    if (!paymentToDelete) return;
    setIsDeletingPayment(true);
    try {
      const res = await deleteDocumentPaymentAction(paymentToDelete.id);
      if (!res.success) {
        toast.push({
          tone: "danger",
          title: "Gagal Menghapus Pembayaran",
          description: res.error || "Terjadi kesalahan saat menghapus pembayaran.",
        });
        return;
      }

      const updatedStatus = res.newStatus as CommercialDocumentDetailRecord["status"];
      setDoc((prev) => ({
        ...prev,
        paidAmount: res.paidAmount,
        status: updatedStatus,
      }));
      setPayments((prev) => prev.filter((p) => p.id !== paymentToDelete.id));

      toast.push({
        tone: "success",
        title: "Pembayaran Dihapus",
        description: `Catatan pembayaran ${paymentToDelete.paymentNumber} sebesar ${formatRupiah(paymentToDelete.amount)} telah dihapus. Status tagihan disesuaikan kembali.`,
      });
      setPaymentToDelete(null);
    } catch (err: unknown) {
      toast.push({
        tone: "danger",
        title: "Kesalahan Sistem",
        description: err instanceof Error ? err.message : "Gagal menghapus pembayaran.",
      });
    } finally {
      setIsDeletingPayment(false);
    }
  };

  // Print feedback
  const [printSuccess, setPrintSuccess] = useState<string | null>(null);

  const remainingBalance = Math.max(0, doc.totalAmount - doc.paidAmount);
  const isInvoiceOrReceipt = doc.documentType === "INVOICE" || doc.documentType === "RECEIPT";
  const isPaid = doc.status === "PAID" || (doc.totalAmount > 0 && doc.paidAmount >= doc.totalAmount);

  // Status Badge Helper
  const getStatusBadge = () => {
    if (doc.documentType === "SAMPLE") {
      return <Badge variant="neutral">Non-Komersial</Badge>;
    }
    switch (doc.status) {
      case "PAID":
        return <Badge variant="success">Lunas</Badge>;
      case "PARTIALLY_PAID":
        return <Badge variant="warning">Sebagian</Badge>;
      case "ISSUED":
        return <Badge variant="info">Diterbitkan</Badge>;
      case "DRAFT":
        return <Badge variant="neutral">Draft</Badge>;
      case "CANCELLED":
        return <Badge variant="danger">Dibatalkan</Badge>;
      default:
        return <Badge variant="neutral">{doc.status}</Badge>;
    }
  };

  const getTypeBadge = () => {
    switch (doc.documentType) {
      case "INVOICE":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            <DocumentIcon className="h-3.5 w-3.5" />
            Invoice (Faktur)
          </span>
        );
      case "SAMPLE":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-warning/10 text-warning border border-warning/20">
            <DocumentIcon className="h-3.5 w-3.5" />
            Surat Sampel
          </span>
        );
      case "SURAT_JALAN":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-warning/10 text-warning border border-warning/20">
            <TruckIcon className="h-3.5 w-3.5" />
            Surat Jalan
          </span>
        );
      case "RECEIPT":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-success/10 text-success border border-success/20">
            <ReceiptIcon className="h-3.5 w-3.5" />
            Kuitansi
          </span>
        );
    }
  };

  const handlePrint = async () => {
    try {
      const res = await recordDocumentPrintAction(doc.id);
      if (res.success) {
        setDoc((prev) => ({
          ...prev,
          printCount: res.printCount,
        }));
        setPrintSuccess(`Pencetakan ke-${res.printCount} berhasil dicatat di audit log.`);
        setTimeout(() => setPrintSuccess(null), 4000);
      }
      window.print();
    } catch {
      window.print();
    }
  };

  const handleTogglePaymentSwitch = () => {
    if (isPaid) {
      setPaymentSwitchNotice(
        "Invoice ini telah berstatus Lunas berdasarkan riwayat pembayaran nyata yang tersimpan di sistem. Status tidak dapat diubah ke Belum Lunas secara langsung demi menjaga integritas pembukuan kas."
      );
      setTimeout(() => setPaymentSwitchNotice(null), 6000);
      return;
    }
    setPaymentSwitchNotice(null);
    setIsPaymentDialogOpen(true);
  };

  const handlePaymentSuccess = (res: {
    paymentId: string;
    newStatus: string;
    paidAmount: number;
    paymentItem: CommercialDocumentDetailRecord["payments"][number];
  }) => {
    const updatedStatus = res.newStatus as CommercialDocumentDetailRecord["status"];
    setDoc((prev) => ({
      ...prev,
      paidAmount: res.paidAmount,
      status: updatedStatus,
    }));
    setPayments((prev) => [res.paymentItem, ...prev]);
    setPaymentSuccess(
      `Pembayaran sebesar ${formatRupiah(res.paymentItem.amount)} berhasil dicatat (Status: ${res.newStatus === "PAID" ? "Lunas" : "Sebagian"}).`
    );
    setTimeout(() => setPaymentSuccess(null), 5000);
  };


  return (
    <>
      <div className="space-y-6 pb-12 print:hidden">
      {/* 1. Header & Navigasi Kembali */}
      <div className="flex flex-col gap-3">
        <div>
          <Link
            href="/documents"
            className="inline-flex items-center gap-1 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors focus:outline-hidden"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <span>Kembali ke Daftar Dokumen</span>
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-default pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl md:text-2xl font-bold font-mono tracking-tight text-text-primary">
                {doc.documentNumber}
              </h1>
              {getTypeBadge()}
              {getStatusBadge()}
            </div>
            <p className="text-xs text-text-secondary">
              {doc.documentType === "SAMPLE"
                ? "Dokumen non-komersial resmi DocuFlow V2 · Pengiriman sampel produk tanpa tagihan piutang."
                : "Dokumen komersial resmi DocuFlow V2 · Penerbitan dan riwayat transaksi tervalidasi."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && editOptions && doc.status !== "CANCELLED" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditSuccess(null);
                  setIsEditOpen(true);
                }}
                title="Edit pelanggan, tanggal, catatan, dan item dokumen"
                className="inline-flex items-center gap-1.5"
              >
                <PencilIcon className="h-4 w-4" />
                <span>Edit Dokumen</span>
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrint}
              title="Cetak format cetak resmi dokumen"
              className="inline-flex items-center gap-1.5"
            >
              <PrinterIcon className="h-4 w-4" />
              <span>Cetak Dokumen</span>
            </Button>
          </div>
        </div>
      </div>


      {printSuccess && (
        <Alert variant="info" title="Pencetakan Tercatat" description={printSuccess} />
      )}

      {editSuccess && (
        <Alert variant="success" title="Dokumen Diperbarui" description={editSuccess} />
      )}

      {canEdit && editOptions && (
        <DocumentEditDialog
          open={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          document={doc}
          options={editOptions}
          onSaved={(updated) => {
            setDoc(updated);
            setPayments(updated.payments);
            setEditSuccess("Perubahan dokumen berhasil disimpan dan dicatat di audit log.");
          }}
        />
      )}

      {/* 2. Layout Grid: Kiri Konten Utama Dokumen, Kanan Sidebar Informasi Mitra & Bayar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom Kiri: Detail Dokumen, Item Lines, dan Ringkasan Nilai */}
        <div className="lg:col-span-2 space-y-6">
          {/* A. Kartu Ringkasan Informasi Dokumen */}
          <div className="rounded-xl border border-border-default bg-surface-card p-5 space-y-4 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Informasi Transaksi Dokumen
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div className="space-y-1">
                <span className="text-text-muted block text-[11px]">Tanggal Terbit</span>
                <span className="font-semibold text-text-primary">{formatDateDisplay(doc.documentDate)}</span>
              </div>

              {doc.documentType === "INVOICE" && (
                <div className="space-y-1">
                  <span className="text-text-muted block text-[11px]">Jatuh Tempo</span>
                  <span className="font-semibold text-text-primary">{formatDateDisplay(doc.dueDate)}</span>
                </div>
              )}

              <div className="space-y-1">
                <span className="text-text-muted block text-[11px]">Frekuensi Cetak</span>
                <span className="font-semibold text-text-primary">
                  {doc.printCount > 0 ? `${doc.printCount}x dicetak` : "Belum dicetak"}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-text-muted block text-[11px]">Referensi PO</span>
                <span className="font-semibold text-text-primary">
                  {doc.poNumber ? doc.poNumber : "—"}
                </span>
              </div>
            </div>

            {doc.notes && (
              <div className="pt-3 border-t border-border-default text-xs text-text-secondary">
                <strong className="text-text-primary font-medium">Catatan Dokumen:</strong> {doc.notes}
              </div>
            )}
          </div>

          {/* Banner Info untuk Dokumen Sample */}
          {doc.documentType === "SAMPLE" && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-xs text-text-secondary space-y-1">
              <span className="font-bold text-text-primary block text-sm">Surat Sampel (Barang Contoh Non-Komersial)</span>
              <p>
                Dokumen ini merupakan pencatatan pemberian sampel produk kepada pelanggan tanpa nilai komersial (Rp 0) dan bukan transaksi penjualan atau tagihan piutang. Pembuatan atau pengeditan Surat Sampel tidak mengurangi saldo stok secara otomatis (pengeluaran fisik barang dicatat melalui alur inventori / Goods Out terpisah). Dokumen ini tidak menerima pembayaran finansial.
              </p>
            </div>
          )}

          {/* B. Daftar Item Dokumen */}
          <div className="rounded-xl border border-border-default bg-surface-card overflow-hidden shadow-xs">
            <div className="p-4 border-b border-border-default flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Rincian Item Dokumen ({doc.lines.length} Item)
              </h2>
            </div>

            {doc.lines.length === 0 ? (
              <div className="p-8 text-center text-xs text-text-muted">
                Tidak ada baris item terpisah yang tercatat untuk dokumen ini.
              </div>
            ) : (
              <>
                {/* Desktop Item Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-surface-subtle text-text-muted font-medium border-b border-border-default">
                      <tr>
                        <th className="p-3 w-10 text-center">#</th>
                        <th className="p-3">Produk</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3 text-right">Kuantitas</th>
                        {isInvoiceOrReceipt && (
                          <>
                            <th className="p-3 text-right">Harga Satuan</th>
                            <th className="p-3 text-right">Diskon</th>
                            <th className="p-3 text-right">Jumlah Akhir</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default font-mono">
                      {doc.lines.map((line, idx) => (
                        <tr key={line.id} className="hover:bg-surface-subtle/50 transition-colors">
                          <td className="p-3 text-center text-text-muted">{idx + 1}</td>
                          <td className="p-3 font-sans font-medium text-text-primary">
                            <div>{line.productName}</div>
                            {line.descriptionSnapshot && line.descriptionSnapshot !== line.productName && (
                              <div className="text-[11px] text-text-muted">{line.descriptionSnapshot}</div>
                            )}
                            {line.tracking === "SERIAL" && (
                              <span className="inline-block mt-0.5 px-1 py-0.2 rounded text-[10px] bg-primary/10 text-primary font-mono">
                                Lacak Serial
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-text-muted">{line.sku || "—"}</td>
                          <td className="p-3 text-right">
                            <span className="font-bold text-text-primary">{line.quantity}</span>{" "}
                            <span className="text-text-muted">{line.unit || "PCS"}</span>
                          </td>
                          {isInvoiceOrReceipt && (
                            <>
                              <td className="p-3 text-right font-medium text-text-primary">
                                {formatRupiah(line.unitPrice)}
                              </td>
                              <td className="p-3 text-right text-danger">
                                {line.discountValue > 0 ? `- ${formatRupiah(line.discountValue)}` : "—"}
                              </td>
                              <td className="p-3 text-right font-bold text-text-primary">
                                {formatRupiah(line.lineTotal)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Item Card List */}
                <div className="md:hidden divide-y divide-border-default">
                  {doc.lines.map((line, idx) => (
                    <div key={line.id} className="p-4 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-text-primary">
                          #{idx + 1} {line.productName}
                        </div>
                        <span className="font-mono text-[11px] text-text-muted">{line.sku || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between font-mono text-text-secondary pt-1">
                        <span>Kuantitas:</span>
                        <span className="font-bold text-text-primary">
                          {line.quantity} {line.unit || "PCS"}
                        </span>
                      </div>
                      {isInvoiceOrReceipt && (
                        <>
                          <div className="flex items-center justify-between font-mono text-text-secondary">
                            <span>Harga Satuan:</span>
                            <span>{formatRupiah(line.unitPrice)}</span>
                          </div>
                          {line.discountValue > 0 && (
                            <div className="flex items-center justify-between font-mono text-danger">
                              <span>Diskon Item:</span>
                              <span>- {formatRupiah(line.discountValue)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between font-mono font-bold text-text-primary border-t border-border-default pt-1.5">
                            <span>Total Item:</span>
                            <span>{formatRupiah(line.lineTotal)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* C. Rincian Finansial & Kalkulasi Diskon Berjenjang (LOCKED) */}
          {isInvoiceOrReceipt && (
            <div className="rounded-xl border border-border-default bg-surface-card p-5 space-y-3 shadow-xs">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Ringkasan Finansial Tagihan (Aturan Diskon LOCKED)
              </h2>

              <div className="space-y-2 text-xs font-mono max-w-md ml-auto">
                <div className="flex justify-between text-text-secondary">
                  <span>1. Subtotal Item Kotor:</span>
                  <span className="font-medium text-text-primary">{formatRupiah(doc.subtotal)}</span>
                </div>

                {doc.itemDiscount > 0 && (
                  <div className="flex justify-between text-danger">
                    <span>2. Diskon Item Terakumulasi:</span>
                    <span>- {formatRupiah(doc.itemDiscount)}</span>
                  </div>
                )}

                {doc.docNominalDiscount > 0 && (
                  <div className="flex justify-between text-danger">
                    <span>3. Diskon Dokumen (Nominal):</span>
                    <span>- {formatRupiah(doc.docNominalDiscount)}</span>
                  </div>
                )}

                {doc.docPercentageDiscount > 0 && (
                  <div className="flex justify-between text-danger">
                    <span>4. Diskon Dokumen ({doc.docPercentageDiscount}%):</span>
                    <span>
                      - {formatRupiah(Math.round(Math.max(0, doc.subtotal - doc.itemDiscount - doc.docNominalDiscount) * (doc.docPercentageDiscount / 100)))}
                    </span>
                  </div>
                )}

                {doc.pointsRedeemed > 0 && (
                  <div className="flex justify-between text-danger">
                    <span>5. Penukaran Poin (Terakhir):</span>
                    <span>- {formatRupiah(doc.pointsRedeemed)}</span>
                  </div>
                )}

                <div className="border-t border-border-default pt-2 flex justify-between text-sm font-extrabold text-text-primary">
                  <span>Total Tagihan Bersih:</span>
                  <span>{formatRupiah(doc.totalAmount)}</span>
                </div>

                <div className="border-t border-border-default pt-1.5 flex justify-between text-xs text-success font-semibold">
                  <span>Sudah Dibayar:</span>
                  <span>{formatRupiah(doc.paidAmount)}</span>
                </div>

                <div className="flex justify-between text-xs font-bold">
                  <span className={remainingBalance > 0 ? "text-danger" : "text-success"}>
                    Sisa Tagihan Belum Dibayar:
                  </span>
                  <span className={remainingBalance > 0 ? "text-danger" : "text-success"}>
                    {formatRupiah(remainingBalance)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Kolom Kanan / Sidebar: Pelanggan, Riwayat Pembayaran, & Catat Bayar */}
        <div className="space-y-6">
          {/* A. Informasi Mitra / Pelanggan */}
          <div className="rounded-xl border border-border-default bg-surface-card p-5 space-y-3 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Pihak Terkait (Pelanggan)
            </h2>
            <div className="space-y-2 text-xs">
              <div className="font-bold text-sm text-text-primary">{doc.customerName}</div>
              {doc.customerCode && (
                <div className="text-text-muted font-mono">Kode Mitra: {doc.customerCode}</div>
              )}
              {doc.customerPhone && (
                <div className="text-text-secondary">
                  Telepon: <span className="font-mono">{doc.customerPhone}</span>
                </div>
              )}
              {doc.customerAddress && (
                <div className="text-text-secondary">
                  Alamat: <span className="text-text-primary">{doc.customerAddress}</span>
                </div>
              )}
            </div>
          </div>

          {/* B. Switch Status Pembayaran & Catat Pembayaran Nyata */}
          {doc.documentType === "INVOICE" && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl border border-border-default bg-surface-card space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    Status Tagihan Invoice
                  </h2>
                  {isPaid ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-success/15 text-success border border-success/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      Lunas
                    </span>
                  ) : doc.paidAmount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-warning/15 text-warning border border-warning/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                      Sebagian ({formatRupiah(doc.paidAmount)})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-danger/15 text-danger border border-danger/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                      Belum Lunas
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-text-secondary leading-relaxed">
                  {isPaid
                    ? "Seluruh tagihan invoice ini telah terlunasi penuh melalui riwayat mutasi kas nyata di database. Untuk membatalkan status lunas, hapus riwayat pembayaran di bawah."
                    : `Sisa piutang: ${formatRupiah(remainingBalance)}. Klik tombol untuk mengunggah bukti dan mencatat transaksi pelunasan.`}
                </p>

                {/* Kontrol Upload / Catat Pembayaran (Menggantikan Switch) */}
                <div className="flex items-center justify-between pt-2 border-t border-border-default">
                  <span className="text-xs font-medium text-text-secondary">
                    {isPaid ? "Status: Lunas Penuh" : `Sisa: ${formatRupiah(remainingBalance)}`}
                  </span>
                  <div>
                    {isPaid ? (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/15 border border-success/30 text-success text-xs font-semibold">
                        <CheckCircleIcon className="h-4 w-4" />
                        <span>Lunas Penuh</span>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => setIsPaymentDialogOpen(true)}
                        disabled={doc.status === "CANCELLED"}
                        className="inline-flex items-center gap-1.5 text-xs font-medium"
                        title="Klik untuk mengunggah bukti dan mencatat pembayaran"
                      >
                        <UploadIcon className="h-3.5 w-3.5" />
                        <span>Upload / Catat Bayar</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {paymentSwitchNotice && (
                <Alert variant="warning" title="Pemberitahuan Status Pembayaran" description={paymentSwitchNotice} />
              )}
              {paymentSuccess && (
                <Alert variant="success" title="Pembayaran Berhasil" description={paymentSuccess} />
              )}
            </div>
          )}

          {/* C. Riwayat Pembayaran Nyata */}
          {isInvoiceOrReceipt && (
            <div className="rounded-xl border border-border-default bg-surface-card p-5 space-y-3 shadow-xs">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Riwayat Pembayaran Nyata ({payments.length})
              </h2>

              {payments.length === 0 ? (
                <div className="p-4 text-center text-xs text-text-muted border border-dashed border-border-default rounded-lg">
                  Belum ada pembayaran yang tercatat untuk dokumen ini.
                </div>
              ) : (
                <div className="divide-y divide-border-default">
                  {payments.map((p) => (
                    <div key={p.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-text-primary">{p.paymentNumber}</span>
                        <span className="font-mono font-bold text-success">{formatRupiah(p.amount)}</span>
                      </div>
                      <div className="flex items-center justify-between text-text-muted text-[11px] font-mono">
                        <span>{formatDateDisplay(p.paymentDate)} &middot; {p.paymentMethod}</span>
                        <span>{p.referenceNumber || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        {p.notes ? (
                          <div className="text-[11px] text-text-secondary italic line-clamp-1">{p.notes}</div>
                        ) : <div />}
                        <div className="flex items-center gap-1 shrink-0 ml-auto">
                          {p.proofBase64 ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setSelectedPaymentForProof(p)}
                              className="inline-flex items-center gap-1 text-[11px] py-0.5 px-2 font-sans"
                              title="Lihat bukti pembayaran Base64"
                            >
                              <EyeIcon className="h-3 w-3" />
                              <span>Lihat Bukti</span>
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setPaymentToDelete(p)}
                            disabled={doc.status === "CANCELLED" || isDeletingPayment}
                            className="text-danger hover:bg-danger/10 hover:text-danger text-[11px] py-0.5 px-2 inline-flex items-center gap-1 font-sans"
                            title={`Hapus pembayaran ${p.paymentNumber}`}
                          >
                            <TrashIcon className="h-3 w-3" />
                            <span>Hapus</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* 3. Tampilan Cetak Resmi Khusus Print / Simpan PDF (Layar Disembunyikan, Muncul Saat Cetak) */}
    <div className="hidden print:block print-container font-sans text-xs text-black bg-white p-6 space-y-6">
      {/* Header Kop Surat */}
      <div className="flex items-start justify-between border-b-2 border-black pb-4">
        <div>
          <div className="text-xl font-black tracking-wider uppercase font-mono">DOCUFLOW INVENTORY</div>
          <div className="text-[10px] text-gray-600">Sistem Manajemen Inventori Multi-Owner &amp; Multi-Gudang</div>
          <div className="text-[10px] text-gray-600 mt-0.5">
            Dokumen Resmi Operasional &middot; Dicetak: {formatDateDisplay(new Date().toISOString())}
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-base font-extrabold uppercase tracking-wide">
            {doc.documentType === "SAMPLE"
              ? "SURAT SAMPEL"
              : doc.documentType === "INVOICE"
              ? "FAKTUR PENJUALAN (INVOICE)"
              : doc.documentType === "SURAT_JALAN"
              ? "SURAT JALAN"
              : "KUITANSI PEMBAYARAN"}
          </h1>
          <div className="font-mono font-bold text-sm mt-0.5">{doc.documentNumber}</div>
          <div className="text-[11px] text-gray-700">Tanggal: {formatDateDisplay(doc.documentDate)}</div>
          {doc.documentType === "INVOICE" && doc.dueDate && (
            <div className="text-[11px] text-gray-700">Jatuh Tempo: {formatDateDisplay(doc.dueDate)}</div>
          )}
          {doc.poNumber && (
            <div className="text-[11px] text-gray-700">No. Ref PO: {doc.poNumber}</div>
          )}
        </div>
      </div>

      {/* Informasi Pihak Terkait & Catatan */}
      <div className="grid grid-cols-2 gap-6 border border-gray-300 p-3 rounded">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Penerima / Pelanggan:</div>
          <div className="font-bold text-sm">{doc.customerName}</div>
          {doc.customerCode && <div className="text-[11px] text-gray-600">Kode: {doc.customerCode}</div>}
          {doc.customerPhone && <div className="text-[11px] text-gray-600">Telp: {doc.customerPhone}</div>}
          {doc.customerAddress && <div className="text-[11px] text-gray-600 mt-0.5">{doc.customerAddress}</div>}
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Keterangan / Catatan:</div>
          <div className="text-[11px] text-gray-800 italic">
            {doc.notes || (doc.documentType === "SAMPLE" ? "Pengiriman sampel produk untuk peninjauan pelanggan." : "—")}
          </div>
          {doc.documentType === "SAMPLE" && (
            <div className="mt-2 text-[10px] text-gray-600 border-t border-gray-200 pt-1">
              <strong>Ketentuan:</strong> Barang contoh / sampel non-komersial bebas biaya. Tidak mengurangi stok otomatis dan bukan merupakan tagihan piutang.
            </div>
          )}
        </div>
      </div>

      {/* Tabel Rincian Item */}
      <div>
        <table className="w-full text-left text-xs border border-gray-300 border-collapse">
          <thead className="bg-gray-100 border-b border-gray-300">
            <tr>
              <th className="p-2 border-r border-gray-300 w-10 text-center font-bold">#</th>
              <th className="p-2 border-r border-gray-300 font-bold">Nama Produk</th>
              <th className="p-2 border-r border-gray-300 font-bold">SKU</th>
              <th className="p-2 border-r border-gray-300 text-right font-bold w-20">Kuantitas</th>
              <th className="p-2 border-r border-gray-300 font-bold w-20">Satuan</th>
              {isInvoiceOrReceipt && (
                <>
                  <th className="p-2 border-r border-gray-300 text-right font-bold">Harga Satuan</th>
                  <th className="p-2 border-r border-gray-300 text-right font-bold">Diskon</th>
                  <th className="p-2 text-right font-bold">Subtotal</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300">
            {doc.lines.map((line, idx) => (
              <tr key={line.id}>
                <td className="p-2 border-r border-gray-300 text-center">{idx + 1}</td>
                <td className="p-2 border-r border-gray-300 font-medium">
                  {line.productName}
                  {line.descriptionSnapshot && line.descriptionSnapshot !== line.productName && (
                    <div className="text-[10px] text-gray-500">{line.descriptionSnapshot}</div>
                  )}
                </td>
                <td className="p-2 border-r border-gray-300 font-mono">{line.sku || "—"}</td>
                <td className="p-2 border-r border-gray-300 text-right font-bold">{line.quantity}</td>
                <td className="p-2 border-r border-gray-300">{line.unit || "PCS"}</td>
                {isInvoiceOrReceipt && (
                  <>
                    <td className="p-2 border-r border-gray-300 text-right font-mono">{formatRupiah(line.unitPrice)}</td>
                    <td className="p-2 border-r border-gray-300 text-right font-mono text-red-600">
                      {line.discountValue > 0 ? `- ${formatRupiah(line.discountValue)}` : "—"}
                    </td>
                    <td className="p-2 text-right font-mono font-bold">{formatRupiah(line.lineTotal)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ringkasan Finansial KHUSUS Invoice / Kuitansi (Surat Sampel TIDAK Menampilkan Finansial / Rp0) */}
      {isInvoiceOrReceipt && (
        <div className="flex justify-end print-avoid-break">
          <div className="w-72 border border-gray-300 p-3 rounded space-y-1.5 text-xs font-mono">
            <div className="flex justify-between">
              <span>Subtotal Item:</span>
              <span className="font-medium">{formatRupiah(doc.subtotal)}</span>
            </div>
            {doc.itemDiscount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Diskon Item:</span>
                <span>- {formatRupiah(doc.itemDiscount)}</span>
              </div>
            )}
            {doc.docNominalDiscount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Diskon Dokumen:</span>
                <span>- {formatRupiah(doc.docNominalDiscount)}</span>
              </div>
            )}
            {doc.docPercentageDiscount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Diskon ({doc.docPercentageDiscount}%):</span>
                <span>
                  - {formatRupiah(Math.round(Math.max(0, doc.subtotal - doc.itemDiscount - doc.docNominalDiscount) * (doc.docPercentageDiscount / 100)))}
                </span>
              </div>
            )}
            {doc.pointsRedeemed > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Poin Ditukar:</span>
                <span>- {formatRupiah(doc.pointsRedeemed)}</span>
              </div>
            )}
            <div className="border-t border-gray-300 pt-1.5 flex justify-between font-bold text-sm">
              <span>Total Tagihan:</span>
              <span>{formatRupiah(doc.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-green-700">
              <span>Sudah Dibayar:</span>
              <span>{formatRupiah(doc.paidAmount)}</span>
            </div>
            <div className="flex justify-between font-bold border-t border-gray-200 pt-1">
              <span>Sisa Piutang:</span>
              <span>{formatRupiah(remainingBalance)}</span>
            </div>
            <div className="text-right text-[10px] uppercase font-bold text-gray-600 pt-0.5">
              Status: {isPaid ? "LUNAS" : doc.paidAmount > 0 ? "SEBAGIAN" : "BELUM LUNAS"}
            </div>
          </div>
        </div>
      )}

      {/* Kolom Tanda Tangan */}
      <div className="grid grid-cols-2 gap-12 pt-8 print-avoid-break text-center">
        <div>
          <div className="text-[11px] text-gray-600 mb-16">Penerima,</div>
          <div className="border-b border-gray-400 mx-8"></div>
          <div className="text-[11px] font-bold mt-1">({doc.customerName})</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-600 mb-16">Pengirim / Petugas Gudang,</div>
          <div className="border-b border-gray-400 mx-8"></div>
          <div className="text-[11px] font-bold mt-1">(DocuFlow Official)</div>
        </div>
      </div>
    </div>

    {/* Modal Catat Pembayaran Nyata (Triggered by Switch Pelunasan) */}
    <div className="print:hidden">
      <PaymentRecordDialog
        open={isPaymentDialogOpen}
        onClose={() => setIsPaymentDialogOpen(false)}
        documentId={doc.id}
        docNumber={doc.documentNumber}
        totalAmount={doc.totalAmount}
        paidAmount={doc.paidAmount}
        onPaymentSuccess={handlePaymentSuccess}
      />

      {/* Modal Pratinjau Bukti Pembayaran */}
      <PaymentProofViewerDialog
        open={Boolean(selectedPaymentForProof)}
        onClose={() => setSelectedPaymentForProof(null)}
        payment={selectedPaymentForProof}
      />

      {/* Modal Konfirmasi Hapus Pembayaran */}
      {paymentToDelete && (
        <ConfirmDialog
          open={Boolean(paymentToDelete)}
          onCancel={() => setPaymentToDelete(null)}
          onConfirm={handleConfirmDeletePayment}
          title="Hapus Catatan Pembayaran"
          description={`Apakah Anda yakin ingin menghapus catatan pembayaran ${paymentToDelete.paymentNumber} sebesar ${formatRupiah(paymentToDelete.amount)}? Menghapus riwayat ini akan mengembalikan sisa piutang invoice dan mengubah status tagihan menjadi Belum Lunas / Sebagian.`}
          confirmLabel={isDeletingPayment ? "Menghapus..." : "Ya, Hapus Pembayaran"}
          tone="danger"
          loading={isDeletingPayment}
        />
      )}
    </div>
  </>
);
}
