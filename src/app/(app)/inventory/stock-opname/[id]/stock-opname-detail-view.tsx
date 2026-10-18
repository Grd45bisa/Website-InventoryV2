"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useActiveContext } from "@/lib/demo/active-context-provider";
import {
  StockOpnameSession,
  StockOpnameCountItem,
} from "@/lib/demo/inventory-fixtures";
import { Button } from "@/components/ui/button";
import { Badge, Alert, FeedbackState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form-fields";
import { Pagination } from "@/components/ui/pagination";
import {
  ChevronLeftIcon,
  SearchIcon,
  FilterIcon,
} from "@/components/ui/icons";
import { StockOpnameAreaNav } from "./stock-opname-area-nav";
import { StockOpnameSerialDrawer } from "./stock-opname-serial-drawer";
import { StockOpnameCountDialog } from "./stock-opname-count-dialog";
import { StockOpnameScannerPanel } from "./stock-opname-scanner-panel";
import { StockOpnameErrorDrawer } from "./stock-opname-error-drawer";
import { StockOpnameReconciliationView } from "./stock-opname-reconciliation-view";
import type {
  StockOpnameAreaRecord,
  StockOpnameScanResult,
} from "@/lib/db/repositories/inventory-repository";
import {
  getStockOpnameAreaCountsAction,
  getStockOpnameScanErrorsAction,
} from "@/lib/inventory/actions";

interface StockOpnameDetailViewProps {
  session: StockOpnameSession & { isCancelled?: boolean };
  initialItems: StockOpnameCountItem[];
  initialAreas?: StockOpnameAreaRecord[];
  isReadOnly?: boolean;
}

export function StockOpnameDetailView({
  session,
  initialItems,
  initialAreas = [],
  isReadOnly = false,
}: StockOpnameDetailViewProps) {
  const { currentRole, activeWarehouseId } = useActiveContext();

  // State Items & Areas
  const [items, setItems] = useState<StockOpnameCountItem[]>(initialItems);
  const [areas, setAreas] = useState<StockOpnameAreaRecord[]>(() => {
    if (initialAreas.length > 0) return initialAreas;
    return [
      {
        id: "default-area",
        ownerId: "default",
        warehouseId: session.warehouseId,
        sessionId: session.id,
        name: "Area Utama",
        status: "PENDING",
        itemCount: 0,
        totalCountedQtyBase: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  });

  const [activeAreaId, setActiveAreaId] = useState<string>(() => {
    const valid = areas.find((a) => a.status !== "CANCELLED");
    return valid ? valid.id : areas[0]?.id || "";
  });

  // State Area Counts cache: areaId -> productId -> countedBaseQty
  const [areaCountsMap, setAreaCountsMap] = useState<Record<string, Record<string, number>>>({});

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [trackingFilter, setTrackingFilter] = useState<"ALL" | "SERIAL" | "NON_SERIAL">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "MATCH" | "SURPLUS" | "DEFICIT" | "UNCOUNTED">("ALL");

  // Tab Switcher Utama (Penghitungan Area vs Review Rekonsiliasi)
  const [activeMainTab, setActiveMainTab] = useState<"COUNTING" | "RECONCILIATION">("COUNTING");

  // Display Unit Switcher (PCS vs Lusin)
  const [displayUnit, setDisplayUnit] = useState<"pcs" | "lusin">("pcs");

  // Pagination (Desktop max 50, Mobile max 20)
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Responsive page size detection
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setPageSize(20);
      } else {
        setPageSize(50);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch counts when active area changes
  useEffect(() => {
    if (!activeAreaId || areaCountsMap[activeAreaId]) return;

    getStockOpnameAreaCountsAction(session.id, activeAreaId)
      .then((res) => {
        if (res.success && res.counts) {
          const map: Record<string, number> = {};
          for (const c of res.counts) {
            map[c.productId] = c.countedQtyBase;
          }
          setAreaCountsMap((prev) => ({ ...prev, [activeAreaId]: map }));
        }
      })
      .catch(() => {
        // Abaikan jika offline / fixture mock
      });
  }, [session.id, activeAreaId, areaCountsMap]);

  // Dialog States
  const [serialDrawerState, setSerialDrawerState] = useState<{
    open: boolean;
    productId: string | null;
    productName: string;
    sku: string;
    snapshotQty: number;
    unit: string;
  }>({
    open: false,
    productId: null,
    productName: "",
    sku: "",
    snapshotQty: 0,
    unit: "pcs",
  });

  const [countDialogState, setCountDialogState] = useState<{
    open: boolean;
    productId: string | null;
    productName: string;
    sku: string;
    snapshotQty: number;
    currentAreaCountedBase: number;
    unit: string;
  }>({
    open: false,
    productId: null,
    productName: "",
    sku: "",
    snapshotQty: 0,
    currentAreaCountedBase: 0,
    unit: "pcs",
  });

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Active Area Info
  const activeArea = areas.find((a) => a.id === activeAreaId) || areas[0];

  // Access check
  const statusStr = String(session.status);
  const isAssigned = session.warehouseId === activeWarehouseId || currentRole === "OWNER";
  const isSessionClosed = statusStr === "COMPLETED" || statusStr === "ADJUSTED" || statusStr === "CANCELLED" || Boolean(session.isCancelled);
  const isReadOnlyMode = isReadOnly || !isAssigned || isSessionClosed;

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.productName.toLowerCase().includes(q);
        const matchesSku = item.sku.toLowerCase().includes(q);
        if (!matchesName && !matchesSku) return false;
      }

      // Tracking
      if (trackingFilter !== "ALL" && item.tracking !== trackingFilter) {
        return false;
      }

      // Status
      if (statusFilter !== "ALL") {
        if (statusFilter === "UNCOUNTED" && item.countedQty > 0) return false;
        if (statusFilter === "MATCH" && item.status !== "MATCH") return false;
        if (statusFilter === "SURPLUS" && item.status !== "SURPLUS") return false;
        if (statusFilter === "DEFICIT" && item.status !== "DEFICIT") return false;
      }

      return true;
    });
  }, [items, searchQuery, trackingFilter, statusFilter]);

  // Paginated Items
  const totalItems = filteredItems.length;
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredItems.slice(startIndex, startIndex + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, trackingFilter, statusFilter, pageSize]);

  // Summary counts
  const totalCountedItems = items.filter((i) => i.countedQty > 0).length;
  const matchCount = items.filter((i) => i.countedQty > 0 && i.variance === 0).length;
  const varianceCount = items.filter((i) => i.variance !== 0 && i.countedQty > 0).length;

  // Formatter helper based on displayUnit
  const formatQtyDisplay = (baseQty: number, productUnit: string) => {
    const cleanUnit = (productUnit || "pcs").toLowerCase();
    if (displayUnit === "lusin" && cleanUnit === "pcs") {
      const lusinVal = (baseQty / 12).toFixed(2);
      return (
        <span>
          <span className="font-mono font-bold">{lusinVal}</span>{" "}
          <span className="text-[11px] text-text-muted">LS ({baseQty} pcs)</span>
        </span>
      );
    }
    return (
      <span>
        <span className="font-mono font-bold">{baseQty.toLocaleString("id-ID")}</span>{" "}
        <span className="text-[11px] text-text-muted">{productUnit}</span>
      </span>
    );
  };

  // Success handler for count input
  const handleCountSuccess = (res: {
    countedQtyBase: number;
    totalCountedQty: number;
    varianceQty: number;
    reconciliationStatus: string;
  }) => {
    if (!countDialogState.productId) return;

    const pId = countDialogState.productId;

    // 1. Update lines state
    setItems((prev) =>
      prev.map((it) => {
        if (it.productId === pId) {
          return {
            ...it,
            countedQty: res.totalCountedQty,
            variance: res.varianceQty,
            status:
              res.varianceQty === 0
                ? "MATCH"
                : res.varianceQty > 0
                ? "SURPLUS"
                : "DEFICIT",
          };
        }
        return it;
      })
    );

    // 2. Update area counts map
    setAreaCountsMap((prev) => ({
      ...prev,
      [activeAreaId]: {
        ...(prev[activeAreaId] || {}),
        [pId]: res.countedQtyBase,
      },
    }));

    // 3. Update area progress in areas state
    setAreas((prev) =>
      prev.map((a) => {
        if (a.id === activeAreaId) {
          const nextStatus = a.status === "PENDING" ? "IN_PROGRESS" : a.status;
          return {
            ...a,
            status: nextStatus,
            itemCount: (a.itemCount ?? 0) + 1,
            totalCountedQtyBase: (a.totalCountedQtyBase ?? 0) + res.countedQtyBase,
          };
        }
        return a;
      })
    );

    setStatusMessage(`Hasil hitungan fisik untuk produk ${countDialogState.productName} berhasil disimpan ke server.`);
  };

  // Error Drawer State & Error Count
  const [isErrorDrawerOpen, setIsErrorDrawerOpen] = useState(false);
  const [areaErrorCount, setAreaErrorCount] = useState(0);

  const refreshErrorCount = useCallback(() => {
    if (!activeAreaId) return;
    getStockOpnameScanErrorsAction(session.id, activeAreaId)
      .then((res) => {
        if (res.success && res.errors) {
          setAreaErrorCount(res.errors.length);
        }
      })
      .catch(() => {});
  }, [session.id, activeAreaId]);

  useEffect(() => {
    refreshErrorCount();
  }, [refreshErrorCount]);

  // Handler Sukses Scan SN (Phase 4)
  const handleScanSuccess = useCallback(
    (result: StockOpnameScanResult) => {
      if (!result.productId) return;

      const addQty = result.baseQuantity || 1;

      // 1. Update lines local state
      setItems((prev) =>
        prev.map((it) => {
          if (it.productId === result.productId) {
            const newCounted = it.countedQty + addQty;
            const newDiff = newCounted - it.snapshotQty;
            const newStatus =
              newDiff === 0 ? "MATCH" : newDiff > 0 ? "SURPLUS" : "DEFICIT";
            return {
              ...it,
              countedQty: newCounted,
              difference: newDiff,
              status: newStatus,
            };
          }
          return it;
        })
      );

      // 2. Update area counts map
      setAreaCountsMap((prev) => {
        const areaMap = { ...(prev[activeAreaId] || {}) };
        areaMap[result.productId!] =
          (areaMap[result.productId!] || 0) + addQty;
        return {
          ...prev,
          [activeAreaId]: areaMap,
        };
      });

      // 3. Update area progress in areas state
      setAreas((prev) =>
        prev.map((a) => {
          if (a.id === activeAreaId) {
            const nextStatus = a.status === "PENDING" ? "IN_PROGRESS" : a.status;
            return {
              ...a,
              status: nextStatus,
              itemCount: (a.itemCount ?? 0) + 1,
              totalCountedQtyBase: (a.totalCountedQtyBase ?? 0) + addQty,
            };
          }
          return a;
        })
      );

      setStatusMessage(result.message);
    },
    [activeAreaId]
  );

  return (
    <div className="space-y-6">
      {/* 1. Header Informasi Sesi */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/inventory/stock-opname"
            className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary mb-2 transition-colors"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
            Kembali ke Daftar Stock Opname
          </Link>

          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl font-mono">
              {session.sessionNumber}
            </h1>
            <Badge
              variant={
                statusStr === "COMPLETED" || statusStr === "ADJUSTED" || session.status === "APPROVED"
                  ? "success"
                  : session.status === "REVIEW"
                  ? "warning"
                  : statusStr === "CANCELLED" || session.isCancelled
                  ? "danger"
                  : "info"
              }
            >
              {statusStr === "COMPLETED" || statusStr === "ADJUSTED" || session.status === "APPROVED"
                ? "Selesai"
                : session.status === "REVIEW"
                ? "Menunggu Review"
                : statusStr === "CANCELLED" || session.isCancelled
                ? "Dibatalkan"
                : "Sedang Dihitung"}
            </Badge>

            {isReadOnlyMode && (
              <Badge variant="outline" size="sm">
                Mode Read-Only
              </Badge>
            )}
          </div>

          <p className="text-xs text-text-muted mt-1.5">
            Gudang: <span className="font-semibold text-text-secondary">{session.warehouseName}</span> | Snapshot:{" "}
            <span className="font-mono text-text-secondary">{session.snapshotFrozenAt}</span> | Dibuat:{" "}
            <span className="text-text-secondary">{session.createdBy}</span>
          </p>
        </div>

        {/* Status Mode Badge */}
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] text-text-muted block">Status Operasional:</span>
            <span className="text-xs font-medium text-text-secondary">
              {isReadOnlyMode ? "Hanya Lihat (Terkunci)" : "Penghitungan Fisik Aktif"}
            </span>
          </div>
        </div>
      </div>

      {/* Warning/Alert Alerts */}
      {!isAssigned && (
        <Alert
          variant="warning"
          title="Akses Dibatasi"
          description="Sesi Stock Opname ini berada di luar gudang penugasan aktif Anda. Anda hanya memiliki hak lihat (read-only)."
        />
      )}

      {isSessionClosed && (
        <Alert
          variant="info"
          title="Sesi Telah Ditutup"
          description={`Sesi Stock Opname ini telah berstatus '${session.status}'. Seluruh data hitungan bersifat permanen dan tidak dapat diubah.`}
        />
      )}

      {statusMessage && (
        <Alert
          variant="success"
          title="Pembaruan Berhasil"
          description={statusMessage}
        />
      )}

      {/* Tab Switcher: 1. Penghitungan Fisik per Area | 2. Review Rekonsiliasi & Delta Concurrent */}
      <div className="flex border-b border-border-default space-x-6">
        <button
          type="button"
          onClick={() => setActiveMainTab("COUNTING")}
          className={`pb-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
            activeMainTab === "COUNTING"
              ? "border-primary text-primary"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          1. Penghitungan Fisik per Area
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab("RECONCILIATION")}
          className={`pb-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeMainTab === "RECONCILIATION"
              ? "border-primary text-primary"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          <span>2. Review Rekonsiliasi & Delta Concurrent</span>
          {varianceCount > 0 && (
            <Badge variant="danger" size="sm">
              {varianceCount} Selisih
            </Badge>
          )}
        </button>
      </div>

      {activeMainTab === "COUNTING" ? (
        <>
          {/* 2. Stat Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-3.5 rounded-xl border border-border-default bg-surface-card">
              <div className="text-[11px] text-text-muted font-medium uppercase tracking-wider">
                Total Snapshot
              </div>
          <div className="text-xl sm:text-2xl font-bold text-text-primary mt-1 font-mono">
            {items.length}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">Produk terdaftar</div>
        </div>

        <div className="p-3.5 rounded-xl border border-border-default bg-surface-card">
          <div className="text-[11px] text-text-muted font-medium uppercase tracking-wider">
            Sudah Dihitung
          </div>
          <div className="text-xl sm:text-2xl font-bold text-primary mt-1 font-mono">
            {totalCountedItems}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">Dari {items.length} produk</div>
        </div>

        <div className="p-3.5 rounded-xl border border-border-default bg-surface-card">
          <div className="text-[11px] text-text-muted font-medium uppercase tracking-wider">
            Sesuai (Match)
          </div>
          <div className="text-xl sm:text-2xl font-bold text-success mt-1 font-mono">
            {matchCount}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">Selisih nol</div>
        </div>

        <div className="p-3.5 rounded-xl border border-border-default bg-surface-card">
          <div className="text-[11px] text-text-muted font-medium uppercase tracking-wider">
            Selisih (Variance)
          </div>
          <div className="text-xl sm:text-2xl font-bold text-danger mt-1 font-mono">
            {varianceCount}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">Surplus / Defisit</div>
        </div>
      </div>

      {/* 3. Area Navigation Bar */}
      <StockOpnameAreaNav
        sessionId={session.id}
        areas={areas}
        activeAreaId={activeAreaId}
        onSelectArea={setActiveAreaId}
        onAreasUpdated={setAreas}
        isReadOnly={isReadOnlyMode}
      />

      {/* 3.1 Panel Scanner Barcode SN (Phase 4) */}
      <StockOpnameScannerPanel
        sessionId={session.id}
        activeArea={activeArea ? { id: activeArea.id, name: activeArea.name, status: activeArea.status } : null}
        isReadOnly={isReadOnlyMode}
        onScanSuccess={handleScanSuccess}
        onOpenErrorDrawer={() => setIsErrorDrawerOpen(true)}
        errorCount={areaErrorCount}
      />

      {/* 4. Filter, Search & Unit Switcher Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-surface-card border border-border-default p-3 rounded-xl">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <input
              type="text"
              placeholder="Cari nama produk atau SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-border-default bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Tracking Filter */}
          <select
            value={trackingFilter}
            onChange={(e) => setTrackingFilter(e.target.value as typeof trackingFilter)}
            className="px-2.5 py-1.5 text-xs rounded-md border border-border-default bg-surface text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">Semua Tipe Tracking</option>
            <option value="SERIAL">Produk Serial (SN)</option>
            <option value="NON_SERIAL">Produk Non-Serial</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-2.5 py-1.5 text-xs rounded-md border border-border-default bg-surface text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">Semua Status</option>
            <option value="MATCH">Sesuai (Match)</option>
            <option value="SURPLUS">Surplus (+)</option>
            <option value="DEFICIT">Defisit (-)</option>
            <option value="UNCOUNTED">Belum Dihitung</option>
          </select>
        </div>

        {/* Switcher Satuan (PCS / Lusin) */}
        <div className="flex items-center gap-2 self-end lg:self-auto pt-1 lg:pt-0 border-t lg:border-t-0 border-border-default/60 w-full lg:w-auto justify-between lg:justify-end">
          <span className="text-xs text-text-muted font-medium">Tampilan Satuan:</span>
          <div className="inline-flex rounded-lg border border-border-default p-0.5 bg-surface-subtle">
            <button
              type="button"
              onClick={() => setDisplayUnit("pcs")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                displayUnit === "pcs"
                  ? "bg-surface-card text-text-primary shadow-xs"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              PCS
            </button>
            <button
              type="button"
              onClick={() => setDisplayUnit("lusin")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                displayUnit === "lusin"
                  ? "bg-surface-card text-text-primary shadow-xs"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Lusin (12 pcs)
            </button>
          </div>
        </div>
      </div>

      {/* 5. Daftar Produk: Desktop Table & Mobile Cards */}
      {paginatedItems.length === 0 ? (
        <FeedbackState
          title="Tidak Ada Produk Ditemukan"
          description={
            searchQuery || trackingFilter !== "ALL" || statusFilter !== "ALL"
              ? "Tidak ada item snapshot yang cocok dengan filter yang Anda tentukan."
              : "Belum ada produk yang tercatat dalam snapshot Stock Opname ini."
          }
        />
      ) : (
        <>
          {/* DESKTOP TABLE (Hidden on Mobile) */}
          <div className="hidden md:block rounded-xl border border-border-default bg-surface-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-text-secondary border-collapse">
                <thead className="bg-surface-subtle text-text-muted border-b border-border-default uppercase font-medium">
                  <tr>
                    <th className="p-3.5">Produk / SKU</th>
                    <th className="p-3.5">Tipe Tracking</th>
                    <th className="p-3.5 text-right">Stok Snapshot</th>
                    <th className="p-3.5 text-right">Total Hitung Fisik</th>
                    <th className="p-3.5 text-right">Area "{activeArea?.name}"</th>
                    <th className="p-3.5 text-right">Selisih</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default/60">
                  {paginatedItems.map((item) => {
                    const currentAreaCount = areaCountsMap[activeAreaId]?.[item.productId] ?? 0;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-surface-subtle/50 transition-colors"
                      >
                        <td className="p-3.5">
                          <div className="font-semibold text-text-primary">{item.productName}</div>
                          <div className="text-text-muted font-mono text-[11px]">{item.sku}</div>
                        </td>

                        <td className="p-3.5">
                          <Badge
                            variant={item.tracking === "SERIAL" ? "neutral" : "outline"}
                            size="sm"
                          >
                            {item.tracking === "SERIAL" ? "Serial (SN)" : "Non-Serial"}
                          </Badge>
                        </td>

                        <td className="p-3.5 text-right">
                          {formatQtyDisplay(item.snapshotQty, item.unit)}
                        </td>

                        <td className="p-3.5 text-right font-semibold text-text-primary">
                          {formatQtyDisplay(item.countedQty, item.unit)}
                        </td>

                        <td className="p-3.5 text-right">
                          <span className="font-mono text-text-secondary">
                            {formatQtyDisplay(currentAreaCount, item.unit)}
                          </span>
                        </td>

                        <td className="p-3.5 text-right font-mono">
                          <span
                            className={`font-semibold ${
                              item.variance === 0
                                ? "text-success"
                                : item.variance > 0
                                ? "text-info"
                                : "text-danger"
                            }`}
                          >
                            {item.variance > 0 ? `+${item.variance}` : item.variance} {item.unit}
                          </span>
                        </td>

                        <td className="p-3.5">
                          <Badge
                            variant={
                              item.countedQty === 0
                                ? "outline"
                                : item.status === "MATCH"
                                ? "success"
                                : item.status === "SURPLUS"
                                ? "info"
                                : "danger"
                            }
                            size="sm"
                          >
                            {item.countedQty === 0
                              ? "Belum Dihitung"
                              : item.status === "MATCH"
                              ? "Sesuai"
                              : item.status === "SURPLUS"
                              ? "Surplus"
                              : "Defisit"}
                          </Badge>
                        </td>

                        <td className="p-3.5 text-right">
                          {item.tracking === "SERIAL" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="text-xs h-7 px-2.5"
                              onClick={() => {
                                setSerialDrawerState({
                                  open: true,
                                  productId: item.productId,
                                  productName: item.productName,
                                  sku: item.sku,
                                  snapshotQty: item.snapshotQty,
                                  unit: item.unit,
                                });
                              }}
                            >
                              Lihat SN Snapshot
                            </Button>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              className="text-xs h-7 px-2.5"
                              disabled={isReadOnlyMode}
                              onClick={() => {
                                setCountDialogState({
                                  open: true,
                                  productId: item.productId,
                                  productName: item.productName,
                                  sku: item.sku,
                                  snapshotQty: item.snapshotQty,
                                  currentAreaCountedBase: currentAreaCount,
                                  unit: item.unit,
                                });
                              }}
                            >
                              Input Hitung Fisik
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* MOBILE CARDS (Hidden on Desktop & Tablet) */}
          <div className="md:hidden space-y-3">
            {paginatedItems.map((item) => {
              const currentAreaCount = areaCountsMap[activeAreaId]?.[item.productId] ?? 0;

              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-border-default bg-surface-card space-y-3 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-text-muted">{item.sku}</span>
                      <h4 className="font-semibold text-text-primary text-sm leading-tight mt-0.5">
                        {item.productName}
                      </h4>
                    </div>
                    <Badge
                      variant={
                        item.countedQty === 0
                          ? "outline"
                          : item.status === "MATCH"
                          ? "success"
                          : item.status === "SURPLUS"
                          ? "info"
                          : "danger"
                      }
                      size="sm"
                    >
                      {item.countedQty === 0
                        ? "Belum Dihitung"
                        : item.status === "MATCH"
                        ? "Sesuai"
                        : item.status === "SURPLUS"
                        ? "Surplus"
                        : "Defisit"}
                    </Badge>
                  </div>

                  {/* 3-Column Stats Grid */}
                  <div className="grid grid-cols-3 gap-2 p-2.5 bg-surface-subtle border border-border-default/60 rounded-lg text-center text-xs">
                    <div>
                      <span className="text-[10px] text-text-muted block">Snapshot:</span>
                      <span className="font-mono font-bold text-text-primary">
                        {item.snapshotQty} {item.unit}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-text-muted block">Area Ini:</span>
                      <span className="font-mono font-bold text-text-secondary">
                        {currentAreaCount} {item.unit}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-text-muted block">Total Selisih:</span>
                      <span
                        className={`font-mono font-bold ${
                          item.variance === 0
                            ? "text-success"
                            : item.variance > 0
                            ? "text-info"
                            : "text-danger"
                        }`}
                      >
                        {item.variance > 0 ? `+${item.variance}` : item.variance}
                      </span>
                    </div>
                  </div>

                  {/* Mobile Action Button */}
                  <div className="pt-1">
                    {item.tracking === "SERIAL" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full text-xs h-9 justify-center"
                        onClick={() => {
                          setSerialDrawerState({
                            open: true,
                            productId: item.productId,
                            productName: item.productName,
                            sku: item.sku,
                            snapshotQty: item.snapshotQty,
                            unit: item.unit,
                          });
                        }}
                      >
                        Lihat {item.snapshotQty} SN Snapshot
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-full text-xs h-9 justify-center"
                        disabled={isReadOnlyMode}
                        onClick={() => {
                          setCountDialogState({
                            open: true,
                            productId: item.productId,
                            productName: item.productName,
                            sku: item.sku,
                            snapshotQty: item.snapshotQty,
                            currentAreaCountedBase: currentAreaCount,
                            unit: item.unit,
                          });
                        }}
                      >
                        Input Hitung Fisik ({activeArea?.name})
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 6. Pagination Component */}
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            total={totalItems}
            onPageChange={setCurrentPage}
          />
        </>
      )}
        </>
      ) : (
        <StockOpnameReconciliationView
          sessionId={session.id}
          isReadOnly={isReadOnlyMode}
        />
      )}

      {/* 7. Dialogs & Drawers */}
      <StockOpnameSerialDrawer
        open={serialDrawerState.open}
        onClose={() => setSerialDrawerState((prev) => ({ ...prev, open: false }))}
        sessionId={session.id}
        productId={serialDrawerState.productId}
        productName={serialDrawerState.productName}
        sku={serialDrawerState.sku}
        snapshotQty={serialDrawerState.snapshotQty}
        unit={serialDrawerState.unit}
      />

      {countDialogState.productId && (
        <StockOpnameCountDialog
          open={countDialogState.open}
          onClose={() => setCountDialogState((prev) => ({ ...prev, open: false }))}
          sessionId={session.id}
          areaId={activeAreaId}
          areaName={activeArea?.name || "Area Aktif"}
          productId={countDialogState.productId}
          productName={countDialogState.productName}
          sku={countDialogState.sku}
          snapshotQty={countDialogState.snapshotQty}
          currentAreaCountedBase={countDialogState.currentAreaCountedBase}
          productUnit={countDialogState.unit}
          onSuccess={handleCountSuccess}
        />
      )}

      {/* Drawer Riwayat Error Scan Sementara */}
      <StockOpnameErrorDrawer
        isOpen={isErrorDrawerOpen}
        onClose={() => setIsErrorDrawerOpen(false)}
        sessionId={session.id}
        activeArea={activeArea ? { id: activeArea.id, name: activeArea.name } : null}
        onErrorsChanged={refreshErrorCount}
      />
    </div>
  );
}
