import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, AlertCircle, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './RecentPurchaseOrders.css';

function cleanVendorName(name) {
  if (!name) return '—';
  if (name.endsWith(' (-)')) {
    return name.slice(0, -4).trim();
  }
  if (name.includes('(')) {
    const match = name.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      const store = match[1].trim();
      const owner = match[2].trim();
      if (owner === '-') return store;
      return `${store} (${owner})`;
    }
  }
  return name;
}

export default function RecentPurchaseOrders() {
  const { t, lang } = useApp();
  const navigate = useNavigate();

  const {
    data: rawPOs,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/purchase-orders?limit=20');
      if (!res.ok) throw new Error('Failed to load purchase orders');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
  });

  const recentPOs = useMemo(() => {
    const list = Array.isArray(rawPOs) ? [...rawPOs] : [];
    list.sort((a, b) => new Date(b.created_at || b.po_date) - new Date(a.created_at || a.po_date));
    return list.slice(0, 5);
  }, [rawPOs]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusChip = (status) => {
    const st = status || 'draft';
    const statusMap = {
      draft: { label: t('po.status.draft') || 'Draft', cls: 'chip-secondary' },
      pending: { label: t('po.status.pending') || 'Pending', cls: 'chip-warning' },
      submitted: { label: t('po.status.submitted') || 'Terkirim', cls: 'chip-info' },
      approved: { label: t('po.status.approved') || 'Disetujui', cls: 'chip-success' },
      cancelled: { label: t('po.status.cancelled') || 'Dibatalkan', cls: 'chip-danger' },
    };
    return statusMap[st] || { label: st, cls: 'chip-secondary' };
  };

  return (
    <div className="dashboard-recent-po">
      <div className="dashboard-recent-po__header">
        <div className="dashboard-recent-po__title-wrap">
          <div className="dashboard-recent-po__icon-badge">
            <ClipboardList size={16} />
          </div>
          <div>
            <h2 className="dashboard-recent-po__title">
              {t('dashboard.recentPO.title') || 'Purchase Orders Terbaru'}
            </h2>
            <p className="dashboard-recent-po__subtitle">
              {t('dashboard.recentPO.subtitle') || 'Daftar PO yang baru dibuat atau diperbarui'}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="dashboard-recent-po__create-btn interactive"
          onClick={() => navigate('/purchase-orders/create')}
        >
          <Plus size={14} />
          <span>{t('dashboard.recentPO.create') || 'Buat PO'}</span>
        </button>
      </div>

      {isLoading && (
        <div className="dashboard-recent-po__skeleton">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton-block" style={{ width: '100%', height: 42, marginBottom: 8 }} />
          ))}
        </div>
      )}

      {isError && (
        <div className="dashboard-recent-po__error">
          <AlertCircle size={32} className="dashboard-recent-po__error-icon" />
          <p>{t('page.loading') || 'Gagal memuat data'}</p>
          <button type="button" className="btn btn-secondary interactive" onClick={refetch}>
            {t('general.retry') || 'Coba Lagi'}
          </button>
        </div>
      )}

      {!isLoading && !isError && recentPOs.length === 0 && (
        <div className="dashboard-recent-po__empty">
          <ClipboardList size={28} className="dashboard-recent-po__empty-icon" />
          <p>{t('dashboard.recentPO.empty') || 'Belum ada Purchase Order tercatat'}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm interactive"
            onClick={() => navigate('/purchase-orders/create')}
          >
            <Plus size={14} />
            <span>{t('dashboard.recentPO.create') || 'Buat PO Baru'}</span>
          </button>
        </div>
      )}

      {!isLoading && !isError && recentPOs.length > 0 && (
        <>
          <div className="dashboard-recent-po__table-wrap">
            <table className="dashboard-recent-po__table">
              <thead>
                <tr>
                  <th>{t('po.list.col.poNumber') || 'No. PO'}</th>
                  <th>{t('po.list.col.vendor') || 'Vendor'}</th>
                  <th>{t('po.list.col.date') || 'Tanggal'}</th>
                  <th>{t('po.list.col.status') || 'Status'}</th>
                  <th style={{ textAlign: 'right' }}>{t('po.form.items') || 'Item'}</th>
                </tr>
              </thead>
              <tbody>
                {recentPOs.map((po) => {
                  const statusInfo = getStatusChip(po.status);
                  const itemsCount = Array.isArray(po.items) ? po.items.length : (po.item_count || 1);
                  return (
                    <tr
                      key={po.id}
                      className="dashboard-recent-po__row interactive"
                      onClick={() => navigate(`/purchase-orders/${po.id}`)}
                    >
                      <td className="dashboard-recent-po__cell-doc">
                        <span className="dashboard-recent-po__doc-num">{po.po_number || '—'}</span>
                      </td>
                      <td className="dashboard-recent-po__cell-vendor" data-label="Vendor">
                        {cleanVendorName(po.vendor_name)}
                      </td>
                      <td className="dashboard-recent-po__cell-date" data-label="Tanggal">
                        {formatDate(po.po_date || po.created_at)}
                      </td>
                      <td data-label="Status">
                        <span className={`chip ${statusInfo.cls}`}>{statusInfo.label}</span>
                      </td>
                      <td className="dashboard-recent-po__cell-items" data-label="Item" style={{ textAlign: 'right' }}>
                        <span className="dashboard-recent-po__item-badge">
                          {itemsCount} item
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="dashboard-recent-po__footer">
            <button
              type="button"
              className="dashboard-recent-po__view-all-btn interactive"
              onClick={() => navigate('/purchase-orders')}
            >
              <span>{t('dashboard.recentPO.viewAll') || 'Lihat Selengkapnya'}</span>
              <ChevronRight size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
