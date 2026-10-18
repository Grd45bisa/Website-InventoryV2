"use client";

import React, { useState, useMemo, useRef, useEffect, useTransition } from "react";
import type { PurchaseOrderRecord, PurchaseOrderLineRecord } from "@/lib/db/repositories/inventory-repository";
import type { Partner, Product } from "@/lib/demo/inventory-fixtures";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { FormField, Input, Select, Textarea } from "@/components/ui/form-fields";
import {
  CloseIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
  DocumentIcon,
  TrashIcon,
  InfoIcon,
  CheckCircleIcon,
} from "@/components/ui/icons";
import { createPurchaseOrderAction } from "@/lib/inventory/actions";

export interface PoCreateDialogProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  customers: Partner[];
  products: Product[];
  currentRole?: string;
  currentUserName?: string;
  onCreated: (newPo: PurchaseOrderRecord, message?: string) => void;
}

interface PoLineDraft {
  id: string;
  productId: string; // ID produk resmi dari Master Produk
  productName: string; // Nama produk resmi
  sku: string; // SKU produk resmi
  searchQuery: string; // Input pencarian untuk autocomplete
  orderedQty: number | string;
  orderedUnit: "PCS" | "Lusin";
  unitPrice?: number;
}

export function PoCreateDialog({
  isOpen,
  open,
  onClose,
  customers,
  products,
  currentRole = "OWNER",
  currentUserName = "Sales",
  onCreated,
}: PoCreateDialogProps) {
  const visible = isOpen ?? open ?? false;
  return (
    <Dialog
      isOpen={visible}
      onClose={onClose}
      size="wide"
      hideTitle={true}
      title="Buat Purchase Order Baru"
    >
      {visible ? (
        <PoCreateDialogBody
          customers={customers}
          products={products}
          currentRole={currentRole}
          currentUserName={currentUserName}
          onClose={onClose}
          onCreated={onCreated}
        />
      ) : null}
    </Dialog>
  );
}

interface PoCreateDialogBodyProps {
  customers: Partner[];
  products: Product[];
  currentRole: string;
  currentUserName: string;
  onClose: () => void;
  onCreated: (newPo: PurchaseOrderRecord, message?: string) => void;
}

function PoCreateDialogBody({
  customers,
  products,
  currentRole,
  currentUserName,
  onClose,
  onCreated,
}: PoCreateDialogBodyProps) {
  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement | null>(null);

  // Form State: Detail pelanggan baru (muncul saat nama tidak terdaftar)
  const [newCustomerOwnerName, setNewCustomerOwnerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");

  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Auto PO Number (Otomatis dibuat oleh sistem)
  const [autoPoNumber] = useState(() => {
    const yyyymm = new Date().toISOString().slice(0, 7).replace("-", "");
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `PO-${yyyymm}-${rand}`;
  });
  const [poNotes, setPoNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  // Lines State - Mendukung Pesanan Bebas maupun Produk Katalog
  const [lines, setLines] = useState<PoLineDraft[]>(() => [
    {
      id: "line-1",
      productId: "",
      productName: "",
      sku: "",
      searchQuery: "",
      orderedQty: 1,
      orderedUnit: "PCS",
      unitPrice: 0,
    },
  ]);

  // Active Dropdown state for product lines
  const [activeProductDropdownLineId, setActiveProductDropdownLineId] = useState<string | null>(null);

  // Selected Customer lookup
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  // Dianggap pelanggan baru jika nama diketik tapi tidak cocok dengan pelanggan terdaftar
  const isNewCustomer = !selectedCustomerId && customerSearchQuery.trim().length > 0;

  // Filtered Customers for search combobox
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.ownerName && c.ownerName.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q))
    );
  }, [customers, customerSearchQuery]);

  // Click outside listener for customer dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCustomerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Click outside listener for product dropdown (tutup saat user klik di luar / tidak aktif)
  const activeProductDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        activeProductDropdownRef.current &&
        !activeProductDropdownRef.current.contains(event.target as Node)
      ) {
        setActiveProductDropdownLineId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Total Kuantitas per Satuan (Lusin & PCS) serta Kuantitas Fisik
  const { totalLusin, totalPcs, totalPhysicalPcs, quantitySummary, totalItems } = useMemo(() => {
    let lusin = 0;
    let pcs = 0;
    let physicalTotal = 0;

    for (const line of lines) {
      const qty = Number(line.orderedQty) || 0;
      if (line.orderedUnit === "Lusin") {
        lusin += qty;
        physicalTotal += qty * 12;
      } else {
        pcs += qty;
        physicalTotal += qty;
      }
    }

    const parts: string[] = [];
    if (lusin > 0) parts.push(`${lusin} Lusin`);
    if (pcs > 0) parts.push(`${pcs} PCS`);
    if (parts.length === 0) parts.push("0 PCS");

    return {
      totalLusin: lusin,
      totalPcs: pcs,
      totalPhysicalPcs: physicalTotal,
      quantitySummary: parts.join(" & "),
      totalItems: lines.length,
    };
  }, [lines]);

  // Add Item Line
  const handleAddLine = () => {
    const newLineId = `line-${Date.now()}`;
    setLines((prev) => [
      ...prev,
      {
        id: newLineId,
        productId: "",
        productName: "",
        sku: "",
        searchQuery: "",
        orderedQty: 1,
        orderedUnit: "PCS",
        unitPrice: 0,
      },
    ]);
    setActiveProductDropdownLineId(newLineId);
  };

  // Remove Item Line
  const handleRemoveLine = (id: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  // Update Line Field
  const updateLine = (id: string, updates: Partial<PoLineDraft>) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
    );
  };

  // Select Product from Catalog
  const handleSelectCatalogProduct = (lineId: string, product: Product) => {
    updateLine(lineId, {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      searchQuery: product.name,
      orderedUnit: product.unit === "Lusin" ? "Lusin" : "PCS",
    });
    setActiveProductDropdownLineId(null);
  };

  // Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isPending || isSubmitting) return;
    setErrorMessage(null);

    const trimmedCustomerQuery = customerSearchQuery.trim();
    if (!selectedCustomerId && !trimmedCustomerQuery) {
      setErrorMessage("Silakan pilih pelanggan atau ketik nama pelanggan baru terlebih dahulu.");
      return;
    }
    if (!selectedCustomerId && newCustomerEmail.trim() && !newCustomerEmail.trim().includes("@")) {
      setErrorMessage("Format email pelanggan baru tidak valid.");
      return;
    }

    if (lines.length === 0) {
      setErrorMessage("Minimal satu item pesanan harus dimasukkan.");
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const itemName = (l.searchQuery || l.productName || "").trim();
      if (!itemName && !l.productId) {
        setErrorMessage(`Item #${i + 1}: Nama barang pesanan wajib diisi.`);
        return;
      }
      if (l.orderedQty === "" || (Number(l.orderedQty) || 0) <= 0) {
        setErrorMessage(`Item #${i + 1}: Jumlah pesanan wajib diisi lebih besar dari 0.`);
        return;
      }
    }

    // Lock immediately to prevent double click before transition settles
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const finalPoNumber = autoPoNumber;

    startTransition(async () => {
      try {
        const payloadLines = lines.map((l) => {
          const factor = l.orderedUnit === "Lusin" ? 12 : 1;
          const targetQty = (Number(l.orderedQty) || 1) * factor;
          const officialProduct = l.productId ? products.find((p) => p.id === l.productId) : null;
          const rawName = (l.searchQuery || l.productName || "").trim();
          return {
            productId: l.productId || undefined,
            rawProductName: rawName || (officialProduct ? officialProduct.name : "Item Pesanan"),
            orderedQty: Number(l.orderedQty) || 1,
            orderedUnit: l.orderedUnit,
            targetQty,
            unitPrice: 0,
          };
        });

        const res = await createPurchaseOrderAction({
          customerId: selectedCustomerId || undefined,
          newCustomerName: !selectedCustomerId && trimmedCustomerQuery ? trimmedCustomerQuery : undefined,
          newCustomerOwnerName: !selectedCustomerId && trimmedCustomerQuery ? newCustomerOwnerName.trim() || undefined : undefined,
          newCustomerPhone: !selectedCustomerId && trimmedCustomerQuery ? newCustomerPhone.trim() || undefined : undefined,
          newCustomerEmail: !selectedCustomerId && trimmedCustomerQuery ? newCustomerEmail.trim() || undefined : undefined,
          newCustomerAddress: !selectedCustomerId && trimmedCustomerQuery ? newCustomerAddress.trim() || undefined : undefined,
          poNumber: finalPoNumber,
          orderDate,
          notes: poNotes.trim() || undefined,
          salesPic: currentUserName,
          lines: payloadLines,
        });

        if (!res.success || !res.po) {
          setErrorMessage(res.error || "Gagal membuat Purchase Order.");
          isSubmittingRef.current = false;
          setIsSubmitting(false);
          return;
        }

        const statusLabel = res.po.status === "PENDING_APPROVAL" ? "Menunggu Persetujuan Owner" : "Terkonfirmasi";
        const msg = `Purchase Order ${res.po.poNumber} berhasil dibuat dengan PIC Sales ${res.po.salesPic || currentUserName} (Status: ${statusLabel}).`;
        onCreated(res.po, msg);
        onClose();
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan pesanan.");
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    });
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100dvh-64px)] max-lg:max-h-none max-lg:h-dvh overflow-hidden">
      {/* ==================================================================== */}
      {/* HEADER MODAL (FIXED)                                                 */}
      {/* ==================================================================== */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-border-default px-6 py-4 bg-surface-card max-lg:px-4 max-lg:py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary-soft text-primary shrink-0">
            <DocumentIcon size={16} />
          </span>
          <h2 className="text-base font-bold text-text-primary max-sm:text-sm truncate">
            Buat Purchase Order Baru
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors cursor-pointer shrink-0"
          aria-label="Tutup modal"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* ==================================================================== */}
      {/* BODY MODAL (SINGLE UNIFIED SCROLL CONTAINER)                        */}
      {/* ==================================================================== */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 max-lg:p-3 space-y-5 max-lg:space-y-3">
        <form id="po-create-form" onSubmit={handleSubmit} noValidate className="space-y-5 max-lg:space-y-3">
          {errorMessage && (
            <Alert
              variant="danger"
              title="Periksa Formulir Pesanan"
              description={errorMessage}
            />
          )}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* BENTO GRID ROW 1: PELANGGAN & INFORMASI PESANAN                    */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-lg:gap-3">
            {/* Card A: Pelanggan (Searchable Autocomplete) */}
            <div className="rounded-xl border border-border-default bg-surface-card p-4 max-lg:p-3 space-y-3 max-lg:space-y-2.5 flex flex-col">
              <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary-soft text-primary">
                    <UsersIcon size={14} />
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                    Pelanggan
                  </h3>
                </div>
              </div>

              {/* Input Pencarian / Ketik Pelanggan Bebas / Pelanggan Baru */}
              <div
                ref={customerDropdownRef}
                className="relative space-y-1"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setIsCustomerDropdownOpen(false);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <label htmlFor="po-customer-search" className="text-xs font-medium text-text-secondary">
                    Nama Toko Pelanggan <span className="text-danger">*</span>
                  </label>
                  {selectedCustomer ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 font-medium">
                      Terdaftar: {selectedCustomer.code}
                    </span>
                  ) : customerSearchQuery.trim() ? (
                    <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-muted text-text-secondary border border-border-default">
                      Pelanggan Baru
                    </span>
                  ) : null}
                </div>

                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                    <SearchIcon size={14} />
                  </span>
                  <input
                    id="po-customer-search"
                    type="text"
                    className="w-full pl-9 pr-8 py-2 text-xs border border-border-default rounded-md bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    placeholder="Ketik nama pelanggan baru atau cari pelanggan yang sudah ada..."
                    value={customerSearchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomerSearchQuery(val);
                      const q = val.trim().toLowerCase();
                      const exact = customers.find((c) => c.name.toLowerCase() === q);
                      if (exact) {
                        setSelectedCustomerId(exact.id);
                      } else {
                        setSelectedCustomerId("");
                      }
                      if (q.length > 0) {
                        setIsCustomerDropdownOpen(true);
                      } else {
                        setIsCustomerDropdownOpen(false);
                      }
                    }}
                    onFocus={() => {
                      if (filteredCustomers.length > 0) {
                        setIsCustomerDropdownOpen(true);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setIsCustomerDropdownOpen(false);
                      }
                    }}
                  />
                  {customerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerSearchQuery("");
                        setSelectedCustomerId("");
                        setIsCustomerDropdownOpen(false);
                        setNewCustomerOwnerName("");
                        setNewCustomerPhone("");
                        setNewCustomerEmail("");
                        setNewCustomerAddress("");
                      }}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-text-muted hover:text-text-primary cursor-pointer"
                      title="Hapus"
                    >
                      <CloseIcon size={14} />
                    </button>
                  )}
                </div>

                {/* Dropdown Pelanggan: hanya muncul jika ada yang cocok di database */}
                {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border-default bg-surface shadow-lg py-1 divide-y divide-border-subtle">
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-muted flex items-center justify-between">
                      <span>Pelanggan Terdaftar ({filteredCustomers.length})</span>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setIsCustomerDropdownOpen(false);
                        }}
                        className="text-text-muted hover:text-text-primary text-[10px] cursor-pointer"
                      >
                        Tutup
                      </button>
                    </div>
                    {filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`w-full px-3 py-2 text-left hover:bg-surface-muted transition-colors flex flex-col gap-0.5 cursor-pointer ${
                          selectedCustomerId === c.id ? "bg-primary-soft/50 font-medium" : ""
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedCustomerId(c.id);
                          setCustomerSearchQuery(c.name);
                          setIsCustomerDropdownOpen(false);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-text-primary">{c.name}</span>
                          <span className="text-[10px] font-mono text-text-muted bg-surface-muted px-1.5 py-0.5 rounded border border-border-default">
                            {c.code}
                          </span>
                        </div>
                        <div className="text-[11px] text-text-secondary flex flex-wrap gap-x-2">
                          {c.ownerName && <span>Pemilik: {c.ownerName}</span>}
                          {c.phone && <span>Telp: {c.phone}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Info profil ringkas jika pelanggan terdaftar dipilih */}
                {selectedCustomer && (
                  <div className="mt-2 p-2 rounded-md bg-surface-subtle border border-border-default text-[11px] text-text-muted space-y-0.5">
                    {selectedCustomer.ownerName && (
                      <div>Pemilik: <span className="text-text-secondary">{selectedCustomer.ownerName}</span></div>
                    )}
                    {selectedCustomer.phone && (
                      <div>Telepon: <span className="text-text-secondary font-mono">{selectedCustomer.phone}</span></div>
                    )}
                    {selectedCustomer.address && (
                      <div>Alamat: <span className="text-text-secondary">{selectedCustomer.address}</span></div>
                    )}
                  </div>
                )}

                {/* Form detail pelanggan baru: muncul langsung saat nama tidak terdaftar */}
                {isNewCustomer && (
                  <div className="mt-2 p-3 rounded-lg border border-primary/30 bg-primary-soft/40 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-1 pb-1.5 border-b border-border-subtle">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-text-primary">
                        Data Pelanggan Baru
                      </span>
                      <span className="text-[10px] text-text-muted">
                        Tersimpan otomatis saat PO dibuat
                      </span>
                    </div>

                    <div className="text-[11px] text-text-secondary">
                      Nama Toko:{" "}
                      <strong className="text-text-primary">{customerSearchQuery.trim()}</strong>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField id="po-new-cust-owner" label="Nama Pemilik Toko" hint="Opsional">
                        <Input
                          id="po-new-cust-owner"
                          value={newCustomerOwnerName}
                          onChange={(e) => setNewCustomerOwnerName(e.target.value)}
                          placeholder="Nama pemilik (opsional)"
                        />
                      </FormField>
                      <FormField id="po-new-cust-phone" label="Telepon">
                        <Input
                          id="po-new-cust-phone"
                          value={newCustomerPhone}
                          onChange={(e) => setNewCustomerPhone(e.target.value)}
                          placeholder="0812-xxxx-xxxx"
                        />
                      </FormField>
                      <FormField id="po-new-cust-email" label="Email">
                        <Input
                          id="po-new-cust-email"
                          type="email"
                          value={newCustomerEmail}
                          onChange={(e) => setNewCustomerEmail(e.target.value)}
                          placeholder="kontak@perusahaan.com"
                        />
                      </FormField>
                      <FormField id="po-new-cust-pic" label="PIC Sales" hint="Otomatis dari pembuat PO">
                        <Input
                          id="po-new-cust-pic"
                          value={currentUserName}
                          disabled
                          readOnly
                          className="bg-surface-muted text-text-secondary cursor-not-allowed"
                        />
                      </FormField>
                      <div className="sm:col-span-2">
                        <FormField id="po-new-cust-address" label="Alamat">
                          <Input
                            id="po-new-cust-address"
                            value={newCustomerAddress}
                            onChange={(e) => setNewCustomerAddress(e.target.value)}
                            placeholder="Jalan, kota, kode pos..."
                          />
                        </FormField>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Card B: Informasi Pesanan & PIC Sales */}
            <div className="rounded-xl border border-border-default bg-surface-card p-4 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary-soft text-primary">
                      <DocumentIcon size={14} />
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                      Informasi Pesanan
                    </h3>
                  </div>
                  <div className="text-[11px] text-text-muted">
                    PIC: <strong className="text-text-primary">{currentUserName}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <FormField id="po-date" label="Tanggal Pesanan" isRequired>
                    <Input
                      id="po-date"
                      type="date"
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      required
                    />
                  </FormField>

                  <FormField id="po-custom-number" label="Nomor PO (Otomatis)">
                    <Input
                      id="po-custom-number"
                      value={autoPoNumber}
                      disabled
                      readOnly
                      className="font-mono text-xs uppercase cursor-not-allowed bg-surface-muted text-text-secondary"
                    />
                  </FormField>
                </div>
              </div>

              <div className="p-2 rounded-md bg-surface-muted border border-border-subtle text-[11px] text-text-muted flex items-center justify-between">
                <span>Konversi:</span>
                <span className="font-medium text-text-secondary">
                  1 Lusin = 12 PCS
                </span>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* BENTO GRID ROW 2: DAFTAR PRODUK / ITEM PESANAN (EXPANSIVE)         */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border-default bg-surface-card p-4 max-lg:p-3 space-y-4 max-lg:space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                  Produk / Item yang Dipesan
                </h3>
                <span className="shrink-0 whitespace-nowrap text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-surface-muted text-text-secondary border border-border-default">
                  {lines.length} Item
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddLine}
                className="shrink-0 whitespace-nowrap text-xs h-7 px-2.5 inline-flex items-center gap-1.5"
              >
                <PlusIcon size={13} />
                <span>Tambah Item</span>
              </Button>
            </div>

            {/* List of Item Lines */}
            <div className="space-y-3 max-lg:space-y-2.5">
              {lines.map((line, idx) => {
                const multiplier = line.orderedUnit === "Lusin" ? 12 : 1;
                const physicalPcs = (Number(line.orderedQty) || 0) * multiplier;

                // Filter produk resmi katalog Master Produk
                const query = line.searchQuery.trim().toLowerCase();
                const filteredProducts = products.filter(
                  (p) =>
                    !query ||
                    p.name.toLowerCase().includes(query) ||
                    p.sku.toLowerCase().includes(query)
                );

                const isLinked = Boolean(line.productId);
                const linkedProduct = isLinked ? products.find((p) => p.id === line.productId) : null;

                return (
                  <div
                    key={line.id}
                    className="p-3.5 max-lg:p-2.5 rounded-xl border border-border-default bg-surface-subtle space-y-3 max-lg:space-y-2 transition-colors hover:border-border-strong"
                  >
                    {/* Item Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text-primary">
                          Item #{idx + 1}
                        </span>
                        {isLinked ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                            <CheckCircleIcon size={12} />
                            <span>Master: {linkedProduct?.sku || line.sku || "SKU"}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-text-secondary bg-surface-muted px-2 py-0.5 rounded border border-border-default font-medium">
                            Item Pesanan Bebas
                          </span>
                        )}
                      </div>

                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.id)}
                          className="text-xs text-danger hover:opacity-80 p-1 rounded hover:bg-danger/10 transition-colors cursor-pointer flex items-center gap-1"
                          title="Hapus baris item"
                        >
                          <TrashIcon size={14} />
                          <span className="text-[11px]">Hapus</span>
                        </button>
                      )}
                    </div>

                    {/* Desktop & Mobile Responsive Field Layout */}
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-2.5 md:gap-3 items-start">
                      {/* Unified Product Combobox (Takes full width on mobile, 7 cols on desktop) */}
                      <div className="col-span-2 md:col-span-7 relative">
                        <label
                          htmlFor={`po-line-prod-${line.id}`}
                          className="block text-xs font-medium text-text-secondary mb-1"
                        >
                          Nama Barang / Produk Pesanan <span className="text-danger">*</span>
                        </label>
                        <div
                          ref={activeProductDropdownLineId === line.id ? activeProductDropdownRef : undefined}
                          className="relative"
                          onBlur={(e) => {
                            // Tutup dropdown jika fokus berpindah keluar dari kontainer input & dropdown
                            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                              setActiveProductDropdownLineId(null);
                            }
                          }}
                        >
                          <input
                            id={`po-line-prod-${line.id}`}
                            type="text"
                            placeholder="Ketik nama barang pesanan atau cari Master Produk..."
                            value={line.searchQuery}
                            onChange={(e) => {
                              const val = e.target.value;
                              const isMatchCurrent = line.productId && val === line.productName;
                              updateLine(line.id, {
                                searchQuery: val,
                                productId: isMatchCurrent ? line.productId : "",
                                productName: isMatchCurrent ? line.productName : val,
                                sku: isMatchCurrent ? line.sku : "",
                              });
                              setActiveProductDropdownLineId(line.id);
                            }}
                            onFocus={() => {
                              setActiveProductDropdownLineId(line.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setActiveProductDropdownLineId(null);
                              }
                            }}
                            className="w-full text-xs border rounded-md bg-surface px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary border-border-default"
                            required
                          />
                          {line.searchQuery && (
                            <button
                              type="button"
                              onClick={() => {
                                updateLine(line.id, {
                                  searchQuery: "",
                                  productId: "",
                                  productName: "",
                                  sku: "",
                                });
                                setActiveProductDropdownLineId(line.id);
                              }}
                              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-text-muted hover:text-text-primary cursor-pointer"
                              title="Hapus dan ketik ulang"
                            >
                              <CloseIcon size={14} />
                            </button>
                          )}

                          {/* Dropdown Hasil Pencarian Katalog Resmi - Hanya muncul jika ada produk Master Produk yang cocok */}
                          {activeProductDropdownLineId === line.id && filteredProducts.length > 0 && (
                            <div className="absolute z-30 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border-default bg-surface shadow-lg py-1 divide-y divide-border-subtle">
                              <div className="px-3 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-muted flex items-center justify-between">
                                <span>Master Produk ({filteredProducts.length})</span>
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setActiveProductDropdownLineId(null);
                                  }}
                                  className="text-text-muted hover:text-text-primary text-[10px] cursor-pointer"
                                >
                                  Tutup
                                </button>
                              </div>

                              {filteredProducts.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  className={`w-full px-3 py-2 text-left hover:bg-surface-muted transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                                    line.productId === p.id ? "bg-primary-soft/50 font-medium" : ""
                                  }`}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSelectCatalogProduct(line.id, p);
                                  }}
                                >
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium text-text-primary truncate">
                                      {p.name}
                                    </div>
                                    <div className="text-[10px] text-text-muted mt-0.5 flex items-center gap-2">
                                      <span>Stok: {p.stock} {p.unit}</span>
                                      {p.category && <span>• {p.category}</span>}
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-muted border border-border-default text-text-secondary shrink-0">
                                    {p.sku}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Jumlah Pesanan (Takes 1 col on mobile, 2 cols on desktop) */}
                      <div className="col-span-1 md:col-span-2">
                        <label
                          htmlFor={`po-line-qty-${line.id}`}
                          className="block text-xs font-medium text-text-secondary mb-1"
                        >
                          Jumlah <span className="text-danger">*</span>
                        </label>
                        <input
                          id={`po-line-qty-${line.id}`}
                          type="number"
                          min="1"
                          value={line.orderedQty}
                          onChange={(e) =>
                            updateLine(line.id, {
                              orderedQty: e.target.value,
                            })
                          }
                          className="w-full text-xs border border-border-default rounded-md bg-surface px-3 py-2 text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                          required
                        />
                      </div>

                      {/* Satuan Pesanan (Takes 1 col on mobile, 3 cols on desktop) */}
                      <div className="col-span-1 md:col-span-3">
                        <label
                          htmlFor={`po-line-unit-${line.id}`}
                          className="block text-xs font-medium text-text-secondary mb-1"
                        >
                          Satuan <span className="text-danger">*</span>
                        </label>
                        <select
                          id={`po-line-unit-${line.id}`}
                          value={line.orderedUnit}
                          onChange={(e) =>
                            updateLine(line.id, {
                              orderedUnit: e.target.value as "PCS" | "Lusin",
                            })
                          }
                          className="w-full text-xs border border-border-default rounded-md bg-surface px-2.5 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                        >
                          <option value="PCS">PCS</option>
                          <option value="Lusin">Lusin (12 pcs)</option>
                        </select>
                      </div>
                    </div>

                    {/* Ringkasan Konversi jika Lusin */}
                    {line.orderedUnit === "Lusin" && (
                      <div className="flex items-center justify-between text-[11px] text-text-muted bg-surface-card px-3 py-1.5 rounded-md border border-border-default">
                        <span>Konversi Fisik:</span>
                        <span className="font-mono font-semibold text-text-primary">
                          {physicalPcs} PCS ({Number(line.orderedQty) || 0} Lusin &times; 12)
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddLine}
              disabled={isPending}
              className="w-full text-xs h-7 px-2.5 flex items-center justify-center gap-1.5"
            >
              <PlusIcon size={13} />
              <span>Tambah Item</span>
            </Button>
          </div>

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* BENTO GRID ROW 3: CATATAN TAMBAHAN (MEMANJANG WIDE)               */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border-default bg-surface-card p-4 max-lg:p-3 space-y-2">
            <label htmlFor="po-notes" className="text-xs font-bold uppercase tracking-wider text-text-primary block">
              Catatan (Opsional)
            </label>
            <textarea
              id="po-notes"
              rows={2}
              placeholder="Catatan pesanan atau instruksi pengiriman..."
              value={poNotes}
              onChange={(e) => setPoNotes(e.target.value)}
              className="w-full text-xs border border-border-default rounded-md bg-surface px-3 py-2 text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
        </form>
      </div>

      {/* ==================================================================== */}
      {/* FOOTER MODAL (FIXED AT BOTTOM WITH TOTAL QUANTITY & ACTIONS)        */}
      {/* ==================================================================== */}
      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-border-default px-6 py-3.5 bg-surface-card max-lg:flex-col max-lg:items-stretch max-lg:gap-2 max-lg:px-4 max-lg:py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted font-medium">Total Kuantitas Pesanan:</span>
            <span className="font-mono text-base sm:text-lg font-bold text-primary inline-flex items-center justify-center text-center">
              {quantitySummary}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 max-lg:grid max-lg:grid-cols-2 max-lg:w-full">
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || isSubmitting}
            onClick={onClose}
            className="max-lg:w-full"
          >
            Batal
          </Button>
          <Button
            type="submit"
            form="po-create-form"
            variant="primary"
            loading={isPending || isSubmitting}
            loadingLabel="Menyimpan Pesanan..."
            disabled={isPending || isSubmitting}
            className="max-lg:w-full"
          >
            Simpan Purchase Order
          </Button>
        </div>
      </div>
    </div>
  );
}
