"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { type Column, DataTable, type DataStatus, type SortState } from "@/components/ui/data-table";
import {
  Alert,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
  type Tone,
} from "@/components/ui/feedback";
import {
  CheckboxField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/ui/form-fields";
import { ListToolbar, type ActiveFilter } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { RecordCards, ViewSwitcher, type CollectionView } from "@/components/ui/record-cards";
import { useToast } from "@/components/ui/toast";
import { uiCopy } from "@/lib/ui-copy";
import { MEDIA, useMediaQuery } from "@/lib/use-media-query";

/* ---------- Fixture DEMO: bukan data nyata ---------- */

type DemoProduct = { id: string; name: string; sku: string; tracking: "SERIAL" | "NON_SERIAL"; stock: number };
type DemoDoc = { id: string; ref: string; date: string; items: number; status: "PENDING" | "AWAITING_SN" | "COMPLETED" | "CANCELLED" };

const DEMO_PRODUCTS: DemoProduct[] = Array.from({ length: 23 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Contoh produk ${String(i + 1).padStart(2, "0")}`,
  sku: `DEMO-${String(i + 1).padStart(3, "0")}`,
  tracking: i % 3 === 0 ? "SERIAL" : "NON_SERIAL",
  stock: ((i * 7) % 40) + 1,
}));

const DEMO_DOCS: DemoDoc[] = [
  { id: "d1", ref: "DEMO-GI-0001", date: "2026-10-01", items: 2, status: "PENDING" },
  { id: "d2", ref: "DEMO-GI-0002", date: "2026-10-02", items: 5, status: "AWAITING_SN" },
  { id: "d3", ref: "DEMO-GI-0003", date: "2026-10-03", items: 1, status: "COMPLETED" },
  { id: "d4", ref: "DEMO-GI-0004", date: "2026-10-04", items: 3, status: "CANCELLED" },
];

const DOC_STATUS: Record<DemoDoc["status"], { tone: Tone; label: string }> = {
  PENDING: { tone: "neutral", label: "Pending" },
  AWAITING_SN: { tone: "warning", label: "Menunggu SN" },
  COMPLETED: { tone: "success", label: "Selesai" },
  CANCELLED: { tone: "danger", label: "Dibatalkan" },
};

const PAGE_SIZE = 5;

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
      {description ? <p className="mt-1 mb-3 text-sm text-text-secondary">{description}</p> : <div className="h-3" />}
      {children}
    </section>
  );
}

const SWATCHES: Array<{ name: string; cls: string }> = [
  { name: "background", cls: "bg-background" },
  { name: "surface", cls: "bg-surface" },
  { name: "surface-muted", cls: "bg-surface-muted" },
  { name: "border", cls: "bg-border" },
  { name: "border-strong", cls: "bg-border-strong" },
  { name: "primary", cls: "bg-primary" },
  { name: "primary-hover", cls: "bg-primary-hover" },
  { name: "success", cls: "bg-success" },
  { name: "warning", cls: "bg-warning" },
  { name: "danger", cls: "bg-danger" },
  { name: "info", cls: "bg-info" },
];

function TokenSection() {
  return (
    <Section
      title="Token warna (REKOMENDASI)"
      description="Nilai awal dari DESIGN_SYSTEM.md; belum menjadi keputusan final pengguna."
    >
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {SWATCHES.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className={`size-8 shrink-0 rounded-md border border-border-strong ${s.cls}`} />
            <code className="truncate text-xs">{s.name}</code>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <StatusBadge tone="neutral">Pending</StatusBadge>
        <StatusBadge tone="info">Informasi</StatusBadge>
        <StatusBadge tone="success">Selesai</StatusBadge>
        <StatusBadge tone="warning">Menunggu SN</StatusBadge>
        <StatusBadge tone="danger">Dibatalkan</StatusBadge>
      </div>
    </Section>
  );
}

function FormSection() {
  const toast = useToast();
  const [name, setName] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [errors, setErrors] = useState<{ name?: string; warehouse?: string; agree?: string }>({});
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim() === "") next.name = "Nama wajib diisi.";
    if (warehouse === "") next.warehouse = "Pilih salah satu gudang.";
    if (!agree) next.agree = "Konfirmasi diperlukan sebelum melanjutkan.";
    setErrors(next);
    if (Object.keys(next).length > 0) {
      // Fokuskan field pertama yang invalid (WIREFRAME.md 25).
      const first = e.currentTarget.querySelector<HTMLElement>("[aria-invalid='true']");
      first?.focus();
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.push({ tone: "info", title: "Demo selesai", description: "Validasi klien lulus. Tidak ada data dikirim atau disimpan." });
    }, 900);
  }

  return (
    <Section title="Form dan validasi" description="Label selalu terlihat; error terhubung ke field lewat aria-describedby.">
      <form noValidate onSubmit={onSubmit} className="grid max-w-3xl grid-cols-1 gap-4 rounded-lg border border-border bg-surface p-4 md:grid-cols-2">
        <TextField label="Nama contoh" required value={name} error={errors.name} hint="Teks bebas untuk demo." onChange={(e) => setName(e.target.value)} />
        <SelectField
          label="Gudang contoh"
          required
          placeholder="Pilih gudang"
          value={warehouse}
          error={errors.warehouse}
          onChange={(e) => setWarehouse(e.target.value)}
          options={[
            { value: "a", label: "Gudang Demo A" },
            { value: "b", label: "Gudang Demo B" },
            { value: "c", label: "Gudang Demo C (nonaktif)", disabled: true },
          ]}
        />
        <TextField label="Referensi (read-only)" readOnly defaultValue="Dibuat otomatis oleh sistem" hint="Referensi transaksi dibuat sistem dan tidak dapat diubah." />
        <TextField label="Kolom nonaktif" disabled defaultValue="Tidak tersedia" />
        <TextareaField className="md:col-span-2" label="Catatan" hint="Opsional." />
        <CheckboxField
          className="md:col-span-2"
          label="Saya memahami bahwa ini hanya demo"
          checked={agree}
          error={errors.agree}
          onChange={(e) => setAgree(e.target.checked)}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row md:col-span-2">
          <Button type="submit" loading={saving} loadingLabel="Memproses">Simpan demo</Button>
          <Button variant="secondary" disabled>Aksi nonaktif</Button>
        </div>
      </form>
    </Section>
  );
}

function FeedbackSection() {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [state, setState] = useState<"loading" | "empty" | "error">("empty");

  return (
    <Section title="Feedback, state, dan konfirmasi">
      <div className="flex max-w-3xl flex-col gap-3">
        <Alert tone="info" title="Informasi">Penjelasan netral untuk pengguna.</Alert>
        <Alert tone="success" title="Berhasil">Hanya tampil setelah server mengonfirmasi hasil.</Alert>
        <Alert tone="warning" title="Perlu diperiksa">Periksa kondisi sebelum melanjutkan.</Alert>
        <Alert tone="danger" title="Gagal">Tindakan gagal; perbaiki input lalu coba lagi.</Alert>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => toast.push({ tone: "info", title: "Notifikasi contoh", description: "Hilang otomatis." })}>Tampilkan toast</Button>
        <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Konfirmasi standar</Button>
        <Button variant="danger" onClick={() => setDangerOpen(true)}>Konfirmasi destruktif</Button>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface">
        <div role="group" aria-label="Pilih state contoh" className="flex flex-wrap gap-2 border-b border-border p-3">
          {(["loading", "empty", "error"] as const).map((s) => (
            <Button key={s} size="sm" variant={state === s ? "primary" : "secondary"} aria-pressed={state === s} onClick={() => setState(s)}>
              {s}
            </Button>
          ))}
        </div>
        {state === "loading" ? <LoadingState /> : null}
        {state === "empty" ? <EmptyState description="Belum ada data untuk ditampilkan. CTA hanya muncul bila aksi tersedia." /> : null}
        {state === "error" ? <ErrorState onRetry={() => setState("loading")} /> : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Posting transaksi contoh?"
        description="Ini hanya demo: dampak tindakan akan dijelaskan di sini, mis. objek terpengaruh dan apakah dapat dibatalkan."
        confirmLabel="Lanjutkan"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => setConfirmOpen(false)}
      />
      <ConfirmDialog
        open={dangerOpen}
        title="Batalkan dokumen contoh?"
        description="Demo tindakan berisiko: alasan wajib diisi dan aksi destruktif bukan tombol default."
        confirmLabel="Batalkan dokumen"
        tone="danger"
        requireReason
        onCancel={() => setDangerOpen(false)}
        onConfirm={() => setDangerOpen(false)}
      />
    </Section>
  );
}

function sortProducts(rows: DemoProduct[], sort: SortState): DemoProduct[] {
  if (!sort) return rows;
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key === "stock") return (a.stock - b.stock) * dir;
    return a.name.localeCompare(b.name) * dir;
  });
}

function ProductCatalogSection() {
  const isMd = useMediaQuery(MEDIA.md, true);
  const [override, setOverride] = useState<CollectionView | null>(null);
  // Desktop default List; mobile default Grid 2 kolom (RPD 6.3.2).
  const view: CollectionView = override ?? (isMd ? "list" : "grid");

  const [search, setSearch] = useState("");
  const [tracking, setTracking] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<DataStatus>("ready");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return DEMO_PRODUCTS.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) &&
        (!tracking || p.tracking === tracking),
    );
  }, [search, tracking]);

  const sorted = useMemo(() => sortProducts(filtered, sort), [filtered, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const active: ActiveFilter[] = [];
  if (search.trim()) active.push({ key: "search", label: `Cari: ${search.trim()}` });
  if (tracking) active.push({ key: "tracking", label: `Tracking: ${tracking === "SERIAL" ? "Serial" : "Non-serial"}` });

  const columns: Column<DemoProduct>[] = [
    { key: "name", header: "Produk", sortable: true, cell: (p) => <span className="font-medium">{p.name}</span> },
    { key: "sku", header: "SKU", cell: (p) => <code className="text-xs">{p.sku}</code> },
    {
      key: "tracking",
      header: "Tracking",
      hideBelow: "lg",
      cell: (p) => <StatusBadge tone="info">{p.tracking === "SERIAL" ? "Serial" : "Non-serial"}</StatusBadge>,
    },
    { key: "stock", header: "Stok (gudang aktif)", align: "right", sortable: true, cell: (p) => `${p.stock} pcs` },
  ];

  const emptyFiltered = (
    <EmptyState
      title={uiCopy.state.emptyFilteredTitle}
      description={uiCopy.state.emptyFilteredHint}
      action={<Button variant="secondary" onClick={() => { setSearch(""); setTracking(""); }}>{uiCopy.state.clearFilters}</Button>}
    />
  );

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }

  return (
    <Section
      title="Pola daftar: katalog produk"
      description="Desktop default List; mobile default Grid dua kolom. Stok selalu dalam konteks satu gudang aktif."
    >
      <div className="mb-3 max-w-xs">
        <SelectField
          label="State data (demo)"
          showRequirement={false}
          value={status}
          onChange={(e) => setStatus(e.target.value as DataStatus)}
          options={[
            { value: "ready", label: "ready" },
            { value: "loading", label: "loading" },
            { value: "error", label: "error" },
          ]}
        />
      </div>
      <div className="flex flex-col gap-3">
        <ListToolbar
          searchLabel="Cari nama atau SKU"
          searchValue={search}
          onSearchChange={resetPage(setSearch)}
          activeFilters={active}
          onRemoveFilter={(k) => { if (k === "search") setSearch(""); if (k === "tracking") setTracking(""); setPage(1); }}
          onClearFilters={() => { setSearch(""); setTracking(""); setPage(1); }}
          trailing={<ViewSwitcher value={view} onChange={setOverride} />}
          filters={
            <SelectField
              label="Tracking"
              showRequirement={false}
              placeholder="Semua"
              value={tracking}
              onChange={(e) => { setTracking(e.target.value); setPage(1); }}
              options={[
                { value: "SERIAL", label: "Serial" },
                { value: "NON_SERIAL", label: "Non-serial" },
              ]}
            />
          }
        />
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {view === "list" && isMd ? (
            <DataTable
              caption="Daftar produk (demo)"
              columns={columns}
              rows={pageRows}
              getRowId={(p) => p.id}
              status={status}
              sort={sort}
              onSortChange={setSort}
              empty={emptyFiltered}
              onRetry={() => setStatus("ready")}
            />
          ) : (
            <div className="p-3">
              <RecordCards
                label="Daftar produk (demo)"
                items={pageRows}
                getId={(p) => p.id}
                layout={view}
                status={status}
                empty={emptyFiltered}
                onRetry={() => setStatus("ready")}
                renderCard={(p) => (
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <code className="truncate text-xs text-text-secondary">{p.sku}</code>
                    <p className="tabular text-sm">{p.stock} pcs</p>
                    <StatusBadge tone="info" className="self-start">{p.tracking === "SERIAL" ? "Serial" : "Non-serial"}</StatusBadge>
                  </div>
                )}
              />
            </div>
          )}
          {status === "ready" && sorted.length > 0 ? (
            <Pagination page={safePage} pageSize={PAGE_SIZE} total={sorted.length} onPageChange={setPage} />
          ) : null}
        </div>
      </div>
    </Section>
  );
}

function DocumentListSection() {
  const isMd = useMediaQuery(MEDIA.md, true);
  const columns: Column<DemoDoc>[] = [
    { key: "ref", header: "Referensi", cell: (d) => <code className="text-xs">{d.ref}</code> },
    { key: "date", header: "Tanggal", cell: (d) => d.date },
    { key: "items", header: "Jumlah item", align: "right", hideBelow: "md", cell: (d) => d.items },
    {
      key: "status",
      header: "Status",
      cell: (d) => <StatusBadge tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</StatusBadge>,
    },
  ];
  return (
    <Section title="Pola daftar: dokumen transaksi" description="Tabel di tablet/desktop; satu kartu per dokumen di mobile. Status, referensi, dan jumlah item tetap tampil.">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {isMd ? (
          <DataTable caption="Daftar dokumen (demo)" columns={columns} rows={DEMO_DOCS} getRowId={(d) => d.id} />
        ) : (
          <div className="p-3">
            <RecordCards
              label="Daftar dokumen (demo)"
              items={DEMO_DOCS}
              getId={(d) => d.id}
              layout="list"
              renderCard={(d) => (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <code className="text-xs">{d.ref}</code>
                    <p className="text-sm text-text-secondary">{d.date} - {d.items} item</p>
                  </div>
                  <StatusBadge tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</StatusBadge>
                </div>
              )}
            />
          </div>
        )}
      </div>
    </Section>
  );
}

export function DesignSystemDemo() {
  return (
    <>
      <Alert tone="warning" title="Data demo" className="mb-6">
        Seluruh nama, SKU, angka, dan dokumen di halaman ini adalah fixture UI, bukan data nyata dan tidak berasal dari database.
      </Alert>
      <TokenSection />
      <FormSection />
      <FeedbackSection />
      <ProductCatalogSection />
      <DocumentListSection />
    </>
  );
}
