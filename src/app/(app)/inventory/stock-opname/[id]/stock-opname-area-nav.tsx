"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/form-fields";
import { PlusIcon, EditIcon, TrashIcon } from "@/components/ui/icons";
import {
  createStockOpnameAreaAction,
  updateStockOpnameAreaAction,
  deleteStockOpnameAreaAction,
} from "@/lib/inventory/actions";
import type { StockOpnameAreaRecord } from "@/lib/db/repositories/inventory-repository";

interface StockOpnameAreaNavProps {
  sessionId: string;
  areas: StockOpnameAreaRecord[];
  activeAreaId: string;
  onSelectArea: (areaId: string) => void;
  onAreasUpdated: (areas: StockOpnameAreaRecord[]) => void;
  isReadOnly?: boolean;
}

export function StockOpnameAreaNav({
  sessionId,
  areas,
  activeAreaId,
  onSelectArea,
  onAreasUpdated,
  isReadOnly = false,
}: StockOpnameAreaNavProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editAreaName, setEditAreaName] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeArea = areas.find((a) => a.id === activeAreaId) || areas[0];

  const handleCreateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await createStockOpnameAreaAction({
        sessionId,
        name: newAreaName.trim(),
      });

      if (res.success && res.area) {
        const nextAreas = [...areas, res.area];
        onAreasUpdated(nextAreas);
        onSelectArea(res.area.id);
        setIsAddOpen(false);
        setNewAreaName("");
      } else {
        setErrorMessage(res.error || "Gagal membuat area penghitungan.");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeArea || !editAreaName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await updateStockOpnameAreaAction({
        sessionId,
        areaId: activeArea.id,
        name: editAreaName.trim(),
      });

      if (res.success && res.area) {
        const nextAreas = areas.map((a) => (a.id === res.area.id ? res.area : a));
        onAreasUpdated(nextAreas);
        setIsEditOpen(false);
      } else {
        setErrorMessage(res.error || "Gagal memperbarui nama area.");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteArea = async () => {
    if (!activeArea || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await deleteStockOpnameAreaAction({
        sessionId,
        areaId: activeArea.id,
      });

      if (res.success) {
        let nextAreas: StockOpnameAreaRecord[];
        if ("action" in res && res.action === "CANCELLED") {
          nextAreas = areas.map((a) =>
            a.id === activeArea.id ? { ...a, status: "CANCELLED" as const } : a
          );
        } else {
          nextAreas = areas.filter((a) => a.id !== activeArea.id);
        }
        onAreasUpdated(nextAreas);
        const remainingActive = nextAreas.find((a) => a.status !== "CANCELLED");
        if (remainingActive) {
          onSelectArea(remainingActive.id);
        }
        setIsDeleteOpen(false);
      } else {
        setErrorMessage(res.error || "Gagal menghapus area.");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 bg-surface-card border border-border-default rounded-xl p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
            Area Penghitungan:
          </span>
          {activeArea && (
            <Badge
              variant={
                activeArea.status === "COMPLETED"
                  ? "success"
                  : activeArea.status === "IN_PROGRESS"
                  ? "info"
                  : activeArea.status === "CANCELLED"
                  ? "danger"
                  : "outline"
              }
              size="sm"
            >
              {activeArea.status === "COMPLETED"
                ? "Selesai Hitung"
                : activeArea.status === "IN_PROGRESS"
                ? "Sedang Dihitung"
                : activeArea.status === "CANCELLED"
                ? "Dibatalkan"
                : "Belum Dihitung"}
            </Badge>
          )}
        </div>

        {/* Action Buttons for Active Area */}
        {!isReadOnly && activeArea && activeArea.status !== "CANCELLED" && (
          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2"
              onClick={() => {
                setEditAreaName(activeArea.name);
                setIsEditOpen(true);
              }}
            >
              <EditIcon className="h-3.5 w-3.5 mr-1" />
              Ubah Nama
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2 text-danger hover:text-danger"
              onClick={() => setIsDeleteOpen(true)}
            >
              <TrashIcon className="h-3.5 w-3.5 mr-1" />
              Hapus Area
            </Button>
          </div>
        )}
      </div>

      {/* Horizontal Scrollable Area Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {areas.map((area) => {
          const isActive = area.id === activeAreaId;
          const isCancelled = area.status === "CANCELLED";

          return (
            <button
              key={area.id}
              type="button"
              onClick={() => onSelectArea(area.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-2 touch-manipulation ${
                isActive
                  ? "bg-primary text-text-inverse border-primary shadow-sm"
                  : isCancelled
                  ? "bg-surface-subtle text-text-muted border-border-default/50 line-through opacity-70"
                  : "bg-surface-subtle text-text-secondary border-border-default hover:bg-surface hover:text-text-primary"
              }`}
            >
              <span>{area.name}</span>
              {(area.itemCount ?? 0) > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive
                      ? "bg-text-inverse/20 text-text-inverse"
                      : "bg-surface-card text-text-muted border border-border-default"
                  }`}
                >
                  {area.itemCount} item
                </span>
              )}
            </button>
          );
        })}

        {/* Add Area Button */}
        {!isReadOnly && (
          <Button
            variant="secondary"
            size="sm"
            className="flex-shrink-0 text-xs h-8 px-2.5 border-dashed"
            onClick={() => {
              setNewAreaName("");
              setErrorMessage(null);
              setIsAddOpen(true);
            }}
          >
            <PlusIcon className="h-3.5 w-3.5 mr-1" />
            Tambah Area
          </Button>
        )}
      </div>

      {/* Active Area Summary Notice */}
      {activeArea && (
        <div className="text-[11px] text-text-muted flex items-center justify-between border-t border-border-default/40 pt-2">
          <span>
            Area Aktif: <strong className="text-text-primary">{activeArea.name}</strong>
          </span>
          <span>
            Total Fisik Area:{" "}
            <strong className="text-text-primary font-mono">
              {(activeArea.totalCountedQtyBase ?? 0).toLocaleString("id-ID")} pcs
            </strong>
          </span>
        </div>
      )}

      {/* Modal Tambah Area */}
      <Dialog
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Tambah Area Penghitungan Baru"
        size="default"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="secondary" onClick={() => setIsAddOpen(false)} disabled={isSubmitting}>
              Batal
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateArea}
              disabled={isSubmitting || !newAreaName.trim()}
            >
              {isSubmitting ? "Menyimpan..." : "Buat Area"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateArea} className="space-y-3">
          {errorMessage && (
            <div className="p-2.5 bg-danger/10 text-danger text-xs rounded-md">{errorMessage}</div>
          )}
          <FormField
            id="new-area-name"
            label="Nama Area / Zona / Rak"
            hint="Contoh: Rak Besi A1, Area Display Depan, Kardus Bawah"
          >
            <Input
              id="new-area-name"
              placeholder="Masukkan nama area..."
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              required
              autoFocus
            />
          </FormField>
        </form>
      </Dialog>

      {/* Modal Ubah Nama Area */}
      <Dialog
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Ubah Nama Area"
        size="default"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="secondary" onClick={() => setIsEditOpen(false)} disabled={isSubmitting}>
              Batal
            </Button>
            <Button
              variant="primary"
              onClick={handleUpdateArea}
              disabled={isSubmitting || !editAreaName.trim()}
            >
              {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleUpdateArea} className="space-y-3">
          {errorMessage && (
            <div className="p-2.5 bg-danger/10 text-danger text-xs rounded-md">{errorMessage}</div>
          )}
          <FormField id="edit-area-name" label="Nama Area Baru">
            <Input
              id="edit-area-name"
              value={editAreaName}
              onChange={(e) => setEditAreaName(e.target.value)}
              required
              autoFocus
            />
          </FormField>
        </form>
      </Dialog>

      {/* Modal Konfirmasi Hapus Area */}
      <Dialog
        open={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Hapus / Batalkan Area"
        size="default"
        isConfirm
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="secondary" onClick={() => setIsDeleteOpen(false)} disabled={isSubmitting}>
              Batal
            </Button>
            <Button variant="danger" onClick={handleDeleteArea} disabled={isSubmitting}>
              {isSubmitting ? "Memproses..." : "Ya, Hapus Area"}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 text-xs text-text-secondary">
          <p>
            Apakah Anda yakin ingin menghapus area <strong>{activeArea?.name}</strong>?
          </p>
          <p className="text-text-muted">
            Jika area ini sudah memiliki catatan hitungan fisik, sistem akan melakukan{" "}
            <strong>soft-cancel</strong> agar tidak merusak jejak audit.
          </p>
          {errorMessage && (
            <div className="p-2.5 bg-danger/10 text-danger text-xs rounded-md">{errorMessage}</div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
