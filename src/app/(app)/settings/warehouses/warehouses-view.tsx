"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useActiveContext } from "@/lib/demo/active-context-provider";
import {
  FIXTURE_WAREHOUSES,
  FIXTURE_LOCATIONS,
  Warehouse,
  StorageLocation,
} from "@/lib/demo/inventory-fixtures";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Alert, FeedbackState } from "@/components/ui/feedback";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Select, Textarea } from "@/components/ui/form-fields";
import { PlusIcon, ChevronLeftIcon } from "@/components/ui/icons";

interface WarehousesViewProps {
  initialWarehouses?: Warehouse[];
}

export function WarehousesView({ initialWarehouses }: WarehousesViewProps = {}) {
  const { currentRole, activeWarehouseId } = useActiveContext();

  const [warehouses, setWarehouses] = useState<Warehouse[]>(
    initialWarehouses && initialWarehouses.length > 0 ? initialWarehouses : FIXTURE_WAREHOUSES
  );
  const [locations, setLocations] = useState<StorageLocation[]>(FIXTURE_LOCATIONS);
  const [selectedWhId, setSelectedWhId] = useState<string>(
    (initialWarehouses && initialWarehouses[0]?.id) || activeWarehouseId || "wh-01"
  );

  // Modal State
  const [isAddWhOpen, setIsAddWhOpen] = useState(false);
  const [isAddLocOpen, setIsAddLocOpen] = useState(false);

  // Form State Gudang
  const [whCode, setWhCode] = useState("");
  const [whName, setWhName] = useState("");
  const [whAddress, setWhAddress] = useState("");

  // Form State Lokasi
  const [locCode, setLocCode] = useState("");
  const [locName, setLocName] = useState("");
  const [locType, setLocType] = useState<StorageLocation["type"]>("RAK");

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWhId);
  const currentWarehouseLocations = useMemo(
    () => locations.filter((loc) => loc.warehouseId === selectedWhId),
    [locations, selectedWhId]
  );

  const handleAddWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!whCode.trim() || !whName.trim()) {
      setFormError("Kode dan Nama Gudang wajib diisi.");
      return;
    }

    if (warehouses.some((w) => w.code.toUpperCase() === whCode.trim().toUpperCase())) {
      setFormError(`Kode gudang "${whCode}" sudah digunakan.`);
      return;
    }

    const newWh: Warehouse = {
      id: `wh-${Date.now()}`,
      code: whCode.trim().toUpperCase(),
      name: whName.trim(),
      address: whAddress.trim() || "-",
      isAssignedToCurrentUser: true,
    };


    setWarehouses((prev) => [...prev, newWh]);
    setSelectedWhId(newWh.id);
    setIsAddWhOpen(false);
    setWhCode("");
    setWhName("");
    setWhAddress("");
    setStatusMessage(`Gudang baru "${newWh.name}" berhasil ditambahkan.`);
  };

  const handleAddLocation = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!locCode.trim() || !locName.trim()) {
      setFormError("Kode dan Nama Lokasi wajib diisi.");
      return;
    }

    if (
      locations.some(
        (l) =>
          l.warehouseId === selectedWhId &&
          l.code.toUpperCase() === locCode.trim().toUpperCase()
      )
    ) {
      setFormError(`Kode lokasi "${locCode}" sudah ada di gudang ini.`);
      return;
    }

    const newLoc: StorageLocation = {
      id: `loc-${Date.now()}`,
      warehouseId: selectedWhId,
      code: locCode.trim().toUpperCase(),
      name: locName.trim(),
      type: locType,
    };

    setLocations((prev) => [...prev, newLoc]);
    setIsAddLocOpen(false);
    setLocCode("");
    setLocName("");
    setStatusMessage(`Master lokasi "${newLoc.code}" berhasil disimpan secara permanen.`);
  };

  const isOwner = currentRole === "OWNER";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary mb-2 transition-colors"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Kembali ke Pengaturan
        </Link>

        <PageHeader
          title="Master Gudang & Lokasi Penyimpanan"
          description="Pengelolaan fasilitas gudang, penetapan penugasan staff, dan master lokasi penyimpanan fleksibel (rak, area, sudut)."
          actions={
            isOwner && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setFormError(null);
                  setIsAddWhOpen(true);
                }}
              >
                <PlusIcon className="h-4 w-4" />
                + Tambah Gudang Baru
              </Button>
            )
          }
        />
      </div>

      <div className="rounded border border-info/30 bg-surface-subtle p-3 text-xs text-text-secondary space-y-1">
        <div className="font-semibold text-text-primary">Aturan Master Lokasi (RPD §7.2 & WIREFRAME §21.3):</div>
        <div>
          1. Lokasi penyimpanan fleksibel (dapat berupa <strong className="text-text-primary">RAK, AREA, SUDUT, atau RUANG</strong>) dan tersimpan secara permanen.
        </div>
        <div>
          2. Seluruh transaksi operasional (Goods In, Goods Out, Stock Opname) <strong className="text-text-primary">hanya dapat memilih</strong> lokasi dari master ini.
        </div>
        <div>
          3. Teks bebas dalam form transaksi dilarang membuat lokasi baru secara otomatis tanpa otorisasi.
        </div>
      </div>

      {statusMessage && (
        <Alert
          variant="success"
          title="Berhasil"
          description={statusMessage}
        />
      )}

      {/* Grid: Daftar Gudang & Panel Lokasi Gudang */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom Kiri: Daftar Gudang */}
        <div className="lg:col-span-1 rounded border border-border-default bg-surface-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Daftar Gudang ({warehouses.length})</h2>
          </div>
          <div className="space-y-2">
            {warehouses.map((wh) => {
              const isSelected = wh.id === selectedWhId;
              const isCurrentActive = wh.id === activeWarehouseId;
              const locCount = locations.filter((l) => l.warehouseId === wh.id).length;

              return (
                <button
                  key={wh.id}
                  type="button"
                  onClick={() => setSelectedWhId(wh.id)}
                  className={`w-full text-left p-3 rounded border text-xs transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5 text-text-primary"
                      : "border-border-default bg-surface-card text-text-secondary hover:bg-surface-subtle"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-text-primary">
                    <span>{wh.name}</span>
                    <span className="font-mono text-text-muted">{wh.code}</span>
                  </div>
                  {wh.address && (
                    <div className="mt-1 text-text-muted text-[11px] line-clamp-1">{wh.address}</div>
                  )}
                  <div className="mt-2 flex items-center justify-between text-[11px] pt-1 border-t border-border-default/50">
                    <span className="text-text-muted">{locCount} Lokasi Rak/Area</span>
                    {isCurrentActive && (
                      <Badge variant="success" size="sm">
                        Konteks Aktif Anda
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Kolom Kanan: Master Lokasi untuk Gudang Terpilih */}
        <div className="lg:col-span-2 rounded border border-border-default bg-surface-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border-default pb-3 gap-2">
            <div>
              <span className="text-xs font-mono text-text-muted">{selectedWarehouse?.code}</span>
              <h3 className="text-base font-semibold text-text-primary">
                Lokasi Penyimpanan di {selectedWarehouse?.name}
              </h3>
            </div>
            {isOwner && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFormError(null);
                  setIsAddLocOpen(true);
                }}
              >
                <PlusIcon className="h-4 w-4" />
                + Tambah Lokasi Baru
              </Button>
            )}
          </div>

          {currentWarehouseLocations.length === 0 ? (
            <FeedbackState
              title="Belum Ada Lokasi"
              description="Gudang ini belum memiliki master lokasi penyimpanan (rak/area). Silakan tambahkan lokasi baru."
            />
          ) : (
            <div className="rounded border border-border-default overflow-hidden">
              <table className="w-full text-left text-xs text-text-secondary border-collapse">
                <thead className="bg-surface-subtle text-text-muted border-b border-border-default uppercase font-medium">
                  <tr>
                    <th className="p-3">Kode Lokasi</th>
                    <th className="p-3">Nama / Keterangan</th>
                    <th className="p-3">Tipe Lokasi</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {currentWarehouseLocations.map((loc) => (
                    <tr key={loc.id} className="hover:bg-surface-subtle/50 transition-colors">
                      <td className="p-3 font-mono font-semibold text-text-primary">{loc.code}</td>
                      <td className="p-3 font-medium text-text-primary">{loc.name}</td>
                      <td className="p-3">
                        <Badge variant="outline" size="sm">
                          {loc.type}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant="success" size="sm">
                          Aktif
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Tambah Gudang Baru */}
      <Dialog
        isOpen={isAddWhOpen}
        onClose={() => setIsAddWhOpen(false)}
        title="Tambah Gudang Baru"
        description="Fasilitas penyimpanan fisik di bawah naungan Owner aktif."
      >
        <form onSubmit={handleAddWarehouse} className="space-y-4">
          {formError && (
            <Alert variant="danger" title="Kesalahan" description={formError} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField id="wh-code" label="Kode Gudang" isRequired hint="Format unik, misal: WH-TIMUR">
              <Input
                id="wh-code"
                placeholder="WH-03"
                value={whCode}
                onChange={(e) => setWhCode(e.target.value)}
                className="font-mono text-xs uppercase"
                required
              />
            </FormField>

            <FormField id="wh-name" label="Nama Gudang" isRequired>
              <Input
                id="wh-name"
                placeholder="Gudang Cabang Timur"
                value={whName}
                onChange={(e) => setWhName(e.target.value)}
                required
              />
            </FormField>
          </div>

          <FormField id="wh-addr" label="Alamat / Lokasi Fisik">
            <Textarea
              id="wh-addr"
              rows={2}
              placeholder="Alamat lengkap fasilitas pergudangan..."
              value={whAddress}
              onChange={(e) => setWhAddress(e.target.value)}
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
            <Button variant="secondary" type="button" onClick={() => setIsAddWhOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" type="submit">
              Simpan Gudang
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Modal Tambah Lokasi Penyimpanan Baru */}
      <Dialog
        isOpen={isAddLocOpen}
        onClose={() => setIsAddLocOpen(false)}
        title={`Tambah Lokasi di ${selectedWarehouse?.name}`}
        description="Master lokasi rak, area, sudut, atau ruangan yang tersimpan permanen."
      >
        <form onSubmit={handleAddLocation} className="space-y-4">
          {formError && (
            <Alert variant="danger" title="Kesalahan" description={formError} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField id="loc-code" label="Kode Lokasi" isRequired hint="Misal: RAK-B1, AREA-PALLET">
              <Input
                id="loc-code"
                placeholder="RAK-B1"
                value={locCode}
                onChange={(e) => setLocCode(e.target.value)}
                className="font-mono text-xs uppercase"
                required
              />
            </FormField>

            <FormField id="loc-type" label="Tipe Lokasi" isRequired>
              <Select
                id="loc-type"
                value={locType}
                onChange={(e) => setLocType(e.target.value as StorageLocation["type"])}
              >
                <option value="RAK">Rak Bertingkat</option>
                <option value="AREA">Area Lantai / Pallet</option>
                <option value="SUDUT">Sudut Transit</option>
                <option value="RUANG">Ruangan Tertutup</option>
              </Select>
            </FormField>
          </div>

          <FormField id="loc-name" label="Nama / Keterangan Lokasi" isRequired>
            <Input
              id="loc-name"
              placeholder="Rak Komponen Elektronik B1"
              value={locName}
              onChange={(e) => setLocName(e.target.value)}
              required
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
            <Button variant="secondary" type="button" onClick={() => setIsAddLocOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" type="submit">
              Simpan Master Lokasi
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
