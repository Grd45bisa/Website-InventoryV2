"use client";

import React, { useState, useMemo, useRef, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CommercialDocument,
  Partner,
  FIXTURE_DOCUMENTS,
  FIXTURE_PARTNERS,
} from "@/lib/demo/inventory-fixtures";
import type { CommercialDocumentDetailRecord } from "@/lib/db/repositories/inventory-repository";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Alert, FeedbackState } from "@/components/ui/feedback";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { FormField, Input, Select } from "@/components/ui/form-fields";
import {
  PlusIcon,
  EyeIcon,
  SearchIcon,
  PrinterIcon,
  CalendarIcon,
  DocumentIcon,
  TruckIcon,
  ReceiptIcon,
  RotateCcwIcon,
  CloseIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/ui/icons";
import {
  recordDocumentPaymentAction,
  deleteDocumentPaymentAction,
  recordDocumentPrintAction,
  getDocumentPaymentsAction,
  getCommercialDocumentDetailAction,
  cancelCommercialDocumentAction,
} from "@/lib/inventory/actions";
import { DocumentCreateDialog } from "./document-create-dialog";
import { PaymentRecordDialog } from "./payment-record-dialog";
import { PaymentProofViewerDialog } from "./payment-proof-viewer-dialog";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";

const PAGE_SIZE = 50;

import type { DocumentCreatePoOption } from "./document-create-dialog";

export interface DocumentsViewProps {
  initialDocuments?: CommercialDocument[];
  initialPartners?: Partner[];
  initialPurchaseOrders?: DocumentCreatePoOption[];
  initialProducts?: Array<{ id: string; sku: string; name: string; unit: string }>;
  initialCreateFromPoId?: string;
}

interface PaymentRecordItem {
  id: string;
  documentId: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  receivedByName: string;
  proofMimeType?: string | null;
  proofBase64?: string | null;
  proofFileName?: string | null;
  proofFileSize?: number | null;
  createdAt: string;
}

const DOC_TYPE_TABS = [
  { key: "ALL", label: "Semua" },
  { key: "INVOICE", label: "Invoice" },
  { key: "SAMPLE", label: "Surat Sampel" },
  { key: "SURAT_JALAN", label: "Surat Jalan" },
  { key: "RECEIPT", label: "Kuitansi" },
] as const;

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function addDaysIso(dateStr: string, days: number): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DocumentsView({
  initialDocuments = [],
  initialPartners = [],
  initialPurchaseOrders = [],
  initialProducts = [],
  initialCreateFromPoId,
}: DocumentsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlCreateFromPoId =
    searchParams.get("createFromPo") ||
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("createFromPo")
      : null);

  const [documents, setDocuments] = useState<CommercialDocument[]>(
    initialDocuments.length > 0 ? initialDocuments : FIXTURE_DOCUMENTS
  );

  const [partners, setPartners] = useState<Partner[]>(
    initialPartners.length > 0 ? initialPartners : FIXTURE_PARTNERS.filter((p) => p.type === "CUSTOMER")
  );
  const initialPartnersKey = initialPartners.length > 0 ? JSON.stringify(initialPartners) : null;
  const [syncedPartnersKey, setSyncedPartnersKey] = useState(initialPartnersKey);
  if (initialPartnersKey !== syncedPartnersKey) {
    setSyncedPartnersKey(initialPartnersKey);
    setPartners(initialPartners.length > 0 ? initialPartners : FIXTURE_PARTNERS.filter((p) => p.type === "CUSTOMER"));
  }

  const purchaseOrders = useMemo(
    () => initialPurchaseOrders,
    [initialPurchaseOrders]
  );

  const products = useMemo(
    () => initialProducts,
    [initialProducts]
  );

  // Search & Filters State
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "INVOICE" | "SAMPLE" | "SURAT_JALAN" | "RECEIPT">("ALL");
  const [paymentFilter, setPaymentFilter] = useState<"ALL" | "UNPAID" | "PARTIAL" | "PAID">("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  // Modal Detail State
  const [selectedDoc, setSelectedDoc] = useState<CommercialDocument | null>(null);
  const [selectedDocDetail, setSelectedDocDetail] = useState<CommercialDocumentDetailRecord | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecordItem[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);

  // Modal Pembayaran & Bukti Bayar State
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedPaymentForProof, setSelectedPaymentForProof] = useState<PaymentRecordItem | null>(null);
  const [paymentSwitchNotice, setPaymentSwitchNotice] = useState<string | null>(null);

  // Modal Hapus Dokumen State
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Modal Buat Dokumen Baru State
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(() =>
    Boolean(
      initialCreateFromPoId ||
      urlCreateFromPoId ||
      (typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("createFromPo"))
    )
  );
  const [createFromPoId, setCreateFromPoId] = useState<string>(() => {
    if (initialCreateFromPoId) return initialCreateFromPoId;
    if (urlCreateFromPoId) return urlCreateFromPoId;
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("createFromPo");
      if (q) return q;
    }
    return "";
  });

  useEffect(() => {
    const fromWindow =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("createFromPo")
        : null;
    const targetPoId = urlCreateFromPoId || fromWindow || initialCreateFromPoId;
    if (targetPoId) {
      const existingPo = purchaseOrders.find((p) => p.id === targetPoId);
      if (existingPo?.invoiceId) {
        // Jika PO sudah memiliki invoice terbit, langsung alihkan ke rincian invoice tersebut
        router.replace(`/documents/${existingPo.invoiceId}`);
        return;
      }
      setCreateFromPoId(targetPoId);
      setIsCreateOpen(true);
    }
  }, [urlCreateFromPoId, initialCreateFromPoId, purchaseOrders, router]);

  // Feedback Messages
  const [docError, setDocError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const toast = useToast();
  // Print Feedback State
  const [printSuccessNotice, setPrintSuccessNotice] = useState<string | null>(null);

  // Payment Delete State
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentRecordItem | null>(null);
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);

  const handleConfirmDeletePayment = async () => {
    if (isDeletingPayment) return;
    if (!paymentToDelete || !selectedDoc) return;
    setIsDeletingPayment(true);
    try {
      const res = await deleteDocumentPaymentAction(paymentToDelete.id);
      if (!res.success) {
        toast.push({
          tone: "danger",
          title: "Gagal Menghapus Pembayaran",
          description: res.error || "Terjadi kesalahan saat menghapus pembayaran.",
        });
        return;
      }

      const newStatus: CommercialDocument["paymentStatus"] =
        res.newStatus === "PAID" ? "PAID" : res.paidAmount > 0 ? "PARTIAL" : "UNPAID";

      const updated: CommercialDocument = {
        ...selectedDoc,
        paidAmount: res.paidAmount,
        paymentStatus: newStatus,
      };

      setSelectedDoc(updated);
      setSelectedDocDetail((prev) =>
        prev
          ? {
            ...prev,
            paidAmount: res.paidAmount,
            status: (res.newStatus as CommercialDocumentDetailRecord["status"]) || prev.status,
          }
          : null
      );
      setDocuments((prev) => prev.map((d) => (d.id === selectedDoc.id ? updated : d)));
      setPaymentHistory((prev) => prev.filter((p) => p.id !== paymentToDelete.id));

      toast.push({
        tone: "success",
        title: "Pembayaran Dihapus",
        description: `Catatan pembayaran ${paymentToDelete.paymentNumber} sebesar ${formatRupiah(paymentToDelete.amount)} telah dihapus. Status tagihan disesuaikan kembali.`,
      });
      setPaymentToDelete(null);
    } catch (err: unknown) {
      toast.push({
        tone: "danger",
        title: "Kesalahan Sistem",
        description: err instanceof Error ? err.message : "Gagal menghapus pembayaran.",
      });
    } finally {
      setIsDeletingPayment(false);
    }
  };

  const handlePaymentSuccess = (res: {
    paymentId: string;
    newStatus: string;
    paidAmount: number;
    paymentItem: PaymentRecordItem;
  }) => {
    if (!selectedDoc) return;
    const newStatus: CommercialDocument["paymentStatus"] = res.newStatus === "PAID" ? "PAID" : "PARTIAL";
    const updated: CommercialDocument = {
      ...selectedDoc,
      paidAmount: res.paidAmount,
      paymentStatus: newStatus,
    };

    setSelectedDoc(updated);
    setSelectedDocDetail((prev) =>
      prev
        ? {
          ...prev,
          paidAmount: res.paidAmount,
          status: (res.newStatus as CommercialDocumentDetailRecord["status"]) || prev.status,
        }
        : null
    );
    setDocuments((prev) => prev.map((d) => (d.id === selectedDoc.id ? updated : d)));
    setPaymentHistory((prev) => [res.paymentItem, ...prev]);
    setStatusMessage(
      `Pembayaran sebesar ${formatRupiah(res.paymentItem.amount)} untuk ${selectedDoc.docNumber} berhasil dicatat (Status: ${newStatus === "PAID" ? "Lunas" : "Sebagian"}).`
    );
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const handleOpenCreateModal = () => {
    setIsCreateOpen(true);
  };

  const handleOpenDocDetail = (doc: CommercialDocument) => {
    setSelectedDoc(doc);
    setSelectedDocDetail(null);
    setPaymentHistory([]);
    setIsLoadingDetail(true);
    setIsLoadingPayments(true);

    getCommercialDocumentDetailAction(doc.id).then((res) => {
      setIsLoadingDetail(false);
      if (res.success && res.document) {
        setSelectedDocDetail(res.document);
        setPaymentHistory(res.document.payments);
        setIsLoadingPayments(false);
      } else {
        getDocumentPaymentsAction(doc.id).then((pRes) => {
          setIsLoadingPayments(false);
          if (pRes.success && pRes.payments) {
            setPaymentHistory(pRes.payments);
          }
        });
      }
    });
  };

  const handleCloseDocDetail = () => {
    setSelectedDoc(null);
    setSelectedDocDetail(null);
    setPaymentHistory([]);
  };

  const handleNavigateToDocumentPage = (docId: string) => {
    handleCloseDocDetail();
    router.push(`/documents/${docId}`);
  };

  // Helper tanggal referensi
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const thisMonthPrefix = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const thisMonthRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { start, end };
  }, []);

  const isTodayActive = startDate === todayIso && endDate === todayIso;
  const isMonthActive = startDate === thisMonthRange.start && endDate === thisMonthRange.end;

  // Interaksi Klik Kartu KPI
  const handleKpiTodayClick = () => {
    if (isTodayActive) {
      setStartDate("");
      setEndDate("");
    } else {
      setStartDate(todayIso);
      setEndDate(todayIso);
    }
  };

  const handleKpiMonthClick = () => {
    if (isMonthActive) {
      setStartDate("");
      setEndDate("");
    } else {
      setStartDate(thisMonthRange.start);
      setEndDate(thisMonthRange.end);
    }
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (!val) {
      setEndDate("");
      return;
    }
    const maxEnd = addDaysIso(val, 30);
    if (!endDate || endDate < val || endDate > maxEnd) {
      setEndDate(maxEnd);
    }
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    if (!val) return;
    if (startDate) {
      if (val < startDate) {
        setStartDate(val);
      }
    } else {
      setStartDate(addDaysIso(val, -30));
    }
  };

  const openDatePicker = (target: "start" | "end") => {
    const input = target === "start" ? startDateInputRef.current : endDateInputRef.current;
    if (!input) return;
    input.focus();
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
      } catch {
        // showPicker dapat melempar error jika dipanggil tanpa interaksi pengguna; focus sudah cukup.
      }
    }
  };

  const handleRangeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    let target: "start" | "end";
    if (e.target === startDateInputRef.current) {
      target = "start";
    } else if (e.target === endDateInputRef.current) {
      target = "end";
    } else if (e.target instanceof HTMLInputElement) {
      return;
    } else {
      target = !startDate ? "start" : !endDate ? "end" : "start";
    }
    openDatePicker(target);
  };

  const resetAllFilters = () => {
    setSearch("");
    setStartDate("");
    setEndDate("");
    setActiveTab("ALL");
    setPaymentFilter("ALL");
  };

  const hasActiveFilters = Boolean(
    search.trim() || startDate || endDate || activeTab !== "ALL" || paymentFilter !== "ALL"
  );

  // Perhitungan KPI Aktual dari Data SQLite
  const kpi = useMemo(() => {
    const todayDocs = documents.filter((d) => d.date === todayIso);
    const monthDocs = documents.filter((d) => d.date.startsWith(thisMonthPrefix));

    const getBreakdown = (list: CommercialDocument[]) => {
      const counts: Record<string, number> = {};
      list.forEach((d) => {
        counts[d.type] = (counts[d.type] || 0) + 1;
      });
      return counts;
    };

    // Metrik Finansial: Hanya dokumen tagihan komersial (bukan Surat Jalan ataupun Sample)
    const valuedDocs = documents.filter((d) => d.type === "INVOICE" || d.type === "RECEIPT");

    // Belum lunas: sisa saldo > 0 dan status belum lunas
    const unpaidDocs = valuedDocs.filter((d) => {
      const rem = d.total - (d.paidAmount || 0);
      return rem > 0 && d.paymentStatus !== "PAID";
    });
    const unpaidAmount = unpaidDocs.reduce((acc, d) => acc + Math.max(0, d.total - (d.paidAmount || 0)), 0);

    // Sudah lunas: dokumen berstatus PAID atau saldo terbayar
    const paidDocs = valuedDocs.filter((d) => d.paymentStatus === "PAID" || (d.total > 0 && d.paidAmount >= d.total));
    const totalPaidAmount = valuedDocs.reduce((acc, d) => acc + (d.paidAmount || 0), 0);
    const totalTransactionsAmount = valuedDocs.reduce((acc, d) => acc + d.total, 0);

    return {
      todayCount: todayDocs.length,
      todayBreakdown: getBreakdown(todayDocs),
      monthCount: monthDocs.length,
      monthBreakdown: getBreakdown(monthDocs),
      totalTransactionsAmount,
      unpaidCount: unpaidDocs.length,
      unpaidAmount,
      paidCount: paidDocs.length,
      paidAmount: totalPaidAmount,
    };
  }, [documents, todayIso, thisMonthPrefix]);

  // Tab Counts Aktual
  const tabCounts = useMemo(() => {
    return {
      ALL: documents.length,
      INVOICE: documents.filter((d) => d.type === "INVOICE").length,
      SAMPLE: documents.filter((d) => d.type === "SAMPLE").length,
      SURAT_JALAN: documents.filter((d) => d.type === "SURAT_JALAN").length,
      RECEIPT: documents.filter((d) => d.type === "RECEIPT").length,
    };
  }, [documents]);

  // Penyaringan Data Gabungan (Pencarian + Tab + Status Pembayaran + Tanggal)
  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      // 1. Filter Pencarian
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNumber = doc.docNumber.toLowerCase().includes(q);
        const matchPartner = doc.partnerName.toLowerCase().includes(q);
        const matchNotes = (doc.notes || "").toLowerCase().includes(q);
        const matchPo = (doc.poReference || "").toLowerCase().includes(q);
        if (!matchNumber && !matchPartner && !matchNotes && !matchPo) return false;
      }

      // 2. Filter Tab Tipe Dokumen
      if (activeTab !== "ALL" && doc.type !== activeTab) {
        return false;
      }

      // 3. Filter Rentang Tanggal
      if (startDate && doc.date < startDate) return false;
      if (endDate && doc.date > endDate) return false;

      // 4. Filter Status Pembayaran
      if (paymentFilter === "UNPAID") {
        if (doc.type === "SURAT_JALAN" || doc.type === "SAMPLE") return false;
        const rem = doc.total - (doc.paidAmount || 0);
        if (rem <= 0 || doc.paymentStatus === "PAID") return false;
      } else if (paymentFilter === "PARTIAL") {
        if (doc.type === "SURAT_JALAN" || doc.type === "SAMPLE") return false;
        if (doc.paidAmount <= 0 || doc.paidAmount >= doc.total) return false;
      } else if (paymentFilter === "PAID") {
        if (doc.type === "SURAT_JALAN" || doc.type === "SAMPLE") return false;
        if (doc.paymentStatus !== "PAID" && doc.paidAmount < doc.total) return false;
      }

      return true;
    });
  }, [documents, search, activeTab, startDate, endDate, paymentFilter]);

  // Reset ke halaman 1 saat filter berubah
  const filtersKey = JSON.stringify([search, activeTab, startDate, endDate, paymentFilter]);
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey);
  if (filtersKey !== prevFiltersKey) {
    setPrevFiltersKey(filtersKey);
    setCurrentPage(1);
  }

  // Paginasi Maksimal 50 Data per Halaman
  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedDocs = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredDocs.slice(start, start + PAGE_SIZE);
  }, [filteredDocs, safePage]);




  // Handler Pencetakan Dokumen
  const handlePrintDocument = (doc: CommercialDocument) => {
    startTransition(async () => {
      const res = await recordDocumentPrintAction(doc.id);
      if (res.success && typeof res.printCount === "number") {
        const nextCount = res.printCount;
        setDocuments((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, printCount: nextCount } : d))
        );
        if (selectedDoc?.id === doc.id) {
          setSelectedDoc((prev) => (prev ? { ...prev, printCount: nextCount } : null));
        }
        setPrintSuccessNotice(`Pencatatan cetak untuk ${doc.docNumber} berhasil (${nextCount}x).`);
        setTimeout(() => setPrintSuccessNotice(null), 4000);
      }
      window.print();
    });
  };

  const handleOpenDeleteModal = () => {
    setDeleteConfirmText("");
    setCancelError(null);
    setIsCancelModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (isCancelling) return;
    if (!selectedDoc) return;
    if (deleteConfirmText.trim() !== "Hapus") {
      setCancelError('Ketik "Hapus" untuk mengonfirmasi.');
      return;
    }

    setIsCancelling(true);
    setCancelError(null);

    const res = await cancelCommercialDocumentAction({
      documentId: selectedDoc.id,
      reason: "Dihapus oleh pengguna (konfirmasi ketik Hapus)",
    });

    setIsCancelling(false);

    if (!res.success) {
      setCancelError(res.error || "Gagal menghapus dokumen.");
      return;
    }

    const updated: CommercialDocument = {
      ...selectedDoc,
      status: "CANCELLED",
    };
    setSelectedDoc(updated);
    setSelectedDocDetail((prev) => (prev ? { ...prev, status: "CANCELLED" } : null));
    setDocuments((prev) => prev.map((d) => (d.id === selectedDoc.id ? updated : d)));
    setIsCancelModalOpen(false);
    setStatusMessage(`Dokumen ${res.documentNumber} berhasil dihapus.`);
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const getDocTypeBadge = (type: CommercialDocument["type"]) => {
    switch (type) {
      case "INVOICE":
        return <Badge variant="info" size="sm">Invoice</Badge>;
      case "SAMPLE":
        return <Badge variant="warning" size="sm">Surat Sampel</Badge>;
      case "SURAT_JALAN":
        return <Badge variant="neutral" size="sm">Surat Jalan</Badge>;
      case "RECEIPT":
        return <Badge variant="success" size="sm">Kuitansi</Badge>;
      default:
        return <Badge variant="outline" size="sm">{type}</Badge>;
    }
  };

  const getDocTypeIcon = (type: CommercialDocument["type"]) => {
    switch (type) {
      case "INVOICE":
        return <DocumentIcon className="h-4 w-4 text-primary shrink-0" />;
      case "SAMPLE":
        return <DocumentIcon className="h-4 w-4 text-warning shrink-0" />;
      case "SURAT_JALAN":
        return <TruckIcon className="h-4 w-4 text-text-secondary shrink-0" />;
      case "RECEIPT":
        return <ReceiptIcon className="h-4 w-4 text-success shrink-0" />;
      default:
        return <DocumentIcon className="h-4 w-4 text-text-muted shrink-0" />;
    }
  };

  const getPaymentStatusBadge = (doc: CommercialDocument) => {
    if (doc.status === "CANCELLED") {
      return <Badge variant="danger">Dibatalkan</Badge>;
    }

    if (doc.type === "SAMPLE" || doc.type === "SURAT_JALAN") {
      return <span className="text-text-muted">—</span>;
    }

    const isPaid = doc.paymentStatus === "PAID" || (doc.total > 0 && (doc.paidAmount || 0) >= doc.total);
    if (isPaid) {
      return <Badge variant="success">Lunas</Badge>;
    }

    const isPartial = (doc.paidAmount || 0) > 0 && (doc.paidAmount || 0) < doc.total;
    if (isPartial) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-warning-soft text-text-primary border border-warning/30">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          <span>Sebagian ({Math.round(((doc.paidAmount || 0) / doc.total) * 100)}%)</span>
        </span>
      );
    }

    const isOverdue = Boolean(doc.dueDate && doc.dueDate < todayIso);
    if (isOverdue) {
      return <Badge variant="danger">Jatuh Tempo</Badge>;
    }

    return <Badge variant="danger">Belum Lunas</Badge>;
  };

  const isSelectedDocPaid =
    selectedDoc?.paymentStatus === "PAID" ||
    Boolean(selectedDoc && selectedDoc.total > 0 && (selectedDoc.paidAmount || 0) >= selectedDoc.total);

  return (
    <div className="space-y-6">
      {/* A. Header Halaman */}
      <PageHeader
        title="Dokumen"
        description={`Pencatatan dokumen komersial, faktur penjualan, surat jalan, dan penerimaan pembayaran resmi. (Menampilkan ${filteredDocs.length} dari ${documents.length} dokumen).`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreateModal}
          >
            <PlusIcon className="h-4 w-4 mr-1" />
            Dokumen Baru
          </Button>
        }
      />

      {statusMessage && (
        <Alert
          variant="success"
          title="Berhasil"
          description={statusMessage}
        />
      )}

      {printSuccessNotice && (
        <Alert
          variant="info"
          title="Pencetakan Dicatat"
          description={printSuccessNotice}
        />
      )}

      {/* B. Ringkasan Statistik (KPI) - 5 Kartu Interaktif */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* 1. Hari Ini */}
        <div
          onClick={handleKpiTodayClick}
          className={`p-3.5 rounded-lg border bg-surface-card cursor-pointer transition-all select-none flex flex-col justify-between ${isTodayActive
              ? "border-primary ring-2 ring-primary/20 shadow-sm"
              : "border-border-default hover:border-primary/50"
            }`}
          title={isTodayActive ? "Klik untuk reset filter tanggal" : "Klik untuk memfilter dokumen terbit hari ini"}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Hari Ini</div>
          <div className="text-xl font-extrabold text-text-primary my-1 font-mono">{kpi.todayCount}</div>
          <div className="flex flex-wrap gap-1 text-[11px] text-text-secondary">
            {kpi.todayCount > 0 ? (
              Object.entries(kpi.todayBreakdown).map(([type, count]) => (
                <span key={type} className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-subtle border border-border-default">
                  {count} {type === "INVOICE" ? "Inv" : type === "SURAT_JALAN" ? "SJ" : "Kui"}
                </span>
              ))
            ) : (
              <span className="text-text-muted text-[11px]">Belum ada hari ini</span>
            )}
          </div>
        </div>

        {/* 2. Bulan Ini */}
        <div
          onClick={handleKpiMonthClick}
          className={`p-3.5 rounded-lg border bg-surface-card cursor-pointer transition-all select-none flex flex-col justify-between ${isMonthActive
              ? "border-primary ring-2 ring-primary/20 shadow-sm"
              : "border-border-default hover:border-primary/50"
            }`}
          title={isMonthActive ? "Klik untuk reset filter tanggal" : "Klik untuk memfilter dokumen bulan berjalan"}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Bulan Ini</div>
          <div className="text-xl font-extrabold text-text-primary my-1 font-mono">{kpi.monthCount}</div>
          <div className="flex flex-wrap gap-1 text-[11px] text-text-secondary">
            {kpi.monthCount > 0 ? (
              Object.entries(kpi.monthBreakdown).map(([type, count]) => (
                <span key={type} className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-subtle border border-border-default">
                  {count} {type === "INVOICE" ? "Inv" : type === "SURAT_JALAN" ? "SJ" : "Kui"}
                </span>
              ))
            ) : (
              <span className="text-text-muted text-[11px]">Belum ada bulan ini</span>
            )}
          </div>
        </div>

        {/* 3. Total Transaksi */}
        <div
          onClick={() => setPaymentFilter("ALL")}
          className={`p-3.5 rounded-lg border bg-surface-card cursor-pointer transition-all select-none flex flex-col justify-between ${paymentFilter === "ALL" && !isTodayActive && !isMonthActive
              ? "border-border-default hover:border-primary/50"
              : "border-border-default hover:border-primary/50"
            }`}
          title="Klik untuk melihat semua transaksi tagihan"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Total Transaksi</div>
          <div className="text-lg font-extrabold text-text-primary my-1 font-mono truncate">
            {formatRupiah(kpi.totalTransactionsAmount)}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <span>{kpi.unpaidCount} belum lunas</span>
            <span>·</span>
            <span>{kpi.paidCount} lunas</span>
          </div>
        </div>

        {/* 4. Belum Lunas */}
        <div
          onClick={() => setPaymentFilter((prev) => (prev === "UNPAID" ? "ALL" : "UNPAID"))}
          className={`p-3.5 rounded-lg border bg-surface-card cursor-pointer transition-all select-none flex flex-col justify-between ${paymentFilter === "UNPAID"
              ? "border-danger ring-2 ring-danger/20 shadow-sm bg-danger-soft/30"
              : "border-border-default hover:border-danger/50"
            }`}
          title={paymentFilter === "UNPAID" ? "Klik untuk reset filter status" : "Klik untuk memfilter tagihan belum lunas"}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-danger">Belum Lunas</div>
          <div className="text-lg font-extrabold text-danger my-1 font-mono truncate">
            {formatRupiah(kpi.unpaidAmount)}
          </div>
          <div className="text-[11px] text-text-muted">
            {kpi.unpaidCount > 0 ? `${kpi.unpaidCount} dokumen tagihan` : "Semua tagihan lunas"}
          </div>
        </div>

        {/* 5. Sudah Lunas */}
        <div
          onClick={() => setPaymentFilter((prev) => (prev === "PAID" ? "ALL" : "PAID"))}
          className={`p-3.5 rounded-lg border bg-surface-card cursor-pointer transition-all select-none flex flex-col justify-between ${paymentFilter === "PAID"
              ? "border-success ring-2 ring-success/20 shadow-sm bg-success-soft/30"
              : "border-border-default hover:border-success/50"
            }`}
          title={paymentFilter === "PAID" ? "Klik untuk reset filter status" : "Klik untuk memfilter tagihan sudah lunas"}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-success">Sudah Lunas</div>
          <div className="text-lg font-extrabold text-success my-1 font-mono truncate">
            {formatRupiah(kpi.paidAmount)}
          </div>
          <div className="text-[11px] text-text-muted">
            {kpi.paidCount > 0 ? `${kpi.paidCount} dokumen lunas` : "Belum ada pelunasan"}
          </div>
        </div>
      </div>

      {/* C. Tab Tipe Dokumen */}
      <div className="flex items-center gap-1 border-b border-border-default overflow-x-auto pb-px">
        {DOC_TYPE_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-text-muted hover:text-text-primary"
                }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-primary-soft text-primary" : "bg-surface-subtle text-text-muted"
                  }`}
              >
                {tabCounts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* D. Pencarian dan Filter Toolbar */}
      <div className="p-3 rounded-lg border border-border-default bg-surface-card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Pencarian */}
          <div className="md:col-span-5 relative">
            <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Cari nomor dokumen, pelanggan, PO, catatan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded border border-border-default bg-surface-card text-text-primary focus:outline-none focus:border-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-text-muted hover:text-text-primary cursor-pointer"
                title="Hapus pencarian"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Rentang Tanggal */}
          <div
            className="md:col-span-4 flex items-center gap-1.5 bg-surface-subtle px-2 py-1 rounded border border-border-default text-xs cursor-pointer"
            onClick={handleRangeClick}
          >
            <CalendarIcon className="h-4 w-4 text-text-muted shrink-0" />
            <span className="text-text-muted text-[11px] font-semibold whitespace-nowrap">Tgl:</span>
            <input
              ref={startDateInputRef}
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch { }
              }}
              className="bg-transparent text-xs text-text-primary outline-none cursor-pointer w-28"
              title="Tanggal Mulai (Klik untuk memilih)"
            />
            <span className="text-text-muted text-[11px] font-bold">—</span>
            <input
              ref={endDateInputRef}
              type="date"
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch { }
              }}
              className="bg-transparent text-xs text-text-primary outline-none cursor-pointer w-28"
              title="Tanggal Akhir (Maks 30 hari, klik untuk memilih)"
            />
          </div>

          {/* Filter Status Pembayaran */}
          <div className="md:col-span-2">
            <Select
              id="payment-status-select"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as "ALL" | "UNPAID" | "PARTIAL" | "PAID")}
              className="text-xs py-1"
            >
              <option value="ALL">Semua Pembayaran</option>
              <option value="UNPAID">Belum Lunas</option>
              <option value="PARTIAL">Bayar Sebagian</option>
              <option value="PAID">Sudah Lunas</option>
            </Select>
          </div>

          {/* Tombol Reset Filter */}
          <div className="md:col-span-1 flex justify-end">
            {hasActiveFilters ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={resetAllFilters}
                className="w-full text-xs py-1.5 px-2"
                title="Reset semua filter"
              >
                <RotateCcwIcon className="h-3.5 w-3.5 mr-1" />
                Reset
              </Button>
            ) : (
              <span className="text-[11px] text-text-muted text-right block w-full pr-1">Filter Aktif: 0</span>
            )}
          </div>
        </div>
      </div>

      {/* E. Tabel Daftar Dokumen (Desktop View) */}
      <div className="hidden md:block rounded-lg border border-border-default bg-surface-card overflow-hidden">
        <table className="w-full text-left text-xs text-text-secondary border-collapse">
          <thead className="bg-surface-subtle text-text-muted border-b border-border-default uppercase font-medium">
            <tr>
              <th className="p-3 w-48">Referensi Dokumen</th>
              <th className="p-3 w-28">Tipe</th>
              <th className="p-3">Pelanggan</th>
              <th className="p-3 w-36">Tanggal</th>
              <th className="p-3 w-32">Status Bayar</th>
              <th className="p-3 w-20 text-center">Cetak</th>
              <th className="p-3 w-32 text-right">Total Nilai</th>
              <th className="p-3 w-28 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {filteredDocs.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-text-muted">
                  <div className="space-y-1">
                    <div className="font-semibold text-text-primary text-sm">Tidak ada dokumen yang ditemukan</div>
                    <div className="text-xs">Coba sesuaikan kata kunci pencarian atau reset filter tanggal dan status.</div>
                    {hasActiveFilters && (
                      <div className="pt-2">
                        <Button variant="secondary" size="sm" onClick={resetAllFilters}>
                          Reset Filter
                        </Button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              pagedDocs.map((doc) => (
                <tr
                  key={doc.id}
                  onClick={() => handleOpenDocDetail(doc)}
                  className="hover:bg-surface-subtle/60 transition-colors cursor-pointer select-none"
                >
                  {/* 1. Referensi Dokumen */}
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {getDocTypeIcon(doc.type)}
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-text-primary hover:text-primary transition-colors">
                          {doc.docNumber}
                        </span>
                        {doc.poReference && (
                          <span className="text-[10px] text-text-muted font-mono">
                            PO: <strong className="text-text-secondary">{doc.poReference}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 2. Tipe Dokumen */}
                  <td className="p-3">{getDocTypeBadge(doc.type)}</td>

                  {/* 3. Pelanggan */}
                  <td className="p-3">
                    <div className="font-semibold text-text-primary">{doc.partnerName}</div>
                    {doc.notes && (
                      <div className="text-[11px] text-text-muted truncate max-w-xs">{doc.notes}</div>
                    )}
                  </td>

                  {/* 4. Tanggal Dokumen */}
                  <td className="p-3 font-mono">
                    <div>{formatDateDisplay(doc.date)}</div>
                    {doc.dueDate && doc.type !== "SURAT_JALAN" && doc.type !== "SAMPLE" && (
                      <div className={`text-[10px] ${doc.dueDate < todayIso && doc.paymentStatus !== "PAID" ? "text-danger font-semibold" : "text-text-muted"}`}>
                        JT: {formatDateDisplay(doc.dueDate)}
                      </div>
                    )}
                  </td>

                  {/* 5. Status Pembayaran */}
                  <td className="p-3">{getPaymentStatusBadge(doc)}</td>

                  {/* 6. Jumlah Cetak */}
                  <td className="p-3 text-center font-mono">
                    {doc.printCount > 0 ? (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold bg-surface-subtle text-text-primary border border-border-default">
                        {doc.printCount}x
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>

                  {/* 7. Total Dokumen */}
                  <td className="p-3 text-right font-mono font-bold text-text-primary">
                    {doc.type === "SURAT_JALAN" || doc.type === "SAMPLE" ? "—" : formatRupiah(doc.total)}
                  </td>

                  {/* 8. Aksi */}
                  <td className="p-3 text-right">
                    <div className="inline-flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDocDetail(doc);
                        }}
                        aria-label={`Rincian ${doc.docNumber}`}
                        title="Lihat rincian dokumen"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredDocs.length === 0 ? (
          <FeedbackState
            title="Tidak Ada Dokumen"
            description="Tidak ada dokumen komersial yang cocok dengan kriteria filter aktif."
          />
        ) : (
          pagedDocs.map((doc) => (
            <div
              key={doc.id}
              onClick={() => handleOpenDocDetail(doc)}
              className="p-4 rounded-lg border border-border-default bg-surface-card space-y-3 shadow-xs cursor-pointer hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getDocTypeIcon(doc.type)}
                  <span className="font-mono font-bold text-text-primary">{doc.docNumber}</span>
                </div>
                {getDocTypeBadge(doc.type)}
              </div>

              <div className="text-sm font-semibold text-text-primary">{doc.partnerName}</div>

              <div className="flex items-center justify-between text-xs text-text-muted font-mono border-t border-border-default pt-2">
                <span>Tgl: {formatDateDisplay(doc.date)}</span>
                <span className="font-bold text-text-primary">
                  {doc.type === "SURAT_JALAN" || doc.type === "SAMPLE" ? "—" : formatRupiah(doc.total)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <div>{getPaymentStatusBadge(doc)}</div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDocDetail(doc);
                    }}
                  >
                    Rincian
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Paginasi Dokumen (Maksimal 50 Data per Halaman) */}
      {filteredDocs.length > 0 && (
        <div className="rounded-lg border border-border bg-surface">
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filteredDocs.length}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* F. Modal Rincian Dokumen, Riwayat Pembayaran, & Form Catat Bayar */}
      <Dialog
        isOpen={Boolean(selectedDoc)}
        onClose={handleCloseDocDetail}
        size="wide"
        hideTitle={true}
        title={`Detail Dokumen: ${selectedDoc?.docNumber || ""}`}
      >
        {selectedDoc && (
          <div className="flex flex-col h-full max-h-[calc(100dvh-64px)] max-lg:max-h-none max-lg:h-dvh overflow-hidden">
            {/* Header Popup (Fixed/Sticky) */}
            <div className="flex-shrink-0 flex items-center justify-between border-b border-border-default px-6 py-4 bg-surface-subtle/40">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-text-primary">Detail Dokumen</h2>
                  {getDocTypeBadge(selectedDoc.type)}
                  <span className="font-mono font-bold text-sm text-text-primary px-2 py-0.5 rounded bg-surface border border-border-default">
                    {selectedDoc.docNumber}
                  </span>
                  {selectedDoc.status && (
                    <Badge variant={selectedDoc.status === "PAID" ? "success" : selectedDoc.status === "CANCELLED" ? "danger" : selectedDoc.status === "PARTIALLY_PAID" ? "warning" : "info"}>
                      {selectedDoc.status === "PAID" ? "Lunas" : selectedDoc.status === "PARTIALLY_PAID" ? "Dibayar Sebagian" : selectedDoc.status === "CANCELLED" ? "Dibatalkan" : "Diterbitkan"}
                    </Badge>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseDocDetail}
                className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
                aria-label="Tutup popup"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Body Popup (Scrollable) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
              {/* Kartu Informasi Dokumen (Grid Desktop Multi-Kolom) */}
              <div className="p-4 rounded-xl border border-border-default bg-surface-subtle/50 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 font-mono">
                  <div>
                    <span className="text-text-muted block text-[11px]">Pihak Terkait</span>
                    <span className="font-semibold text-text-primary font-sans text-xs">
                      {selectedDoc.partnerName}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[11px]">Tanggal Dokumen</span>
                    <span className="text-text-primary">{formatDateDisplay(selectedDoc.date)}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[11px]">Status Pembayaran</span>
                    <div className="mt-0.5">{getPaymentStatusBadge(selectedDoc)}</div>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[11px]">Jatuh Tempo</span>
                    <span className="text-text-primary">
                      {selectedDoc.type === "INVOICE" ? formatDateDisplay(selectedDoc.dueDate) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[11px]">Jumlah Cetak</span>
                    <span className="font-bold text-text-primary">
                      {selectedDoc.printCount > 0 ? `${selectedDoc.printCount}x dicetak` : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[11px]">Referensi PO</span>
                    <span className="text-text-primary">
                      {selectedDoc.poReference || "—"}
                    </span>
                  </div>
                </div>

                {selectedDoc.notes && (
                  <div className="mt-3 pt-3 border-t border-border-default text-xs text-text-secondary">
                    <strong className="text-text-primary font-medium">Catatan:</strong> {selectedDoc.notes}
                  </div>
                )}
              </div>

              {/* Daftar Item Dokumen */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    Daftar Item Dokumen
                    {selectedDocDetail?.lines && ` (${selectedDocDetail.lines.length} Item)`}
                  </h3>
                </div>

                {isLoadingDetail ? (
                  <div className="p-6 text-center text-xs text-text-muted border rounded-xl bg-surface-subtle">
                    Memuat daftar item dokumen...
                  </div>
                ) : selectedDocDetail?.lines && selectedDocDetail.lines.length > 0 ? (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block rounded-xl border border-border-default overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-surface-subtle text-text-muted font-medium border-b border-border-default">
                          <tr>
                            <th className="p-3 w-10 text-center">#</th>
                            <th className="p-3">Produk</th>
                            <th className="p-3">SKU</th>
                            <th className="p-3 text-right">Kuantitas & Satuan</th>
                            {selectedDoc.type !== "SURAT_JALAN" && selectedDoc.type !== "SAMPLE" && (
                              <>
                                <th className="p-3 text-right">Harga Satuan</th>
                                <th className="p-3 text-right">Diskon</th>
                                <th className="p-3 text-right">Jumlah Akhir</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-default font-mono">
                          {selectedDocDetail.lines.map((line, idx) => (
                            <tr key={line.id} className="hover:bg-surface-subtle/50 transition-colors">
                              <td className="p-3 text-center text-text-muted">{idx + 1}</td>
                              <td className="p-3 font-sans font-medium text-text-primary">
                                <div>{line.productName}</div>
                                {line.descriptionSnapshot && line.descriptionSnapshot !== line.productName && (
                                  <div className="text-[11px] text-text-muted font-normal">{line.descriptionSnapshot}</div>
                                )}
                              </td>
                              <td className="p-3 text-text-muted">{line.sku || "—"}</td>
                              <td className="p-3 text-right">
                                <span className="font-bold text-text-primary">{line.quantity}</span>{" "}
                                <span className="text-text-muted">{line.unit || "PCS"}</span>
                              </td>
                              {selectedDoc.type !== "SURAT_JALAN" && selectedDoc.type !== "SAMPLE" && (
                                <>
                                  <td className="p-3 text-right font-medium text-text-primary">
                                    {formatRupiah(line.unitPrice)}
                                  </td>
                                  <td className="p-3 text-right text-danger">
                                    {line.discountValue > 0 ? `- ${formatRupiah(line.discountValue)}` : "—"}
                                  </td>
                                  <td className="p-3 text-right font-bold text-text-primary">
                                    {formatRupiah(line.lineTotal)}
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card List */}
                    <div className="md:hidden space-y-2.5">
                      {selectedDocDetail.lines.map((line, idx) => (
                        <div key={line.id} className="p-3.5 rounded-lg border border-border-default bg-surface-card space-y-1.5 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-text-primary">#{idx + 1} {line.productName}</span>
                            <span className="font-mono text-[11px] text-text-muted">{line.sku || "—"}</span>
                          </div>
                          <div className="flex justify-between font-mono text-text-secondary">
                            <span>Kuantitas:</span>
                            <span className="font-bold text-text-primary">{line.quantity} {line.unit || "PCS"}</span>
                          </div>
                          {selectedDoc.type !== "SURAT_JALAN" && selectedDoc.type !== "SAMPLE" && (
                            <>
                              <div className="flex justify-between font-mono text-text-secondary">
                                <span>Harga Satuan:</span>
                                <span>{formatRupiah(line.unitPrice)}</span>
                              </div>
                              {line.discountValue > 0 && (
                                <div className="flex justify-between font-mono text-danger">
                                  <span>Diskon:</span>
                                  <span>- {formatRupiah(line.discountValue)}</span>
                                </div>
                              )}
                              <div className="flex justify-between font-mono font-bold text-text-primary border-t border-border-default pt-1">
                                <span>Jumlah Akhir:</span>
                                <span>{formatRupiah(line.lineTotal)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="p-4 rounded-xl border border-dashed border-border-default bg-surface-subtle/30 text-xs text-text-muted text-center">
                    Baris item tercatat berdasarkan nilai subtotal global transaksi.
                  </div>
                )}
              </div>

              {/* Banner Info untuk Dokumen Sample */}
              {selectedDoc.type === "SAMPLE" && (
                <div className="p-4 rounded-xl border border-warning/30 bg-warning/5 text-xs text-text-secondary space-y-1">
                  <span className="font-bold text-text-primary block text-sm">Surat Sampel (Barang Contoh Non-Komersial)</span>
                  <p>
                    Surat Sampel merupakan bukti serah terima pemberian sampel produk non-komersial kepada pelanggan tanpa nilai tagihan komersial atau piutang. Sesuai aturan bisnis, Surat Sampel tidak mengurangi saldo stok fisik secara otomatis dan tidak menerima pembayaran finansial.
                  </p>
                </div>
              )}

              {/* Ringkasan Total Finansial (di Kanan Bawah) */}
              {selectedDoc.type !== "SURAT_JALAN" && selectedDoc.type !== "SAMPLE" && (
                <div className="flex flex-col items-end">
                  <div className="w-full sm:max-w-md p-4 rounded-xl border border-border-default bg-surface-card space-y-2 text-xs font-mono shadow-xs">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted border-b border-border-default pb-1.5">
                      Ringkasan Total Finansial (LOCKED):
                    </div>
                    <div className="flex justify-between text-text-secondary">
                      <span>Subtotal Item Kotor:</span>
                      <span className="font-medium text-text-primary">{formatRupiah(selectedDoc.subtotal)}</span>
                    </div>
                    {selectedDoc.itemDiscount > 0 && (
                      <div className="flex justify-between text-danger">
                        <span>Diskon Item:</span>
                        <span>- {formatRupiah(selectedDoc.itemDiscount)}</span>
                      </div>
                    )}
                    {selectedDoc.documentDiscount > 0 && (
                      <div className="flex justify-between text-danger">
                        <span>Diskon Dokumen (Nominal):</span>
                        <span>- {formatRupiah(selectedDoc.documentDiscount)}</span>
                      </div>
                    )}
                    {selectedDoc.pointsRedeemed > 0 && (
                      <div className="flex justify-between text-danger">
                        <span>Penukaran Poin (Terakhir):</span>
                        <span>- {formatRupiah(selectedDoc.pointsRedeemed)}</span>
                      </div>
                    )}
                    <div className="border-t border-border-default pt-2 flex justify-between text-sm font-extrabold text-text-primary">
                      <span>Total Akhir Tagihan:</span>
                      <span>{formatRupiah(selectedDoc.total)}</span>
                    </div>
                    <div className="border-t border-border-default pt-1.5 flex justify-between text-xs text-success font-semibold">
                      <span>Sudah Dibayar:</span>
                      <span>{formatRupiah(selectedDoc.paidAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold">
                      <span className={selectedDoc.total - (selectedDoc.paidAmount || 0) > 0 ? "text-danger" : "text-success"}>
                        Sisa Tagihan Belum Dibayar:
                      </span>
                      <span className={selectedDoc.total - (selectedDoc.paidAmount || 0) > 0 ? "text-danger" : "text-success"}>
                        {formatRupiah(Math.max(0, selectedDoc.total - (selectedDoc.paidAmount || 0)))}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Switch Pembayaran & Riwayat Pembayaran Nyata */}
              {selectedDoc.type !== "SURAT_JALAN" && selectedDoc.type !== "SAMPLE" && (
                <div className="space-y-4 pt-2 border-t border-border-default">
                  {/* Switch Status Pembayaran untuk Tipe INVOICE */}
                  {selectedDoc.type === "INVOICE" && (
                    <div className="space-y-2">
                      <div className="p-3.5 rounded-xl border border-border-default bg-surface-subtle/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-text-primary">Status Pembayaran Invoice:</span>
                            {selectedDoc.paymentStatus === "PAID" || (selectedDoc.total > 0 && (selectedDoc.paidAmount || 0) >= selectedDoc.total) ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-success/15 text-success border border-success/30">
                                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                                Lunas
                              </span>
                            ) : (selectedDoc.paidAmount || 0) > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-warning/15 text-warning border border-warning/30">
                                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                                Sebagian ({formatRupiah(selectedDoc.paidAmount || 0)} / {formatRupiah(selectedDoc.total)})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-danger/15 text-danger border border-danger/30">
                                <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                                Belum Lunas
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-text-secondary">
                            {selectedDoc.paymentStatus === "PAID" || (selectedDoc.total > 0 && (selectedDoc.paidAmount || 0) >= selectedDoc.total)
                              ? "Invoice telah lunas penuh berdasarkan transaksi kas nyata di database. Untuk membatalkan pelunasan, hapus riwayat pembayaran di bawah."
                              : `Sisa piutang: ${formatRupiah(Math.max(0, selectedDoc.total - (selectedDoc.paidAmount || 0)))}. Klik tombol untuk mengunggah bukti dan mencatat pembayaran.`}
                          </p>
                        </div>

                        {/* Kontrol Upload / Catat Pembayaran (Menggantikan Switch) */}
                        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
                          {isSelectedDocPaid ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/15 border border-success/30 text-success text-xs font-semibold">
                              <CheckCircleIcon className="h-4 w-4" />
                              <span>Lunas Penuh</span>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={() => setIsPaymentDialogOpen(true)}
                              disabled={selectedDoc.status === "CANCELLED"}
                              className="inline-flex items-center gap-1.5 text-xs font-medium"
                              title="Klik untuk mengunggah bukti bayar dan mencatat transaksi kas"
                            >
                              <UploadIcon className="h-3.5 w-3.5" />
                              <span>Upload / Catat Bayar</span>
                            </Button>
                          )}
                        </div>
                      </div>

                      {paymentSwitchNotice && (
                        <Alert variant="warning" title="Pemberitahuan Status Pembayaran" description={paymentSwitchNotice} />
                      )}
                    </div>
                  )}

                  {/* Riwayat Pembayaran Nyata Table */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                        Riwayat Pembayaran Nyata ({paymentHistory.length})
                      </h3>
                      {selectedDoc.status !== "CANCELLED" &&
                        selectedDoc.total - (selectedDoc.paidAmount || 0) > 0 &&
                        selectedDoc.paymentStatus !== "PAID" && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setIsPaymentDialogOpen(true)}
                            className="inline-flex items-center gap-1.5 text-xs"
                          >
                            <PlusIcon className="h-3.5 w-3.5" />
                            <span>Catat Pembayaran Nyata</span>
                          </Button>
                        )}
                    </div>

                    {isLoadingPayments ? (
                      <div className="p-4 text-center text-xs text-text-muted border rounded-lg bg-surface-subtle">
                        Memuat riwayat pembayaran...
                      </div>
                    ) : paymentHistory.length === 0 ? (
                      <div className="p-3 text-center text-xs text-text-muted border border-dashed rounded-lg">
                        Belum ada riwayat pembayaran tercatat untuk dokumen ini.
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border-default overflow-hidden">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-surface-subtle text-text-muted font-medium border-b border-border-default">
                            <tr>
                              <th className="p-2.5">No. Bayar</th>
                              <th className="p-2.5">Tanggal</th>
                              <th className="p-2.5">Metode</th>
                              <th className="p-2.5">No. Referensi</th>
                              <th className="p-2.5">Bukti Bayar</th>
                              <th className="p-2.5 text-right">Nominal</th>
                              <th className="p-2.5 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-default font-mono">
                            {paymentHistory.map((pm) => (
                              <tr key={pm.id} className="hover:bg-surface-subtle/50">
                                <td className="p-2.5 font-bold text-text-primary">{pm.paymentNumber}</td>
                                <td className="p-2.5">{formatDateDisplay(pm.paymentDate)}</td>
                                <td className="p-2.5">{pm.paymentMethod}</td>
                                <td className="p-2.5 text-text-muted">{pm.referenceNumber || "—"}</td>
                                <td className="p-2.5">
                                  {pm.proofBase64 ? (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => setSelectedPaymentForProof(pm)}
                                      className="inline-flex items-center gap-1 text-[11px] py-0.5 px-2 font-sans"
                                      title="Pratinjau bukti bayar Base64"
                                    >
                                      <EyeIcon className="h-3 w-3" />
                                      <span>Lihat Bukti</span>
                                    </Button>
                                  ) : (
                                    <span className="text-text-muted">—</span>
                                  )}
                                </td>
                                <td className="p-2.5 text-right font-bold text-success">{formatRupiah(pm.amount)}</td>
                                <td className="p-2.5 text-right">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setPaymentToDelete(pm)}
                                    disabled={selectedDoc.status === "CANCELLED" || isDeletingPayment}
                                    className="text-danger hover:bg-danger/10 hover:text-danger px-2 py-0.5 text-[11px] inline-flex items-center gap-1 font-sans"
                                    title={`Hapus pembayaran ${pm.paymentNumber}`}
                                  >
                                    <TrashIcon className="h-3 w-3" />
                                    <span>Hapus</span>
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Popup (Fixed/Sticky di Bawah) */}
            <div className="flex-shrink-0 border-t border-border-default px-6 py-4 flex flex-wrap items-center justify-between gap-3 bg-surface-subtle/50">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-text-muted">Status Finansial:</span>
                {getPaymentStatusBadge(selectedDoc)}
                {selectedDoc.type !== "SURAT_JALAN" && selectedDoc.type !== "SAMPLE" && (
                  <span className="font-mono text-text-secondary text-[11px] ml-1">
                    (Sisa: {formatRupiah(Math.max(0, selectedDoc.total - (selectedDoc.paidAmount || 0)))})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {selectedDoc.status !== "CANCELLED" && (selectedDoc.paidAmount || 0) === 0 && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleOpenDeleteModal}
                    title="Hapus dokumen"
                    className="inline-flex items-center gap-1.5"
                  >
                    <TrashIcon className="h-4 w-4" />
                    <span>Hapus</span>
                  </Button>
                )}

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleNavigateToDocumentPage(selectedDoc.id)}
                  title="Navigasi ke halaman dokumen lengkap"
                  className="inline-flex items-center gap-1.5"
                >
                  <DocumentIcon className="h-4 w-4" />
                  <span>Buka Dokumen</span>
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handlePrintDocument(selectedDoc)}
                  title="Cetak format cetak resmi dokumen"
                  className="inline-flex items-center gap-1.5"
                >
                  <PrinterIcon className="h-4 w-4" />
                  <span>Cetak</span>
                </Button>

                <Button variant="secondary" size="sm" onClick={handleCloseDocDetail}>
                  Tutup
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Modal Konfirmasi Hapus Dokumen */}
      <Dialog
        isOpen={isCancelModalOpen}
        onClose={() => !isCancelling && setIsCancelModalOpen(false)}
        size="default"
        title={`Hapus Dokumen: ${selectedDoc?.docNumber || ""}`}
        hideTitle
      >
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-text-primary">Hapus Dokumen</h2>
              <p className="font-mono text-xs text-text-secondary mt-0.5 truncate">
                {selectedDoc?.docNumber}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCancelModalOpen(false)}
              disabled={isCancelling}
              className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors cursor-pointer disabled:opacity-60"
              aria-label="Tutup"
            >
              <CloseIcon size={18} />
            </button>
          </div>

          {cancelError && <Alert variant="danger" description={cancelError} />}

          <FormField id="delete-confirm-input" label='Ketik "Hapus" untuk mengonfirmasi' isRequired>
            <Input
              id="delete-confirm-input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Hapus"
              autoComplete="off"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsCancelModalOpen(false)}
              disabled={isCancelling}
            >
              Tidak
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmDelete}
              loading={isCancelling}
              loadingLabel="Menghapus..."
              disabled={deleteConfirmText.trim() !== "Hapus" || isCancelling}
            >
              Ya, Hapus
            </Button>
          </div>
        </div>
      </Dialog>

      {/* G. Dialog Buat Dokumen Baru (Bento Layout, Dynamic Items, Kalkulasi Diskon LOCKED) */}
      <DocumentCreateDialog
        open={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateFromPoId("");
          if (
            searchParams.get("createFromPo") ||
            (typeof window !== "undefined" && window.location.search.includes("createFromPo"))
          ) {
            router.replace("/documents");
          }
        }}
        customers={partners}
        products={products}
        purchaseOrders={purchaseOrders}
        existingDocCount={documents.length}
        defaultPoId={createFromPoId}
        onCreated={(newDoc, createdCustomer) => {
          setDocuments((prev) => [newDoc, ...prev]);
          if (createdCustomer) {
            setPartners((prev) => [createdCustomer, ...prev]);
          }
          setStatusMessage(`Dokumen ${newDoc.docNumber} (${newDoc.type}) berhasil diterbitkan.`);
          setTimeout(() => setStatusMessage(null), 5000);
          router.refresh();
        }}
      />
      {/* Modal Catat Pembayaran Nyata (Triggered by Switch Pelunasan) */}
      {selectedDoc && (
        <PaymentRecordDialog
          open={isPaymentDialogOpen}
          onClose={() => setIsPaymentDialogOpen(false)}
          documentId={selectedDoc.id}
          docNumber={selectedDoc.docNumber}
          totalAmount={selectedDoc.total}
          paidAmount={selectedDoc.paidAmount || 0}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {/* Modal Pratinjau Bukti Pembayaran */}
      <PaymentProofViewerDialog
        open={Boolean(selectedPaymentForProof)}
        onClose={() => setSelectedPaymentForProof(null)}
        payment={selectedPaymentForProof}
      />

      {/* Modal Konfirmasi Hapus Pembayaran */}
      {paymentToDelete && (
        <ConfirmDialog
          open={Boolean(paymentToDelete)}
          onCancel={() => setPaymentToDelete(null)}
          onConfirm={handleConfirmDeletePayment}
          title="Hapus Catatan Pembayaran"
          description={`Apakah Anda yakin ingin menghapus catatan pembayaran ${paymentToDelete.paymentNumber} sebesar ${formatRupiah(paymentToDelete.amount)}? Menghapus riwayat ini akan mengembalikan sisa piutang invoice dan mengubah status tagihan menjadi Belum Lunas / Sebagian.`}
          confirmLabel={isDeletingPayment ? "Menghapus..." : "Ya, Hapus Pembayaran"}
          tone="danger"
          loading={isDeletingPayment}
        />
      )}
    </div>
  );
}
