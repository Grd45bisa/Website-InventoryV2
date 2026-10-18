"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge, Alert } from "@/components/ui/feedback";
import { TextField, TextareaField } from "@/components/ui/form-fields";
import { ListToolbar, type ActiveFilter } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";

const PAGE_SIZE = 50;
import { FIXTURE_PARTNERS, type Partner } from "@/lib/demo/inventory-fixtures";
import { createSupplierAction } from "@/lib/inventory/actions";

export function SuppliersView({ initialSuppliers }: { initialSuppliers?: Partner[] }) {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Partner[]>(
    initialSuppliers && initialSuppliers.length > 0
      ? initialSuppliers
      : FIXTURE_PARTNERS.filter((p) => p.type === "SUPPLIER")
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedSuppliers = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const activeFilters: ActiveFilter[] = [];
  if (search.trim()) activeFilters.push({ key: "search", label: `Cari: ${search.trim()}` });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = "Nama pemasok wajib diisi.";
    if (!code.trim()) err.code = "Kode pemasok wajib diisi.";

    if (suppliers.some((s) => s.code.toLowerCase() === code.trim().toLowerCase())) {
      err.code = "Kode pemasok sudah ada. Gunakan kode unik.";
    }

    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const res = await createSupplierAction({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
      });

      if (!res.success) {
        toast.push({
          tone: "danger",
          title: "Gagal Menambahkan Pemasok",
          description: res.error || "Terjadi kesalahan pada database SQLite.",
        });
        setIsSubmitting(false);
        return;
      }

      const newSup: Partner = {
        id: res.supplier?.id || `sup-${Date.now()}`,
        ownerId: "current-owner",
        type: "SUPPLIER",
        name: name.trim(),
        code: code.trim().toUpperCase(),
        phone: phone.trim() || "-",
        email: email.trim() || "-",
        address: address.trim() || "-",
        status: "ACTIVE",
      };

      setSuppliers((prev) => [newSup, ...prev]);
      setModalOpen(false);
      toast.push({
        tone: "success",
        title: "Pemasok Disimpan ke Database",
        description: `${newSup.name} (${newSup.code}) berhasil disimpan ke SQLite dan siap digunakan untuk penerimaan barang.`,
      });

      setName("");
      setCode("");
      setPhone("");
      setEmail("");
      setAddress("");
      setErrors({});
    } catch (err: unknown) {
      toast.push({
        tone: "danger",
        title: "Kesalahan Sistem",
        description: err instanceof Error ? err.message : "Gagal menambahkan pemasok.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const columns: Column<Partner>[] = [
    {
      key: "code",
      header: "Kode Pemasok",
      sortable: true,
      cell: (s) => (
        <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs font-semibold">{s.code}</code>
      ),
    },
    {
      key: "name",
      header: "Nama Pemasok",
      sortable: true,
      cell: (s) => (
        <div>
          <span className="font-semibold text-text-primary">{s.name}</span>
          <p className="text-xs text-text-secondary truncate max-w-xs">{s.address}</p>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Kontak",
      cell: (s) => (
        <div className="text-xs">
          <p className="text-text-primary">{s.phone}</p>
          <p className="text-text-secondary">{s.email}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (s) => (
        <StatusBadge tone={s.status === "ACTIVE" ? "success" : "neutral"}>
          {s.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Master Pemasok (Suppliers)"
        description="Data vendor dan pemasok barang yang terdaftar resmi pada lingkup Owner."
        actions={
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            + Tambah Pemasok
          </Button>
        }
      />

      <Alert
        variant="info"
        title="Aturan Lingkup Data Pemasok"
        description="Pemasok tersimpan di database SQLite di bawah Owner aktif dan dapat dipilih oleh semua gudang untuk transaksi Goods In."
      />

      {/* Toolbar Filter */}
      <ListToolbar
        searchPlaceholder="Cari nama, kode pemasok, atau email..."
        searchValue={search}
        onSearchChange={setSearch}
        activeFilters={activeFilters}
        onRemoveFilter={() => setSearch("")}
        onClearFilters={() => setSearch("")}
      />

      {/* Tabel Pemasok */}
      <div className="rounded-lg border border-border bg-surface">
        <DataTable
          caption="Daftar data master pemasok"
          columns={columns}
          rows={pagedSuppliers}
          getRowId={(s) => s.id}
        />
        {filtered.length > 0 && (
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* Modal Tambah Pemasok Baru */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Tambah Pemasok Baru"
        description="Data vendor ini akan tersimpan permanen di database dan dapat digunakan pada form penerimaan barang masuk."
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Kode Pemasok"
              required
              placeholder="Mis: SUP-003"
              value={code}
              error={errors.code}
              onChange={(e) => setCode(e.target.value)}
            />
            <TextField
              label="Nama Lengkap Pemasok"
              required
              placeholder="PT / CV / Distributor..."
              value={name}
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Nomor Telepon / Sales"
              placeholder="021-xxxx / 0812-xxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <TextField
              label="Email Perusahaan"
              type="email"
              placeholder="sales@vendor.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <TextareaField
            label="Alamat Kantor / Pergudangan Pemasok"
            placeholder="Jalan, kawasan industri, kota..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={isSubmitting}>
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              loading={isSubmitting}
              loadingLabel="Menyimpan Pemasok..."
            >
              Simpan Pemasok
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
