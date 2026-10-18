import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, FileText, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './RecentActivity.css';

const TYPE_ICONS = {
  goods_in: ArrowDownToLine,
  goods_out: ArrowUpFromLine,
  invoice: FileText,
};

const TYPE_LABELS = {
  goods_in: 'Masuk',
  goods_out: 'Keluar',
  invoice: 'Invoice',
};

export default function RecentActivity({ onSelect }) {
  const { t, lang } = useApp();

  const {
    data: rawDocs,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/documents?limit=50');
      if (!res.ok) throw new Error('Failed to load documents');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
  });

  const recentDocs = useMemo(() => {
    const docs = rawDocs ?? [];
    const completed = docs.filter((d) => d.status === 'completed');
    completed.sort((a, b) => new Date(b.created_at || b.issue_date) - new Date(a.created_at || a.issue_date));
    return completed.slice(0, 5);
  }, [rawDocs]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const docTypeLabel = (type) => {
    if (lang === 'id') {
      return TYPE_LABELS[type] || type;
    }
    if (type === 'goods_in') return 'Inbound';
    if (type === 'goods_out') return 'Outbound';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const DocIcon = (type) => TYPE_ICONS[type] || FileText;

  const getChipClass = (type) => {
    if (type === 'goods_in') return 'chip-success';
    if (type === 'goods_out') return 'chip-warning';
    return 'chip-info';
  };

  const getIconClass = (type) => {
    if (type === 'goods_in') return 'dashboard-recent-activity__doc-icon--in';
    if (type === 'goods_out') return 'dashboard-recent-activity__doc-icon--out';
    return 'dashboard-recent-activity__doc-icon--invoice';
  };

  if (isLoading) {
    return (
      <div className="dashboard-recent-activity">
        <h2 className="dashboard-recent-activity__title">{t('dashboard.recentActivity')}</h2>
        <div className="dashboard-recent-activity__skeleton">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton-block" style={{ width: '100%', height: 42, marginBottom: 8 }} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="dashboard-recent-activity">
        <h2 className="dashboard-recent-activity__title">{t('dashboard.recentActivity')}</h2>
        <div className="dashboard-recent-activity__error">
          <AlertCircle size={32} className="dashboard-recent-activity__error-icon" />
          <p>{t('page.loading')}</p>
          <button type="button" className="btn btn-secondary interactive" onClick={refetch}>
            {t('general.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (recentDocs.length === 0) {
    return (
      <div className="dashboard-recent-activity">
        <h2 className="dashboard-recent-activity__title">{t('dashboard.recentActivity')}</h2>
        <div className="dashboard-recent-activity__empty">
          <p>{t('page.underConstruction') || 'No activity recorded yet.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-recent-activity">
      <h2 className="dashboard-recent-activity__title">{t('dashboard.recentActivity')}</h2>
      <div className="dashboard-recent-activity__table-wrap">
        <table className="dashboard-recent-activity__table">
          <thead>
            <tr>
              <th>{t('goodsIn.docNumber') || 'Document'}</th>
              <th>Type</th>
              <th>Date</th>
              <th>Contact</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {recentDocs.map((doc) => {
              const Icon = DocIcon(doc.document_type);
              const iconCls = getIconClass(doc.document_type);
              const chipCls = getChipClass(doc.document_type);
              return (
                <tr
                  key={doc.id}
                  className="dashboard-recent-activity__row interactive"
                  onClick={() => onSelect?.(doc)}
                >
                  <td className="dashboard-recent-activity__cell-doc">
                    <div className={`dashboard-recent-activity__icon-badge ${iconCls}`}>
                      <Icon size={14} />
                    </div>
                    <span className="dashboard-recent-activity__doc-num">{doc.document_number || '—'}</span>
                  </td>
                  <td data-label="Tipe">
                    <span className={`chip ${chipCls}`}>{docTypeLabel(doc.document_type)}</span>
                  </td>
                  <td className="dashboard-recent-activity__cell-date" data-label="Tanggal">{formatDate(doc.issue_date)}</td>
                  <td className="dashboard-recent-activity__cell-contact" data-label="Pelanggan">{doc.contact_name || '—'}</td>
                  <td className="dashboard-recent-activity__cell-total" data-label="Total">
                    {(doc.total || 0).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
