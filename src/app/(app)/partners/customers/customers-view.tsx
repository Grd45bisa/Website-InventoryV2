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
import { createCustomerAction } from "@/lib/inventory/actions";

export function CustomersView({ initialCustomers }: { initialCustomers?: Partner[] }) {
  const toast = useToast();
  const [customers, setCustomers] = useState<Partner[]>(
    initialCustomers && initialCustomers.length > 0
      ? initialCustomers
      : FIXTURE_PARTNERS.filter((p) => p.type === "CUSTOMER")
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
    return customers.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [customers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedCustomers = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const activeFilters: ActiveFilter[] = [];
  if (search.trim()) activeFilters.push({ key: "search", label: `Cari: ${search.trim()}` });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = "Nama pelanggan wajib diisi.";
    if (!code.trim()) err.code = "Kode pelanggan wajib diisi.";

    if (customers.some((c) => c.code.toLowerCase() === code.trim().toLowerCase())) {
      err.code = "Kode pelanggan sudah ada. Gunakan kode unik.";
    }

    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const res = await createCustomerAction({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
      });

      if (!res.success) {
        toast.push({
          tone: "danger",
          title: "Gagal Menambahkan Pelanggan",
          description: res.error || "Terjadi kesalahan pada database SQLite.",
        });
        setIsSubmitting(false);
        return;
      }

      const newCust: Partner = {
        id: res.customer?.id || `cust-${Date.now()}`,
        ownerId: "current-owner",
        type: "CUSTOMER",
        name: name.trim(),
        code: code.trim().toUpperCase(),
        phone: phone.trim() || "-",
        email: email.trim() || "-",
        address: address.trim() || "-",
        status: "ACTIVE",
      };

      setCustomers((prev) => [newCust, ...prev]);
      setModalOpen(false);
      toast.push({
        tone: "success",
        title: "Pelanggan Disimpan ke Database",
        description: `${newCust.name} (${newCust.code}) berhasil disimpan ke SQLite dan siap digunakan lintas gudang.`,
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
        description: err instanceof Error ? err.message : "Gagal menambahkan pelanggan.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const columns: Column<Partner>[] = [
    {
      key: "code",
      header: "Kode Pelanggan",
      sortable: true,
      cell: (c) => (
        <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs font-semibold">{c.code}</code>
      ),
    },
    {
      key: "name",
      header: "Nama Pelanggan",
      sortable: true,
      cell: (c) => (
        <div>
          <span className="font-semibold text-text-primary">{c.name}</span>
          <p className="text-xs text-text-secondary truncate max-w-xs">{c.address}</p>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Kontak",
      cell: (c) => (
        <div className="text-xs">
          <p className="text-text-primary">{c.phone}</p>
          <p className="text-text-secondary">{c.email}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => (
        <StatusBadge tone={c.status === "ACTIVE" ? "success" : "neutral"}>
          {c.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Master Pelanggan (Customers)"
        description="Data pelanggan dibagikan pada lingkup Owner dan digunakan untuk tujuan pengiriman atau Purchase Order."
        actions={
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            + Tambah Pelanggan
          </Button>
        }
      />

      <Alert
        variant="info"
        title="Aturan Lingkup Data Pelanggan"
        description="Pelanggan terikat pada Owner aktif dan tersimpan di database SQLite, sehingga dapat dipilih oleh seluruh gudang yang berada di bawah Owner ini."
      />

      {/* Toolbar Filter */}
      <ListToolbar
        searchPlaceholder="Cari nama, kode pelanggan, atau email..."
        searchValue={search}
        onSearchChange={setSearch}
        activeFilters={activeFilters}
        onRemoveFilter={() => setSearch("")}
        onClearFilters={() => setSearch("")}
      />

      {/* Tabel Pelanggan */}
      <div className="rounded-lg border border-border bg-surface">
        <DataTable
          caption="Daftar data master pelanggan"
          columns={columns}
          rows={pagedCustomers}
          getRowId={(c) => c.id}
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

      {/* Modal Tambah Pelanggan Baru */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Tambah Pelanggan Baru"
        description="Data pelanggan ini akan tersimpan permanen di database dan dapat diakses lintas gudang."
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Kode Pelanggan"
              required
              placeholder="Mis: CUST-003"
              value={code}
              error={errors.code}
              onChange={(e) => setCode(e.target.value)}
            />
            <TextField
              label="Nama Lengkap Pelanggan"
              required
              placeholder="PT / Toko / Perorangan..."
              value={name}
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Nomor Telepon / WhatsApp"
              placeholder="0812-xxxx-xxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <TextField
              label="Email Kontak"
              type="email"
              placeholder="kontak@perusahaan.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <TextareaField
            label="Alamat Lengkap Pengiriman"
            placeholder="Jalan, nomor, gedung, kota, kode pos..."
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
              loadingLabel="Menyimpan Pelanggan..."
            >
              Simpan Pelanggan
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
