"use client";

import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, StatusBadge } from "@/components/ui/feedback";
import { BoxIcon, ArrowInIcon, ArrowOutIcon, WarningIcon, ClockIcon } from "@/components/ui/icons";

import { useActiveContext } from "@/lib/demo/active-context-provider";
import {
  FIXTURE_PRODUCTS,
  FIXTURE_GOODS_IN,
  FIXTURE_GOODS_OUT,
  FIXTURE_PURCHASE_ORDERS,
  FIXTURE_STOCK_HISTORY,
  FIXTURE_OPNAME_SESSIONS,
} from "@/lib/demo/inventory-fixtures";

export interface DashboardSummaryData {
  totalProducts: number;
  lowStockCount: number;
  pendingGoodsInCount: number;
  pendingGoodsOutCount: number;
  totalStockCount: number;
}

export function DashboardView({ initialSummary }: { initialSummary?: DashboardSummaryData }) {
  const { context } = useActiveContext();

  const isOwner = context.role === "OWNER";
  const isStaff = context.role === "STAFF";
  const isSales = context.role === "SALES";
  const isSuperAdmin = context.role === "SUPER_ADMIN";

  // Filter data berdasarkan gudang aktif (jika dipilih)
  const activeWhId = context.warehouseId;
  const filteredProducts = activeWhId
    ? FIXTURE_PRODUCTS.filter((p) => p.warehouseId === activeWhId)
    : FIXTURE_PRODUCTS;

  const filteredGoodsIn = activeWhId
    ? FIXTURE_GOODS_IN.filter((gi) => gi.warehouseId === activeWhId)
    : FIXTURE_GOODS_IN;

  const filteredGoodsOut = activeWhId
    ? FIXTURE_GOODS_OUT.filter((go) => go.warehouseId === activeWhId)
    : FIXTURE_GOODS_OUT;

  const pendingGoodsIn = filteredGoodsIn.filter((gi) => gi.status === "PENDING" || gi.status === "AWAITING_SN");
  const pendingGoodsOut = filteredGoodsOut.filter((go) => go.status === "PENDING");
  const lowStockProducts = filteredProducts.filter((p) => p.minStock && p.stock <= p.minStock);
  const awaitingSnCount = filteredGoodsIn.filter((gi) => gi.status === "AWAITING_SN").length;
  const opnameNeedingReview = FIXTURE_OPNAME_SESSIONS.filter((s) => s.status === "IN_PROGRESS" || s.status === "REVIEW");

  const totalProductsDisplay = initialSummary ? initialSummary.totalProducts : filteredProducts.length;
  const pendingGoodsInDisplay = initialSummary ? initialSummary.pendingGoodsInCount : pendingGoodsIn.length;
  const pendingGoodsOutDisplay = initialSummary ? initialSummary.pendingGoodsOutCount : pendingGoodsOut.length;
  const lowStockDisplay = initialSummary ? initialSummary.lowStockCount : lowStockProducts.length;

  return (
    <div className="flex flex-col gap-6">

      <PageHeader
        title={
          isSuperAdmin
            ? "Dasbor Operasi Platform (Super Admin)"
            : isOwner
            ? "Dasbor Operasi Owner"
            : isStaff
            ? "Dasbor Operasi Staff Gudang"
            : "Dasbor Penjualan & Pemenuhan"
        }
        description={
          !activeWhId
            ? `Menampilkan ringkasan lintas gudang milik ${context.ownerName} (agregasi eksklusif).`
            : `Konteks kerja aktif: ${context.warehouseName}.`
        }
      />

      {/* Status Akses Super Admin */}
      {isSuperAdmin ? (
        <Alert tone="info" title="Hak Akses Operasional Penuh Super Admin">
          Anda mengelola inventaris, transaksi, dan pergerakan stok tenant {context.ownerName} dengan wewenang penuh Super Admin.
        </Alert>
      ) : null}

      {/* Grid Metrik Utama */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metrik 1: Total SKU */}
        <Link
          href="/inventory/products"
          className="flex flex-col justify-between rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">Total SKU</span>
            <span className="rounded-md bg-surface-muted p-2 text-primary">
              <BoxIcon size={20} />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-semibold tabular text-text-primary">{totalProductsDisplay}</p>
            <p className="text-xs text-text-secondary">Katalog produk aktif</p>
          </div>
        </Link>

        {/* Metrik 2: Barang Masuk Pending */}
        <Link
          href="/inventory/goods-in"
          className="flex flex-col justify-between rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">Barang Masuk Pending</span>
            <span className="rounded-md bg-surface-muted p-2 text-info">
              <ArrowInIcon size={20} />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-semibold tabular text-text-primary">{pendingGoodsInDisplay}</p>
            <p className="text-xs text-text-secondary">Belum diposting ke stok</p>
          </div>
        </Link>

        {/* Metrik 3: Barang Keluar Pending */}
        <Link
          href="/inventory/goods-out"
          className="flex flex-col justify-between rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">Barang Keluar Pending</span>
            <span className="rounded-md bg-surface-muted p-2 text-warning">
              <ArrowOutIcon size={20} />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-semibold tabular text-text-primary">{pendingGoodsOutDisplay}</p>
            <p className="text-xs text-text-secondary">Mereservasi stok (belum potong fisik)</p>
          </div>
        </Link>

        {/* Metrik 4: Nilai Stok (TBD - Penjelasan Jujur) */}
        <div className="flex flex-col justify-between rounded-lg border border-border bg-surface p-4 opacity-90">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">Valuasi Stok</span>
            <span className="rounded-md bg-surface-muted p-2 text-text-secondary">
              <ClockIcon size={20} />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-lg font-semibold text-text-secondary">Belum Ditetapkan</p>
            <p className="text-xs text-text-secondary">
              Kebijakan metode valuasi stok (FIFO/LIFO/Average) berstatus TBD (TASK-006).
            </p>
          </div>
        </div>
      </div>

      {/* Bagian Khusus Sales: Purchase Orders & Dokumen Komersial */}
      {isSales ? (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-lg font-semibold text-text-primary">Pemantauan Pesanan Penjualan (PO)</h2>
          <p className="text-xs text-text-secondary">
            Sales dibatasi pada tindak lanjut PO dan pemenuhan dokumen; operasional fisik dilakukan oleh gudang.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIXTURE_PURCHASE_ORDERS.map((po) => (
              <div key={po.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text-primary">{po.poNumber}</span>
                  <StatusBadge tone={po.status === "FULFILLED" ? "success" : "warning"}>
                    {po.status === "PARTIALLY_FULFILLED" ? "Terpenuhi Sebagian" : po.status}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-sm text-text-secondary">Pelanggan: {po.customerName}</p>
                <p className="text-sm font-medium tabular text-text-primary">
                  Rp {po.totalAmount.toLocaleString("id-ID")}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Bagian Perlu Perhatian */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">Perlu Perhatian Operasional</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Item 1: Stok Rendah */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-warning">
              <WarningIcon size={18} />
              <h3 className="font-medium text-text-primary">Stok Menipis ({lowStockDisplay})</h3>
            </div>
            {lowStockProducts.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {lowStockProducts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2 font-medium">{p.name}</span>
                    <span className="tabular text-danger">
                      {p.stock} / min {p.minStock} {p.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">Seluruh produk berada di atas batas minimum stok.</p>
            )}
          </div>

          {/* Item 2: Menunggu SN */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-info">
              <ClockIcon size={18} />
              <h3 className="font-medium text-text-primary">Menunggu Serial Number ({awaitingSnCount})</h3>
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              Transaksi Goods In produk serial memerlukan penginputan nomor seri lengkap sebelum diposting resmi.
            </p>
            {awaitingSnCount > 0 ? (
              <Link href="/inventory/goods-in" className="mt-3 inline-block text-xs font-semibold text-primary underline">
                Lihat Barang Masuk Menunggu SN &rarr;
              </Link>
            ) : null}
          </div>

          {/* Item 3: Stock Opname Sesi Aktif */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-primary">
              <BoxIcon size={18} />
              <h3 className="font-medium text-text-primary">Stock Opname Berjalan ({opnameNeedingReview.length})</h3>
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              Sesi penghitungan fisik aktif. Penyesuaian stok hanya dilakukan setelah rekonsiliasi dan approval.
            </p>
            <Link href="/inventory/stock-opname" className="mt-3 inline-block text-xs font-semibold text-primary underline">
              Buka Modul Stock Opname &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Bagian Riwayat Mutasi Terkini */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">Riwayat Transaksi Stok Terkini</h2>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-surface-muted text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-semibold">Waktu</th>
                  <th className="px-4 py-2 font-semibold">Referensi</th>
                  <th className="px-4 py-2 font-semibold">Jenis Transaksi</th>
                  <th className="px-4 py-2 font-semibold text-right">Perubahan</th>
                  <th className="px-4 py-2 font-semibold text-right">Saldo</th>
                  <th className="px-4 py-2 font-semibold">Pengguna</th>
                </tr>
              </thead>
              <tbody>
                {FIXTURE_STOCK_HISTORY.map((sh) => (
                  <tr key={sh.id} className="border-b border-border hover:bg-surface-muted">
                    <td className="px-4 py-3 text-text-secondary">{sh.timestamp}</td>
                    <td className="px-4 py-3 font-mono text-xs">{sh.reference}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={sh.changeQty > 0 ? "success" : "neutral"}>
                        {sh.type}
                      </StatusBadge>
                    </td>
                    <td className={`px-4 py-3 text-right tabular font-medium ${sh.changeQty > 0 ? "text-success" : "text-danger"}`}>
                      {sh.changeQty > 0 ? `+${sh.changeQty}` : sh.changeQty} {sh.unit}
                    </td>
                    <td className="px-4 py-3 text-right tabular font-medium">
                      {sh.balanceQty} {sh.unit}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{sh.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
