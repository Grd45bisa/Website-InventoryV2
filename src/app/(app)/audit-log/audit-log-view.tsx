"use client";

import React, { useState, useMemo } from "react";
import {

  FIXTURE_AUDIT_LOGS,
  AuditLogEntry,
} from "@/lib/demo/inventory-fixtures";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge, FeedbackState } from "@/components/ui/feedback";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/form-fields";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { EyeIcon } from "@/components/ui/icons";

const PAGE_SIZE = 50;

export function AuditLogView({ initialLogs }: { initialLogs?: AuditLogEntry[] }) {
  const [logs] = useState<AuditLogEntry[]>(
    initialLogs && initialLogs.length > 0 ? initialLogs : FIXTURE_AUDIT_LOGS
  );

  const [search, setSearch] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchSearch =
        log.actorEmail.toLowerCase().includes(search.toLowerCase()) ||
        log.targetId.toLowerCase().includes(search.toLowerCase()) ||
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        log.details.toLowerCase().includes(search.toLowerCase());

      const matchType = targetTypeFilter === "ALL" || log.targetType === targetTypeFilter;

      return matchSearch && matchType;
    });
  }, [logs, search, targetTypeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedLogs = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, safePage]);

  const getActionBadge = (action: string) => {
    if (action.includes("CREATE")) return <Badge variant="success" size="sm">{action}</Badge>;
    if (action.includes("CANCEL")) return <Badge variant="danger" size="sm">{action}</Badge>;
    if (action.includes("GRANT")) return <Badge variant="warning" size="sm">{action}</Badge>;
    return <Badge variant="neutral" size="sm">{action}</Badge>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Log Audit Sistem"
        description="Catatan jejak aktivitas operasional, perubahan status dokumen sensitif, dan verifikasi kepatuhan transaksi."
      />

      <div className="rounded border border-info/30 bg-surface-subtle p-3 text-xs text-text-secondary space-y-1">
        <div className="font-semibold text-text-primary">Prinsip Integritas Audit (RPD §7.10 & §10):</div>
        <div>
          1. <strong className="text-text-primary">Append-Only & Immutable:</strong> Catatan audit tersimpan permanen dan tidak dapat diubah atau dihapus oleh siapapun.
        </div>
        <div>
          2. Rekaman tidak menyimpan rahasia, password, session token, atau database credentials.
        </div>
        <div>
          3. Setiap aksi yang memengaruhi reservasi, pelepasan kuota, Stock Opname, atau hak akses terekam secara otomatis.
        </div>
      </div>

      {/* Toolbar Filter */}
      <ListToolbar
        searchPlaceholder="Cari email pelaku, aksi, target ID, atau detail..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={
          <div className="w-48">
            <label htmlFor="target-type-filter" className="sr-only">Jenis Entitas</label>
            <Select
              id="target-type-filter"
              value={targetTypeFilter}
              onChange={(e) => setTargetTypeFilter(e.target.value)}
            >
              <option value="ALL">Semua Entitas</option>
              <option value="GOODS_IN">Barang Masuk</option>
              <option value="GOODS_OUT">Barang Keluar</option>
              <option value="STOCK_OPNAME">Stock Opname</option>
              <option value="SUPER_ADMIN_GRANT">Grant Akses Admin</option>
            </Select>
          </div>
        }
      />


      {/* Desktop Table View */}
      <div className="hidden md:block rounded border border-border-default bg-surface-card overflow-hidden">
        <table className="w-full text-left text-xs text-text-secondary border-collapse">
          <thead className="bg-surface-subtle text-text-muted border-b border-border-default uppercase font-medium">
            <tr>
              <th className="p-3">Waktu (WIB)</th>
              <th className="p-3">Pelaku (Aktor)</th>
              <th className="p-3">Role</th>
              <th className="p-3">Aksi Terlaksana</th>
              <th className="p-3">Target / Entitas</th>
              <th className="p-3">Ringkasan Perubahan</th>
              <th className="p-3 text-right">Rincian</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-text-muted">
                  Tidak ada catatan audit yang cocok dengan filter yang ditentukan.
                </td>
              </tr>
            ) : (
              pagedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-surface-subtle/50 transition-colors">
                  <td className="p-3 font-mono text-text-muted whitespace-nowrap">{log.timestamp}</td>
                  <td className="p-3 font-semibold text-text-primary">{log.actorEmail}</td>
                  <td className="p-3">
                    <Badge variant="outline" size="sm">
                      {log.actorRole}
                    </Badge>
                  </td>
                  <td className="p-3">{getActionBadge(log.action)}</td>
                  <td className="p-3 font-mono text-text-primary">
                    <span className="text-[11px] text-text-muted">{log.targetType}: </span>
                    {log.targetId}
                  </td>
                  <td className="p-3 text-text-secondary max-w-xs truncate" title={log.details}>
                    {log.details}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedLog(log)}
                      aria-label={`Rincian audit ${log.id}`}
                    >
                      <EyeIcon className="h-4 w-4" />
                      Detail
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredLogs.length === 0 ? (
          <FeedbackState
            title="Tidak Ada Log"
            description="Tidak ada log audit yang sesuai dengan pencarian."
          />
        ) : (
          pagedLogs.map((log) => (
            <div
              key={log.id}
              className="p-4 rounded border border-border-default bg-surface-card space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-text-muted">{log.timestamp}</span>
                {getActionBadge(log.action)}
              </div>
              <div className="text-xs">
                <span className="font-semibold text-text-primary">{log.actorEmail}</span>{" "}
                <span className="text-text-muted">({log.actorRole})</span>
              </div>
              <div className="text-xs font-mono text-text-secondary">
                {log.targetType}: <strong>{log.targetId}</strong>
              </div>
              <div className="text-xs text-text-muted line-clamp-2">{log.details}</div>
              <div className="border-t border-border-default pt-2 flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedLog(log)}
                >
                  Lihat Detail Audit
                </Button>

              </div>
            </div>
          ))
        )}
      </div>

      {/* Paginasi Log Audit (Maksimal 50 Data per Halaman) */}
      {filteredLogs.length > 0 && (
        <div className="rounded-lg border border-border bg-surface">
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filteredLogs.length}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Modal Detail Audit Entry */}
      <Dialog
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title="Rincian Catatan Audit"
        description={`ID Log: ${selectedLog?.id || ""}`}
      >
        {selectedLog && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 rounded bg-surface-subtle border border-border-default">
              <div>
                <span className="text-text-muted">Waktu Pencatatan:</span>
                <div className="font-mono font-semibold text-text-primary mt-0.5">
                  {selectedLog.timestamp}
                </div>
              </div>
              <div>
                <span className="text-text-muted">Aktor / Email:</span>
                <div className="font-semibold text-text-primary mt-0.5">
                  {selectedLog.actorEmail} ({selectedLog.actorRole})
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="p-3 rounded border border-border-default bg-surface-card space-y-1.5">
                <div className="text-text-muted">Aksi & Entitas Terkait:</div>
                <div className="flex items-center gap-2">
                  {getActionBadge(selectedLog.action)}
                  <span className="font-mono font-semibold text-text-primary">
                    {selectedLog.targetType} #{selectedLog.targetId}
                  </span>
                </div>
              </div>

              {selectedLog.reason && (
                <div className="p-3 rounded border border-border-default bg-surface-card space-y-1">
                  <div className="text-text-muted">Alasan Operasi:</div>
                  <div className="font-medium text-text-primary">{selectedLog.reason}</div>
                </div>
              )}

              <div className="p-3 rounded border border-border-default bg-surface-card space-y-1">
                <div className="text-text-muted">Payload / Kronologi Lengkap:</div>
                <div className="font-mono text-text-secondary whitespace-pre-wrap bg-surface-subtle p-2 rounded border border-border-default">
                  {selectedLog.details}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setSelectedLog(null)}>
                Tutup
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
