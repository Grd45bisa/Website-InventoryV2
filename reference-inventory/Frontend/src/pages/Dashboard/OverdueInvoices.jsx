import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Clock, AlertTriangle, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './OverdueInvoices.css';

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysLabel(days, lang) {
  if (days === 0) return lang === 'id' ? 'Hari ini' : 'Today';
  if (days === 1) return lang === 'id' ? 'Besok' : 'Tomorrow';
  return `${days} ${lang === 'id' ? 'hari' : 'days'}`;
}

export default function OverdueInvoices() {
  const { t, lang } = useApp();
  const navigate = useNavigate();

  const { data: rawDocs, isLoading } = useQuery({
    queryKey: ['documents', 'completed-invoices'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/documents?type=invoice&status=completed&limit=500');
      if (!res.ok) throw new Error('Failed to load documents');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
  });

  const { overdueList, upcomingList } = useMemo(() => {
    const docs = rawDocs ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in5Days = new Date(today);
    in5Days.setDate(in5Days.getDate() + 5);

    const unpaid = docs.filter((d) => {
      const terms = d.payment_terms || 'unpaid:0';
      const [payStatus] = terms.split(':');
      if (payStatus === 'paid') return false;
      return !!d.due_date;
    });

    const overdue = [];
    const upcoming = [];

    unpaid.forEach((d) => {
      const due = new Date(d.due_date);
      if (due < today) {
        const daysLate = Math.floor((today - due) / (1000 * 60 * 60 * 24));
        overdue.push({ ...d, daysLate });
      } else if (due <= in5Days) {
        const daysLeft = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
        upcoming.push({ ...d, daysLeft });
      }
    });

    overdue.sort((a, b) => b.daysLate - a.daysLate);
    upcoming.sort((a, b) => a.daysLeft - b.daysLeft);

    return { overdueList: overdue, upcomingList: upcoming };
  }, [rawDocs]);

  const isEmpty = overdueList.length === 0 && upcomingList.length === 0;

  if (isLoading) {
    return (
      <div className="overdue-card overdue-card--skeleton">
        <div className="skeleton-block" style={{ width: 140, height: 14 }} />
      </div>
    );
  }

  return (
    <div className={`overdue-card ${isEmpty ? 'overdue-card--empty' : ''}`}>
      <div className="overdue-card__head">
        <div className="overdue-card__head-left">
          <Clock size={16} className={`overdue-card__icon ${overdueList.length === 0 && upcomingList.length > 0 ? 'overdue-card__icon--warning' : ''}`} />
          <h3 className="overdue-card__title">{t('dashboard.overdue.title')}</h3>
        </div>
        {!isEmpty && (
          <span className="overdue-card__badge">{overdueList.length + upcomingList.length}</span>
        )}
      </div>

      {isEmpty ? (
        <div className="overdue-card__empty">
          <AlertTriangle size={16} />
          <span>{t('dashboard.overdue.empty')}</span>
        </div>
      ) : (
        <div className="overdue-card__list">
          {upcomingList.length > 0 && (
            <>
              <div className="overdue-card__subhead">
                {t('dashboard.overdue.dueSoon')}
              </div>
              {upcomingList.slice(0, 3).map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  className={`overdue-card__item ${doc.daysLeft <= 2 ? 'overdue-card__item--urgent' : 'overdue-card__item--upcoming'}`}
                  onClick={() => navigate('/document/' + doc.id)}
                >
                  <div className="overdue-card__item-left">
                    <span className="overdue-card__item-name">{doc.contact_name || '\u2014'}</span>
                    <span className="overdue-card__item-meta">
                      {t('dashboard.overdue.due')} {formatDate(doc.due_date)}
                    </span>
                  </div>
                  <div className="overdue-card__item-right">
                    <span className="overdue-card__item-days">{daysLabel(doc.daysLeft, lang)}</span>
                    <ChevronRight size={14} className="overdue-card__item-chevron" />
                  </div>
                </button>
              ))}
            </>
          )}

          {overdueList.length > 0 && (
            <>
              <div className="overdue-card__subhead overdue-card__subhead--danger">
                {t('dashboard.overdue.overdue')}
              </div>
              {overdueList.slice(0, 3).map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  className="overdue-card__item overdue-card__item--overdue"
                  onClick={() => navigate('/document/' + doc.id)}
                >
                  <div className="overdue-card__item-left">
                    <span className="overdue-card__item-name">{doc.contact_name || '\u2014'}</span>
                    <span className="overdue-card__item-meta">
                      {t('dashboard.overdue.due')} {formatDate(doc.due_date)}
                    </span>
                  </div>
                  <div className="overdue-card__item-right">
                    <span className="overdue-card__item-days">{t('dashboard.overdue.days', { days: doc.daysLate })}</span>
                    <ChevronRight size={14} className="overdue-card__item-chevron" />
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
