import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Package, FileText, Users, Key, Layout, Settings, Layers, 
  Search, ChevronDown, ChevronUp, RefreshCw, History 
} from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './AuditLogPage.css';

const ITEMS_PER_PAGE = 25;
const IGNORED_KEYS = ['id', 'owner_id', 'created_at', 'updated_at', 'created_by', 'ownerId', 'tenant_id', 'updated_by'];

const ACTION_CONFIG = {
  created: { labelKey: 'auditLog.action.created', className: 'audit-log-badge--created' },
  updated: { labelKey: 'auditLog.action.updated', className: 'audit-log-badge--updated' },
  deleted: { labelKey: 'auditLog.action.deleted', className: 'audit-log-badge--deleted' },
};

function formatRelativeTime(dateStr, lang) {
  if (!dateStr) return '—';
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return lang === 'id' ? 'Baru saja' : 'Just now';
  if (diffMins < 60) return lang === 'id' ? `${diffMins} menit lalu` : `${diffMins}m ago`;
  if (diffHours < 24) return lang === 'id' ? `${diffHours} jam lalu` : `${diffHours}h ago`;
  if (diffDays < 7) return lang === 'id' ? `${diffDays} hari lalu` : `${diffDays}d ago`;
  
  return d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric',
    month: 'short'
  });
}

function formatDateFull(dateStr, lang) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AuditLogPage() {
  const { t, lang } = useApp();

  // Lookup queries for resolving UUIDs to human-readable names
  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/products?limit=1000');
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? json;
    },
    staleTime: 5 * 60000, // cache for 5 minutes
  });

  const { data: documentsData } = useQuery({
    queryKey: ['documents-lookup'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/documents?limit=1000');
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? json;
    },
    staleTime: 5 * 60000,
  });

  const productsMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(productsData)) {
      productsData.forEach((p) => {
        if (p?.id) map.set(p.id, p);
      });
    }
    return map;
  }, [productsData]);

  const documentsMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(documentsData)) {
      documentsData.forEach((d) => {
        if (d?.id) map.set(d.id, d);
      });
    }
    return map;
  }, [documentsData]);

  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actionFilter, setActionFilter] = useState(''); // client-side action filter: '', 'created', 'updated', 'deleted'
  const [page, setPage] = useState(1);
  const [expandedRowId, setExpandedRowId] = useState(null);

  const offset = (page - 1) * ITEMS_PER_PAGE;

  const queryParams = new URLSearchParams({ limit: String(ITEMS_PER_PAGE), offset: String(offset) });
  if (search.trim()) queryParams.set('search', search.trim());
  if (entityType) queryParams.set('type', entityType);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['audit-log', offset, search, entityType],
    queryFn: async () => {
      const res = await api.get(`/api/workspace/history?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Failed to load audit log');
      return res.json();
    },
    placeholderData: (previousData) => previousData,
  });

  const rawRows = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  // Client-side action filter implementation
  const filteredRows = useMemo(() => {
    if (!actionFilter) return rawRows;
    return rawRows.filter((row) => row.action === actionFilter);
  }, [rawRows, actionFilter]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
    setExpandedRowId(null);
  };

  const handleEntityTabClick = (value) => {
    setEntityType(value);
    setPage(1);
    setExpandedRowId(null);
  };

  const handleActionChipClick = (value) => {
    setActionFilter(value);
    setExpandedRowId(null);
  };

  const toggleRowExpanded = (rowId) => {
    setExpandedRowId(expandedRowId === rowId ? null : rowId);
  };

  // Get Actor Initial Avatar Character
  const getActorInitial = (name) => {
    if (!name) return '?';
    return name.trim().charAt(0).toUpperCase();
  };

  // Clean value rendering helper
  const renderValue = (val, key) => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? (lang === 'id' ? 'Ya' : 'Yes') : (lang === 'id' ? 'Tidak' : 'No');
    
    // Resolve UUID keys to names dynamically!
    if (typeof val === 'string' && val.length === 36) {
      const loweredKey = (key || '').toLowerCase();
      
      // 1. Check if it's a product ID
      if (loweredKey.includes('product_id') || loweredKey.includes('productid')) {
        const prod = productsMap.get(val);
        if (prod) {
          return `${prod.name} (${prod.sku})`;
        }
      }
      
      // 2. Check if it's a document ID
      if (
        loweredKey.includes('document_id') || 
        loweredKey.includes('documentid') || 
        loweredKey.includes('goods_in_') || 
        loweredKey.includes('goods_out_')
      ) {
        const doc = documentsMap.get(val);
        if (doc) {
          const typeStr = doc.document_type === 'goods_in' ? 'Goods In' : doc.document_type === 'goods_out' ? 'Goods Out' : 'Invoice';
          return `${doc.document_number} (${typeStr})`;
        }
      }
    }
    
    if (typeof val === 'object') {
      try {
        if (Array.isArray(val)) {
          if (val.length === 0) return '[]';
          
          // Check if it is an array of objects (like document items)
          if (typeof val[0] === 'object' && val[0] !== null) {
            return (
              <ul className="diff-item-list" style={{ margin: 0, paddingLeft: '16px', listStyleType: 'disc', textAlign: 'left' }}>
                {val.map((item, idx) => {
                  const name = item.item_name || item.name || item.product_name || 'Item';
                  const sku = item.sku ? ` (${item.sku})` : '';
                  const qty = item.quantity ?? item.qty ?? 0;
                  const unit = item.unit || 'pcs';
                  
                  const priceVal = item.unit_price ?? item.price;
                  const priceStr = priceVal !== undefined ? ` @ Rp ${Number(priceVal).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US')}` : '';
                  
                  return (
                    <li key={idx} style={{ marginBottom: '4px', lineHeight: '1.4' }}>
                      <strong>{name}</strong>{sku}: {qty} {unit}{priceStr}
                    </li>
                  );
                })}
              </ul>
            );
          }
          
          return val.map(x => String(x)).join(', ');
        }
        
        // If it's a plain object (like metadata or config)
        const keys = Object.keys(val).filter(k => !IGNORED_KEYS.includes(k));
        if (keys.length === 0) return '{}';
        return (
          <ul className="diff-item-list" style={{ margin: 0, paddingLeft: '16px', listStyleType: 'circle', textAlign: 'left' }}>
            {keys.map((k) => (
              <li key={k} style={{ marginBottom: '2px', lineHeight: '1.4' }}>
                <strong>{formatPropKey(k)}:</strong> {renderValue(val[k], k)}
              </li>
            ))}
          </ul>
        );
      } catch (err) {
        return JSON.stringify(val);
      }
    }
    
    // Numeric formatting for total/subtotal amounts
    if (typeof val === 'number') {
      if (val > 1000 && (val % 10 === 0)) {
        return `Rp ${val.toLocaleString(lang === 'id' ? 'id-ID' : 'en-US')}`;
      }
      return val.toLocaleString(lang === 'id' ? 'id-ID' : 'en-US');
    }

    // If it's a string, let's see if it's a JSON string representing an array or object
    if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
      try {
        const parsed = JSON.parse(val);
        return renderValue(parsed, key); // format recursively
      } catch (e) {
        // Fallback to normal string
      }
    }

    return String(val);
  };

  // Label formatting helper for property keys
  const formatPropKey = (key) => {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase());
  };

  // Translate / Format Entity Types for readable values
  const formatEntityType = (type) => {
    if (!type) return '—';
    if (type === 'Product Serials' || type === 'ProductSerials') {
      return lang === 'id' ? 'Serial' : 'Serials';
    }
    if (lang === 'id') {
      if (type === 'Products') return 'Produk';
      if (type === 'Documents') return 'Dokumen';
      if (type === 'Contacts') return 'Kontak';
      if (type === 'Templates') return 'Template';
      if (type === 'Settings') return 'Pengaturan';
    }
    return type;
  };

  // Diff Engine
  const getRowDiff = (row) => {
    const before = row.before_data || {};
    const after = row.after_data || {};
    const action = row.action;

    const diff = [];
    const allKeys = Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)])
    ).filter((k) => !IGNORED_KEYS.includes(k));

    if (action === 'created') {
      allKeys.forEach((key) => {
        const afterVal = after[key];
        if (afterVal !== undefined && afterVal !== null && afterVal !== '') {
          diff.push({ key, before: null, after: afterVal });
        }
      });
    } else if (action === 'deleted') {
      allKeys.forEach((key) => {
        const beforeVal = before[key];
        if (beforeVal !== undefined && beforeVal !== null && beforeVal !== '') {
          diff.push({ key, before: beforeVal, after: null });
        }
      });
    } else {
      // updated
      allKeys.forEach((key) => {
        const beforeVal = before[key];
        const afterVal = after[key];
        if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
          diff.push({ key, before: beforeVal, after: afterVal });
        }
      });
    }

    return diff;
  };

  const entityTabs = [
    { value: '', labelKey: 'auditLog.filterAll', icon: Layers },
    { value: 'Products', labelKey: 'auditLog.filterProducts', icon: Package },
    { value: 'Documents', labelKey: 'auditLog.filterDocuments', icon: FileText },
    { value: 'Contacts', labelKey: 'auditLog.filterContacts', icon: Users },
    { value: 'Product Serials', labelKey: 'auditLog.filterSerials', icon: Key },
    { value: 'Templates', labelKey: 'auditLog.filterTemplates', icon: Layout },
    { value: 'Settings', labelKey: 'auditLog.filterSettings', icon: Settings },
  ];

  const actionChips = [
    { value: '', labelKey: 'auditLog.filter.action.all', className: 'chip-all' },
    { value: 'created', labelKey: 'auditLog.filter.action.created', className: 'chip-created' },
    { value: 'updated', labelKey: 'auditLog.filter.action.updated', className: 'chip-updated' },
    { value: 'deleted', labelKey: 'auditLog.filter.action.deleted', className: 'chip-deleted' },
  ];

  return (
    <div className="audit-log-page">
      <div className="audit-log-header-group">
        <div className="audit-log-title-area">
          <History className="audit-log-title-icon" size={24} />
          <div>
            <h1 className="audit-log-title">{t('auditLog.title')}</h1>
            <p className="audit-log-subtitle">{t('auditLog.subtitle')}</p>
          </div>
        </div>
        {totalCount > 0 && (
          <div className="audit-log-count-badge">
            <span>{totalCount} {lang === 'id' ? 'Aktivitas' : 'Activities'}</span>
          </div>
        )}
      </div>

      {/* Advanced Entity Filter Tabs */}
      <div className="audit-log-entity-tabs-container">
        <div className="audit-log-entity-tabs">
          {entityTabs.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = entityType === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                className={`audit-log-entity-tab ${isActive ? 'audit-log-entity-tab--active' : ''}`}
                onClick={() => handleEntityTabClick(tab.value)}
              >
                <TabIcon size={14} />
                <span>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search and Action Filter Toolbar */}
      <div className="audit-log-toolbar">
        <div className="audit-log-search-wrap">
          <Search className="audit-log-search-icon" size={16} />
          <input
            type="text"
            className="audit-log-search-input input"
            placeholder={t('auditLog.searchPlaceholder')}
            value={search}
            onChange={handleSearchChange}
          />
          {isFetching && <RefreshCw className="audit-log-fetch-spinner animate-spin" size={16} />}
        </div>

        {/* Action Filter Chips */}
        <div className="audit-log-action-chips">
          {actionChips.map((chip) => {
            const isActive = actionFilter === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                className={`audit-log-action-chip ${chip.className} ${isActive ? 'audit-log-action-chip--active' : ''}`}
                onClick={() => handleActionChipClick(chip.value)}
              >
                <span className="action-chip-dot" />
                <span>{t(chip.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table Container */}
      <div className="audit-log-table-wrapper">
        {isLoading ? (
          <div className="audit-log-empty-cell">
            <RefreshCw className="animate-spin" size={28} />
            <p>{t('auditLog.loading')}</p>
          </div>
        ) : isError ? (
          <div className="audit-log-empty-cell">
            <RefreshCw size={28} className="text-danger" />
            <p>{t('auditLog.error')}</p>
            <button type="button" className="btn btn-secondary interactive" onClick={() => refetch()}>
              {t('general.retry')}
            </button>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="audit-log-empty-cell">
            <History size={28} />
            <p>{t('auditLog.empty')}</p>
          </div>
        ) : (
          <table className="audit-log-table">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>{t('auditLog.table.time')}</th>
                <th style={{ width: '180px' }}>{t('auditLog.table.actor')}</th>
                <th style={{ width: '120px' }}>{t('auditLog.table.action')}</th>
                <th style={{ width: '150px' }}>{t('auditLog.table.entity')}</th>
                <th>{t('auditLog.table.entityName')}</th>
                <th style={{ width: '50px', textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const actionCfg = ACTION_CONFIG[row.action] ?? ACTION_CONFIG.updated;
                const isExpanded = expandedRowId === row.id;
                const rowDiff = getRowDiff(row);

                return (
                  <React.Fragment key={row.id}>
                    <tr 
                      className={`audit-log-table-row ${isExpanded ? 'audit-log-table-row--expanded' : ''}`}
                      onClick={() => toggleRowExpanded(row.id)}
                      title={t('auditLog.detail.rowClickTooltip')}
                    >
                      <td data-label={t('auditLog.table.time')} title={formatDateFull(row.created_at, lang)}>
                        <span className="audit-log-time">{formatRelativeTime(row.created_at, lang)}</span>
                      </td>
                      <td data-label={t('auditLog.table.actor')}>
                        <div className="audit-log-actor-cell">
                          <div className="audit-log-actor-avatar">
                            {getActorInitial(row.actor_name)}
                          </div>
                          <span className="audit-log-actor-name">{row.actor_name || 'System'}</span>
                        </div>
                      </td>
                      <td data-label={t('auditLog.table.action')}>
                        <span className={`audit-log-badge ${actionCfg.className}`}>
                          {t(actionCfg.labelKey)}
                        </span>
                      </td>
                      <td data-label={t('auditLog.table.entity')}>
                        <span className="audit-log-entity-type">{formatEntityType(row.entity_type)}</span>
                      </td>
                      <td data-label={t('auditLog.table.entityName')}>
                        <span className="audit-log-entity-name">{row.entity_name || '—'}</span>
                      </td>
                      <td className="audit-log-arrow-cell">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </td>
                    </tr>
                    
                    {/* Collapsible Differences Sub-row */}
                    {isExpanded && (
                      <tr className="audit-log-details-row">
                        <td colSpan={6}>
                          <div className="audit-log-details-panel">
                            <h4 className="audit-log-details-title">{t('auditLog.detail.title')}</h4>
                            {rowDiff.length === 0 ? (
                              <p className="audit-log-details-empty">{t('auditLog.detail.noChanges')}</p>
                            ) : (
                              <div className="audit-log-diff-table-wrap">
                                <table className="audit-log-diff-table">
                                  <thead>
                                    <tr>
                                      <th>{t('auditLog.detail.property')}</th>
                                      <th>{t('auditLog.detail.before')}</th>
                                      <th>{t('auditLog.detail.after')}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rowDiff.map((diffItem) => (
                                      <tr key={diffItem.key}>
                                        <td className="diff-cell-prop">{formatPropKey(diffItem.key)}</td>
                                        <td className="diff-cell-before">
                                          <div className="diff-removed-val">
                                            {renderValue(diffItem.before, diffItem.key)}
                                          </div>
                                        </td>
                                        <td className="diff-cell-after">
                                          <div className="diff-added-val">
                                            {renderValue(diffItem.after, diffItem.key)}
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="audit-log-pagination">
          <button
            type="button"
            className="audit-log-pagination-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('auditLog.pagination.prev')}
          </button>
          <span className="audit-log-page-indicator">
            {t('auditLog.pagination.page', { current: String(page), total: String(totalPages) })}
          </span>
          <button
            type="button"
            className="audit-log-pagination-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {t('auditLog.pagination.next')}
          </button>
        </div>
      )}
    </div>
  );
}
