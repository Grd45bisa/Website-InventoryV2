"use client";

import React, { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormField, Input, SelectField } from "@/components/ui/form-fields";
import { Badge, Alert } from "@/components/ui/feedback";
import { PlusIcon, MinusIcon } from "@/components/ui/icons";
import { getUnitMultiplier, formatConversionDisplay } from "@/lib/inventory/units";
import { saveStockOpnameAreaCountAction } from "@/lib/inventory/actions";

interface StockOpnameCountDialogProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  areaId: string;
  areaName: string;
  productId: string;
  productName: string;
  sku: string;
  snapshotQty: number;
  currentAreaCountedBase: number;
  productUnit: string;
  onSuccess: (result: {
    countedQtyBase: number;
    totalCountedQty: number;
    varianceQty: number;
    reconciliationStatus: string;
  }) => void;
}

export function StockOpnameCountDialog({
  open,
  onClose,
  sessionId,
  areaId,
  areaName,
  productId,
  productName,
  sku,
  snapshotQty,
  currentAreaCountedBase,
  productUnit,
  onSuccess,
}: StockOpnameCountDialogProps) {
  const [inputQty, setInputQty] = useState<string>("0");
  const [selectedUnit, setSelectedUnit] = useState<string>("pcs");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize input when opened
  useEffect(() => {
    if (open) {
      const baseUnit = (productUnit || "pcs").toLowerCase();
      setSelectedUnit(baseUnit === "lusin" ? "lusin" : "pcs");
      // Jika area sudah memiliki hitungan sebelumnya
      if (currentAreaCountedBase > 0) {
        if (baseUnit === "lusin") {
          setInputQty(String(currentAreaCountedBase / 12));
        } else {
          setInputQty(String(currentAreaCountedBase));
        }
      } else {
        setInputQty("0");
      }
      setNotes("");
      setErrorMessage(null);
    }
  }, [open, currentAreaCountedBase, productUnit]);

  const numQty = parseFloat(inputQty) || 0;
  const multiplier = getUnitMultiplier(selectedUnit);
  const calculatedBaseQty = numQty * multiplier;

  const handleStep = (delta: number) => {
    const nextVal = Math.max(0, numQty + delta);
    setInputQty(String(nextVal));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    if (isNaN(numQty) || numQty < 0) {
      setErrorMessage("Kuantitas fisik harus berupa angka lebih besar atau sama dengan 0.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await saveStockOpnameAreaCountAction({
        sessionId,
        areaId,
        productId,
        quantity: numQty,
        unit: selectedUnit,
        notes: notes.trim() || undefined,
      });

      if (res.success && "countedQtyBase" in res && res.countedQtyBase !== undefined) {
        onSuccess({
          countedQtyBase: res.countedQtyBase,
          totalCountedQty: res.totalCountedQty ?? res.countedQtyBase,
          varianceQty: res.varianceQty ?? (res.totalCountedQty ?? res.countedQtyBase) - snapshotQty,
          reconciliationStatus: res.reconciliationStatus ?? "MATCH",
        });
        onClose();
      } else {
        setErrorMessage(("error" in res && res.error) ? res.error : "Gagal menyimpan hitungan fisik.");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan pada server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Input Hitungan Fisik Manual"
      size="default"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />
                Menyimpan...
              </span>
            ) : (
              "Simpan Hitungan"
            )}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Product & Area Card */}
        <div className="p-3 bg-surface-subtle border border-border-default rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-text-muted">{sku}</span>
            <Badge variant="outline" size="sm">
              Area: {areaName}
            </Badge>
          </div>
          <h3 className="font-semibold text-text-primary text-base mt-0.5">{productName}</h3>
          <div className="mt-2 flex items-center justify-between text-xs text-text-secondary border-t border-border-default/60 pt-2">
            <span>Stok Snapshot Sistem:</span>
            <span className="font-mono font-bold text-text-primary">
              {snapshotQty} {productUnit}
            </span>
          </div>
        </div>

        {errorMessage && (
          <Alert variant="danger" title="Gagal Menyimpan" description={errorMessage} />
        )}

        {/* Unit Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField id="select-unit" label="Satuan Input Lapangan">
            <select
              id="select-unit"
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border-default bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="pcs">Pcs (1 item)</option>
              <option value="lusin">Lusin (12 pcs)</option>
              <option value="pack">Pack (60 pcs / 5 lusin)</option>
              {productUnit && productUnit !== "pcs" && productUnit !== "lusin" && productUnit !== "pack" && (
                <option value={productUnit}>{productUnit}</option>
              )}
            </select>
          </FormField>

          {/* Stepper & Numeric Input */}
          <FormField id="count-qty" label="Jumlah Fisik Ditemukan">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-10 px-3 touch-manipulation"
                onClick={() => handleStep(-1)}
                disabled={numQty <= 0}
              >
                <MinusIcon className="h-4 w-4" />
              </Button>
              <Input
                id="count-qty"
                type="number"
                min="0"
                step="any"
                value={inputQty}
                onChange={(e) => setInputQty(e.target.value)}
                className="text-center font-mono font-bold text-base h-10"
                placeholder="0"
                required
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-10 px-3 touch-manipulation"
                onClick={() => handleStep(1)}
              >
                <PlusIcon className="h-4 w-4" />
              </Button>
            </div>
          </FormField>
        </div>

        {/* Quick Stepper Buttons for Mobile (+5, +10, +12) */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted mr-1">Tambah Cepat:</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2 border border-border-default/60"
            onClick={() => handleStep(5)}
          >
            +5
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2 border border-border-default/60"
            onClick={() => handleStep(10)}
          >
            +10
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2 border border-border-default/60"
            onClick={() => handleStep(12)}
          >
            +12 (1 LS)
          </Button>
        </div>

        {/* Canonical Base Preview */}
        <div className="p-2.5 rounded bg-surface-card border border-border-default flex items-center justify-between text-xs">
          <span className="text-text-muted">Konversi Kuantitas Kanonis Dasar:</span>
          <span className="font-mono font-bold text-text-primary text-sm">
            {calculatedBaseQty.toLocaleString("id-ID")} pcs
          </span>
        </div>

        {/* Notes (Optional) */}
        <FormField id="count-notes" label="Catatan Lapangan (Opsional)">
          <Input
            id="count-notes"
            type="text"
            placeholder="Misal: Ditemukan di kardus bawah rak A2..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
      </form>
    </Dialog>
  );
}
