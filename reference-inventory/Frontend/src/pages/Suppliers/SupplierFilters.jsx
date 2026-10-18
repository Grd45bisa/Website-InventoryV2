import React from 'react';
import { useApp } from '../../context/AppContext.jsx';

const FILTERS = ['all', 'active', 'pending', 'archived'];

export default function SupplierFilters({ search, onSearchChange, statusFilter, onStatusChange }) {
  const { t } = useApp();

  return (
    <div className="suppliers-page__filters">
      <div className="suppliers-page__search-wrap">
        <input
          className="input"
          placeholder={t('suppliers.searchPlaceholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="suppliers-page__status-tabs" role="tablist">
        {FILTERS.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={statusFilter === s}
            className={`suppliers-page__status-tab ${statusFilter === s ? 'active' : ''}`}
            onClick={() => onStatusChange(s)}
          >
            {s === 'all' ? t('suppliers.filterAll') : t(`suppliers.status.${s}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
