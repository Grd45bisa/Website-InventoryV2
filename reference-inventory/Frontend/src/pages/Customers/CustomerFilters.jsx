import React from 'react';
import { useApp } from '../../context/AppContext.jsx';

const FILTERS = ['all', 'active', 'pending', 'archived'];

export default function CustomerFilters({ search, onSearchChange, statusFilter, onStatusChange }) {
  const { t } = useApp();

  return (
    <div className="customers-page__filters">
      <div className="customers-page__search-wrap">
        <input
          className="input"
          placeholder={t('customers.searchPlaceholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="customers-page__status-tabs" role="tablist">
        {FILTERS.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={statusFilter === s}
            className={`customers-page__status-tab ${statusFilter === s ? 'active' : ''}`}
            onClick={() => onStatusChange(s)}
          >
            {s === 'all' ? t('customers.filterAll') : t(`customers.status.${s}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
