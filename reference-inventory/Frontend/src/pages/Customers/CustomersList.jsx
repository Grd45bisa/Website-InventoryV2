import React from 'react';
import { Eye, Edit3, Trash2, User, ChevronRight, Award } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';

const STATUS_CLASS = {
  Active: 'customers-status-badge--active',
  Pending: 'customers-status-badge--pending',
  Archived: 'customers-status-badge--archived',
};

export default function CustomersList({ customers, onView, onEdit, onDelete }) {
  const { t } = useApp();

  const { data: pointBalances = {} } = useQuery({
    queryKey: ['contacts-point-balances'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/contacts/points/balances');
      if (!res.ok) return {};
      const json = await res.json();
      return json.data ?? {};
    },
    staleTime: 15000,
  });

  if (customers.length === 0) return null;

  return (
    <div className="customers-list-wrapper">
      <table className="table customers-list-table">
        <thead>
          <tr>
            <th className="customers-th--desktop" style={{ width: '48px' }}>#</th>
            <th>{t('customers.col.name')}</th>
            <th className="customers-th--hide-mobile">{t('customers.col.phone')}</th>
            <th className="customers-th--hide-mobile">{t('customers.col.email')}</th>
            <th className="customers-th--hide-tablet">{t('customers.col.city')}</th>
            <th className="customers-th--hide-tablet">PIC Sales</th>
            <th style={{ width: '130px' }}>Saldo Cashback</th>
            <th style={{ width: '110px' }}>{t('customers.col.status')}</th>
            <th className="customers-th--hide-tablet" style={{ width: '90px' }}>{t('customers.col.tag')}</th>
            <th style={{ width: '100px' }}>{t('customers.col.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c, idx) => {
            const storeName = (c.name && c.name.trim() && c.name !== '-') ? c.name.trim() : (c.storeName || '-');
            const ownerName = (c.name && c.name.trim() && c.name !== '-') ? (c.storeName || '') : '';
            const phone = (c.phone && c.phone.trim() && c.phone !== '—') ? c.phone.trim() : '';
            const balance = Number(pointBalances[c.id] || 0);

            return (
              <tr key={c.id} className="customers-list__row interactive" onClick={() => onView(c)}>
                <td className="customers-td--avatar">
                  <div className="customers-avatar-box">
                    <User size={18} className="customers-avatar-icon" />
                  </div>
                </td>
                <td className="customers-td--mono" data-label="#">{idx + 1}</td>
                <td className="customers-td--name" data-label={t('customers.col.name')}>
                  <div className="customers-list__name-wrap">
                    <span className="customers-list__store-title">{storeName}</span>
                    <div className="customers-list__sub-info">
                      {ownerName && <span className="customers-list__owner-val">{ownerName}</span>}
                      {ownerName && phone && <span className="customers-list__sub-dot">·</span>}
                      {phone && <span className="customers-list__phone-val">{phone}</span>}
                    </div>
                  </div>
                </td>
                <td className="customers-td--hide-mobile" data-label={t('customers.col.phone')}>{c.phone || '—'}</td>
                <td className="customers-td--hide-mobile" data-label={t('customers.col.email')}>{c.email || '—'}</td>
                <td className="customers-td--hide-tablet" data-label={t('customers.col.city')}>{c.city || '—'}</td>
                <td className="customers-td--hide-tablet" data-label="PIC Sales">{c.picSales || '—'}</td>
                <td data-label="Saldo Cashback">
                  <span className={`customers-point-badge ${balance > 0 ? 'customers-point-badge--has' : ''}`}>
                    {balance > 0 && <Award size={12} />}
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(balance)}
                  </span>
                </td>
                <td className="customers-td--status" data-label={t('customers.col.status')}>
                  <span className={`customers-status-badge ${STATUS_CLASS[c.status] || ''}`}>
                    {t(`customers.status.${c.status.toLowerCase()}`)}
                  </span>
                </td>
                <td className="customers-td--hide-tablet" data-label={t('customers.col.tag')}>
                  <span className="customers-tag-pill">{c.tag || '—'}</span>
                </td>
                <td className="customers-td--actions" data-label={t('customers.col.actions')}>
                  <div className="customers-list__actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn-icon" onClick={() => onView(c)} title={t('customers.action.view')}>
                      <Eye size={15} />
                    </button>
                    <button className="btn-icon" onClick={() => onEdit(c)} title={t('customers.action.edit')}>
                      <Edit3 size={15} />
                    </button>
                    <button className="btn-icon btn-icon--danger" onClick={() => onDelete(c)} title={t('customers.action.delete')}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
                <td className="customers-td--chevron">
                  <div className="customers-list__chevron-box">
                    <ChevronRight size={18} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
