"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import type {
  CommercialDocumentDetailRecord,
  DocumentEditOptions,
} from "@/lib/db/repositories/inventory-repository";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { FormField, Input, Select } from "@/components/ui/form-fields";
import {
  CloseIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
  DocumentIcon,
  ClipboardIcon,
  WarningIcon,
  CheckCircleIcon,
  PencilIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@/components/ui/icons";
import {
  updateCommercialDocumentAction,
  updateCustomerAction,
} from "@/lib/inventory/actions";
import {
  calculateDocumentTotals,
  type DocumentLineDiscountType,
} from "@/lib/inventory/document-calc";

export interface DocumentEditDialogProps {
  open: boolean;
  onClose: () => void;
  document: CommercialDocumentDetailRecord;
  options: DocumentEditOptions;
  onSaved: (document: CommercialDocumentDetailRecord) => void;
}

interface LineDraft {
  key: string;
  id?: string;
  productId: string;
  productName?: string;
  isCustomProduct?: boolean;
  quantity: string;
  unit: "PCS" | "Lusin";
  unitPrice: string;
  discountType: DocumentLineDiscountType;
  discountValue: string;
  note: string;
}

interface FormDraft {
  customerId: string;
  documentDate: string;
  dueDate: string;
  notes: string;
  defaultUnit: "PCS" | "Lusin";
  docNominalDiscount: string;
  docPercentageDiscount: string;
  // Diskon Toko
  hasShopDiscount: boolean;
  shopDiscountNote: string;
  shopDiscountType: "NOMINAL" | "PERCENTAGE";
  shopDiscountValue: string;
  // Cashback Poin
  hasCashback: boolean;
  cashbackType: "PERCENTAGE" | "NOMINAL";
  cashbackValue: string;
  lines: LineDraft[];
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(amount: number): string {
  return new Intl.NumberFormat("id-ID").format(amount);
}

function toNumber(value: string): number {
  if (value.trim() === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

const DOCUMENT_TYPE_LABEL: Record<CommercialDocumentDetailRecord["documentType"], string> = {
  INVOICE: "Invoice (Faktur Tagihan)",
  SAMPLE: "Surat Sampel (Barang Contoh Non-Komersial)",
  RECEIPT: "Kuitansi Resmi",
  SURAT_JALAN: "Surat Jalan (Logistik)",
};

const STATUS_LABEL: Record<CommercialDocumentDetailRecord["status"], string> = {
  DRAFT: "Draft",
  ISSUED: "Diterbitkan",
  PARTIALLY_PAID: "Dibayar Sebagian",
  PAID: "Lunas",
  CANCELLED: "Dibatalkan",
};

export function DocumentEditDialog({
  open,
  onClose,
  document,
  options,
  onSaved,
}: DocumentEditDialogProps) {
  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      size="wide"
      hideTitle={true}
      title={`Edit Dokumen: ${document.documentNumber}`}
    >
      {/* Dirender hanya saat open agar seluruh state form kembali ke data tersimpan setiap dibuka. */}
      {open ? (
        <EditBody document={document} options={options} onClose={onClose} onSaved={onSaved} />
      ) : null}
    </Dialog>
  );
}

function EditBody({
  document: doc,
  options,
  onClose,
  onSaved,
}: Omit<DocumentEditDialogProps, "open">) {
  const keyCounter = useRef(0);
  const nextKey = () => {
    keyCounter.current += 1;
    return `new-line-${keyCounter.current}`;
  };

  const isNonFinancial = doc.documentType === "SAMPLE" || doc.documentType === "SURAT_JALAN";

  const initial = useMemo<FormDraft>(
    () => ({
      customerId: doc.customerId,
      documentDate: doc.documentDate.slice(0, 10),
      dueDate: doc.dueDate ? doc.dueDate.slice(0, 10) : doc.documentDate.slice(0, 10),
      notes: doc.notes ?? "",
      defaultUnit: "PCS",
      docNominalDiscount: doc.docNominalDiscount ? String(doc.docNominalDiscount) : "",
      docPercentageDiscount: doc.docPercentageDiscount ? String(doc.docPercentageDiscount) : "",
      hasShopDiscount: Boolean(doc.shopDiscountNote || (doc.docNominalDiscount && doc.docNominalDiscount > 0) || (doc.docPercentageDiscount && doc.docPercentageDiscount > 0)),
      shopDiscountNote: doc.shopDiscountNote || "",
      shopDiscountType: doc.docPercentageDiscount > 0 ? "PERCENTAGE" : "NOMINAL",
      shopDiscountValue: doc.docPercentageDiscount > 0 ? String(doc.docPercentageDiscount) : (doc.docNominalDiscount ? String(doc.docNominalDiscount) : ""),
      hasCashback: Boolean(doc.cashbackType && doc.cashbackType !== "NONE" && (doc.cashbackValue ?? 0) > 0),
      cashbackType: doc.cashbackType === "NOMINAL" ? "NOMINAL" : "PERCENTAGE",
      cashbackValue: doc.cashbackValue ? String(doc.cashbackValue) : "2",
      lines: doc.lines.map((l) => ({
        key: l.id,
        id: l.id,
        productId: l.productId || "",
        productName: l.productName || l.descriptionSnapshot || "",
        isCustomProduct: !l.productId,
        quantity: String(l.quantity),
        unit: (l.unit === "Lusin" ? "Lusin" : "PCS") as "PCS" | "Lusin",
        unitPrice: String(l.unitPrice),
        discountType: l.discountType,
        discountValue: l.discountValue ? String(l.discountValue) : "",
        note:
          l.descriptionSnapshot && l.descriptionSnapshot !== l.productName
            ? l.descriptionSnapshot
            : "",
      })),
    }),
    [doc]
  );
  const initialJson = useMemo(() => JSON.stringify(initial), [initial]);

  const [draft, setDraft] = useState<FormDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Mode Ganti Pelanggan
  const [isChangingCustomer, setIsChangingCustomer] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const customerDropdownRef = useRef<HTMLDivElement | null>(null);

  const isDirty = JSON.stringify(draft) !== initialJson;

  const requestClose = () => {
    if (isPending) return;
    if (isDirty && !window.confirm("Perubahan belum disimpan. Tutup tanpa menyimpan?")) {
      return;
    }
    onClose();
  };

  // Local list pelanggan agar update profil langsung terefleksi di modal
  const [customerList, setCustomerList] = useState(options.customers);
  React.useEffect(() => {
    setCustomerList(options.customers);
  }, [options.customers]);

  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [customerFeedback, setCustomerFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [editCustomerDraft, setEditCustomerDraft] = useState({
    name: "",
    ownerName: "",
    picSales: "",
    phone: "",
    email: "",
    address: "",
  });
  const [isCustDetailOpenMobile, setIsCustDetailOpenMobile] = useState(false);

  const customerById = useMemo(
    () => new Map(customerList.map((c) => [c.id, c])),
    [customerList]
  );

  const selectedCustomer = useMemo(
    () => customerById.get(draft.customerId),
    [customerById, draft.customerId]
  );

  const handleSaveCustomer = async () => {
    if (!selectedCustomer || !editCustomerDraft.name.trim()) return;
    setIsSavingCustomer(true);
    setCustomerFeedback(null);
    try {
      const res = await updateCustomerAction(selectedCustomer.id, {
        name: editCustomerDraft.name.trim(),
        ownerName: editCustomerDraft.ownerName.trim() || undefined,
        picSales: editCustomerDraft.picSales.trim() || undefined,
        phone: editCustomerDraft.phone.trim() || undefined,
        email: editCustomerDraft.email.trim() || undefined,
        address: editCustomerDraft.address.trim() || undefined,
      });
      if (!res.success || !res.customer) {
        setCustomerFeedback({ type: "error", message: res.error || "Gagal memperbarui data pelanggan." });
        return;
      }
      setCustomerList((prev) =>
        prev.map((c) =>
          c.id === selectedCustomer.id
            ? {
                ...c,
                name: res.customer.name,
                ownerName: res.customer.ownerName ?? undefined,
                picSales: res.customer.picSales ?? undefined,
                phone: res.customer.phone ?? null,
                email: res.customer.email ?? null,
                address: res.customer.address ?? null,
              }
            : c
        )
      );
      setIsEditingCustomer(false);
      setCustomerFeedback({ type: "success", message: "Data pelanggan berhasil diperbarui." });
      setTimeout(() => setCustomerFeedback(null), 3500);
    } catch (err) {
      setCustomerFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan pelanggan.",
      });
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return customerList;
    return customerList.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.ownerName && c.ownerName.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        c.code.toLowerCase().includes(q)
    );
  }, [customerList, customerSearchQuery]);

  const productById = useMemo(
    () => new Map(options.products.map((p) => [p.id, p])),
    [options.products]
  );

  const patch = (changes: Partial<FormDraft>) => setDraft((prev) => ({ ...prev, ...changes }));
  const patchLine = (key: string, changes: Partial<LineDraft>) =>
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.key === key ? { ...l, ...changes } : l)),
    }));

  const isLineComplete = (line: LineDraft) => {
    const hasProduct = isNonFinancial
      ? Boolean(line.productId || line.productName?.trim())
      : Boolean(line.productId);
    return hasProduct && Number(line.quantity) > 0;
  };

  const canAddLine = draft.lines.length === 0 || draft.lines.every(isLineComplete);

  const addLine = () => {
    if (!canAddLine) return;
    setDraft((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          key: nextKey(),
          productId: options.products[0]?.id || "",
          productName: options.products[0]?.name || "",
          isCustomProduct: false,
          quantity: "1",
          unit: prev.defaultUnit || "PCS",
          unitPrice: "0",
          discountType: "NONE",
          discountValue: "",
          note: "",
        },
      ],
    }));
  };

  const removeLine = (key: string) =>
    setDraft((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.key !== key) }));

  // Kalkulasi Diskon & Total Dokumen LOCKED
  const parsed = useMemo(() => {
    const lines = draft.lines.map((l) => ({
      quantity: toNumber(l.quantity),
      unitPrice: isNonFinancial ? 0 : toNumber(l.unitPrice),
      discountType: isNonFinancial ? ("NONE" as DocumentLineDiscountType) : l.discountType,
      discountValue: isNonFinancial || l.discountType === "NONE" ? 0 : toNumber(l.discountValue),
    }));

    let docNominal = 0;
    let docPct = 0;
    if (!isNonFinancial) {
      if (draft.hasShopDiscount) {
        if (draft.shopDiscountType === "NOMINAL") {
          docNominal = toNumber(draft.shopDiscountValue);
        } else {
          docPct = Math.min(100, Math.max(0, toNumber(draft.shopDiscountValue)));
        }
      } else {
        docNominal = toNumber(draft.docNominalDiscount);
        docPct = toNumber(draft.docPercentageDiscount);
      }
    }

    const hasNaN =
      Number.isNaN(docNominal) ||
      Number.isNaN(docPct) ||
      lines.some((l) => [l.quantity, l.unitPrice, l.discountValue].some(Number.isNaN));
    if (hasNaN) return null;

    const totals = calculateDocumentTotals({
      lines,
      docNominalDiscount: docNominal,
      docPercentageDiscount: docPct,
      pointsRedeemed: isNonFinancial ? 0 : doc.pointsRedeemed,
    });

    // Estimasi Cashback Poin
    let estimatedCashbackPoints = 0;
    if (!isNonFinancial && draft.hasCashback) {
      const cbVal = toNumber(draft.cashbackValue);
      if (!Number.isNaN(cbVal) && cbVal > 0) {
        if (draft.cashbackType === "PERCENTAGE") {
          estimatedCashbackPoints = Math.round((totals.totalAmount * cbVal) / 100);
        } else {
          estimatedCashbackPoints = Math.round(cbVal);
        }
      }
    }

    return {
      docNominal,
      docPct,
      totals,
      estimatedCashbackPoints,
    };
  }, [draft, doc.pointsRedeemed, isNonFinancial]);

  const totalAmount = isNonFinancial ? 0 : (parsed?.totals.totalAmount ?? 0);
  const belowPaid = !isNonFinancial && parsed !== null && totalAmount < doc.paidAmount;
  const projectedStatus: CommercialDocumentDetailRecord["status"] =
    !isNonFinancial && doc.paidAmount > 0 && parsed
      ? doc.paidAmount >= totalAmount
        ? "PAID"
        : "PARTIALLY_PAID"
      : doc.status;

  const validate = (): string | null => {
    if (!draft.customerId) return "Pelanggan wajib dipilih.";
    if (!draft.documentDate) return "Tanggal dokumen wajib diisi.";
    if (!isNonFinancial && !draft.dueDate) return "Jatuh tempo wajib diisi.";
    if (!isNonFinancial && draft.dueDate && draft.dueDate < draft.documentDate) {
      return "Jatuh tempo tidak boleh lebih awal dari tanggal dokumen.";
    }
    if (draft.lines.length === 0) return "Dokumen harus memiliki minimal satu item.";
    if (!parsed) return "Terdapat isian angka yang tidak valid.";

    for (let i = 0; i < draft.lines.length; i += 1) {
      const l = draft.lines[i];
      const n = i + 1;
      if (doc.documentType === "SAMPLE") {
        const hasProdName = Boolean(l.productId || l.productName?.trim());
        if (!hasProdName) return `Item ${n}: nama produk sampel wajib diisi atau dipilih.`;
        if (!(toNumber(l.quantity) > 0)) return `Item ${n}: kuantitas sampel harus lebih besar dari 0.`;
      } else {
        if (!l.productId) return `Item ${n}: produk wajib dipilih.`;
        if (!(toNumber(l.quantity) > 0)) return `Item ${n}: jumlah harus lebih besar dari 0.`;
      }

      if (!isNonFinancial) {
        if (toNumber(l.unitPrice) < 0) return `Item ${n}: harga satuan tidak valid.`;
        if (l.discountType === "PERCENTAGE" && toNumber(l.discountValue) > 100) {
          return `Item ${n}: diskon persentase maksimal 100.`;
        }
        if (
          l.discountType === "NOMINAL" &&
          toNumber(l.discountValue) > Math.round(toNumber(l.quantity) * toNumber(l.unitPrice))
        ) {
          return `Item ${n}: diskon nominal melebihi nilai item.`;
        }
        if (toNumber(l.discountValue) < 0) return `Item ${n}: nilai diskon tidak valid.`;
      }
    }

    if (!isNonFinancial) {
      if (parsed.docNominal < 0) return "Diskon nominal tidak valid.";
      if (parsed.docPct < 0 || parsed.docPct > 100) {
        return "Diskon persentase harus 0 sampai 100.";
      }
      if (totalAmount <= 0) return "Total akhir dokumen harus lebih besar dari 0.";
      if (belowPaid) {
        return `Total akhir tidak boleh lebih kecil dari jumlah yang sudah dibayar (${formatRupiah(doc.paidAmount)}).`;
      }
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    startTransition(async () => {
      const res = await updateCommercialDocumentAction({
        documentId: doc.id,
        customerId: draft.customerId,
        documentDate: draft.documentDate,
        dueDate: isNonFinancial ? draft.documentDate : draft.dueDate,
        notes: draft.notes.trim() || null,
        docNominalDiscount: parsed ? parsed.docNominal : 0,
        docPercentageDiscount: parsed ? parsed.docPct : 0,
        shopDiscountNote: !isNonFinancial && draft.hasShopDiscount && draft.shopDiscountNote.trim() ? draft.shopDiscountNote.trim() : null,
        shopDiscountType: !isNonFinancial && draft.hasShopDiscount ? draft.shopDiscountType : undefined,
        shopDiscountValue: !isNonFinancial && draft.hasShopDiscount ? toNumber(draft.shopDiscountValue) : 0,
        cashbackType: !isNonFinancial && draft.hasCashback ? draft.cashbackType : "NONE",
        cashbackValue: !isNonFinancial && draft.hasCashback ? toNumber(draft.cashbackValue) : 0,
        cashbackAmount: !isNonFinancial && draft.hasCashback ? parsed?.estimatedCashbackPoints : 0,
        pointsRedeemed: isNonFinancial ? 0 : doc.pointsRedeemed,
        lines: draft.lines.map((l) => {
          const p = options.products.find((prod) => prod.id === l.productId);
          return {
            id: l.id,
            productId: l.productId || undefined,
            productName: l.productName?.trim() || p?.name || (l.productId ? "Produk" : "Produk Sampel"),
            unit: l.unit || "PCS",
            quantity: toNumber(l.quantity),
            unitPrice: isNonFinancial ? 0 : toNumber(l.unitPrice),
            discountType: isNonFinancial ? ("NONE" as DocumentLineDiscountType) : l.discountType,
            discountValue: isNonFinancial || l.discountType === "NONE" ? 0 : toNumber(l.discountValue),
            note: l.note.trim() || null,
          };
        }),
      });

      if (!res.success) {
        setError(res.error);
        return;
      }
      onSaved(res.document);
      onClose();
    });
  };

  // Keyboard navigation & Enter prevention
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter") {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA") {
        return;
      }

      e.preventDefault();

      const lineRow = target.closest("[data-line-row]");
      if (lineRow) {
        const lineKey = lineRow.getAttribute("data-line-key");
        const currentLine = draft.lines.find((l) => l.key === lineKey);
        const isCurrentLineFilled = Boolean(currentLine?.productId) && Number(currentLine?.quantity) > 0;
        const allLinesFilled = draft.lines.every((l) => Boolean(l.productId) && Number(l.quantity) > 0);

        if (isCurrentLineFilled && allLinesFilled) {
          addLine();
          setTimeout(() => {
            const nextIdx = draft.lines.length + 1;
            const nextProdSelect = document.getElementById(`edit-line-${nextIdx}-product`);
            nextProdSelect?.focus();
          }, 60);
        } else {
          if (!currentLine?.productId) {
            const prodInput = lineRow.querySelector<HTMLSelectElement>('select[id^="edit-line-"]');
            prodInput?.focus();
          } else if (!currentLine.quantity || Number(currentLine.quantity) <= 0) {
            const qtyInput = lineRow.querySelector<HTMLInputElement>('input[id*="-qty"]');
            qtyInput?.focus();
          }
        }
        return;
      }

      const firstProductSelect = document.getElementById("edit-line-1-product");
      if (firstProductSelect) {
        firstProductSelect.focus();
      }
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100dvh-64px)] max-lg:max-h-none max-lg:h-dvh overflow-hidden">
      {/* Header Modal (Fixed) */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-border-default px-6 py-4 bg-surface-card max-lg:px-4 max-lg:py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-bold text-text-primary max-sm:text-sm truncate">
            Edit Dokumen
          </h2>
          <span className="text-xs font-mono font-bold bg-primary-soft text-primary px-2 py-0.5 rounded border border-primary/20 shrink-0">
            {doc.documentNumber}
          </span>
          <p className="text-xs text-text-secondary max-lg:hidden">
            Perbarui data pelanggan, tanggal, catatan, diskon, dan item dokumen dengan aman.
          </p>
        </div>
        <button
          type="button"
          onClick={requestClose}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors cursor-pointer shrink-0"
          aria-label="Tutup form edit"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Body Modal (Scrollable) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <form
          id="doc-edit-form"
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          noValidate
          className="space-y-6"
        >
          {error && <Alert variant="danger" title="Periksa Kembali Formulir" description={error} />}

          {belowPaid && (
            <Alert
              variant="danger"
              title="Perubahan Dibatasi: Pembayaran Telah Diterima"
              description={`Dokumen telah memiliki pembayaran sebesar ${formatRupiah(doc.paidAmount)}. Total akhir tagihan tidak boleh lebih kecil dari jumlah yang sudah dibayar.`}
            />
          )}

          {/* ── BENTO CARD LAYOUT (Pelanggan & Tipe Dokumen berdampingan di atas, Catatan panjang di bawah) ── */}
          <div className="doc-modal__bento grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Card A: Bento Pelanggan */}
            <div
              className="doc-modal__bento-card doc-modal__bento-card--customer rounded-xl border border-border-default bg-surface-card p-4 space-y-3.5 flex flex-col"
              ref={customerDropdownRef}
            >
              <div className="doc-modal__bento-card-head flex items-center justify-between pb-2 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <span className="doc-modal__bento-card-icon inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary-soft text-primary">
                    <UsersIcon size={14} />
                  </span>
                  <h3 className="doc-modal__bento-card-title text-xs font-bold uppercase tracking-wider text-text-primary">
                    Pelanggan
                  </h3>
                </div>
                {isChangingCustomer ? (
                  <button
                    type="button"
                    onClick={() => setIsChangingCustomer(false)}
                    className="text-xs font-medium text-text-muted hover:text-text-primary hover:underline cursor-pointer"
                  >
                    Batal Ganti
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingCustomer(true);
                      setCustomerSearchQuery("");
                    }}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Ganti Pelanggan
                  </button>
                )}
              </div>

              {isChangingCustomer ? (
                /* Mode Pemilihan / Ganti Pelanggan */
                <div className="space-y-3">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                      <SearchIcon size={14} />
                    </span>
                    <input
                      type="text"
                      className="w-full pl-9 pr-8 py-2 text-xs border border-border-default rounded-md bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                      placeholder="Cari nama toko, pemilik, telepon, atau kode..."
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      autoFocus
                    />
                    {customerSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setCustomerSearchQuery("")}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-text-muted hover:text-text-primary"
                      >
                        <CloseIcon size={14} />
                      </button>
                    )}
                  </div>

                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border-default bg-surface divide-y divide-border-subtle shadow-inner">
                    {filteredCustomers.length > 0 ? (
                      filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`w-full px-3 py-2 text-left hover:bg-surface-muted transition-colors flex flex-col gap-0.5 cursor-pointer ${
                            c.id === draft.customerId ? "bg-primary-soft/40" : ""
                          }`}
                          onClick={() => {
                            patch({ customerId: c.id });
                            setIsChangingCustomer(false);
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-text-primary">{c.name}</span>
                            <span className="text-[10px] font-mono text-text-muted">{c.code}</span>
                          </div>
                          <div className="text-[11px] text-text-secondary flex flex-wrap gap-x-2">
                            {c.ownerName && <span>Pemilik: {c.ownerName}</span>}
                            {c.phone && <span>Telp: {c.phone}</span>}
                            {c.availablePoints ? (
                              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                                {formatNumber(c.availablePoints)} Poin
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-3 text-center text-xs text-text-muted">
                        Pelanggan &ldquo;{customerSearchQuery}&rdquo; tidak ditemukan.
                      </div>
                    )}
                  </div>
                </div>
              ) : selectedCustomer ? (
                /* Profil Pelanggan Terpilih */
                <div className="doc-modal__selected-customer-wrap space-y-3">
                  {/* Baris aksi di pojok kanan bawah garis header card */}
                  <div className="flex items-center justify-between pb-0.5">
                    <span className="text-[11px] text-text-muted">
                      {isEditingCustomer ? "Perbarui informasi profil pelanggan:" : "Data Toko & Kontak Pelanggan"}
                    </span>
                    {!isEditingCustomer ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingCustomer(true);
                          setCustomerFeedback(null);
                          setEditCustomerDraft({
                            name: selectedCustomer.name,
                            ownerName: selectedCustomer.ownerName || doc.customerOwnerName || "",
                            picSales: selectedCustomer.picSales || doc.customerPicSales || "",
                            phone: selectedCustomer.phone || doc.customerPhone || "",
                            email: selectedCustomer.email || doc.customerEmail || "",
                            address: selectedCustomer.address || doc.customerAddress || "",
                          });
                        }}
                        className="doc-modal__edit-contact-btn inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline cursor-pointer py-0.5"
                      >
                        <PencilIcon size={12} />
                        <span>Edit Pelanggan</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setIsEditingCustomer(false);
                            setCustomerFeedback(null);
                          }}
                          disabled={isSavingCustomer}
                        >
                          Batal
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={handleSaveCustomer}
                          disabled={isSavingCustomer || !editCustomerDraft.name.trim()}
                          loading={isSavingCustomer}
                          loadingLabel="Menyimpan..."
                        >
                          Simpan Pelanggan
                        </Button>
                      </div>
                    )}
                  </div>

                  {customerFeedback && (
                    <div
                      className={`text-xs px-2.5 py-1.5 rounded-md border ${
                        customerFeedback.type === "success"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
                          : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800"
                      }`}
                    >
                      {customerFeedback.message}
                    </div>
                  )}

                  {!isEditingCustomer ? (
                    <>
                      {/* Desktop View (>= 1024px): 6 Field Input Readonly Bertingkat */}
                      <div className="hidden lg:block space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-text-secondary">
                              Nama Toko <span className="text-primary font-bold">*</span>
                            </label>
                            <input
                              type="text"
                              className="w-full text-xs font-semibold bg-surface-muted border border-border-default rounded-md px-3 py-2 text-text-primary cursor-not-allowed font-mono"
                              value={selectedCustomer.name}
                              disabled
                              readOnly
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-text-secondary">
                              Nama Lengkap Pemilik
                            </label>
                            <input
                              type="text"
                              className="w-full text-xs bg-surface-muted border border-border-default rounded-md px-3 py-2 text-text-primary cursor-not-allowed"
                              value={selectedCustomer.ownerName || doc.customerOwnerName || "—"}
                              disabled
                              readOnly
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-text-secondary">PIC Sales</label>
                            <input
                              type="text"
                              className="w-full text-xs bg-surface-muted border border-border-default rounded-md px-3 py-2 text-text-primary cursor-not-allowed"
                              value={selectedCustomer.picSales || doc.customerPicSales || "—"}
                              disabled
                              readOnly
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-text-secondary">Telepon</label>
                            <input
                              type="text"
                              className="w-full text-xs bg-surface-muted border border-border-default rounded-md px-3 py-2 text-text-primary cursor-not-allowed"
                              value={selectedCustomer.phone || doc.customerPhone || "—"}
                              disabled
                              readOnly
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-text-secondary">Email</label>
                            <input
                              type="text"
                              className="w-full text-xs bg-surface-muted border border-border-default rounded-md px-3 py-2 text-text-primary cursor-not-allowed truncate"
                              value={selectedCustomer.email || doc.customerEmail || "—"}
                              disabled
                              readOnly
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-text-secondary">Alamat</label>
                          <input
                            type="text"
                            className="w-full text-xs bg-surface-muted border border-border-default rounded-md px-3 py-2 text-text-primary cursor-not-allowed"
                            value={selectedCustomer.address || doc.customerAddress || "—"}
                            disabled
                            readOnly
                          />
                        </div>
                      </div>

                      {/* Mobile & Tablet Portrait View (< 1024px): Kartu Ringkas Padat */}
                      <div className="lg:hidden space-y-2">
                        <div className="rounded-lg border border-border-default bg-surface p-2.5 space-y-2">
                          {/* Baris 1: Nama Toko + Kode + Tombol Ganti */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-text-primary font-mono truncate">
                                  {selectedCustomer.name}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-muted text-text-secondary border border-border-default">
                                  {selectedCustomer.code}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-secondary flex-wrap">
                                {(selectedCustomer.ownerName || doc.customerOwnerName) && (
                                  <span>Pemilik: <strong className="text-text-primary">{selectedCustomer.ownerName || doc.customerOwnerName}</strong></span>
                                )}
                                {(selectedCustomer.phone || doc.customerPhone) && (
                                  <span>Telp: <strong className="text-text-primary font-mono">{selectedCustomer.phone || doc.customerPhone}</strong></span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditingCustomer(true);
                                  setCustomerFeedback(null);
                                  setEditCustomerDraft({
                                    name: selectedCustomer.name,
                                    ownerName: selectedCustomer.ownerName || doc.customerOwnerName || "",
                                    picSales: selectedCustomer.picSales || doc.customerPicSales || "",
                                    phone: selectedCustomer.phone || doc.customerPhone || "",
                                    email: selectedCustomer.email || doc.customerEmail || "",
                                    address: selectedCustomer.address || doc.customerAddress || "",
                                  });
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-secondary hover:text-primary px-2 py-1 rounded border border-border-default hover:bg-surface-muted transition-colors cursor-pointer"
                                title="Edit Profil Pelanggan"
                              >
                                <PencilIcon size={11} />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsChangingCustomer(true);
                                  setCustomerSearchQuery("");
                                }}
                                className="text-[11px] font-semibold text-primary px-2 py-1 rounded border border-primary/30 hover:bg-primary-soft transition-colors cursor-pointer"
                              >
                                Ganti
                              </button>
                            </div>
                          </div>

                          {/* Baris 2: Saldo Poin & Toggle Detail Alamat/PIC */}
                          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border-subtle text-[11px]">
                            {selectedCustomer.availablePoints ? (
                              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                                Saldo Poin: <strong className="font-mono">{formatNumber(selectedCustomer.availablePoints)}</strong>
                              </span>
                            ) : (
                              <span className="text-text-muted">
                                Poin: <span className="font-mono">0</span>
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => setIsCustDetailOpenMobile((prev) => !prev)}
                              className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary cursor-pointer font-medium"
                            >
                              <span>{isCustDetailOpenMobile ? "Sembunyikan Detail" : "Lihat Alamat & PIC"}</span>
                              {isCustDetailOpenMobile ? (
                                <ChevronUpIcon size={12} />
                              ) : (
                                <ChevronDownIcon size={12} />
                              )}
                            </button>
                          </div>

                          {/* Expandable Section: Alamat, Email, PIC Sales */}
                          {isCustDetailOpenMobile && (
                            <div className="pt-2 border-t border-border-subtle text-[11px] text-text-secondary space-y-1 bg-surface-muted/50 -mx-2.5 -mb-2.5 p-2.5 rounded-b-lg">
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-text-muted shrink-0">PIC Sales:</span>
                                <span className="text-text-primary font-medium text-right truncate">
                                  {selectedCustomer.picSales || doc.customerPicSales || "—"}
                                </span>
                              </div>
                              {(selectedCustomer.email || doc.customerEmail) && (
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-text-muted shrink-0">Email:</span>
                                  <span className="text-text-primary text-right truncate">{selectedCustomer.email || doc.customerEmail}</span>
                                </div>
                              )}
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-text-muted shrink-0">Alamat:</span>
                                <span className="text-text-primary text-right">{selectedCustomer.address || doc.customerAddress || "—"}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-text-secondary">
                            Nama Toko <span className="text-primary font-bold">*</span>
                          </label>
                          <input
                            type="text"
                            className="w-full text-xs font-semibold bg-surface border border-border-default rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono"
                            value={editCustomerDraft.name}
                            onChange={(e) =>
                              setEditCustomerDraft((prev) => ({ ...prev, name: e.target.value }))
                            }
                            placeholder="Nama toko pelanggan"
                            required
                            autoFocus
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-text-secondary">
                            Nama Lengkap Pemilik
                          </label>
                          <input
                            type="text"
                            className="w-full text-xs bg-surface border border-border-default rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            value={editCustomerDraft.ownerName}
                            onChange={(e) =>
                              setEditCustomerDraft((prev) => ({ ...prev, ownerName: e.target.value }))
                            }
                            placeholder="Nama pemilik (opsional)"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-text-secondary">PIC Sales</label>
                          <input
                            type="text"
                            className="w-full text-xs font-medium bg-surface border border-border-default rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            value={editCustomerDraft.picSales}
                            onChange={(e) =>
                              setEditCustomerDraft((prev) => ({ ...prev, picSales: e.target.value }))
                            }
                            placeholder="Nama PIC sales (opsional)"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-text-secondary">Telepon</label>
                          <input
                            type="text"
                            className="w-full text-xs bg-surface border border-border-default rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            value={editCustomerDraft.phone}
                            onChange={(e) =>
                              setEditCustomerDraft((prev) => ({ ...prev, phone: e.target.value }))
                            }
                            placeholder="0812xxxx (opsional)"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-text-secondary">Email</label>
                          <input
                            type="email"
                            className="w-full text-xs bg-surface border border-border-default rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary truncate"
                            value={editCustomerDraft.email}
                            onChange={(e) =>
                              setEditCustomerDraft((prev) => ({ ...prev, email: e.target.value }))
                            }
                            placeholder="nama@toko.com (opsional)"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-text-secondary">Alamat</label>
                        <input
                          type="text"
                          className="w-full text-xs bg-surface border border-border-default rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                          value={editCustomerDraft.address}
                          onChange={(e) =>
                            setEditCustomerDraft((prev) => ({ ...prev, address: e.target.value }))
                          }
                          placeholder="Alamat lengkap (opsional)"
                        />
                      </div>
                    </>
                  )}

                  {/* Badge Saldo Poin Pelanggan Terpilih */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-surface-muted border border-border-subtle text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span className="text-text-secondary">Saldo Poin Pelanggan:</span>
                      <strong className="font-mono text-emerald-700 dark:text-emerald-400">
                        {formatNumber(selectedCustomer.availablePoints ?? doc.customerAvailablePoints ?? 0)} Poin
                      </strong>
                    </div>
                    {(selectedCustomer.pendingPoints ?? doc.customerPendingPoints ?? 0) > 0 && (
                      <span className="text-[11px] text-text-muted">
                        ({formatNumber(selectedCustomer.pendingPoints ?? doc.customerPendingPoints ?? 0)} poin pending)
                      </span>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Card B: Bento Tipe Dokumen */}
            <div className="doc-modal__bento-card doc-modal__bento-card--doc rounded-xl border border-border-default bg-surface-card p-4 space-y-3.5 flex flex-col">
              <div className="doc-modal__bento-card-head flex items-center justify-between pb-2 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <span className="doc-modal__bento-card-icon inline-flex items-center justify-center w-6 h-6 rounded-md bg-info-surface text-info">
                    <DocumentIcon size={14} />
                  </span>
                  <h3 className="doc-modal__bento-card-title text-xs font-bold uppercase tracking-wider text-text-primary">
                    Detail Dokumen
                  </h3>
                </div>
                <span className="text-[10px] font-mono font-bold text-text-muted bg-surface-muted px-2 py-0.5 rounded border border-border-subtle">
                  {doc.documentNumber}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField id="edit-doc-type" label="Tipe Dokumen">
                  <Input
                    id="edit-doc-type"
                    value={DOCUMENT_TYPE_LABEL[doc.documentType]}
                    disabled
                    readOnly
                    className="text-xs bg-surface-muted cursor-not-allowed font-medium"
                  />
                </FormField>

                <FormField id="edit-doc-date" label="Tanggal Dokumen" isRequired>
                  <Input
                    id="edit-doc-date"
                    type="date"
                    value={draft.documentDate}
                    onChange={(e) => !isNonFinancial && patch({ documentDate: e.target.value })}
                    disabled={isNonFinancial}
                    readOnly={isNonFinancial}
                    className={isNonFinancial ? "text-xs bg-surface-muted cursor-not-allowed font-mono" : ""}
                    required
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField id="edit-doc-number" label="Nomor Dokumen">
                  <Input
                    id="edit-doc-number"
                    value={doc.documentNumber}
                    disabled
                    readOnly
                    className="font-mono text-xs bg-surface-muted cursor-not-allowed font-semibold"
                  />
                </FormField>

                <FormField id="edit-payment-status" label="Status Dokumen">
                  <Input
                    id="edit-payment-status"
                    value={isNonFinancial ? "Bebas Biaya (Non-Komersial)" : STATUS_LABEL[projectedStatus]}
                    disabled
                    readOnly
                    className="text-xs bg-surface-muted cursor-not-allowed font-semibold"
                  />
                </FormField>
              </div>

              {!isNonFinancial ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField id="edit-due-date" label="Jatuh Tempo" isRequired>
                    <Input
                      id="edit-due-date"
                      type="date"
                      value={draft.dueDate}
                      min={draft.documentDate || undefined}
                      onChange={(e) => patch({ dueDate: e.target.value })}
                      required
                    />
                  </FormField>

                  <FormField id="edit-doc-paid" label="Sudah Dibayar">
                    <Input
                      id="edit-doc-paid"
                      value={formatRupiah(doc.paidAmount)}
                      disabled
                      readOnly
                      className="font-mono text-xs bg-surface-muted cursor-not-allowed font-semibold text-text-primary"
                    />
                  </FormField>
                </div>
              ) : (
                <div className="p-2.5 rounded bg-surface-muted border border-border-subtle text-[11px] text-text-muted">
                  {doc.documentType === "SAMPLE"
                    ? "Surat Sampel tidak membebankan tagihan finansial atau jatuh tempo pembayaran."
                    : "Surat Jalan adalah dokumen logistik tanpa jatuh tempo pembayaran."}
                </div>
              )}

              {doc.poNumber && (
                <div className="text-[11px] text-text-muted p-2 rounded bg-surface-muted border border-border-subtle flex items-center justify-between">
                  <span>Referensi Purchase Order:</span>
                  <span className="font-mono font-bold text-text-primary">{doc.poNumber}</span>
                </div>
              )}
            </div>

            {/* Card C: Bento Catatan (Panjang ke samping di bawah Pelanggan & Tipe Dokumen) */}
            <div className="doc-modal__bento-card doc-modal__bento-card--notes lg:col-span-2 rounded-xl border border-border-default bg-surface-card p-4 space-y-2 flex flex-col">
              <div className="doc-modal__bento-card-head flex items-center gap-2 pb-2 border-b border-border-subtle">
                <span className="doc-modal__bento-card-icon inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <ClipboardIcon size={14} />
                </span>
                <h3 className="doc-modal__bento-card-title text-xs font-bold uppercase tracking-wider text-text-primary">
                  Catatan
                </h3>
              </div>
              <textarea
                id="edit-doc-notes"
                className="w-full min-h-[64px] text-xs border border-border-default rounded-md p-2.5 bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-y"
                placeholder="Instruksi pengiriman, rekening bank, atau catatan khusus lainnya..."
                value={draft.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </div>
          </div>

          {/* ── SECTION ITEM BARIS PRODUK ── */}
          <section
            aria-labelledby="edit-lines-title"
            className="rounded-xl border border-border-default bg-surface-card p-4 space-y-4"
          >
            <div className="flex flex-col gap-2.5 pb-2 border-b border-border-subtle sm:flex-row sm:items-center sm:justify-between sm:gap-0">
              <div>
                <h3
                  id="edit-lines-title"
                  className="text-xs font-bold uppercase tracking-wider text-text-muted"
                >
                  {doc.documentType === "SAMPLE"
                    ? `Rincian Item Surat Sampel (${draft.lines.length} Item)`
                    : `Rincian Item Dokumen (${draft.lines.length} Baris)`}
                </h3>
                <p className="text-[11px] text-text-secondary">
                  {doc.documentType === "SAMPLE"
                    ? "Perbarui nama produk sampel, kuantitas, dan satuan (PCS/Lusin)."
                    : "Perbarui produk, kuantitas, satuan, harga satuan, dan diskon per item."}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Switcher Satuan Default */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-text-muted text-[11px] font-medium">Default Satuan Baru:</span>
                  <div className="inline-flex rounded-md border border-border-default p-0.5 bg-surface-muted">
                    <button
                      type="button"
                      onClick={() => patch({ defaultUnit: "PCS" })}
                      className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                        draft.defaultUnit === "PCS"
                          ? "bg-surface text-text-primary shadow-xs"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      PCS
                    </button>
                    <button
                      type="button"
                      onClick={() => patch({ defaultUnit: "Lusin" })}
                      className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                        draft.defaultUnit === "Lusin"
                          ? "bg-surface text-text-primary shadow-xs"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      Lusin
                    </button>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addLine}
                  disabled={!canAddLine}
                  title={!canAddLine ? "Harap lengkapi produk dan kuantitas baris saat ini sebelum menambah baris baru" : undefined}
                  className={`hidden sm:inline-flex ${!canAddLine ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Tambah Baris
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {draft.lines.map((line, idx) => {
                const n = idx + 1;
                const prod = productById.get(line.productId);
                const qNum = toNumber(line.quantity);
                const pNum = isNonFinancial ? 0 : toNumber(line.unitPrice);
                const gross = Math.max(0, qNum * pNum);
                let lineTotal = gross;
                if (!isNonFinancial && line.discountType === "PERCENTAGE") {
                  const pct = Math.min(100, Math.max(0, toNumber(line.discountValue)));
                  lineTotal = Math.round(gross * (1 - pct / 100));
                } else if (!isNonFinancial && line.discountType === "NOMINAL") {
                  const disc = Math.max(0, toNumber(line.discountValue));
                  lineTotal = Math.max(0, gross - disc);
                }

                return (
                  <div
                    key={line.key}
                    data-line-row
                    data-line-key={line.key}
                    className="p-3 rounded-lg border border-border-default bg-surface space-y-3 transition-colors hover:border-border-strong"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-text-muted">Item #{n}</span>
                      {draft.lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="inline-flex min-h-9 items-center px-2 -my-1 rounded-md text-xs font-semibold text-danger hover:bg-danger/10 hover:underline cursor-pointer"
                        >
                          Hapus
                        </button>
                      )}
                    </div>

                    {doc.documentType === "SAMPLE" ? (
                      /* KHUSUS EDIT SURAT SAMPEL: Non-komersial, produk bebas/katalog, Qty, Satuan */
                      <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5 md:gap-3">
                        <div className="col-span-2 sm:col-span-6">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-medium text-text-secondary">
                              Nama Produk Sampel <span className="text-danger">*</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const nextCustom = !line.isCustomProduct;
                                patchLine(line.key, {
                                  isCustomProduct: nextCustom,
                                  productId: nextCustom ? "" : (options.products[0]?.id || ""),
                                  productName: nextCustom ? (line.productName || "") : (options.products[0]?.name || ""),
                                });
                              }}
                              className="inline-flex min-h-9 items-center text-[11px] font-medium text-primary hover:underline cursor-pointer"
                            >
                              {line.isCustomProduct ? "← Pilih dari Katalog" : "+ Ketik Nama Bebas"}
                            </button>
                          </div>
                          {line.isCustomProduct ? (
                            <Input
                              id={`edit-line-${n}-custom-prod`}
                              placeholder="Nama produk sampel bebas..."
                              value={line.productName || ""}
                              onChange={(e) => patchLine(line.key, { productName: e.target.value })}
                              className="text-xs min-h-11 md:min-h-10"
                              required
                            />
                          ) : (
                            <Select
                              id={`edit-line-${n}-product`}
                              value={line.productId}
                              onChange={(e) => {
                                const selectedId = e.target.value;
                                const p = options.products.find((prod) => prod.id === selectedId);
                                patchLine(line.key, {
                                  productId: selectedId,
                                  productName: p?.name || "",
                                });
                              }}
                              className="text-xs min-h-11 md:min-h-10"
                            >
                              <option value="">Pilih produk...</option>
                              {options.products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.sku})
                                </option>
                              ))}
                            </Select>
                          )}
                        </div>

                        <div className="col-span-1 sm:col-span-3">
                          <FormField id={`edit-line-${n}-qty`} label="Kuantitas Sampel" isRequired>
                            <Input
                              id={`edit-line-${n}-qty`}
                              type="number"
                              min="1"
                              step="1"
                              inputMode="numeric"
                              value={line.quantity}
                              onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                              className="font-mono text-xs min-h-11 md:min-h-10"
                              required
                            />
                          </FormField>
                        </div>

                        <div className="col-span-1 sm:col-span-3">
                          <FormField id={`edit-line-${n}-unit`} label="Satuan" isRequired>
                            <Select
                              id={`edit-line-${n}-unit`}
                              value={line.unit || "PCS"}
                              onChange={(e) => patchLine(line.key, { unit: e.target.value as "PCS" | "Lusin" })}
                              className="text-xs min-h-11 md:min-h-10 font-medium"
                            >
                              <option value="PCS">PCS</option>
                              <option value="Lusin">Lusin (12 Pcs)</option>
                            </Select>
                          </FormField>
                        </div>
                      </div>
                    ) : (
                      /* FORMULIR EDIT INVOICE DENGAN SWITCHER PCS/LUSIN */
                      <div className="grid grid-cols-2 md:grid-cols-12 gap-2.5 md:gap-3">
                        <div className="col-span-2 md:col-span-4">
                          <FormField id={`edit-line-${n}-product`} label="Pilih Produk" isRequired>
                            <Select
                              id={`edit-line-${n}-product`}
                              value={line.productId}
                              onChange={(e) => {
                                const selectedId = e.target.value;
                                const p = options.products.find((prod) => prod.id === selectedId);
                                patchLine(line.key, {
                                  productId: selectedId,
                                  productName: p?.name || "",
                                });
                              }}
                              className="min-h-11 md:min-h-10"
                            >
                              <option value="">Pilih produk...</option>
                              {options.products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.sku})
                                </option>
                              ))}
                            </Select>
                          </FormField>
                        </div>

                        <div className="col-span-1 md:col-span-2">
                          <FormField id={`edit-line-${n}-qty`} label="Qty" isRequired>
                            <Input
                              id={`edit-line-${n}-qty`}
                              type="number"
                              min="1"
                              step="1"
                              inputMode="numeric"
                              value={line.quantity}
                              onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                              className="font-mono text-xs min-h-11 md:min-h-10"
                              required
                            />
                          </FormField>
                        </div>

                        <div className="col-span-1 md:col-span-2">
                          <FormField id={`edit-line-${n}-unit`} label="Satuan" isRequired>
                            <Select
                              id={`edit-line-${n}-unit`}
                              value={line.unit || "PCS"}
                              onChange={(e) => patchLine(line.key, { unit: e.target.value as "PCS" | "Lusin" })}
                              className="text-xs font-medium min-h-11 md:min-h-10"
                            >
                              <option value="PCS">PCS</option>
                              <option value="Lusin">Lusin</option>
                            </Select>
                          </FormField>
                        </div>

                        {!isNonFinancial ? (
                          <>
                            <div className="col-span-2 md:col-span-2">
                              <FormField id={`edit-line-${n}-price`} label={`Harga/${line.unit || "PCS"}`} isRequired>
                                <Input
                                  id={`edit-line-${n}-price`}
                                  type="number"
                                  min="0"
                                  step="1000"
                                  inputMode="numeric"
                                  value={line.unitPrice}
                                  onChange={(e) => patchLine(line.key, { unitPrice: e.target.value })}
                                  className="font-mono text-xs min-h-11 md:min-h-10"
                                  required
                                />
                              </FormField>
                            </div>

                            <div className="col-span-2 md:col-span-2">
                              <FormField id={`edit-line-${n}-disc-type`} label="Diskon Item">
                                <div className="grid grid-cols-2 gap-1.5">
                                  <Select
                                    id={`edit-line-${n}-disc-type`}
                                    value={line.discountType}
                                    onChange={(e) =>
                                      patchLine(line.key, {
                                        discountType: e.target.value as DocumentLineDiscountType,
                                        discountValue: e.target.value === "NONE" ? "" : line.discountValue,
                                      })
                                    }
                                    className="text-[11px] px-1 min-h-11 md:min-h-10"
                                  >
                                    <option value="NONE">-</option>
                                    <option value="PERCENTAGE">%</option>
                                    <option value="NOMINAL">Rp</option>
                                  </Select>
                                  <Input
                                    id={`edit-line-${n}-disc-val`}
                                    type="number"
                                    min="0"
                                    max={line.discountType === "PERCENTAGE" ? "100" : undefined}
                                    inputMode="numeric"
                                    placeholder={line.discountType === "PERCENTAGE" ? "%" : "Rp"}
                                    value={line.discountType === "NONE" ? "" : line.discountValue}
                                    onChange={(e) => patchLine(line.key, { discountValue: e.target.value })}
                                    disabled={line.discountType === "NONE"}
                                    className="font-mono text-xs px-1 min-h-11 md:min-h-10"
                                  />
                                </div>
                              </FormField>
                            </div>
                          </>
                        ) : null}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between pt-2 border-t border-border-subtle gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-1 min-w-0 max-w-md">
                        <Input
                          placeholder="Catatan per item (opsional)..."
                          value={line.note}
                          onChange={(e) => patchLine(line.key, { note: e.target.value })}
                          className="text-xs h-11 md:h-7"
                        />
                      </div>
                      {!isNonFinancial && (
                        <div className="font-mono font-bold text-text-primary">
                          Total Baris: {formatRupiah(lineTotal)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={addLine}
              disabled={!canAddLine}
              title={!canAddLine ? "Harap lengkapi produk dan kuantitas baris saat ini sebelum menambah baris baru" : undefined}
              className="w-full"
            >
              <PlusIcon className="h-4 w-4" />
              Tambah Baris
            </Button>
          </section>

          {/* ── SECTION DISKON TOKO & REWARD CASHBACK / BANNER NON-FINANSIAL ── */}
          {!isNonFinancial ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Kartu Diskon Toko */}
              <div className="rounded-xl border border-border-default bg-surface-card p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[11px]">
                      %
                    </span>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                      Diskon Toko (Potongan Tambahan)
                    </h4>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      className="rounded border-border-default text-primary focus:ring-primary"
                      checked={draft.hasShopDiscount}
                      onChange={(e) => patch({ hasShopDiscount: e.target.checked })}
                    />
                    <span>Aktifkan</span>
                  </label>
                </div>

                {draft.hasShopDiscount ? (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField id="edit-shop-discount-type" label="Jenis Diskon Toko">
                        <Select
                          id="edit-shop-discount-type"
                          value={draft.shopDiscountType}
                          onChange={(e) =>
                            patch({
                              shopDiscountType: e.target.value as "NOMINAL" | "PERCENTAGE",
                            })
                          }
                        >
                          <option value="NOMINAL">Nominal Tunai (Rp)</option>
                          <option value="PERCENTAGE">Persentase (%)</option>
                        </Select>
                      </FormField>

                      <FormField
                        id="edit-shop-discount-val"
                        label={draft.shopDiscountType === "PERCENTAGE" ? "Nilai Diskon (%)" : "Nominal Potongan (Rp)"}
                        isRequired
                      >
                        <Input
                          id="edit-shop-discount-val"
                          type="number"
                          min="0"
                          max={draft.shopDiscountType === "PERCENTAGE" ? "100" : undefined}
                          step={draft.shopDiscountType === "PERCENTAGE" ? "0.5" : "1000"}
                          placeholder={draft.shopDiscountType === "PERCENTAGE" ? "10" : "50000"}
                          value={draft.shopDiscountValue}
                          onChange={(e) => patch({ shopDiscountValue: e.target.value })}
                          className="font-mono text-xs"
                        />
                      </FormField>
                    </div>

                    <FormField id="edit-shop-discount-note" label="Keterangan / Alasan Diskon Toko">
                      <Input
                        id="edit-shop-discount-note"
                        placeholder="Misal: Promo Akhir Tahun, Diskon Loyalitas..."
                        value={draft.shopDiscountNote}
                        onChange={(e) => patch({ shopDiscountNote: e.target.value })}
                        className="text-xs"
                      />
                    </FormField>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted py-2">
                    Aktifkan jika ingin memberikan potongan harga tambahan di tingkat dokumen faktur.
                  </p>
                )}
              </div>

              {/* Kartu Cashback Reward Poin */}
              <div className="rounded-xl border border-border-default bg-surface-card p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                      ★
                    </span>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                      Cashback Reward Poin
                    </h4>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      className="rounded border-border-default text-primary focus:ring-primary"
                      checked={draft.hasCashback}
                      onChange={(e) => patch({ hasCashback: e.target.checked })}
                    />
                    <span>Aktifkan</span>
                  </label>
                </div>

                {draft.hasCashback ? (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField id="edit-cashback-type" label="Tipe Perhitungan">
                        <Select
                          id="edit-cashback-type"
                          value={draft.cashbackType}
                          onChange={(e) =>
                            patch({
                              cashbackType: e.target.value as "PERCENTAGE" | "NOMINAL",
                            })
                          }
                        >
                          <option value="PERCENTAGE">Persentase (%) dari Total</option>
                          <option value="NOMINAL">Poin Tetap (Nominal)</option>
                        </Select>
                      </FormField>

                      <FormField
                        id="edit-cashback-val"
                        label={draft.cashbackType === "PERCENTAGE" ? "Cashback (%)" : "Jumlah Poin"}
                        isRequired
                      >
                        <Input
                          id="edit-cashback-val"
                          type="number"
                          min="0"
                          step={draft.cashbackType === "PERCENTAGE" ? "0.5" : "10"}
                          placeholder={draft.cashbackType === "PERCENTAGE" ? "2" : "500"}
                          value={draft.cashbackValue}
                          onChange={(e) => patch({ cashbackValue: e.target.value })}
                          className="font-mono text-xs"
                        />
                      </FormField>
                    </div>

                    <div className="p-2.5 rounded-lg bg-surface-muted border border-border-subtle text-xs space-y-1">
                      <div className="flex justify-between items-center text-text-primary font-semibold">
                        <span>Estimasi Poin Diperoleh:</span>
                        <span className="font-mono text-emerald-700 dark:text-emerald-400">
                          +{formatNumber(parsed?.estimatedCashbackPoints ?? 0)} Poin
                        </span>
                      </div>
                      <p className="text-[10px] text-text-muted">
                        Poin akan tercatat pada buku besar pelanggan saat dokumen diperbarui.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted py-2">
                    Berikan cashback poin reward kepada pelanggan untuk transaksi ini.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-border-default bg-surface-subtle/50 text-xs text-text-secondary">
              <span className="font-bold text-text-primary block mb-1">
                {doc.documentType === "SAMPLE" ? "Surat Sampel (Barang Contoh Non-Komersial)" : "Informasi Surat Jalan"}
              </span>
              <p>
                {doc.documentType === "SAMPLE"
                  ? "Surat Sampel merupakan bukti penyerahan barang contoh tanpa nilai komersial atau tagihan piutang. Sesuai aturan bisnis, pengeditan Surat Sampel tidak mengurangi saldo stok fisik secara otomatis."
                  : "Dokumen Surat Jalan merupakan dokumen logistik pengiriman barang dan tidak memuat nilai komersial."}
              </p>
            </div>
          )}
        </form>
      </div>

      {/* Footer Modal (Fixed) */}
      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-border-default px-6 py-3 bg-surface-card">
        <div className="text-xs">
          <span className="block text-text-muted">
            {isNonFinancial ? "Sifat Dokumen:" : "Total Tagihan Baru:"}
          </span>
          <span className="font-mono text-base font-bold text-text-primary">
            {isNonFinancial
              ? (doc.documentType === "SAMPLE" ? "Non-Komersial (Sampel Bebas Biaya)" : "Surat Jalan (Logistik)")
              : (parsed ? formatRupiah(totalAmount) : "—")}
          </span>
          {!isNonFinancial && doc.paidAmount > 0 && (
            <span className="block text-[11px] text-text-secondary">
              Sudah dibayar: <strong className="font-mono">{formatRupiah(doc.paidAmount)}</strong>
              {totalAmount >= doc.paidAmount && (
                <> &middot; Sisa tagihan: <strong className="font-mono">{formatRupiah(totalAmount - doc.paidAmount)}</strong></>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={requestClose} disabled={isPending}>
            Batal
          </Button>
          <Button
            type="submit"
            form="doc-edit-form"
            variant="primary"
            loading={isPending}
            loadingLabel="Menyimpan Perubahan..."
            disabled={belowPaid}
          >
            Simpan Perubahan
          </Button>
        </div>
      </div>
    </div>
  );
}
