"use client";

import React, { useMemo, useRef, useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { FormField, Input, Select, Textarea } from "@/components/ui/form-fields";
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
  createCommercialDocumentAction,
  updateCustomerAction,
} from "@/lib/inventory/actions";
import {
  calculateDocumentTotals,
  type DocumentLineDiscountType,
} from "@/lib/inventory/document-calc";
import type { CommercialDocument, Partner } from "@/lib/demo/inventory-fixtures";

export interface DocumentCreateCustomerOption {
  id: string;
  code: string;
  name: string;
  ownerName?: string;
  picSales?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  availablePoints?: number;
  pendingPoints?: number;
}

export interface DocumentCreateProductOption {
  id: string;
  sku: string;
  name: string;
  unit: string;
}

export interface DocumentCreatePoLineOption {
  id: string;
  productId?: string | null;
  productName?: string;
  rawProductName?: string;
  sku?: string;
  orderedQty?: number;
  orderedUnit?: string;
  targetQty: number;
  fulfilledQty?: number;
  unitPrice: number;
  mappingStatus?: string;
}

export interface DocumentCreatePoOption {
  id: string;
  poNumber: string;
  customerId: string;
  customerName?: string;
  status?: string;
  salesPic?: string | null;
  notes?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  lines?: DocumentCreatePoLineOption[];
}

export interface DocumentCreateDialogProps {
  open: boolean;
  onClose: () => void;
  customers: DocumentCreateCustomerOption[];
  products: DocumentCreateProductOption[];
  purchaseOrders: DocumentCreatePoOption[];
  existingDocCount?: number;
  defaultPoId?: string;
  onCreated: (document: CommercialDocument, createdCustomer?: Partner) => void;
}

interface LineDraft {
  key: string;
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

interface NewCustomerFormDraft {
  name: string;
  ownerName: string;
  picSales: string;
  phone: string;
  email: string;
  address: string;
}

interface FormDraft {
  documentType: "INVOICE" | "SAMPLE" | "SURAT_JALAN" | "RECEIPT";
  documentNumber: string;
  customerId: string;
  poId: string;
  documentDate: string;
  dueDate: string;
  paymentStatus: "UNPAID" | "PAID";
  notes: string;
  defaultUnit: "PCS" | "Lusin";
  // Diskon Toko (Tambahan)
  hasShopDiscount: boolean;
  shopDiscountNote: string;
  shopDiscountType: "NOMINAL" | "PERCENTAGE";
  shopDiscountValue: string;
  // Cashback Poin
  hasCashback: boolean;
  cashbackType: "PERCENTAGE" | "NOMINAL";
  cashbackValue: string;
  // Penukaran Poin
  pointsRedeemed: string;
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

function generateDefaultDocNumber(
  type: "INVOICE" | "SAMPLE" | "SURAT_JALAN" | "RECEIPT",
  count: number
): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const ym = `${y}${m}`;
  const ymd = `${y}${m}${d}`;
  const seq = String(count + 1).padStart(4, "0");
  if (type === "SAMPLE") return `SS-${ymd}-${seq}`;
  if (type === "SURAT_JALAN") return `SJ-${ym}-${seq.slice(-3)}`;
  if (type === "RECEIPT") return `KUI-${ym}-${seq.slice(-3)}`;
  return `INV-${ym}-${seq.slice(-3)}`;
}

export function DocumentCreateDialog({
  open,
  onClose,
  customers,
  products,
  purchaseOrders,
  existingDocCount = 0,
  defaultPoId,
  onCreated,
}: DocumentCreateDialogProps) {
  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      size="wide"
      hideTitle={true}
      title="Buat Dokumen Baru"
    >
      {open ? (
        <CreateBody
          customers={customers}
          products={products}
          purchaseOrders={purchaseOrders}
          existingDocCount={existingDocCount}
          defaultPoId={defaultPoId}
          onClose={onClose}
          onCreated={onCreated}
        />
      ) : null}
    </Dialog>
  );
}

function CreateBody({
  customers,
  products,
  purchaseOrders,
  existingDocCount = 0,
  defaultPoId,
  onClose,
  onCreated,
}: Omit<DocumentCreateDialogProps, "open">) {
  const keyCounter = useRef(1);
  const nextKey = () => {
    keyCounter.current += 1;
    return `new-create-line-${keyCounter.current}`;
  };

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultDueStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }, []);

  const defaultType = "INVOICE";
  const defaultNumber = useMemo(
    () => generateDefaultDocNumber(defaultType, existingDocCount),
    [defaultType, existingDocCount]
  );

  // Draft form utama
  const [draft, setDraft] = useState<FormDraft>({
    documentType: defaultType,
    documentNumber: defaultNumber,
    customerId: customers[0]?.id || "",
    poId: "",
    documentDate: todayStr,
    dueDate: defaultDueStr,
    paymentStatus: "UNPAID",
    notes: "",
    defaultUnit: "PCS",
    hasShopDiscount: false,
    shopDiscountNote: "",
    shopDiscountType: "NOMINAL",
    shopDiscountValue: "",
    hasCashback: false,
    cashbackType: "PERCENTAGE",
    cashbackValue: "2",
    pointsRedeemed: "",
    lines: [
      {
        key: "initial-line-1",
        productId: "",
        productName: "",
        isCustomProduct: false,
        quantity: "1",
        unit: "PCS",
        unitPrice: "0",
        discountType: "NONE",
        discountValue: "",
        note: "",
      },
    ],
  });

  // Mode tambah pelanggan baru
  const [isAddingNewCustomer, setIsAddingNewCustomer] = useState(false);
  const [newCustomerDraft, setNewCustomerDraft] = useState<NewCustomerFormDraft>({
    name: "",
    ownerName: "",
    picSales: "",
    phone: "",
    email: "",
    address: "",
  });

  // State search autocomplete pelanggan
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // State search autocomplete produk per baris
  const [activeProdDropdownKey, setActiveProdDropdownKey] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isSubmittingRef = useRef(false);

  // Local list pelanggan agar update profil langsung terefleksi di modal
  const [customerList, setCustomerList] = useState<DocumentCreateCustomerOption[]>(customers);
  useEffect(() => {
    setCustomerList(customers);
  }, [customers]);

  // Mode edit pelanggan terpilih
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

  const selectedPo = useMemo(
    () => purchaseOrders.find((p) => p.id === draft.poId),
    [purchaseOrders, draft.poId]
  );

  const customerPicSales = useMemo(() => {
    if (selectedPo?.salesPic) return selectedPo.salesPic;
    if (
      selectedCustomer?.picSales &&
      selectedCustomer.picSales !== "—" &&
      selectedCustomer.picSales !== "-"
    ) {
      return selectedCustomer.picSales;
    }
    const poWithPic = purchaseOrders.find(
      (p) => p.customerId === selectedCustomer?.id && p.salesPic
    );
    if (poWithPic?.salesPic) return poWithPic.salesPic;
    return "—";
  }, [selectedPo, selectedCustomer, purchaseOrders]);

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

  // Filter daftar pelanggan berdasarkan kata kunci
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customerList;
    return customerList.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.ownerName && c.ownerName.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        c.code.toLowerCase().includes(q)
    );
  }, [customerList, searchQuery]);

  // Deteksi nama toko yang sama/mirip (untuk identitas aman toko sama pemilik beda)
  const similarCustomerWarning = useMemo(() => {
    if (!isAddingNewCustomer || !newCustomerDraft.name.trim()) return null;
    const target = newCustomerDraft.name.trim().toLowerCase();
    const match = customers.find((c) => c.name.trim().toLowerCase() === target);
    if (!match) return null;
    return match;
  }, [isAddingNewCustomer, newCustomerDraft.name, customers]);

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-product-dropdown-container]")) {
        setActiveProdDropdownKey(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const patch = (changes: Partial<FormDraft>) => setDraft((prev) => ({ ...prev, ...changes }));

  const patchLine = (key: string, changes: Partial<LineDraft>) =>
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.key === key ? { ...l, ...changes } : l)),
    }));

  const isNonFinancial = draft.documentType === "SURAT_JALAN" || draft.documentType === "SAMPLE";

  const handleTypeChange = (newType: "INVOICE" | "SAMPLE" | "SURAT_JALAN" | "RECEIPT") => {
    setDraft((prev) => ({
      ...prev,
      documentType: newType,
      documentNumber: generateDefaultDocNumber(newType, existingDocCount),
    }));
  };

  const handlePoChange = (selectedPoId: string) => {
    const po = purchaseOrders.find((p) => p.id === selectedPoId);
    setDraft((prev) => {
      let updatedLines = prev.lines;
      if (po && po.lines && po.lines.length > 0) {
        updatedLines = po.lines.map((l, idx) => {
          const matchedProd = products.find((p) => p.id === l.productId || (l.sku && p.sku === l.sku));
          const effectiveProductId = matchedProd?.id || (l.productId || "");
          const rawUnit = (l.orderedUnit || "").trim().toLowerCase();
          const effectiveUnit: "PCS" | "Lusin" = rawUnit === "lusin" || rawUnit === "doz" ? "Lusin" : "PCS";
          const effectiveQty =
            effectiveUnit === "Lusin"
              ? (l.orderedQty && l.orderedQty > 0 ? l.orderedQty : (l.targetQty > 0 ? Math.floor(l.targetQty / 12) : 1))
              : (l.orderedQty && l.orderedQty > 0 ? l.orderedQty : (l.targetQty > 0 ? l.targetQty : 1));

          return {
            key: `po-line-${po.id}-${l.id}-${idx}`,
            productId: effectiveProductId,
            productName: matchedProd?.name || l.rawProductName || l.productName || "",
            isCustomProduct: false,
            quantity: String(effectiveQty),
            unit: effectiveUnit,
            unitPrice: l.unitPrice > 0 ? String(l.unitPrice) : "",
            discountType: "NONE" as DocumentLineDiscountType,
            discountValue: "",
            note: l.rawProductName ? `PO: ${l.rawProductName}` : "",
          };
        });
      }
      return {
        ...prev,
        poId: selectedPoId,
        customerId: po?.customerId || prev.customerId,
        lines: updatedLines,
      };
    });
  };

  useEffect(() => {
    if (defaultPoId) {
      handlePoChange(defaultPoId);
    }
  }, [defaultPoId]);

  const isLineComplete = (line: LineDraft) => {
    const hasProduct = Boolean(line.productId || line.productName?.trim());
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
          productId: "",
          productName: "",
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

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter") {
      const target = e.target as HTMLElement;
      // Jangan cegah Enter di textarea catatan agar user bisa membuat baris baru di teks catatan
      if (target.tagName === "TEXTAREA") {
        return;
      }

      // Selalu cegah submit dokumen otomatis akibat tekan Enter
      e.preventDefault();

      // Cek apakah Enter ditekan di dalam baris produk
      const lineRow = target.closest("[data-line-row]");
      if (lineRow) {
        const lineKey = lineRow.getAttribute("data-line-key");
        const currentLine = draft.lines.find((l) => l.key === lineKey);
        const isCurrentLineFilled = Boolean(currentLine?.productId) && Number(currentLine?.quantity) > 0;
        const allLinesFilled = draft.lines.every((l) => Boolean(l.productId) && Number(l.quantity) > 0);

        if (isCurrentLineFilled && allLinesFilled) {
          // Tambahkan baris baru
          addLine();
          // Fokuskan ke select produk baris berikutnya
          setTimeout(() => {
            const nextIdx = draft.lines.length + 1;
            const nextProdSelect = document.getElementById(`line-prod-${nextIdx}`);
            nextProdSelect?.focus();
          }, 60);
        } else {
          // Jika belum lengkap, arahkan ke input yang kosong di baris ini
          if (!currentLine?.productId) {
            const prodInput = lineRow.querySelector<HTMLSelectElement>('select[id^="line-prod-"]');
            prodInput?.focus();
          } else if (!currentLine.quantity || Number(currentLine.quantity) <= 0) {
            const qtyInput = lineRow.querySelector<HTMLInputElement>('input[id^="line-qty-"]');
            qtyInput?.focus();
          }
        }
        return;
      }

      // Jika Enter ditekan di luar tabel produk (Pelanggan / Dokumen / PO),
      // arahkan fokus langsung ke produk pada baris pertama
      const firstProductSelect = document.getElementById("line-prod-1");
      if (firstProductSelect) {
        firstProductSelect.focus();
      }
    }
  };

  const removeLine = (key: string) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.filter((l) => l.key !== key),
    }));
  };

  // Kalkulasi Finansial LOCKED & Reward Cashback Poin
  const parsed = useMemo(() => {
    const lines = draft.lines.map((l) => ({
      quantity: toNumber(l.quantity),
      unitPrice: isNonFinancial ? 0 : toNumber(l.unitPrice),
      discountType: isNonFinancial ? ("NONE" as DocumentLineDiscountType) : l.discountType,
      discountValue: isNonFinancial || l.discountType === "NONE" ? 0 : toNumber(l.discountValue),
    }));

    // Diskon Toko (Tambahan)
    let docNominal = 0;
    let docPct = 0;
    if (!isNonFinancial && draft.hasShopDiscount) {
      if (draft.shopDiscountType === "NOMINAL") {
        docNominal = toNumber(draft.shopDiscountValue);
      } else {
        docPct = toNumber(draft.shopDiscountValue);
      }
    }

    const pts = isNonFinancial ? 0 : toNumber(draft.pointsRedeemed);

    const hasNaN =
      Number.isNaN(docNominal) ||
      Number.isNaN(docPct) ||
      Number.isNaN(pts) ||
      lines.some((l) => [l.quantity, l.unitPrice, l.discountValue].some(Number.isNaN));

    if (hasNaN) return null;

    const totals = calculateDocumentTotals({
      lines,
      docNominalDiscount: docNominal,
      docPercentageDiscount: docPct,
      pointsRedeemed: pts,
    });

    // Dasar perhitungan cashback poin: nilai setelah diskon produk & diskon toko (sebelum penukaran poin)
    const step1 = Math.max(0, totals.subtotal - totals.itemDiscount);
    const step2 = Math.max(0, step1 - docNominal);
    const eligibleAmount = Math.max(0, step2 * (1 - docPct / 100));

    let estimatedCashbackPoints = 0;
    if (!isNonFinancial && draft.hasCashback) {
      const cbVal = toNumber(draft.cashbackValue);
      if (!Number.isNaN(cbVal) && cbVal > 0) {
        if (draft.cashbackType === "PERCENTAGE") {
          estimatedCashbackPoints = Math.round(eligibleAmount * (Math.min(100, cbVal) / 100));
        } else {
          estimatedCashbackPoints = Math.round(cbVal);
        }
      }
    }

    return {
      docNominal,
      docPct,
      pts,
      totals,
      estimatedCashbackPoints,
    };
  }, [draft, isNonFinancial]);

  const totalAmount = isNonFinancial ? 0 : (parsed?.totals.totalAmount ?? 0);

  // Batas poin reward yang tersedia untuk ditukarkan
  const customerAvailablePoints = selectedCustomer?.availablePoints ?? 0;

  const validate = (): string | null => {
    if (!draft.documentNumber.trim()) return "Nomor dokumen wajib diisi.";

    if (isAddingNewCustomer) {
      if (!newCustomerDraft.name.trim()) {
        return "Nama Toko pelanggan baru wajib diisi.";
      }
      if (newCustomerDraft.email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newCustomerDraft.email.trim())) {
          return "Format email pelanggan baru tidak valid.";
        }
      }
    } else {
      if (!draft.customerId) return "Pelanggan wajib dipilih atau ditambahkan.";
    }

    if (!draft.documentDate) return "Tanggal dokumen wajib diisi.";
    if (!isNonFinancial && draft.paymentStatus === "UNPAID" && !draft.dueDate) {
      return "Tanggal jatuh tempo wajib diisi untuk tagihan belum lunas.";
    }
    if (!isNonFinancial && draft.dueDate && draft.dueDate < draft.documentDate) {
      return "Jatuh tempo tidak boleh lebih awal dari tanggal dokumen.";
    }
    if (draft.lines.length === 0) return "Dokumen harus memiliki minimal satu item.";
    if (!parsed) return "Terdapat isian angka yang tidak valid.";

    for (let i = 0; i < draft.lines.length; i += 1) {
      const l = draft.lines[i];
      const n = i + 1;
      const hasProdName = Boolean(l.productId || l.productName?.trim());
      if (!hasProdName) return `Item ${n}: nama produk wajib diisi atau dipilih.`;
      if (!(toNumber(l.quantity) > 0)) {
        return draft.documentType === "SAMPLE"
          ? `Item ${n}: kuantitas sampel harus lebih besar dari 0.`
          : `Item ${n}: jumlah harus lebih besar dari 0.`;
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
      if (draft.hasShopDiscount) {
        if (draft.shopDiscountType === "PERCENTAGE") {
          const val = toNumber(draft.shopDiscountValue);
          if (val < 0 || val > 100) return "Diskon Toko persentase harus antara 0% dan 100%.";
        } else {
          const val = toNumber(draft.shopDiscountValue);
          if (val < 0) return "Diskon Toko nominal tidak boleh bernilai negatif.";
        }
      }

      if (parsed.pts < 0) return "Nilai penukaran poin tidak valid.";
      if (parsed.pts > customerAvailablePoints) {
        return `Penukaran poin (${formatNumber(parsed.pts)} poin) melebihi saldo pelanggan (${formatNumber(customerAvailablePoints)} poin).`;
      }

      if (draft.documentType === "INVOICE" && parsed.totals.subtotal <= 0) {
        return "Subtotal kotor invoice harus lebih besar dari 0.";
      }

      if (draft.poId && selectedPo?.invoiceId) {
        return `Purchase Order ${selectedPo.poNumber} sudah memiliki invoice terbit (${selectedPo.invoiceNumber}). Satu PO hanya dapat dibuatkan 1 invoice.`;
      }
    }

    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending || isSubmittingRef.current) return;
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    isSubmittingRef.current = true;

    startTransition(async () => {
      try {
        const formattedLines = draft.lines.map((l) => {
        const prod = products.find((p) => p.id === l.productId);
        const resolvedName = l.productName?.trim() || prod?.name || (l.productId ? "Produk" : "Produk Sampel");
        return {
          productId: l.productId || undefined,
          productName: resolvedName,
          unit: l.unit || draft.defaultUnit || "PCS",
          quantity: toNumber(l.quantity),
          unitPrice: isNonFinancial ? 0 : toNumber(l.unitPrice),
          discountType: isNonFinancial ? ("NONE" as DocumentLineDiscountType) : l.discountType,
          discountValue: isNonFinancial || l.discountType === "NONE" ? 0 : toNumber(l.discountValue),
          note: l.note.trim() || null,
        };
      });

      const res = await createCommercialDocumentAction({
        documentType: draft.documentType,
        documentNumber: draft.documentNumber.trim().toUpperCase(),
        customerId: isAddingNewCustomer ? undefined : draft.customerId,
        newCustomer: isAddingNewCustomer
          ? {
              name: newCustomerDraft.name.trim(),
              ownerName: newCustomerDraft.ownerName.trim() || undefined,
              picSales: newCustomerDraft.picSales.trim() || undefined,
              phone: newCustomerDraft.phone.trim() || undefined,
              email: newCustomerDraft.email.trim() || undefined,
              address: newCustomerDraft.address.trim() || undefined,
            }
          : undefined,
        poId: draft.poId || undefined,
        documentDate: draft.documentDate,
        dueDate: isNonFinancial ? draft.documentDate : (draft.dueDate || draft.documentDate),
        paymentStatus: isNonFinancial ? "UNPAID" : draft.paymentStatus,
        subtotal: isNonFinancial ? 0 : (parsed?.totals.subtotal ?? 0),
        itemDiscount: isNonFinancial ? 0 : (parsed?.totals.itemDiscount ?? 0),
        docNominalDiscount: isNonFinancial ? 0 : (parsed?.docNominal ?? 0),
        docPercentageDiscount: isNonFinancial ? 0 : (parsed?.docPct ?? 0),
        shopDiscountNote: draft.hasShopDiscount ? draft.shopDiscountNote.trim() : undefined,
        pointsRedeemed: isNonFinancial ? 0 : (parsed?.pts ?? 0),
        cashbackType: isNonFinancial || !draft.hasCashback ? "NONE" : draft.cashbackType,
        cashbackValue: isNonFinancial || !draft.hasCashback ? 0 : toNumber(draft.cashbackValue),
        cashbackAmount: isNonFinancial || !draft.hasCashback ? 0 : (parsed?.estimatedCashbackPoints ?? 0),
        notes: draft.notes.trim() || undefined,
        lines: formattedLines,
      });

      if (!res.success || !res.document) {
        setError(res.error || "Gagal membuat dokumen.");
        isSubmittingRef.current = false;
        return;
      }

      const cust = customerById.get(res.document.customerId);
      const po = purchaseOrders.find((p) => p.id === res.document.poId);

      const newCommercialDoc: CommercialDocument = {
        id: res.document.id,
        docNumber: res.document.documentNumber,
        type: res.document.documentType,
        date: res.document.documentDate,
        dueDate: res.document.dueDate,
        poReference: po?.poNumber || undefined,
        partnerName: res.document.customerName || cust?.name || newCustomerDraft.name || "Pelanggan",
        customerId: res.document.customerId,
        subtotal: res.document.subtotal,
        itemDiscount: res.document.itemDiscount,
        documentDiscount: res.document.docNominalDiscount,
        pointsRedeemed: res.document.pointsRedeemed,
        total: res.document.totalAmount,
        paidAmount: res.document.paidAmount,
        printCount: 0,
        paymentStatus:
          res.document.documentType === "SURAT_JALAN" || res.document.documentType === "SAMPLE"
            ? "NOT_APPLICABLE"
            : res.document.status === "PAID"
            ? "PAID"
            : "UNPAID",
        notes: res.document.notes || undefined,
        status: res.document.status,
      };

      const createdCustomerObj: Partner | undefined = isAddingNewCustomer
        ? {
            id: res.document.customerId,
            ownerId: res.document.ownerId,
            type: "CUSTOMER",
            code: `CST-NEW`,
            name: newCustomerDraft.name.trim(),
            ownerName: newCustomerDraft.ownerName.trim() || undefined,
            picSales: newCustomerDraft.picSales.trim() || undefined,
            phone: newCustomerDraft.phone.trim() || "-",
            email: newCustomerDraft.email.trim() || "-",
            address: newCustomerDraft.address.trim() || "-",
            status: "ACTIVE",
            availablePoints: 0,
            pendingPoints: parsed?.estimatedCashbackPoints ?? 0,
          }
        : undefined;

      onCreated(newCommercialDoc, createdCustomerObj);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat membuat dokumen.");
      isSubmittingRef.current = false;
    }
  });
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100dvh-64px)] max-lg:max-h-none max-lg:h-dvh overflow-hidden">
      {/* Header Modal (Fixed) */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-border-default px-6 py-4 max-lg:px-4 max-lg:py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-bold text-text-primary max-sm:text-sm truncate">
            Buat Dokumen Baru
          </h2>
          <span className="lg:hidden text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-surface-muted text-text-secondary border border-border-subtle shrink-0">
            {draft.documentNumber}
          </span>
          <p className="text-xs text-text-secondary max-lg:hidden">
            Terbitkan dokumen komersial resmi, manajemen pelanggan, diskon, dan cashback poin.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors cursor-pointer shrink-0"
          aria-label="Tutup form buat dokumen"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Body Modal (Scrollable) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 max-lg:p-3">
        <form
          id="doc-create-form"
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          noValidate
          className="space-y-6 max-lg:space-y-3"
        >
          {error && <Alert variant="danger" title="Periksa Kembali Formulir" description={error} />}

          {/* ── BENTO CARD LAYOUT (Pelanggan & Tipe Dokumen berdampingan di atas, Catatan panjang di bawah) ── */}
          <div className="doc-modal__bento grid grid-cols-1 lg:grid-cols-2 gap-4 max-lg:gap-3">
            {/* Card A: Bento Pelanggan */}
            <div
              className="doc-modal__bento-card doc-modal__bento-card--customer rounded-xl border border-border-default bg-surface-card p-4 space-y-3.5 flex flex-col max-lg:p-3 max-lg:space-y-3"
              ref={dropdownRef}
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
                {isAddingNewCustomer ? (
                  <span className="text-[10px] font-semibold text-primary bg-primary-soft px-2 py-0.5 rounded border border-primary/20">
                    Pelanggan Baru
                  </span>
                ) : selectedCustomer ? (
                  <button
                    type="button"
                    onClick={() => {
                      patch({ customerId: "" });
                      setSearchQuery("");
                      setIsDropdownOpen(true);
                    }}
                    className="doc-modal__change-contact-btn text-xs font-medium text-primary hover:underline cursor-pointer"
                  >
                    Ganti Pelanggan
                  </button>
                ) : null}
              </div>

              {/* Konten Card Pelanggan: Mode Baru vs Terpilih vs Pencarian */}
              {isAddingNewCustomer ? (
                /* FORM TAMBAH PELANGGAN BARU */
                <div className="doc-modal__selected-customer-wrap space-y-3">
                  {similarCustomerWarning && (
                    <div className="p-2.5 rounded-lg border border-warning/30 bg-warning/10 text-xs text-text-primary space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-warning-text">
                        <WarningIcon size={14} className="shrink-0" />
                        <span>Nama Toko Serupa Terdaftar</span>
                      </div>
                      <p className="text-[11px] text-text-secondary leading-relaxed">
                        Terdapat pelanggan bernama <strong>{similarCustomerWarning.name}</strong>
                        {similarCustomerWarning.ownerName ? ` (Pemilik: ${similarCustomerWarning.ownerName})` : ""}
                        {similarCustomerWarning.phone ? ` (Telp: ${similarCustomerWarning.phone})` : ""}.
                        Jika ini pemilik toko yang berbeda, Anda dapat melanjutkan.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingNewCustomer(false);
                          patch({ customerId: similarCustomerWarning.id });
                        }}
                        className="text-[11px] font-semibold text-primary hover:underline inline-block pt-0.5"
                      >
                        &rarr; Gunakan Pelanggan Terdaftar Ini
                      </button>
                    </div>
                  )}

                  <div className="doc-modal__bento-card-row grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField id="new-cust-store" label="Nama Toko" isRequired>
                      <Input
                        id="new-cust-store"
                        placeholder="Contoh: Toko Berkah Jaya"
                        value={newCustomerDraft.name}
                        onChange={(e) =>
                          setNewCustomerDraft((prev) => ({ ...prev, name: e.target.value }))
                        }
                        required
                        autoFocus
                      />
                    </FormField>
                    <FormField id="new-cust-owner" label="Nama Lengkap Pemilik">
                      <Input
                        id="new-cust-owner"
                        placeholder="Nama pemilik (opsional)"
                        value={newCustomerDraft.ownerName}
                        onChange={(e) =>
                          setNewCustomerDraft((prev) => ({ ...prev, ownerName: e.target.value }))
                        }
                      />
                    </FormField>
                  </div>

                  <div className="doc-modal__bento-card-row grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <FormField id="new-cust-pic" label="PIC Sales">
                      <Input
                        id="new-cust-pic"
                        placeholder="Nama sales (opsional)"
                        value={newCustomerDraft.picSales}
                        onChange={(e) =>
                          setNewCustomerDraft((prev) => ({ ...prev, picSales: e.target.value }))
                        }
                      />
                    </FormField>
                    <FormField id="new-cust-phone" label="Telepon">
                      <Input
                        id="new-cust-phone"
                        type="tel"
                        placeholder="0812xxxx (opsional)"
                        value={newCustomerDraft.phone}
                        onChange={(e) =>
                          setNewCustomerDraft((prev) => ({ ...prev, phone: e.target.value }))
                        }
                      />
                    </FormField>
                    <FormField id="new-cust-email" label="Email">
                      <Input
                        id="new-cust-email"
                        type="email"
                        placeholder="nama@toko.com (opsional)"
                        value={newCustomerDraft.email}
                        onChange={(e) =>
                          setNewCustomerDraft((prev) => ({ ...prev, email: e.target.value }))
                        }
                      />
                    </FormField>
                  </div>

                  <FormField id="new-cust-addr" label="Alamat">
                    <Input
                      id="new-cust-addr"
                      placeholder="Alamat lengkap toko / pengiriman (opsional)"
                      value={newCustomerDraft.address}
                      onChange={(e) =>
                        setNewCustomerDraft((prev) => ({ ...prev, address: e.target.value }))
                      }
                    />
                  </FormField>

                  <div className="flex justify-between items-center pt-1">
                    <span className="text-[11px] text-text-muted">
                      Profil akan otomatis tersimpan ke master saat dokumen berhasil diterbitkan.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNewCustomer(false);
                        patch({ customerId: customers[0]?.id || "" });
                      }}
                      className="text-xs font-semibold text-text-muted hover:text-text-primary px-2 py-1 rounded border border-border-default hover:bg-surface-muted transition-colors cursor-pointer"
                    >
                      Batal / Pilih Terdaftar
                    </button>
                  </div>
                </div>
              ) : selectedCustomer ? (
                /* PROFIL PELANGGAN TERPILIH */
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
                            ownerName: selectedCustomer.ownerName || "",
                            picSales: customerPicSales !== "—" ? customerPicSales : (selectedCustomer.picSales || ""),
                            phone: selectedCustomer.phone || "",
                            email: selectedCustomer.email || "",
                            address: selectedCustomer.address || "",
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
                        <div className="doc-modal__bento-card-row grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="doc-modal__field space-y-1">
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
                          <div className="doc-modal__field space-y-1">
                            <label className="text-xs font-medium text-text-secondary">
                              Nama Lengkap Pemilik
                            </label>
                            <input
                              type="text"
                              className="w-full text-xs bg-surface-muted border border-border-default rounded-md px-3 py-2 text-text-primary cursor-not-allowed"
                              value={selectedCustomer.ownerName || "—"}
                              disabled
                              readOnly
                            />
                          </div>
                        </div>

                        <div className="doc-modal__bento-card-row grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="doc-modal__field space-y-1">
                            <label className="text-xs font-medium text-text-secondary flex items-center justify-between">
                              <span>PIC Sales</span>
                              {customerPicSales !== "—" && (
                                <span className="text-[10px] text-primary font-medium">
                                  {selectedPo?.salesPic ? "(Dari PO)" : "(PIC Toko)"}
                                </span>
                              )}
                            </label>
                            <input
                              type="text"
                              className="w-full text-xs font-medium bg-surface-muted border border-border-default rounded-md px-3 py-2 text-text-primary cursor-not-allowed"
                              value={customerPicSales}
                              disabled
                              readOnly
                            />
                          </div>
                          <div className="doc-modal__field space-y-1">
                            <label className="text-xs font-medium text-text-secondary">Telepon</label>
                            <input
                              type="text"
                              className="w-full text-xs bg-surface-muted border border-border-default rounded-md px-3 py-2 text-text-primary cursor-not-allowed"
                              value={selectedCustomer.phone || "—"}
                              disabled
                              readOnly
                            />
                          </div>
                          <div className="doc-modal__field space-y-1">
                            <label className="text-xs font-medium text-text-secondary">Email</label>
                            <input
                              type="text"
                              className="w-full text-xs bg-surface-muted border border-border-default rounded-md px-3 py-2 text-text-primary cursor-not-allowed truncate"
                              value={selectedCustomer.email || "—"}
                              disabled
                              readOnly
                            />
                          </div>
                        </div>

                        <div className="doc-modal__field space-y-1">
                          <label className="text-xs font-medium text-text-secondary">Alamat</label>
                          <input
                            type="text"
                            className="w-full text-xs bg-surface-muted border border-border-default rounded-md px-3 py-2 text-text-primary cursor-not-allowed"
                            value={selectedCustomer.address || "—"}
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
                                {selectedCustomer.ownerName && (
                                  <span>Pemilik: <strong className="text-text-primary">{selectedCustomer.ownerName}</strong></span>
                                )}
                                {selectedCustomer.phone && (
                                  <span>Telp: <strong className="text-text-primary font-mono">{selectedCustomer.phone}</strong></span>
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
                                    ownerName: selectedCustomer.ownerName || "",
                                    picSales: customerPicSales !== "—" ? customerPicSales : (selectedCustomer.picSales || ""),
                                    phone: selectedCustomer.phone || "",
                                    email: selectedCustomer.email || "",
                                    address: selectedCustomer.address || "",
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
                                  patch({ customerId: "" });
                                  setSearchQuery("");
                                  setIsDropdownOpen(true);
                                }}
                                className="text-[11px] font-semibold text-primary px-2 py-1 rounded border border-primary/30 hover:bg-primary-soft transition-colors cursor-pointer"
                              >
                                Ganti
                              </button>
                            </div>
                          </div>

                          {/* Baris 2: Saldo Poin & Toggle Detail Alamat/PIC */}
                          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border-subtle text-[11px]">
                            {customerAvailablePoints > 0 ? (
                              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                                Saldo Poin: <strong className="font-mono">{formatNumber(customerAvailablePoints)}</strong>
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
                                  {customerPicSales} {selectedPo?.salesPic ? "(Dari PO)" : ""}
                                </span>
                              </div>
                              {selectedCustomer.email && (
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-text-muted shrink-0">Email:</span>
                                  <span className="text-text-primary text-right truncate">{selectedCustomer.email}</span>
                                </div>
                              )}
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-text-muted shrink-0">Alamat:</span>
                                <span className="text-text-primary text-right">{selectedCustomer.address || "—"}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="doc-modal__bento-card-row grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="doc-modal__field space-y-1">
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
                        <div className="doc-modal__field space-y-1">
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

                      <div className="doc-modal__bento-card-row grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="doc-modal__field space-y-1">
                          <label className="text-xs font-medium text-text-secondary">
                            PIC Sales
                          </label>
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
                        <div className="doc-modal__field space-y-1">
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
                        <div className="doc-modal__field space-y-1">
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

                      <div className="doc-modal__field space-y-1">
                        <label className="text-xs font-medium text-text-secondary">Alamat</label>
                        <input
                          type="text"
                          className="w-full text-xs bg-surface border border-border-default rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                          value={editCustomerDraft.address}
                          onChange={(e) =>
                            setEditCustomerDraft((prev) => ({ ...prev, address: e.target.value }))
                          }
                          placeholder="Alamat lengkap toko / pengiriman (opsional)"
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
                        {formatNumber(selectedCustomer.availablePoints || 0)} Poin
                      </strong>
                    </div>
                    {(selectedCustomer.pendingPoints ?? 0) > 0 && (
                      <span className="text-[11px] text-text-muted">
                        ({formatNumber(selectedCustomer.pendingPoints || 0)} poin pending)
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                /* PENCARIAN & DROPDOWN AUTOCOMPLETE PELANGGAN */
                <div className="doc-modal__field relative space-y-2">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                      <SearchIcon size={14} />
                    </span>
                    <input
                      type="text"
                      className="w-full pl-9 pr-8 py-2 text-xs border border-border-default rounded-md bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                      placeholder="Ketik atau pilih nama pelanggan"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-text-muted hover:text-text-primary"
                      >
                        <CloseIcon size={14} />
                      </button>
                    )}
                  </div>

                  {isDropdownOpen && (
                    <div className="doc-modal__customer-dropdown absolute z-20 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border-default bg-surface shadow-lg py-1 divide-y divide-border-subtle">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-surface-muted transition-colors flex flex-col gap-0.5 cursor-pointer"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              patch({ customerId: c.id });
                              setIsDropdownOpen(false);
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
                          Pelanggan &ldquo;{searchQuery}&rdquo; tidak ditemukan.
                        </div>
                      )}

                      {/* Tombol Tambah Pelanggan Baru */}
                      <button
                        type="button"
                        className="w-full px-3 py-2.5 text-left text-xs font-semibold text-primary hover:bg-primary-soft transition-colors flex items-center gap-2 cursor-pointer border-t border-border-default"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setIsAddingNewCustomer(true);
                          setNewCustomerDraft((prev) => ({
                            ...prev,
                            name: searchQuery.trim(),
                          }));
                          setIsDropdownOpen(false);
                        }}
                      >
                        <PlusIcon size={14} />
                        <span>+ Tambah Pelanggan: &ldquo;{searchQuery.trim() || "Pelanggan Baru"}&rdquo;</span>
                      </button>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[11px] text-text-muted pt-1">
                    <span>Mendukung pencarian nama toko, nama pemilik, nomor telepon, atau kode.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNewCustomer(true);
                        setNewCustomerDraft((prev) => ({
                          ...prev,
                          name: searchQuery.trim(),
                        }));
                      }}
                      className="text-primary font-semibold hover:underline cursor-pointer"
                    >
                      + Tambah Baru
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Card B: Bento Tipe Dokumen */}
            <div className="doc-modal__bento-card doc-modal__bento-card--doc rounded-xl border border-border-default bg-surface-card p-4 space-y-3.5 flex flex-col max-lg:p-3 max-lg:space-y-3">
              <div className="doc-modal__bento-card-head flex items-center justify-between pb-2 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <span className="doc-modal__bento-card-icon inline-flex items-center justify-center w-6 h-6 rounded-md bg-info-surface text-info">
                    <DocumentIcon size={14} />
                  </span>
                  <h3 className="doc-modal__bento-card-title text-xs font-bold uppercase tracking-wider text-text-primary">
                    Tipe Dokumen
                  </h3>
                </div>
                <span className="text-[10px] font-mono font-bold text-text-muted bg-surface-muted px-2 py-0.5 rounded border border-border-subtle">
                  {draft.documentNumber}
                </span>
              </div>

              <div className="doc-modal__bento-card-row grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField id="create-doc-type" label="Tipe Dokumen" isRequired>
                  <Select
                    id="create-doc-type"
                    value={draft.documentType}
                    onChange={(e) =>
                      handleTypeChange(e.target.value as "INVOICE" | "SAMPLE" | "SURAT_JALAN" | "RECEIPT")
                    }
                  >
                    <option value="INVOICE">Invoice (Faktur Tagihan)</option>
                    <option value="SAMPLE">Surat Sampel (Barang Contoh Non-Komersial)</option>
                    <option value="SURAT_JALAN">Surat Jalan (Logistik)</option>
                    <option value="RECEIPT">Kuitansi Resmi</option>
                  </Select>
                </FormField>

                <FormField id="create-doc-date" label="Tanggal Dokumen" isRequired>
                  <Input
                    id="create-doc-date"
                    type="date"
                    value={draft.documentDate}
                    onChange={(e) => patch({ documentDate: e.target.value })}
                    required
                  />
                </FormField>
              </div>

              <div className="doc-modal__bento-card-row grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField id="create-doc-number" label="Nomor Dokumen" isRequired>
                  <Input
                    id="create-doc-number"
                    value={draft.documentNumber}
                    disabled
                    readOnly
                    className="font-mono text-xs bg-surface-muted cursor-not-allowed"
                    required
                  />
                </FormField>

                {!isNonFinancial ? (
                  <FormField id="create-payment-status" label="Status Pembayaran">
                    <Select
                      id="create-payment-status"
                      value={draft.paymentStatus}
                      onChange={(e) =>
                        patch({ paymentStatus: e.target.value as "UNPAID" | "PAID" })
                      }
                    >
                      <option value="UNPAID">Belum Lunas (UNPAID)</option>
                      <option value="PAID">Lunas (PAID)</option>
                    </Select>
                  </FormField>
                ) : (
                  <FormField id="create-payment-status-na" label="Status Pembayaran">
                    <Input
                      id="create-payment-status-na"
                      value="Bebas Biaya (Non-Finansial)"
                      disabled
                      readOnly
                      className="text-xs bg-surface-muted cursor-not-allowed"
                    />
                  </FormField>
                )}
              </div>

              <div className="doc-modal__bento-card-row grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!isNonFinancial ? (
                  draft.paymentStatus === "UNPAID" ? (
                    <FormField id="create-due-date" label="Jatuh Tempo" isRequired>
                      <Input
                        id="create-due-date"
                        type="date"
                        value={draft.dueDate}
                        min={draft.documentDate || undefined}
                        onChange={(e) => patch({ dueDate: e.target.value })}
                        required
                      />
                    </FormField>
                  ) : (
                    <div className="flex flex-col justify-end text-xs text-text-muted p-2 rounded bg-surface-muted border border-border-subtle">
                      <span className="font-semibold text-text-primary">Lunas Langsung</span>
                      <span>Pembayaran penuh tercatat saat dokumen dibuat.</span>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col justify-end text-[11px] text-text-muted">
                    {draft.documentType === "SAMPLE"
                      ? "Sample tidak memiliki tanggal jatuh tempo pembayaran."
                      : "Surat Jalan tidak memiliki jatuh tempo pembayaran."}
                  </div>
                )}

                <FormField id="create-doc-po" label="Hubungkan PO (Opsional)">
                  <Select
                    id="create-doc-po"
                    value={draft.poId}
                    onChange={(e) => handlePoChange(e.target.value)}
                  >
                    <option value="">-- Tanpa PO --</option>
                    {purchaseOrders.map((po) => {
                      const hasInvoice = Boolean(po.invoiceId);
                      return (
                        <option
                          key={po.id}
                          value={po.id}
                          disabled={hasInvoice && po.id !== draft.poId}
                        >
                          {po.poNumber} — {po.customerName || "Pelanggan"}{" "}
                          {po.salesPic ? `(PIC: ${po.salesPic})` : ""}{" "}
                          {hasInvoice ? `[Sudah Ada Invoice: ${po.invoiceNumber}]` : ""}
                        </option>
                      );
                    })}
                  </Select>
                </FormField>
                {draft.poId && selectedPo?.invoiceId && (
                  <div className="col-span-1 sm:col-span-2 p-2.5 rounded-lg bg-warning-soft/60 border border-warning/40 text-xs text-text-primary flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-warning shrink-0" />
                      <span>
                        PO ini sudah memiliki invoice terbit: <strong className="font-mono font-bold text-text-primary">{selectedPo.invoiceNumber}</strong>. Satu PO hanya dapat dibuatkan 1 invoice.
                      </span>
                    </div>
                  </div>
                )}
                {draft.poId && !selectedPo?.invoiceId && (
                  <div className="col-span-1 sm:col-span-2 p-2.5 rounded-lg bg-primary-soft/40 border border-primary/20 text-xs text-text-secondary flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      <span>
                        Terhubung ke PO <strong className="text-primary font-mono font-bold">{purchaseOrders.find((p) => p.id === draft.poId)?.poNumber}</strong>
                        <span className="max-lg:hidden">. Item dan kuantitas disalin otomatis dari pesanan.</span>
                      </span>
                    </div>
                    {selectedPo?.salesPic && (
                      <span className="text-[11px] font-medium text-text-secondary bg-surface px-2 py-0.5 rounded border border-border-default shrink-0">
                        PIC Sales: <strong className="text-text-primary">{selectedPo.salesPic}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Card C: Bento Catatan (Panjang ke samping di bawah Pelanggan & Tipe Dokumen) */}
            <div className="doc-modal__bento-card doc-modal__bento-card--notes lg:col-span-2 rounded-xl border border-border-default bg-surface-card p-4 space-y-2 flex flex-col max-lg:p-3">
              <div className="doc-modal__bento-card-head flex items-center gap-2 pb-2 border-b border-border-subtle">
                <span className="doc-modal__bento-card-icon inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <ClipboardIcon size={14} />
                </span>
                <h3 className="doc-modal__bento-card-title text-xs font-bold uppercase tracking-wider text-text-primary">
                  Catatan
                </h3>
              </div>
              <textarea
                id="create-doc-notes"
                className="w-full min-h-[64px] text-xs border border-border-default rounded-md p-2.5 bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-y max-lg:min-h-[44px]"
                placeholder="Instruksi pengiriman, rekening bank, atau catatan khusus lainnya..."
                value={draft.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </div>
          </div>

          {/* ── SECTION ITEM BARIS PRODUK ── */}
          <section
            aria-labelledby="create-lines-title"
            className="rounded-xl border border-border-default bg-surface-card p-4 space-y-4 max-lg:p-3 max-lg:space-y-3"
          >
            <div className="flex flex-col gap-2.5 pb-2 border-b border-border-subtle sm:flex-row sm:items-center sm:justify-between sm:gap-0">
              <div>
                <h3
                  id="create-lines-title"
                  className="text-xs font-bold uppercase tracking-wider text-text-muted"
                >
                  {draft.documentType === "SAMPLE"
                    ? `Rincian Item Surat Sampel (${draft.lines.length} Item)`
                    : `Rincian Item Dokumen (${draft.lines.length} Baris)`}
                </h3>
                <p className="text-[11px] text-text-secondary max-lg:hidden">
                  {draft.documentType === "SAMPLE"
                    ? "Tentukan nama produk sampel, kuantitas, dan satuan (PCS/Lusin)."
                    : "Tentukan item produk, kuantitas, satuan, harga, dan diskon per item."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Switcher Satuan Default */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-text-muted text-[11px] font-medium">
                    <span className="max-sm:hidden">Default Satuan Baru:</span>
                    <span className="sm:hidden">Default:</span>
                  </span>
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
                  title={!canAddLine ? "Harap lengkapi produk dan kuantitas pada baris saat ini sebelum menambah baris baru" : undefined}
                  className={`hidden sm:inline-flex ${!canAddLine ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Tambah Baris
                </Button>
              </div>
            </div>

            <div className="space-y-3 max-lg:space-y-2.5">
              {draft.lines.map((line, idx) => {
                const n = idx + 1;
                const prod = products.find((p) => p.id === line.productId);
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

                const qSearch = (line.productName || "").trim().toLowerCase();
                const lineFilteredProducts = products.filter(
                  (p) =>
                    p.name.toLowerCase().includes(qSearch) ||
                    p.sku.toLowerCase().includes(qSearch)
                );

                return (
                  <div
                    key={line.key}
                    data-line-row
                    data-line-key={line.key}
                    className="p-3 rounded-lg border border-border-default bg-surface space-y-3 transition-colors hover:border-border-strong max-lg:p-2.5 max-lg:space-y-2"
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

                    {draft.documentType === "SAMPLE" ? (
                      /* KHUSUS SURAT SAMPEL: Non-komersial, produk bisa katalog / manual, Qty, Satuan, Keterangan */
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 md:gap-3">
                        <div className="sm:col-span-6" data-product-dropdown-container>
                          <label htmlFor={`line-prod-${n}`} className="text-xs font-medium text-text-primary block mb-1">
                            Pilih / Ketik Produk <span className="text-danger">*</span>
                          </label>
                          <div className="relative">
                            <Input
                              id={`line-prod-${n}`}
                              placeholder="Ketik nama produk sampel atau cari dari katalog..."
                              value={line.productName || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                const exactMatch = products.find((p) => p.name.toLowerCase() === val.trim().toLowerCase());
                                patchLine(line.key, {
                                  productName: val,
                                  productId: exactMatch ? exactMatch.id : "",
                                  isCustomProduct: !exactMatch,
                                });
                                if (val.trim()) {
                                  setActiveProdDropdownKey(line.key);
                                } else {
                                  setActiveProdDropdownKey(null);
                                }
                              }}
                              onFocus={() => {
                                const q = (line.productName || "").trim().toLowerCase();
                                const matches = products.filter(
                                  (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
                                );
                                if (matches.length > 0) {
                                  setActiveProdDropdownKey(line.key);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  setActiveProdDropdownKey(null);
                                }
                              }}
                              className="min-h-11 md:min-h-10 text-xs pr-8"
                              required
                            />
                            {line.productName && (
                              <button
                                type="button"
                                onClick={() => {
                                  patchLine(line.key, {
                                    productName: "",
                                    productId: "",
                                    isCustomProduct: false,
                                  });
                                  setActiveProdDropdownKey(null);
                                }}
                                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-text-muted hover:text-text-primary cursor-pointer"
                                aria-label="Hapus nama produk"
                              >
                                <CloseIcon size={14} />
                              </button>
                            )}

                            {activeProdDropdownKey === line.key && lineFilteredProducts.length > 0 && (
                              <div className="absolute z-30 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border-default bg-surface shadow-lg py-1 divide-y divide-border-subtle">
                                <div className="px-3 py-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-muted flex items-center justify-between">
                                  <span>Katalog ({lineFilteredProducts.length})</span>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setActiveProdDropdownKey(null);
                                    }}
                                    className="text-text-muted hover:text-text-primary text-[10px] cursor-pointer"
                                  >
                                    Tutup
                                  </button>
                                </div>
                                {lineFilteredProducts.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    className="w-full px-3 py-1.5 text-left hover:bg-surface-muted transition-colors flex items-center justify-between gap-2 cursor-pointer"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      patchLine(line.key, {
                                        productId: p.id,
                                        productName: p.name,
                                        isCustomProduct: false,
                                        unit: p.unit && (p.unit.toLowerCase() === "lusin" || p.unit.toLowerCase() === "doz") ? "Lusin" : (line.unit || "PCS"),
                                      });
                                      setActiveProdDropdownKey(null);
                                    }}
                                  >
                                    <span className="text-xs font-medium text-text-primary truncate">
                                      {p.name}
                                    </span>
                                    <span className="text-[10px] font-mono text-text-muted shrink-0">
                                      {p.sku}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {line.productName?.trim() && !line.productId ? (
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-text-muted">
                              <span className="bg-surface-subtle px-1.5 py-0.2 rounded border border-border-default text-text-secondary">
                                Item Bebas / Non-Katalog
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="sm:col-span-3">
                          <FormField id={`line-qty-${n}`} label="Kuantitas Sampel" isRequired>
                            <Input
                              id={`line-qty-${n}`}
                              type="number"
                              min="1"
                              step="1"
                              inputMode="numeric"
                              value={line.quantity}
                              onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                              className="font-mono min-h-11 md:min-h-10 text-xs"
                              required
                            />
                          </FormField>
                        </div>

                        <div className="sm:col-span-3">
                          <FormField id={`line-unit-${n}`} label="Satuan" isRequired>
                            <Select
                              id={`line-unit-${n}`}
                              value={line.unit || "PCS"}
                              onChange={(e) => patchLine(line.key, { unit: e.target.value as "PCS" | "Lusin" })}
                              className="min-h-11 md:min-h-10 text-xs font-medium"
                            >
                              <option value="PCS">PCS</option>
                              <option value="Lusin">Lusin (12 Pcs)</option>
                            </Select>
                          </FormField>
                        </div>
                      </div>
                    ) : (
                      /* FORMULIR INVOICE & DOKUMEN KOMERSIAL DENGAN SWITCHER PCS/LUSIN */
                      <div className="grid grid-cols-2 md:grid-cols-12 gap-2.5 md:gap-3">
                        <div className="col-span-2 md:col-span-4" data-product-dropdown-container>
                          <label htmlFor={`line-prod-${n}`} className="text-xs font-medium text-text-primary block mb-1">
                            Pilih / Ketik Produk <span className="text-danger">*</span>
                          </label>
                          <div className="relative">
                            <Input
                              id={`line-prod-${n}`}
                              placeholder="Ketik nama produk atau cari dari katalog..."
                              value={line.productName || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                const exactMatch = products.find((p) => p.name.toLowerCase() === val.trim().toLowerCase());
                                patchLine(line.key, {
                                  productName: val,
                                  productId: exactMatch ? exactMatch.id : "",
                                  isCustomProduct: !exactMatch,
                                });
                                if (val.trim()) {
                                  setActiveProdDropdownKey(line.key);
                                } else {
                                  setActiveProdDropdownKey(null);
                                }
                              }}
                              onFocus={() => {
                                const q = (line.productName || "").trim().toLowerCase();
                                const matches = products.filter(
                                  (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
                                );
                                if (matches.length > 0) {
                                  setActiveProdDropdownKey(line.key);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  setActiveProdDropdownKey(null);
                                }
                              }}
                              className="min-h-11 md:min-h-10 text-xs pr-8"
                              required
                            />
                            {line.productName && (
                              <button
                                type="button"
                                onClick={() => {
                                  patchLine(line.key, {
                                    productName: "",
                                    productId: "",
                                    isCustomProduct: false,
                                  });
                                  setActiveProdDropdownKey(null);
                                }}
                                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-text-muted hover:text-text-primary cursor-pointer"
                                aria-label="Hapus nama produk"
                              >
                                <CloseIcon size={14} />
                              </button>
                            )}

                            {activeProdDropdownKey === line.key && lineFilteredProducts.length > 0 && (
                              <div className="absolute z-30 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border-default bg-surface shadow-lg py-1 divide-y divide-border-subtle">
                                <div className="px-3 py-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-muted flex items-center justify-between">
                                  <span>Katalog ({lineFilteredProducts.length})</span>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setActiveProdDropdownKey(null);
                                    }}
                                    className="text-text-muted hover:text-text-primary text-[10px] cursor-pointer"
                                  >
                                    Tutup
                                  </button>
                                </div>
                                {lineFilteredProducts.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    className="w-full px-3 py-1.5 text-left hover:bg-surface-muted transition-colors flex items-center justify-between gap-2 cursor-pointer"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      patchLine(line.key, {
                                        productId: p.id,
                                        productName: p.name,
                                        isCustomProduct: false,
                                        unit: p.unit && (p.unit.toLowerCase() === "lusin" || p.unit.toLowerCase() === "doz") ? "Lusin" : (line.unit || "PCS"),
                                      });
                                      setActiveProdDropdownKey(null);
                                    }}
                                  >
                                    <span className="text-xs font-medium text-text-primary truncate">
                                      {p.name}
                                    </span>
                                    <span className="text-[10px] font-mono text-text-muted shrink-0">
                                      {p.sku}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {line.productName?.trim() && !line.productId ? (
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-text-muted">
                              <span className="bg-surface-subtle px-1.5 py-0.2 rounded border border-border-default text-text-secondary">
                                Item Bebas / Non-Katalog
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="col-span-1 md:col-span-2">
                          <FormField id={`line-qty-${n}`} label="Qty" isRequired>
                            <Input
                              id={`line-qty-${n}`}
                              type="number"
                              min="1"
                              step="1"
                              inputMode="numeric"
                              value={line.quantity}
                              onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                              className="font-mono min-h-11 md:min-h-10 text-xs"
                              required
                            />
                          </FormField>
                        </div>

                        <div className="col-span-1 md:col-span-2">
                          <FormField id={`line-unit-${n}`} label="Satuan" isRequired>
                            <Select
                              id={`line-unit-${n}`}
                              value={line.unit || "PCS"}
                              onChange={(e) => patchLine(line.key, { unit: e.target.value as "PCS" | "Lusin" })}
                              className="min-h-11 md:min-h-10 text-xs font-medium"
                            >
                              <option value="PCS">PCS</option>
                              <option value="Lusin">Lusin</option>
                            </Select>
                          </FormField>
                        </div>

                        {!isNonFinancial ? (
                          <>
                            <div className="col-span-1 md:col-span-2">
                              <FormField id={`line-price-${n}`} label={`Harga/${line.unit || "PCS"} (Rp)`} isRequired>
                                <Input
                                  id={`line-price-${n}`}
                                  type="number"
                                  min="0"
                                  step="1000"
                                  inputMode="numeric"
                                  value={line.unitPrice}
                                  onChange={(e) => patchLine(line.key, { unitPrice: e.target.value })}
                                  className="font-mono min-h-11 md:min-h-10 text-xs"
                                  required
                                />
                              </FormField>
                            </div>

                            <div className="col-span-1 md:col-span-2">
                              <FormField id={`line-disc-type-${n}`} label="Diskon Item">
                                <div className="grid grid-cols-2 gap-1">
                                  <Select
                                    id={`line-disc-type-${n}`}
                                    value={line.discountType}
                                    onChange={(e) =>
                                      patchLine(line.key, {
                                        discountType: e.target.value as DocumentLineDiscountType,
                                        discountValue: e.target.value === "NONE" ? "" : line.discountValue,
                                      })
                                    }
                                    className="min-h-11 md:min-h-10 text-[11px] px-1"
                                  >
                                    <option value="NONE">-</option>
                                    <option value="PERCENTAGE">%</option>
                                    <option value="NOMINAL">Rp</option>
                                  </Select>
                                  <Input
                                    id={`line-disc-val-${n}`}
                                    type="number"
                                    min="0"
                                    max={line.discountType === "PERCENTAGE" ? "100" : undefined}
                                    inputMode="numeric"
                                    placeholder={line.discountType === "PERCENTAGE" ? "%" : "Rp"}
                                    value={line.discountType === "NONE" ? "" : line.discountValue}
                                    onChange={(e) => patchLine(line.key, { discountValue: e.target.value })}
                                    disabled={line.discountType === "NONE"}
                                    className="font-mono min-h-11 md:min-h-10 text-xs px-2"
                                  />
                                </div>
                              </FormField>
                            </div>
                          </>
                        ) : (
                          <div className="col-span-2 md:col-span-4 flex items-center text-xs text-text-muted italic">
                            Bebas biaya / Dokumen non-finansial
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] items-end gap-2 md:gap-3 pt-2 border-t border-border-subtle">
                      <FormField
                        id={`line-note-${n}`}
                        label="Keterangan (Opsional)"
                      >
                        <Input
                          id={`line-note-${n}`}
                          placeholder="Catatan opsional untuk item ini..."
                          value={line.note}
                          onChange={(e) => patchLine(line.key, { note: e.target.value })}
                          className="text-xs min-h-10"
                        />
                      </FormField>
                      {draft.documentType !== "SAMPLE" && !isNonFinancial && (
                        <div className="flex items-center justify-between gap-2 md:block md:text-right pt-0.5">
                          <span className="text-[10px] text-text-muted md:block">Total Baris:</span>
                          <span className="font-mono text-xs font-bold text-text-primary md:block">
                            {formatRupiah(lineTotal)}
                          </span>
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
              title={!canAddLine ? "Harap lengkapi produk dan kuantitas pada baris saat ini sebelum menambah baris baru" : undefined}
              className="w-full max-lg:h-9 max-lg:text-xs"
            >
              + Tambah Baris Item
            </Button>
          </section>

          {/* ── DISKON TOKO, CASHBACK POIN & PENUKARAN POIN ── */}
          {!isNonFinancial ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-lg:gap-3">
              {/* Kolom Kiri: Diskon Toko & Cashback & Penukaran */}
              <div className="space-y-4 max-lg:space-y-3">
                {/* 1. Diskon Toko (Tambahan) */}
                <div className="p-4 rounded-xl border border-border-default bg-surface-card space-y-3 max-lg:p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-text-primary">Diskon Toko (Tambahan)</h4>
                      <p className="text-[11px] text-text-secondary max-lg:hidden">
                        Diskon global yang langsung memotong tagihan invoice saat ini.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.hasShopDiscount}
                        onChange={(e) => patch({ hasShopDiscount: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-border-default peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:border-border-default after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {draft.hasShopDiscount && (
                    <div className="space-y-3 pt-2 border-t border-border-subtle">
                      <FormField id="shop-disc-note" label="Keterangan Diskon">
                        <Input
                          id="shop-disc-note"
                          placeholder="Contoh: Promo Akhir Tahun / Diskon Khusus"
                          value={draft.shopDiscountNote}
                          onChange={(e) => patch({ shopDiscountNote: e.target.value })}
                          className="text-xs"
                        />
                      </FormField>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField id="shop-disc-type" label="Jenis Diskon">
                          <Select
                            id="shop-disc-type"
                            value={draft.shopDiscountType}
                            onChange={(e) =>
                              patch({
                                shopDiscountType: e.target.value as "NOMINAL" | "PERCENTAGE",
                                shopDiscountValue: "",
                              })
                            }
                          >
                            <option value="NOMINAL">Nominal (Rp)</option>
                            <option value="PERCENTAGE">Persen (%)</option>
                          </Select>
                        </FormField>
                        <FormField
                          id="shop-disc-val"
                          label={draft.shopDiscountType === "PERCENTAGE" ? "Nilai (%)" : "Nilai (Rp)"}
                        >
                          <Input
                            id="shop-disc-val"
                            type="number"
                            min="0"
                            max={draft.shopDiscountType === "PERCENTAGE" ? "100" : undefined}
                            placeholder={draft.shopDiscountType === "PERCENTAGE" ? "0 - 100" : "10000"}
                            value={draft.shopDiscountValue}
                            onChange={(e) => patch({ shopDiscountValue: e.target.value })}
                            className="font-mono text-xs"
                          />
                        </FormField>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Cashback Poin */}
                <div className="p-4 rounded-xl border border-border-default bg-surface-card space-y-3 max-lg:p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-text-primary">Cashback Poin Reward</h4>
                      <p className="text-[11px] text-text-secondary max-lg:hidden">
                        Reward dicatat ke saldo pelanggan setelah pembayaran. TIDAK memotong total saat ini.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.hasCashback}
                        onChange={(e) => patch({ hasCashback: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-border-default peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:border-border-default after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>

                  {draft.hasCashback && (
                    <div className="space-y-3 pt-2 border-t border-border-subtle">
                      <div className="grid grid-cols-2 gap-3">
                        <FormField id="cashback-type" label="Perhitungan Reward">
                          <Select
                            id="cashback-type"
                            value={draft.cashbackType}
                            onChange={(e) =>
                              patch({
                                cashbackType: e.target.value as "PERCENTAGE" | "NOMINAL",
                              })
                            }
                          >
                            <option value="PERCENTAGE">Persentase (%)</option>
                            <option value="NOMINAL">Nominal Poin Tetap</option>
                          </Select>
                        </FormField>
                        <FormField
                          id="cashback-val"
                          label={draft.cashbackType === "PERCENTAGE" ? "Persentase (%)" : "Jumlah Poin"}
                        >
                          <Input
                            id="cashback-val"
                            type="number"
                            min="0"
                            max={draft.cashbackType === "PERCENTAGE" ? "100" : undefined}
                            placeholder={draft.cashbackType === "PERCENTAGE" ? "Contoh: 2" : "20000"}
                            value={draft.cashbackValue}
                            onChange={(e) => patch({ cashbackValue: e.target.value })}
                            className="font-mono text-xs"
                          />
                        </FormField>
                      </div>

                      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                          <CheckCircleIcon size={14} className="shrink-0" />
                          <span>Estimasi Reward:</span>
                        </div>
                        <span className="font-mono font-bold text-emerald-800 dark:text-emerald-200">
                          +{formatNumber(parsed?.estimatedCashbackPoints ?? 0)} Poin
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Penukaran Poin Belanja */}
                <div className="p-4 rounded-xl border border-border-default bg-surface-card space-y-2 max-lg:p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-text-primary">Tukarkan Saldo Poin Pelanggan</h4>
                    <span className="text-[11px] font-mono text-text-muted">
                      Tersedia: {formatNumber(customerAvailablePoints)} Poin
                    </span>
                  </div>
                  <p className="text-[11px] text-text-secondary max-lg:hidden">
                    1 Poin = Rp 1. Mengurangi tagihan setelah diskon produk & Diskon Toko.
                  </p>

                  <div className="grid grid-cols-[1fr_auto] gap-2 pt-1">
                    <Input
                      id="redeem-points"
                      type="number"
                      min="0"
                      max={customerAvailablePoints}
                      placeholder="0"
                      value={draft.pointsRedeemed}
                      onChange={(e) => patch({ pointsRedeemed: e.target.value })}
                      disabled={customerAvailablePoints <= 0 || isAddingNewCustomer}
                      className="font-mono text-xs"
                    />
                    {customerAvailablePoints > 0 && !isAddingNewCustomer && (
                      <button
                        type="button"
                        onClick={() => patch({ pointsRedeemed: String(customerAvailablePoints) })}
                        className="px-2.5 py-1 text-xs font-semibold text-primary border border-primary/30 rounded hover:bg-primary-soft transition-colors cursor-pointer"
                      >
                        Gunakan Semua
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Kolom Kanan: Ringkasan Finansial Tagihan */}
              <div className="p-4 rounded-xl border border-border-default bg-surface-card space-y-4 flex flex-col justify-between max-lg:p-3 max-lg:space-y-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted pb-2 border-b border-border-subtle">
                    Ringkasan Finansial Tagihan
                  </h3>
                  <div className="space-y-2 text-xs font-mono pt-3 max-lg:pt-2 max-lg:space-y-1.5">
                    <div className="flex justify-between text-text-secondary">
                      <span>Subtotal Kotor Item:</span>
                      <span className="text-text-primary">
                        {parsed ? formatRupiah(parsed.totals.subtotal) : "—"}
                      </span>
                    </div>

                    {parsed && parsed.totals.itemDiscount > 0 && (
                      <div className="flex justify-between text-danger">
                        <span>Diskon Item Terakumulasi:</span>
                        <span>- {formatRupiah(parsed.totals.itemDiscount)}</span>
                      </div>
                    )}

                    {parsed && parsed.docNominal > 0 && (
                      <div className="flex justify-between text-danger">
                        <span>Diskon Toko (Nominal):</span>
                        <span>- {formatRupiah(parsed.docNominal)}</span>
                      </div>
                    )}

                    {parsed && parsed.docPct > 0 && (
                      <div className="flex justify-between text-danger">
                        <span>Diskon Toko ({parsed.docPct}%):</span>
                        <span>
                          -{" "}
                          {formatRupiah(
                            Math.round(
                              Math.max(
                                0,
                                parsed.totals.subtotal - parsed.totals.itemDiscount - parsed.docNominal
                              ) *
                                (parsed.docPct / 100)
                            )
                          )}
                        </span>
                      </div>
                    )}

                    {parsed && parsed.pts > 0 && (
                      <div className="flex justify-between text-danger">
                        <span>Penukaran Poin Reward:</span>
                        <span>- {formatRupiah(parsed.pts)}</span>
                      </div>
                    )}

                    <div className="flex justify-between border-t border-border-default pt-2 text-sm font-extrabold text-text-primary">
                      <span>Total Tagihan Bersih:</span>
                      <span className="text-primary">{parsed ? formatRupiah(totalAmount) : "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Info Cashback Poin di Footer Ringkasan */}
                {draft.hasCashback && (parsed?.estimatedCashbackPoints ?? 0) > 0 && (
                  <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-[11px] text-emerald-800 dark:text-emerald-300 space-y-0.5">
                    <div className="flex items-center justify-between font-bold">
                      <span>Reward Cashback Poin:</span>
                      <span>+{formatNumber(parsed?.estimatedCashbackPoints ?? 0)} Poin</span>
                    </div>
                    <p className="text-[10px] text-text-muted">
                      {draft.paymentStatus === "PAID"
                        ? "Poin langsung masuk ke saldo pelanggan karena transaksi lunas."
                        : "Poin berstatus pending dan akan masuk ke saldo setelah invoice dilunasi."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-border-default bg-surface-subtle/50 text-xs text-text-secondary">
              <span className="font-bold text-text-primary block mb-1">
                {draft.documentType === "SAMPLE" ? "Surat Sampel (Barang Contoh Non-Komersial)" : "Informasi Surat Jalan"}
              </span>
              <p className="max-lg:hidden">
                {draft.documentType === "SAMPLE"
                  ? "Surat Sampel merupakan bukti serah terima pemberian sampel produk non-komersial kepada pelanggan tanpa nilai tagihan komersial atau piutang. Sesuai aturan bisnis, pembuatan Surat Sampel tidak mengurangi stok secara otomatis."
                  : "Dokumen Surat Jalan merupakan dokumen logistik resmi pengiriman barang. Dokumen ini tidak memuat nilai komersial atau tagihan finansial."}
              </p>
            </div>
          )}


        </form>
      </div>

      {/* Footer Modal (Fixed) */}
      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-border-default px-6 py-3 bg-surface-card max-lg:flex-col max-lg:items-stretch max-lg:gap-2 max-lg:px-4 max-lg:py-2.5">
        <div className="text-xs max-lg:flex max-lg:items-baseline max-lg:justify-between max-lg:gap-2">
          <span className="block text-text-muted max-lg:inline">
            {draft.documentType === "SAMPLE" ? "Sifat Dokumen:" : "Total Tagihan:"}
          </span>
          <span className="font-mono text-base font-bold text-text-primary max-lg:text-sm">
            {isNonFinancial
              ? (draft.documentType === "SAMPLE" ? "Non-Komersial (Sampel Bebas Biaya)" : "Surat Jalan (Logistik)")
              : (parsed ? formatRupiah(totalAmount) : "—")}
          </span>
        </div>
        <div className="flex items-center gap-2 max-lg:grid max-lg:grid-cols-2 max-lg:w-full">
          <Button variant="secondary" onClick={onClose} disabled={isPending} className="max-lg:w-full">
            Batal
          </Button>
          <Button
            type="submit"
            form="doc-create-form"
            variant="primary"
            loading={isPending}
            loadingLabel="Menyimpan..."
            className="max-lg:w-full"
          >
            Terbitkan Dokumen
          </Button>
        </div>
      </div>
    </div>
  );
}
