/**
 * Teks UI bersama Fase 2 (Bahasa Indonesia, default produk).
 *
 * TASK-018 (i18n) BLOCKED: mekanisme locale/library belum diputuskan (TASK-006).
 * Seluruh teks UI baru dipusatkan di sini dan diberi key stabil agar dapat
 * dipindah ke dictionary locale tanpa mencari string tersebar. Ini BUKAN
 * mekanisme i18n dan tidak menyediakan pergantian bahasa.
 */
export const uiCopy = {
  brand: { name: "Docuflow", subtitle: "Operasi inventory" },
  shell: {
    skipToContent: "Lewati ke konten utama",
    openMenu: "Buka menu navigasi",
    closeMenu: "Tutup menu navigasi",
    collapseSidebar: "Ciutkan sidebar",
    expandSidebar: "Perluas sidebar",
    primaryNav: "Navigasi utama",
    breadcrumb: "Breadcrumb",
    ownerLabel: "Owner",
    warehouseLabel: "Gudang",
    noWarehouse: "Belum memilih gudang",
    contextLabel: "Konteks kerja aktif",
    languageLabel: "Bahasa",
    languageUnavailable: "Pilihan bahasa belum aktif (menunggu keputusan i18n).",
    demoBanner:
      "Mode demo Fase 2: konteks Owner, gudang, dan pengguna di bawah ini bukan dari sesi nyata.",
    userFooter: "Identitas pengguna aktif",
  },
  state: {
    loading: "Memuat data",
    emptyTitle: "Belum ada data",
    emptyFilteredTitle: "Tidak ada hasil untuk filter ini",
    emptyFilteredHint: "Ubah atau bersihkan filter untuk melihat data lain.",
    errorTitle: "Data tidak dapat dimuat",
    errorHint: "Periksa koneksi lalu coba lagi.",
    retry: "Coba lagi",
    clearFilters: "Bersihkan filter",
    required: "wajib diisi",
    errorPrefix: "Kesalahan:",
    optional: "opsional",
  },
  table: {
    sortAscending: "urut naik",
    sortDescending: "urut turun",
    sortNone: "belum diurutkan",
    viewSwitcher: "Tampilan daftar",
    viewList: "List",
    viewGrid: "Grid",
    pagination: "Paginasi",
    previous: "Sebelumnya",
    next: "Berikutnya",
    pageOf: (page: number, total: number) => `Halaman ${page} dari ${total}`,
    rangeOf: (from: number, to: number, total: number) =>
      `Menampilkan ${from}-${to} dari ${total}`,
    search: "Cari",
    activeFilters: "Filter aktif",
    filters: "Filter",
    removeFilter: (label: string) => `Hapus filter ${label}`,
  },
  dialog: {
    cancel: "Batal",
    reasonRequired: "Alasan wajib diisi.",
  },
  toast: { dismiss: "Tutup notifikasi", region: "Notifikasi" },
} as const;
