"use client";

import React, { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { SearchIcon, CloseIcon } from "@/components/ui/icons";
import { getStockOpnameSerialSnapshotsAction } from "@/lib/inventory/actions";
import type { StockOpnameSerialSnapshotRecord } from "@/lib/db/repositories/inventory-repository";

interface StockOpnameSerialDrawerProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  productId: string | null;
  productName: string;
  sku: string;
  snapshotQty: number;
  unit: string;
}

export function StockOpnameSerialDrawer({
  open,
  onClose,
  sessionId,
  productId,
  productName,
  sku,
  snapshotQty,
  unit,
}: StockOpnameSerialDrawerProps) {
  const [serials, setSerials] = useState<StockOpnameSerialSnapshotRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!open || !productId) {
      setSerials([]);
      setSearchQuery("");
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getStockOpnameSerialSnapshotsAction(sessionId, productId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.serials) {
          setSerials(res.serials);
        } else {
          setError(res.error || "Gagal memuat rincian serial number.");
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat serial number.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, sessionId, productId]);

  const filteredSerials = serials.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.serialNumber.toLowerCase().includes(q) ||
      s.normalizedSerialNumber.toLowerCase().includes(q)
    );
  });

  const invalidUnitCount = serials.filter((s) => !s.isUnitValid).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rincian Serial Number Snapshot"
      size="wide"
      footer={
        <div className="flex justify-end w-full">
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Product Info Header */}
        <div className="p-3 bg-surface-subtle border border-border-default rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <div>
              <span className="font-mono text-xs text-text-muted">{sku}</span>
              <h3 className="font-semibold text-text-primary text-base">{productName}</h3>
            </div>
            <div className="text-right">
              <span className="text-xs text-text-muted">Total Snapshot Sistem:</span>
              <div className="font-mono font-bold text-text-primary text-base">
                {snapshotQty} <span className="text-xs font-normal text-text-secondary">{unit}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Informational Alert */}
        <Alert
          variant="info"
          title="Data Snapshot Beku"
          description="Daftar ini adalah nomor seri aktif yang tercatat di gudang pada saat sesi Stock Opname dibuat. Tampilan ini hanya untuk verifikasi data snapshot awal dan bukan merupakan aksi pemindaian fisik lapangan."
        />

        {/* Warning if any invalid units */}
        {invalidUnitCount > 0 && (
          <Alert
            variant="warning"
            title="Pemeriksaan Satuan Diperlukan"
            description={`Terdapat ${invalidUnitCount} Serial Number dengan satuan tidak dikenal atau tidak memiliki kuantitas dasar sah. Serial ini tidak dihitung otomatis dan memerlukan konfirmasi operator.`}
          />
        )}

        {/* Search & Counter Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <input
              type="text"
              placeholder="Cari nomor seri..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-border-default bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <span className="text-xs text-text-muted">
            Menampilkan <strong className="text-text-primary">{filteredSerials.length}</strong> dari {serials.length} serial
          </span>
        </div>

        {/* Serials List */}
        {loading ? (
          <div className="p-8 text-center text-xs text-text-muted">
            <div className="animate-spin inline-block w-5 h-5 border-2 border-current border-t-transparent text-primary rounded-full mb-2" />
            <p>Memuat daftar serial number snapshot...</p>
          </div>
        ) : error ? (
          <div className="p-4 bg-danger/10 border border-danger/20 rounded-md text-xs text-danger">
            {error}
          </div>
        ) : filteredSerials.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-border-default rounded-md text-xs text-text-muted">
            {searchQuery
              ? `Tidak ada nomor seri yang cocok dengan kata kunci "${searchQuery}".`
              : "Tidak ada data serial number aktif pada snapshot untuk produk ini."}
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1 divide-y divide-border-default/50">
            {filteredSerials.map((sn) => (
              <div
                key={sn.id}
                className="pt-2 pb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 hover:bg-surface-subtle/50 px-2 rounded transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-text-primary">
                    {sn.serialNumber}
                  </span>
                  <Badge
                    variant={sn.statusAtSnapshot === "AVAILABLE" ? "success" : "warning"}
                    size="sm"
                  >
                    {sn.statusAtSnapshot === "AVAILABLE" ? "Tersedia" : "Direservasi"}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-text-muted">
                    Satuan: <span className="font-medium text-text-secondary">{sn.unit}</span>
                  </span>
                  <span className="text-text-muted">|</span>
                  <span className="text-text-muted">
                    Kuantitas Dasar:{" "}
                    <span className="font-mono font-medium text-text-secondary">
                      {sn.baseQuantity} pcs
                    </span>
                  </span>
                  {!sn.isUnitValid && (
                    <Badge variant="danger" size="sm">
                      Satuan Invalid
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
