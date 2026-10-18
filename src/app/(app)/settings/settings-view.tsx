"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useActiveContext } from "@/lib/demo/active-context-provider";
import {
  FIXTURE_WAREHOUSES,
  FIXTURE_LOCATIONS,
} from "@/lib/demo/inventory-fixtures";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Alert } from "@/components/ui/feedback";
import { Dialog } from "@/components/ui/dialog";
import { UsersIcon, ChevronRightIcon, AuditIcon } from "@/components/ui/icons";


export function SettingsView() {
  const { currentRole, setCurrentRole, activeWarehouse } = useActiveContext();


  const [activeTab, setActiveTab] = useState<"ACCOUNT" | "FACILITIES" | "FORMATS" | "APPEARANCE" | "SUPER_ADMIN">(
    "ACCOUNT"
  );
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleLogout = () => {
    setIsLogoutOpen(false);
    setStatusMessage("Sesi pengguna telah diakhiri secara aman. Sesi konteks berhasil dibersihkan.");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengaturan Sistem"
        description="Konfigurasi akun, fasilitas gudang, format Serial Number, satuan produk, dan preferensi aplikasi."
      />

      {statusMessage && (
        <Alert
          variant="info"
          title="Pemberitahuan Sistem"
          description={statusMessage}
        />
      )}

      {/* Tabs */}
      <div className="border-b border-border-default flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("ACCOUNT")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "ACCOUNT"
              ? "border-primary text-text-primary font-semibold"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          Akun & Sesi Pengguna
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("FACILITIES")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "FACILITIES"
              ? "border-primary text-text-primary font-semibold"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          Fasilitas Gudang & Lokasi
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("FORMATS")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "FORMATS"
              ? "border-primary text-text-primary font-semibold"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          Format SN & Satuan
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("APPEARANCE")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "APPEARANCE"
              ? "border-primary text-text-primary font-semibold"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          Bahasa & Tampilan
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("SUPER_ADMIN")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "SUPER_ADMIN"
              ? "border-primary text-text-primary font-semibold"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          Platform & Tenant (Super Admin)
        </button>
      </div>

      {/* TAB 1: AKUN & SESI PENGGUNA (TASK-039) */}
      {activeTab === "ACCOUNT" && (
        <div className="space-y-6 max-w-2xl">
          <div className="rounded border border-border-default bg-surface-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <UsersIcon className="h-4 w-4 text-primary" />
              Informasi Akun & Membership Aktif
            </h2>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-border-default">
                <span className="text-text-muted">Nama Lengkap</span>
                <span className="col-span-2 font-medium text-text-primary">Budi Santoso</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-border-default">
                <span className="text-text-muted">Email Pengguna</span>
                <span className="col-span-2 font-mono text-text-primary">budi@docuflow.id</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-border-default">
                <span className="text-text-muted">Organisasi (Tenant Owner)</span>
                <span className="col-span-2 font-medium text-text-primary">PT Surya Logistik Utama</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-border-default">
                <span className="text-text-muted">Role Otorisasi Aktif</span>
                <span className="col-span-2">
                  <Badge variant={currentRole === "OWNER" ? "success" : "info"}>
                    {currentRole}
                  </Badge>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2">
                <span className="text-text-muted">Gudang Penugasan</span>
                <span className="col-span-2 font-medium text-text-primary">
                  {activeWarehouse?.name} ({activeWarehouse?.code})
                </span>
              </div>
            </div>

            {/* Role Switcher Demo */}
            <div className="mt-4 p-4 rounded bg-surface-subtle border border-border-default space-y-3">
              <div className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <AuditIcon className="h-4 w-4 text-warning" />
                Simulasi Peran Operasional (Role Switcher):
              </div>
              <p className="text-[11px] text-text-secondary">
                Ganti peran aktif untuk menguji batas wewenang antarmuka sesuai kebijakan isolasi gudang dan hak akses.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={currentRole === "OWNER" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setCurrentRole("OWNER")}
                >
                  Owner (Multi-Gudang)
                </Button>
                <Button
                  variant={currentRole === "STAFF" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setCurrentRole("STAFF")}
                >
                  Staff (Gudang Tugas)
                </Button>
                <Button
                  variant={currentRole === "SALES" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setCurrentRole("SALES")}
                >
                  Sales (Gudang Tugas)
                </Button>
                <Button
                  variant={currentRole === "SUPER_ADMIN" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setCurrentRole("SUPER_ADMIN")}
                >
                  Super Admin (Platform)
                </Button>
              </div>
            </div>


            <div className="pt-2 flex justify-between items-center border-t border-border-default">
              <span className="text-xs text-text-muted">Keluar dari sesi perangkat ini:</span>
              <Button variant="danger" size="sm" onClick={() => setIsLogoutOpen(true)}>
                Keluar (Logout)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FASILITAS GUDANG & LOKASI (TASK-022) */}
      {activeTab === "FACILITIES" && (
        <div className="space-y-6 max-w-2xl">
          <div className="rounded border border-border-default bg-surface-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-text-primary">Master Fasilitas & Lokasi Rak</h2>
            <p className="text-xs text-text-secondary">
              Kelola master gudang dan struktur lokasi penyimpanan tetap (rak, area pallet, sudut transit) yang digunakan pada seluruh formulir transaksi operasional.
            </p>

            <div className="p-4 rounded border border-border-default bg-surface-subtle flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-text-primary">
                  {FIXTURE_WAREHOUSES.length} Fasilitas Gudang Terdaftar
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  {FIXTURE_LOCATIONS.length} Master Lokasi Penyimpanan Permanen
                </div>
              </div>
              <Link href="/settings/warehouses">
                <Button variant="primary" size="sm">
                  Buka Master Gudang
                  <ChevronRightIcon className="h-4 w-4 ml-1" />
                </Button>
              </Link>

            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FORMAT SN & SATUAN (TASK-037, TBD-04/05) */}
      {activeTab === "FORMATS" && (
        <div className="space-y-6 max-w-2xl">
          <div className="rounded border border-border-default bg-surface-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-text-primary">Format Serial Number (SN)</h2>
            <div className="rounded border border-warning/30 bg-surface-subtle p-3 text-xs text-text-secondary space-y-1">
              <div className="font-semibold text-text-primary">Baseline Format SN Terkonfigurasi:</div>
              <div className="font-mono font-semibold text-primary text-sm py-1">
                {"{WH}-{SKU}-{YYYYMMDD}-{SEQ}"}
              </div>

              <div>
                Contoh: <span className="font-mono text-text-primary">WH01-SWT-20261014-001</span>
              </div>
              <div className="pt-1 text-text-muted">
                Perubahan formula format SN baru tidak akan mengubah riwayat SN yang telah diposting sebelumnya.
              </div>
            </div>

            <div className="border-t border-border-default pt-4 space-y-3">
              <h2 className="text-sm font-semibold text-text-primary">Satuan Produk yang Didukung</h2>
              <p className="text-xs text-text-secondary">
                Satuan yang sah untuk transaksi non-serial. Kuantitas berbeda satuan tidak dapat dijumlahkan tanpa rasio konversi resmi.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {["unit", "roll", "pack", "box"].map((u) => (
                  <div key={u} className="p-2.5 rounded border border-border-default bg-surface-subtle text-center text-xs font-mono font-semibold text-text-primary">
                    {u}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: BAHASA & TAMPILAN (TASK-018) */}
      {activeTab === "APPEARANCE" && (
        <div className="space-y-6 max-w-2xl">
          <div className="rounded border border-border-default bg-surface-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-text-primary">Bahasa Antarmuka (Locale)</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded border border-primary bg-primary/5 text-xs">
                <div>
                  <div className="font-semibold text-text-primary">Bahasa Indonesia (Default)</div>
                  <div className="text-text-muted text-[11px]">Bahasa standar operasional Docuflow</div>
                </div>
                <Badge variant="success">Aktif</Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded border border-border-default bg-surface-subtle text-xs">
                <div>
                  <div className="font-semibold text-text-secondary">English (US)</div>
                  <div className="text-text-muted text-[11px]">i18n Dictionary Module</div>
                </div>
                <Badge variant="outline">BLOCKED (TASK-018)</Badge>
              </div>
            </div>

            <div className="border-t border-border-default pt-4 space-y-2">
              <h2 className="text-sm font-semibold text-text-primary">Standar Visual UI</h2>
              <p className="text-xs text-text-secondary">
                Docuflow V2.4.1 menggunakan prinsip flat colors, tanpa gradasi warna, dan tanpa emoji dekoratif untuk efisiensi kerja operasional pergudangan B2B.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PLATFORM & TENANT (SUPER ADMIN) */}
      {activeTab === "SUPER_ADMIN" && (
        <div className="space-y-6 max-w-2xl">
          <div className="rounded border border-border-default bg-surface-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Otorisasi & Akses Tenant Platform</h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  Wewenang operasional Super Admin untuk mengelola seluruh data inventaris antar-tenant.
                </p>
              </div>
              <Badge variant="info">SUPER ADMIN</Badge>
            </div>

            <div className="rounded border border-border-default bg-surface-subtle p-3.5 space-y-3">
              <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">Tenant & Active Grants Terdaftar</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded bg-surface border border-border-default">
                  <div>
                    <p className="font-semibold text-text-primary">Alpha Logistics Indonesia (OWNER-ALPHA)</p>
                    <p className="text-text-muted text-[11px]">2 Fasilitas: Cakung (WH-NORTH), Cikarang (WH-SOUTH)</p>
                  </div>
                  <span className="font-mono text-[11px] font-medium text-primary bg-primary-soft px-2 py-0.5 rounded">
                    FULL_ACCESS (Aktif s/d 2099)
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded bg-surface border border-border-default">
                  <div>
                    <p className="font-semibold text-text-primary">Beta Retail Nusantara (OWNER-BETA)</p>
                    <p className="text-text-muted text-[11px]">1 Fasilitas: Gudang Pusat Surabaya (WH-SUB-01)</p>
                  </div>
                  <span className="font-mono text-[11px] font-medium text-primary bg-primary-soft px-2 py-0.5 rounded">
                    FULL_ACCESS (Aktif s/d 2099)
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-border-default pt-4 space-y-3">
              <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">Audit & Keamanan Platform</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded border border-border-default bg-surface">
                  <span className="font-medium text-text-primary block mb-1">Isolasi Tenant Ketat</span>
                  <p className="text-text-secondary text-[11px]">
                    Setiap mutasi stok dan ledger transaksi diverifikasi di database server.
                  </p>
                </div>
                <div className="p-3 rounded border border-border-default bg-surface">
                  <span className="font-medium text-text-primary block mb-1">Pencatatan Audit Trail</span>
                  <p className="text-text-secondary text-[11px]">
                    Seluruh aktivitas operasional tercatat pada audit log platform.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dialog Konfirmasi Logout */}
      <Dialog
        isOpen={isLogoutOpen}
        onClose={() => setIsLogoutOpen(false)}
        title="Konfirmasi Keluar Sesi"
        description="Apakah Anda yakin ingin keluar dari akun Anda pada perangkat ini?"
        isConfirm={true}
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-text-secondary">
            Sesi lokal dan token otorisasi akan dibersihkan. Anda harus masuk kembali untuk mengakses data operasional inventori.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
            <Button variant="secondary" onClick={() => setIsLogoutOpen(false)}>
              Batal
            </Button>
            <Button variant="danger" onClick={handleLogout}>
              Ya, Keluar Sesi
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
