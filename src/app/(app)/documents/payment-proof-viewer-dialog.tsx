"use client";

import React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface PaymentProofViewerDialogProps {
  open: boolean;
  onClose: () => void;
  payment?: {
    paymentNumber: string;
    paymentDate: string;
    amount: number;
    paymentMethod: string;
    proofMimeType?: string | null;
    proofBase64?: string | null;
    proofFileName?: string | null;
    proofFileSize?: number | null;
  } | null;
  paymentNumber?: string;
  paymentDate?: string;
  amount?: number;
  paymentMethod?: string;
  proofMimeType?: string | null;
  proofBase64?: string | null;
  proofFileName?: string | null;
  proofFileSize?: number | null;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function PaymentProofViewerDialog({
  open,
  onClose,
  payment,
  paymentNumber = payment?.paymentNumber || "",
  paymentDate = payment?.paymentDate || "",
  amount = payment?.amount || 0,
  paymentMethod = payment?.paymentMethod || "",
  proofMimeType = payment?.proofMimeType || null,
  proofBase64 = payment?.proofBase64 || null,
  proofFileName = payment?.proofFileName || null,
  proofFileSize = payment?.proofFileSize || null,
}: PaymentProofViewerDialogProps) {
  const isImage = proofMimeType?.startsWith("image/");
  const isPdf = proofMimeType === "application/pdf";
  const dataUri = proofMimeType && proofBase64 ? `data:${proofMimeType};base64,${proofBase64}` : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title={`Bukti Pembayaran: ${paymentNumber}`}
    >
      <div className="p-4 sm:p-6 space-y-4">
        {/* Metadata Transaksi Pembayaran */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border border-border-default bg-surface-subtle/50 text-xs font-mono">
          <div>
            <span className="text-text-muted block text-[11px]">Nominal Bayar</span>
            <span className="font-bold text-success text-sm">{formatRupiah(amount)}</span>
          </div>
          <div>
            <span className="text-text-muted block text-[11px]">Tanggal Bayar</span>
            <span className="text-text-primary">{paymentDate}</span>
          </div>
          <div>
            <span className="text-text-muted block text-[11px]">Metode Bayar</span>
            <span className="text-text-primary">{paymentMethod}</span>
          </div>
          <div>
            <span className="text-text-muted block text-[11px]">Ukuran Berkas</span>
            <span className="text-text-primary">{formatFileSize(proofFileSize)}</span>
          </div>
        </div>

        {/* Area Tampilan Bukti */}
        <div className="rounded-xl border border-border-default bg-surface-card overflow-hidden flex flex-col items-center justify-center p-3 min-h-[300px] max-h-[70vh]">
          {dataUri ? (
            isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dataUri}
                alt={`Bukti bayar ${paymentNumber}`}
                className="max-h-[65vh] max-w-full object-contain rounded-lg shadow-xs"
              />
            ) : isPdf ? (
              <div className="w-full h-[65vh] flex flex-col items-center justify-center space-y-3">
                <iframe
                  src={dataUri}
                  title={`PDF Bukti Pembayaran ${paymentNumber}`}
                  className="w-full h-full rounded border border-border-default"
                />
              </div>
            ) : (
              <div className="text-center p-8 space-y-2 text-xs text-text-muted">
                <div>Format berkas ({proofMimeType}) tidak dapat dipratinjau langsung.</div>
                <a
                  href={dataUri}
                  download={proofFileName || `bukti_${paymentNumber}`}
                  className="inline-block px-3 py-1.5 rounded bg-primary text-white font-medium text-xs hover:bg-primary-hover"
                >
                  Unduh Berkas Bukti
                </a>
              </div>
            )
          ) : (
            <div className="p-8 text-center text-xs text-text-muted">
              Tidak ada data bukti pembayaran yang dapat ditampilkan.
            </div>
          )}
        </div>

        {proofFileName && (
          <div className="text-[11px] text-text-muted truncate font-mono">
            Nama Berkas: <span className="text-text-primary font-medium">{proofFileName}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center pt-3 border-t border-border-default">
          {dataUri && (
            <a
              href={dataUri}
              download={proofFileName || `bukti_${paymentNumber}`}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Unduh Berkas Asli
            </a>
          )}
          <div className="ml-auto">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Tutup Pratinjau
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
