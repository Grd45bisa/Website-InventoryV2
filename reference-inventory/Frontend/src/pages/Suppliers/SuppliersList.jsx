import React from 'react';
import { Eye, Edit3, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';

const STATUS_CLASS = {
  Active: 'suppliers-status-badge--active',
  Pending: 'suppliers-status-badge--pending',
  Archived: 'suppliers-status-badge--archived',
};

export default function SuppliersList({ suppliers, onView, onEdit, onDelete }) {
  const { t } = useApp();

  if (suppliers.length === 0) return null;

  return (
    <div className="suppliers-list-wrapper">
      <table className="table suppliers-list-table">
        <thead>
          <tr>
            <th style={{ width: '48px' }}>#</th>
            <th>{t('suppliers.col.name')}</th>
            <th className="suppliers-th--hide-mobile">{t('suppliers.col.phone')}</th>
            <th className="suppliers-th--hide-mobile">{t('suppliers.col.email')}</th>
            <th className="suppliers-th--hide-tablet">{t('suppliers.col.city')}</th>
            <th style={{ width: '110px' }}>{t('suppliers.col.status')}</th>
            <th className="suppliers-th--hide-tablet" style={{ width: '90px' }}>{t('suppliers.col.tag')}</th>
            <th style={{ width: '100px' }}>{t('suppliers.col.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((c, idx) => (
            <tr key={c.id} className="suppliers-list__row interactive" onClick={() => onView(c)}>
              <td className="suppliers-td--mono" data-label="#">{idx + 1}</td>
              <td data-label={t('suppliers.col.name')}>
                <div className="suppliers-list__name">{c.name}</div>
              </td>
              <td className="suppliers-td--hide-mobile" data-label={t('suppliers.col.phone')}>{c.phone || '—'}</td>
              <td className="suppliers-td--hide-mobile" data-label={t('suppliers.col.email')}>{c.email || '—'}</td>
              <td className="suppliers-td--hide-tablet" data-label={t('suppliers.col.city')}>{c.city || '—'}</td>
              <td data-label={t('suppliers.col.status')}>
                <span className={`suppliers-status-badge ${STATUS_CLASS[c.status] || ''}`}>
                  {t(`suppliers.status.${c.status.toLowerCase()}`)}
                </span>
              </td>
              <td className="suppliers-td--hide-tablet" data-label={t('suppliers.col.tag')}>
                <span className="suppliers-tag-pill">{c.tag || '—'}</span>
              </td>
              <td data-label={t('suppliers.col.actions')}>
                <div className="suppliers-list__actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn-icon" onClick={() => onView(c)} title={t('suppliers.action.view')}>
                    <Eye size={15} />
                  </button>
                  <button className="btn-icon" onClick={() => onEdit(c)} title={t('suppliers.action.edit')}>
                    <Edit3 size={15} />
                  </button>
                  <button className="btn-icon btn-icon--danger" onClick={() => onDelete(c)} title={t('suppliers.action.delete')}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
