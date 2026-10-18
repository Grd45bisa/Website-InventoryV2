"use client";

import React, { useState, useRef, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { FormField, Input, Select } from "@/components/ui/form-fields";
import { recordDocumentPaymentAction } from "@/lib/inventory/actions";

interface PaymentProofData {
  mimeType: string;
  base64: string;
  fileName: string;
  fileSize: number;
}

export interface PaymentRecordDialogProps {
  open: boolean;
  onClose: () => void;
  documentId: string;
  documentNumber?: string;
  docNumber?: string;
  totalAmount: number;
  paidAmount: number;
  remainingBalance?: number;
  onPaymentSuccess: (result: {
    paymentId: string;
    newStatus: string;
    paidAmount: number;
    paymentItem: {
      id: string;
      documentId: string;
      paymentNumber: string;
      paymentDate: string;
      amount: number;
      paymentMethod: string;
      referenceNumber: string | null;
      notes: string | null;
      receivedByName: string;
      proofMimeType?: string | null;
      proofBase64?: string | null;
      proofFileName?: string | null;
      proofFileSize?: number | null;
      createdAt: string;
    };
  }) => void;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function PaymentRecordDialog({
  open,
  onClose,
  documentId,
  documentNumber,
  docNumber,
  totalAmount,
  paidAmount,
  remainingBalance,
  onPaymentSuccess,
}: PaymentRecordDialogProps) {
  const effectiveRemainingBalance =
    typeof remainingBalance === "number"
      ? remainingBalance
      : Math.max(0, totalAmount - paidAmount);
  const effectiveDocNumber = documentNumber || docNumber || "";

  const [amount, setAmount] = useState<number>(effectiveRemainingBalance);
  const [paymentMethod, setPaymentMethod] = useState<
    "TRANSFER" | "TUNAI" | "GIRO" | "KARTU_KREDIT"
  >("TRANSFER");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [proof, setProof] = useState<PaymentProofData | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isSubmittingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync amount with remainingBalance whenever dialog opens
  const openKey = JSON.stringify([open, effectiveRemainingBalance]);
  const [prevOpenKey, setPrevOpenKey] = useState(openKey);
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (open) {
      setAmount(effectiveRemainingBalance);
      setError(null);
      setProof(null);
      setPreviewUrl(null);
      setReferenceNumber("");
      setNotes("");
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const processSelectedFile = (file: File) => {
    setError(null);

    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedMimes.includes(file.type)) {
      setError("Format berkas tidak didukung. Harap unggah berkas gambar (JPEG, PNG, WebP) atau PDF.");
      return;
    }

    const MAX_SIZE = 2.5 * 1024 * 1024; // 2.5 MB
    if (file.size > MAX_SIZE) {
      setError(`Ukuran berkas (${formatFileSize(file.size)}) melebihi batas maksimum 2.5 MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URI prefix for clean storage payload
      const commaIdx = result.indexOf(",");
      const b64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;

      setProof({
        mimeType: file.type,
        base64: b64,
        fileName: file.name,
        fileSize: file.size,
      });

      if (file.type.startsWith("image/")) {
        setPreviewUrl(result);
      } else {
        setPreviewUrl(null);
      }
    };
    reader.onerror = () => {
      setError("Gagal membaca berkas bukti pembayaran.");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveProof = () => {
    setProof(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending || isSubmittingRef.current) return;
    setError(null);

    if (amount <= 0) {
      setError("Nominal pembayaran harus lebih besar dari Rp 0.");
      return;
    }

    if (amount > effectiveRemainingBalance) {
      setError(
        `Nominal pembayaran (${formatRupiah(amount)}) melebihi sisa tagihan (${formatRupiah(effectiveRemainingBalance)}).`
      );
      return;
    }

    isSubmittingRef.current = true;

    startTransition(async () => {
      try {
        const res = await recordDocumentPaymentAction({
          documentId,
          amount,
          paymentMethod,
          referenceNumber: referenceNumber.trim() || undefined,
          notes: notes.trim() || undefined,
          proof: proof || undefined,
        });

        if (!res.success) {
          setError(res.error || "Gagal mencatat pembayaran.");
          isSubmittingRef.current = false;
          return;
        }

        const paymentItem = {
          id: res.paymentId,
          documentId,
          paymentNumber: `PAY-${Date.now().toString().slice(-6)}`,
          paymentDate: new Date().toISOString().slice(0, 10),
          amount,
          paymentMethod,
          referenceNumber: referenceNumber.trim() || null,
          notes: notes.trim() || null,
          receivedByName: "Petugas Kasir",
          proofMimeType: proof?.mimeType || null,
          proofBase64: proof?.base64 || null,
          proofFileName: proof?.fileName || null,
          proofFileSize: proof?.fileSize || null,
          createdAt: new Date().toISOString(),
        };

        onPaymentSuccess({
          paymentId: res.paymentId,
          newStatus: res.newStatus,
          paidAmount: res.paidAmount,
          paymentItem,
        });
        onClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan saat mencatat pembayaran.");
        isSubmittingRef.current = false;
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={() => !isPending && onClose()}
      size="default"
      title={`Catat Pembayaran Nyata: ${effectiveDocNumber}`}
    >
      <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs font-sans">
        {/* Ringkasan Tagihan */}
        <div className="p-3 rounded-lg border border-border-default bg-surface-subtle/50 font-mono space-y-1.5">
          <div className="flex justify-between text-text-secondary">
            <span>Total Tagihan:</span>
            <span className="font-bold text-text-primary">{formatRupiah(totalAmount)}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>Sudah Dibayar:</span>
            <span className="text-success">{formatRupiah(paidAmount)}</span>
          </div>
          <div className="flex justify-between text-text-secondary border-t border-border-default pt-1 font-bold">
            <span className="text-danger">Sisa Tagihan yang Harus Dilunasi:</span>
            <span className="text-danger">{formatRupiah(effectiveRemainingBalance)}</span>
          </div>
        </div>

        {error && <Alert variant="danger" title="Peringatan" description={error} />}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField id="pay-nominal-input" label="Nominal Pembayaran (Rp)" isRequired>
            <Input
              id="pay-nominal-input"
              type="number"
              min="1"
              max={effectiveRemainingBalance}
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder={`Maks ${formatRupiah(effectiveRemainingBalance)}`}
              className="font-mono text-xs"
              required
            />
          </FormField>

          <FormField id="pay-method-field" label="Metode Pembayaran" isRequired>
            <Select
              id="pay-method-field"
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(
                  e.target.value as "TRANSFER" | "TUNAI" | "GIRO" | "KARTU_KREDIT"
                )
              }
            >
              <option value="TRANSFER">Transfer Bank</option>
              <option value="TUNAI">Tunai / Kas Langsung</option>
              <option value="GIRO">Giro / Cek</option>
              <option value="KARTU_KREDIT">Kartu Kredit / Debit</option>
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField id="pay-ref-input" label="No. Referensi / Bukti Transfer">
            <Input
              id="pay-ref-input"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Contoh: TRX-BCA-987654"
              className="font-mono text-xs"
            />
          </FormField>

          <FormField id="pay-notes-field" label="Catatan Transaksi">
            <Input
              id="pay-notes-field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Keterangan pembayaran..."
              className="text-xs"
            />
          </FormField>
        </div>

        {/* Upload Bukti Pembayaran (Opsional) */}
        <div className="space-y-1.5 border-t border-border-default pt-3">
          <label className="text-xs font-semibold text-text-primary block">
            Bukti Pembayaran (Opsional)
          </label>
          <p className="text-[11px] text-text-muted">
            Format JPEG, PNG, WebP, atau PDF (Maks 2.5 MB). Disimpan sebagai Base64 terenkapsulasi di SQLite.
          </p>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
          />

          {!proof ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const droppedFile = e.dataTransfer.files?.[0];
                if (droppedFile) processSelectedFile(droppedFile);
              }}
              className="border-2 border-dashed border-border-default hover:border-primary/60 rounded-xl p-4 text-center cursor-pointer transition-colors bg-surface-subtle/30 hover:bg-surface-subtle/60"
            >
              <div className="text-text-muted text-xs">
                <span className="font-semibold text-primary">Klik untuk memilih berkas</span> atau seret berkas bukti ke sini
              </div>
              <div className="text-[10px] text-text-muted mt-1">PNG, JPG, WebP, PDF hingga 2.5 MB</div>
            </div>
          ) : (
            <div className="rounded-xl border border-border-default p-3 bg-surface-card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-text-primary truncate text-xs">
                    {proof.fileName}
                  </div>
                  <div className="text-[11px] text-text-muted font-mono">
                    {formatFileSize(proof.fileSize)} &middot; {proof.mimeType}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Ganti
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={handleRemoveProof}
                  >
                    Hapus
                  </Button>
                </div>
              </div>

              {previewUrl && (
                <div className="mt-2 rounded-lg border border-border-default overflow-hidden max-h-36 bg-surface-subtle flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Preview Bukti Pembayaran"
                    className="max-h-36 max-w-full object-contain"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Aksi */}
        <div className="flex justify-end gap-2 pt-3 border-t border-border-default">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            Batal
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={isPending}
            loadingLabel="Menyimpan Transaksi..."
            disabled={amount <= 0 || amount > effectiveRemainingBalance || isPending}
          >
            Konfirmasi &amp; Catat Pembayaran
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
