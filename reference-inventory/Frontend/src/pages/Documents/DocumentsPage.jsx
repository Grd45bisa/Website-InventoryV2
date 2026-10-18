import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, AlertCircle, FileText, X, Calendar, CreditCard, RotateCcw, Layers, ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api, getWorkspaceSettings } from '../../utils/api.js';
import DocumentsList from './DocumentsList.jsx';
import DocumentCreateModal from './DocumentCreateModal.jsx';
import DocumentDetailModal from './DocumentDetailModal.jsx';
import './DocumentsPage.css';

const DOC_TYPES = ['all', 'invoice', 'sample', 'delivery_note', 'receipt'];
const ALL_DOC_TYPES = ['invoice', 'sample', 'delivery_note', 'receipt'];
const TAB_KEY_MAP = {
  all: 'all',
  invoice: 'invoice',
  sample: 'sample',
  delivery_note: 'deliveryNote',
  receipt: 'receipt',
};

// Helper for date calculations
function addDaysIso(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getDaysDiff(d1Str, d2Str) {
  if (!d1Str || !d2Str) return 0;
  const d1 = new Date(d1Str);
  const d2 = new Date(d2Str);
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

function getMonthRange(year, monthIndex) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0); // Last day of month
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function DocumentsPage() {
  const { t, user, lang } = useApp();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: getWorkspaceSettings,
    staleTime: 5 * 60 * 1000,
  });

  const canEditDocs = useMemo(() => {
    if (!settings || !user) return true;
    const userRole = user.role?.toLowerCase();
    if (userRole === 'super_admin' || userRole === 'owner') return true;

    // Check individual staff permissions
    const perms = settings.staff_permissions?.[user.id] || settings.admin_permissions?.[user.id];
    if (userRole === 'staff' && perms) {
      return perms.canEditDocs !== false;
    }

    // Check default staff permissions
    const raw = settings.modules_owner || settings.modules || {};
    const docsConfig = raw.documents;
    return docsConfig?.canEditDocs !== false;
  }, [settings, user]);

  const printLimit = useMemo(() => {
    if (!settings || !user) return 'all';
    const userRole = user.role?.toLowerCase();
    if (userRole === 'super_admin' || userRole === 'owner') return 'all';

    // Check individual staff permissions
    const perms = settings.staff_permissions?.[user.id] || settings.admin_permissions?.[user.id];
    if (userRole === 'staff' && perms) {
      return perms.printPeriodLimit || 'all';
    }

    // Check default staff permissions
    const raw = settings.modules_owner || settings.modules || {};
    const docsConfig = raw.documents;
    return docsConfig?.printPeriodLimit || 'all';
  }, [settings, user]);

  const showKpi = useMemo(() => {
    if (!user) return false;
    const role = user.role?.toLowerCase();
    return role === 'owner' || role === 'super_admin';
  }, [user]);
  const location = useLocation();
  const navigate = useNavigate();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // Filter States: Date range (max 30 days), Payment filter, & Document Types multi-select
  const [startDate, setStartDate] = useState(''); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(''); // YYYY-MM-DD
  const [paymentFilter, setPaymentFilter] = useState('all'); // 'all' | 'unpaid' | 'paid'
  const [selectedTypes, setSelectedTypes] = useState([]); // Array of types, empty = all
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const typeDropdownRef = useRef(null);

  // Close type popover on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target)) {
        setShowTypeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStartDateChange = (val) => {
    setStartDate(val);
    if (!val) {
      setEndDate('');
      return;
    }
    const maxEnd = addDaysIso(val, 30);
    if (!endDate || endDate < val || endDate > maxEnd) {
      setEndDate(maxEnd);
    }
  };

  const handleEndDateChange = (val) => {
    setEndDate(val);
    if (!val) return;
    if (startDate) {
      const diff = getDaysDiff(startDate, val);
      if (diff > 30) {
        setStartDate(addDaysIso(val, -30));
      } else if (diff < 0) {
        setStartDate(val);
      }
    } else {
      setStartDate(addDaysIso(val, -30));
    }
  };

  const hasActiveFilters = useMemo(() => {
    return Boolean(startDate || endDate || paymentFilter !== 'all' || selectedTypes.length > 0);
  }, [startDate, endDate, paymentFilter, selectedTypes]);

  const resetAllFilters = () => {
    setStartDate('');
    setEndDate('');
    setPaymentFilter('all');
    setSelectedTypes([]);
    setActiveTab('all');
  };

  // Helper date references for KPI active states
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const thisMonthRange = useMemo(() => {
    const now = new Date();
    return getMonthRange(now.getFullYear(), now.getMonth());
  }, []);

  const isTodayActive = startDate === todayIso && endDate === todayIso;
  const isMonthActive = startDate === thisMonthRange.start && endDate === thisMonthRange.end;

  const handleKpiTodayClick = () => {
    if (isTodayActive) {
      setStartDate('');
      setEndDate('');
    } else {
      setStartDate(todayIso);
      setEndDate(todayIso);
    }
  };

  const handleKpiMonthClick = () => {
    if (isMonthActive) {
      setStartDate('');
      setEndDate('');
    } else {
      setStartDate(thisMonthRange.start);
      setEndDate(thisMonthRange.end);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    const create = params.get('create');
    const payment = params.get('payment');
    let changed = false;

    if (q !== null) {
      setSearch(q);
      params.delete('q');
      changed = true;
    }
    if (create === 'true') {
      setShowCreate(true);
      params.delete('create');
      changed = true;
    }
    if (payment === 'paid' || payment === 'unpaid' || payment === 'all') {
      setPaymentFilter(payment);
      params.delete('payment');
      changed = true;
    }

    if (changed) {
      navigate({ search: params.toString() }, { replace: true });
    }
  }, [location.search, navigate]);

  const {
    data: rawDocs,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/documents?limit=500');
      if (!res.ok) throw new Error('Failed to load documents');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
  });

  const docs = useMemo(() => {
    return (rawDocs ?? []).filter((d) => {
      const type = (d.document_type || d.type || '').toLowerCase();
      return type !== 'goods_in' && type !== 'goods_out';
    });
  }, [rawDocs]);

  const tabbedDocs = useMemo(() => {
    let completed = docs;

    if (printLimit !== 'all') {
      const todayDate = new Date();
      const dToday = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());

      completed = completed.filter((d) => {
        const issueDateStr = d.issue_date || d.created_at;
        if (!issueDateStr) return false;

        const docDate = new Date(issueDateStr);
        const dDate = new Date(docDate.getFullYear(), docDate.getMonth(), docDate.getDate());

        if (printLimit === 'today') {
          return dDate.getTime() === dToday.getTime();
        }

        if (printLimit === 'week') {
          const diffTime = dToday.getTime() - dDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays >= 0 && diffDays <= 7;
        }

        return true;
      });
    }

    const isDocPaid = (d) => {
      const terms = d.payment_terms || 'unpaid:0';
      const [payStatus] = terms.split(':');
      return payStatus === 'paid';
    };

    // 1. Date Range Filter
    if (startDate) {
      completed = completed.filter((d) => (d.issue_date || d.created_at)?.slice(0, 10) >= startDate);
    }
    if (endDate) {
      completed = completed.filter((d) => (d.issue_date || d.created_at)?.slice(0, 10) <= endDate);
    }

    // 2. Payment Status Filter
    if (paymentFilter === 'unpaid') {
      completed = completed.filter((d) => !isDocPaid(d) && Number(d.total ?? 0) > 0);
    } else if (paymentFilter === 'paid') {
      completed = completed.filter((d) => isDocPaid(d) && Number(d.total ?? 0) > 0);
    }

    // 3. Document Types Filter (Multi-select)
    if (selectedTypes.length > 0) {
      completed = completed.filter((d) => selectedTypes.includes(d.document_type));
    } else if (activeTab !== 'all') {
      completed = completed.filter((d) => d.document_type === activeTab);
    }

    return completed;
  }, [docs, activeTab, printLimit, startDate, endDate, paymentFilter, selectedTypes]);

  const filteredDocs = useMemo(() => {
    if (!search.trim()) return tabbedDocs;
    const q = search.toLowerCase();
    return tabbedDocs.filter(
      (d) =>
        d.document_number?.toLowerCase().includes(q) ||
        d.contact_name?.toLowerCase().includes(q) ||
        d.notes?.toLowerCase().includes(q)
    );
  }, [tabbedDocs, search]);

const TYPE_META = {
  invoice: { labelKey: 'documents.type.invoice', defaultLabel: 'Invoice', color: '#0284c7' },
  sample: { labelKey: 'documents.type.sample', defaultLabel: 'Sample', color: '#8b5cf6' },
  delivery_note: { labelKey: 'documents.type.deliveryNote', defaultLabel: 'Surat Jalan', color: '#64748b' },
  receipt: { labelKey: 'documents.type.receipt', defaultLabel: 'Receipt', color: '#0d9488' },
};

  const dateScopedDocs = useMemo(() => {
    if (!startDate && !endDate) return docs;
    return docs.filter((d) => {
      const dStr = (d.issue_date || d.created_at)?.slice(0, 10);
      if (!dStr) return false;
      if (startDate && dStr < startDate) return false;
      if (endDate && dStr > endDate) return false;
      return true;
    });
  }, [docs, startDate, endDate]);

  const kpi = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const todayDocs = docs.filter((d) => (d.issue_date || d.created_at)?.slice(0, 10) === today);
    const monthDocs = docs.filter((d) => (d.issue_date || d.created_at)?.slice(0, 7) === thisMonth);

    // Monetary and payment status breakdown
    const isDocPaid = (d) => {
      const terms = d.payment_terms || 'unpaid:0';
      const [payStatus] = terms.split(':');
      return payStatus === 'paid';
    };

    // Calculate unpaid & paid based on active date range
    const targetDocs = (startDate || endDate) ? dateScopedDocs : docs;
    const valuedDocs = targetDocs.filter((d) => Number(d.total ?? 0) > 0);
    const unpaidDocs = valuedDocs.filter((d) => !isDocPaid(d));
    const paidDocs = valuedDocs.filter((d) => isDocPaid(d));

    const unpaidAmount = unpaidDocs.reduce((sum, d) => sum + Number(d.total ?? 0), 0);
    const paidAmount = paidDocs.reduce((sum, d) => sum + Number(d.total ?? 0), 0);

    const getBreakdown = (list) => {
      const counts = {};
      list.forEach((d) => {
        const type = d.document_type || 'other';
        counts[type] = (counts[type] || 0) + 1;
      });
      return counts;
    };

    return {
      todayCount: todayDocs.length,
      todayBreakdown: getBreakdown(todayDocs),
      monthCount: monthDocs.length,
      monthBreakdown: getBreakdown(monthDocs),
      unpaidCount: unpaidDocs.length,
      unpaidAmount,
      paidCount: paidDocs.length,
      paidAmount,
      isDateScoped: Boolean(startDate || endDate),
    };
  }, [docs, dateScopedDocs, startDate, endDate]);

  const renderBreakdown = (breakdown, emptyText, customPillClass) => {
    const entries = Object.entries(breakdown || {});
    if (entries.length === 0) {
      return <span className="documents-page__kpi-empty-text">{emptyText}</span>;
    }
    return (
      <div className="documents-page__kpi-breakdown">
        {entries.map(([type, count]) => {
          const meta = TYPE_META[type] || { defaultLabel: type, color: 'var(--color-text-secondary)' };
          const label = t(meta.labelKey) || meta.defaultLabel;
          return (
            <span key={type} className={`documents-page__kpi-pill ${customPillClass || ''}`}>
              <span className="documents-page__kpi-dot" style={{ backgroundColor: meta.color }} />
              <span>{count} {label}</span>
            </span>
          );
        })}
      </div>
    );
  };

  const tabCounts = useMemo(() => {
    const counts = {};
    DOC_TYPES.forEach((type) => {
      counts[type] = type === 'all' ? docs.length : docs.filter((d) => d.document_type === type).length;
    });
    return counts;
  }, [docs]);

  const handleCreateSuccess = (newDoc) => {
    queryClient.setQueryData(['documents'], (prev) =>
      prev ? [newDoc, ...prev] : [newDoc]
    );
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['product-serials'] });
    setShowCreate(false);
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const getTypeButtonLabel = () => {
    if (selectedTypes.length === 0 || selectedTypes.length === ALL_DOC_TYPES.length) {
      return t('documents.filter.allTypes') || 'Semua Tipe';
    }
    if (selectedTypes.length === 1) {
      const meta = TYPE_META[selectedTypes[0]];
      return t(meta?.labelKey) || meta?.defaultLabel || selectedTypes[0];
    }
    return t('documents.filter.typesSelected', { count: selectedTypes.length }) || `${selectedTypes.length} Tipe`;
  };

  const handleToggleType = (type) => {
    if (selectedTypes.length === 0) {
      // If currently all types are active, selecting one checks ONLY this one
      setSelectedTypes([type]);
    } else if (selectedTypes.includes(type)) {
      const next = selectedTypes.filter((t) => t !== type);
      setSelectedTypes(next);
    } else {
      const next = [...selectedTypes, type];
      if (next.length === ALL_DOC_TYPES.length) {
        setSelectedTypes([]); // Reset to all
      } else {
        setSelectedTypes(next);
      }
    }
  };

  return (
    <div className="documents-page">
      <div className="documents-page__header">
        <div>
          <h1 className="documents-page__title">{t('documents.title')}</h1>
          <p className="documents-page__subtitle">
            {t('documents.subtitle', { count: filteredDocs.length })}
          </p>
        </div>
        {canEditDocs && (
          <button
            type="button"
            className="btn btn-primary btn-md interactive"
            onClick={() => setShowCreate(true)}
            disabled={isLoading}
          >
            <Plus size={16} />
            <span>{t('documents.createBtn')}</span>
          </button>
        )}
      </div>

      {!isLoading && !isError && showKpi && (
        <div className="documents-page__kpi-row">
          {/* 1. Hari Ini */}
          <div
            className={`documents-page__kpi-card interactive ${isTodayActive ? 'documents-page__kpi-card--active' : ''}`}
            onClick={handleKpiTodayClick}
            title={isTodayActive ? 'Klik untuk reset filter tanggal' : 'Klik untuk filter dokumen hari ini'}
          >
            <span className="documents-page__kpi-label">{t('documents.kpi.today')}</span>
            <span className="documents-page__kpi-value">{kpi.todayCount}</span>
            {renderBreakdown(kpi.todayBreakdown, t('documents.kpi.noDocsToday') || 'Belum ada hari ini')}
          </div>

          {/* 2. Bulan Ini */}
          <div
            className={`documents-page__kpi-card interactive ${isMonthActive ? 'documents-page__kpi-card--active' : ''}`}
            onClick={handleKpiMonthClick}
            title={isMonthActive ? 'Klik untuk reset filter tanggal' : 'Klik untuk filter dokumen bulan ini'}
          >
            <span className="documents-page__kpi-label">{t('documents.kpi.thisMonth')}</span>
            <span className="documents-page__kpi-value">{kpi.monthCount}</span>
            {renderBreakdown(kpi.monthBreakdown, t('documents.kpi.noDocsThisMonth') || 'Belum ada bulan ini')}
          </div>

          {/* 3. Total Transaksi */}
          <div
            className={`documents-page__kpi-card interactive ${paymentFilter === 'all' && hasActiveFilters ? '' : ''}`}
            onClick={() => setPaymentFilter('all')}
            title="Klik untuk tampilkan semua status pembayaran"
          >
            <span className="documents-page__kpi-label">Total Transaksi</span>
            <span className="documents-page__kpi-value">
              {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(kpi.unpaidAmount + kpi.paidAmount)}
            </span>
            <div className="documents-page__kpi-breakdown">
              {kpi.unpaidCount + kpi.paidCount > 0 ? (
                <>
                  <span className="documents-page__kpi-pill documents-page__kpi-pill--warning">
                    <span className="documents-page__kpi-dot" style={{ backgroundColor: 'var(--color-warning)' }} />
                    <span>{kpi.unpaidCount} belum lunas</span>
                  </span>
                  <span className="documents-page__kpi-pill documents-page__kpi-pill--success">
                    <span className="documents-page__kpi-dot" style={{ backgroundColor: 'var(--color-success)' }} />
                    <span>{kpi.paidCount} lunas</span>
                  </span>
                </>
              ) : (
                <span className="documents-page__kpi-empty-text">Belum ada transaksi</span>
              )}
            </div>
          </div>

          {/* 4. Belum Lunas */}
          <div
            className={`documents-page__kpi-card interactive ${paymentFilter === 'unpaid' ? 'documents-page__kpi-card--active documents-page__kpi-card--active-unpaid' : ''}`}
            onClick={() => setPaymentFilter((prev) => (prev === 'unpaid' ? 'all' : 'unpaid'))}
            title={paymentFilter === 'unpaid' ? 'Klik untuk reset filter pembayaran' : 'Klik untuk filter dokumen belum lunas'}
          >
            <span className="documents-page__kpi-label">{t('documents.kpi.unpaid') || 'Belum Lunas'}</span>
            <span className="documents-page__kpi-value documents-page__kpi-value--warning">
              {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(kpi.unpaidAmount)}
            </span>
            <div className="documents-page__kpi-breakdown">
              {kpi.unpaidCount > 0 ? (
                <span className="documents-page__kpi-pill documents-page__kpi-pill--warning">
                  <span className="documents-page__kpi-dot" style={{ backgroundColor: 'var(--color-warning)' }} />
                  <span>{t('documents.kpi.unpaidDocs', { count: kpi.unpaidCount }) || `${kpi.unpaidCount} belum lunas`}</span>
                </span>
              ) : (
                <span className="documents-page__kpi-empty-text">{t('documents.kpi.allPaid') || 'Semua tagihan lunas'}</span>
              )}
            </div>
          </div>


          {/* 5. Sudah Lunas */}
          <div
            className={`documents-page__kpi-card interactive ${paymentFilter === 'paid' ? 'documents-page__kpi-card--active documents-page__kpi-card--active-paid' : ''}`}
            onClick={() => setPaymentFilter((prev) => (prev === 'paid' ? 'all' : 'paid'))}
            title={paymentFilter === 'paid' ? 'Klik untuk reset filter pembayaran' : 'Klik untuk filter dokumen sudah lunas'}
          >
            <span className="documents-page__kpi-label">{t('documents.kpi.paid') || 'Sudah Lunas'}</span>
            <span className="documents-page__kpi-value documents-page__kpi-value--success">
              {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(kpi.paidAmount)}
            </span>
            <div className="documents-page__kpi-breakdown">
              {kpi.paidCount > 0 ? (
                <span className="documents-page__kpi-pill documents-page__kpi-pill--success">
                  <span className="documents-page__kpi-dot" style={{ backgroundColor: 'var(--color-success)' }} />
                  <span>{t('documents.kpi.paidDocs', { count: kpi.paidCount }) || `${kpi.paidCount} lunas`}</span>
                </span>
              ) : (
                <span className="documents-page__kpi-empty-text">{t('documents.kpi.noPaidYet') || 'Belum ada penerimaan'}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {!isLoading && !isError && docs.length > 0 && selectedTypes.length === 0 && (
        <div className="documents-page__tabs">
          {DOC_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`documents-page__tab${activeTab === type ? ' documents-page__tab--active' : ''}`}
              onClick={() => setActiveTab(type)}
            >
              {t(`documents.tab.${TAB_KEY_MAP[type]}`)}
              <span className="documents-page__tab-count">{tabCounts[type]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters Toolbar */}
      {!isLoading && !isError && docs.length > 0 && (
        <div className="documents-page__filter-toolbar">
          {/* Search */}
          <div className="documents-page__search-wrap">
            <input
              type="text"
              className="input documents-page__search"
              placeholder={t('documents.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="documents-page__filter-controls">
            {/* 1. Date Range Box */}
            <div className="documents-page__date-filter-box">
              <div
                className="documents-page__date-input-group"
                onClick={(e) => {
                  const input = e.currentTarget.querySelector('input');
                  input?.showPicker?.();
                }}
              >
                <span className="documents-page__date-label">Dari:</span>
                <input
                  type="date"
                  className="documents-page__date-field"
                  value={startDate}
                  onClick={(e) => e.target.showPicker?.()}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  title="Pilih tanggal mulai"
                />
              </div>

              <span className="documents-page__date-sep">s/d</span>

              <div
                className="documents-page__date-input-group"
                onClick={(e) => {
                  const input = e.currentTarget.querySelector('input');
                  input?.showPicker?.();
                }}
              >
                <span className="documents-page__date-label">Sampai:</span>
                <input
                  type="date"
                  className="documents-page__date-field"
                  value={endDate}
                  min={startDate || undefined}
                  max={startDate ? addDaysIso(startDate, 30) : undefined}
                  onClick={(e) => e.target.showPicker?.()}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  title="Pilih tanggal akhir (Maks. 30 hari)"
                />
              </div>
            </div>

            {/* 2. Dropdowns Row */}
            <div className="documents-page__filter-dropdowns-row">
              {/* Payment Filter Dropdown */}
              <div className="documents-page__filter-group">
                <CreditCard size={14} className="documents-page__filter-icon" />
                <select
                  className="select documents-page__filter-select"
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                >
                  <option value="all">{t('documents.filter.allPayment') || 'Semua Pembayaran'}</option>
                  <option value="unpaid">{t('documents.filter.unpaid') || 'Belum Lunas'}</option>
                  <option value="paid">{t('documents.filter.paid') || 'Sudah Lunas'}</option>
                </select>
              </div>

              {/* Document Type Multi-Select Dropdown */}
              <div className="documents-page__type-filter-wrap" ref={typeDropdownRef}>
                <button
                  type="button"
                  className={`btn btn-secondary btn-sm documents-page__type-btn interactive ${selectedTypes.length > 0 ? 'active' : ''}`}
                  onClick={() => setShowTypeDropdown((prev) => !prev)}
                >
                  <Layers size={14} />
                  <span>{getTypeButtonLabel()}</span>
                  <ChevronDown size={13} className={`documents-page__chevron ${showTypeDropdown ? 'open' : ''}`} />
                </button>

                {showTypeDropdown && (
                  <div className="documents-page__type-popover">
                    <div className="documents-page__type-popover-header">
                      <label className="documents-page__type-checkbox-row documents-page__type-select-all">
                        <input
                          type="checkbox"
                          checked={selectedTypes.length === 0}
                          onChange={() => setSelectedTypes([])}
                        />
                        <span>{t('documents.filter.allTypes') || 'Semua Tipe Dokumen'}</span>
                      </label>
                    </div>
                    <div className="documents-page__type-popover-list">
                      {ALL_DOC_TYPES.map((type) => {
                        const isChecked = selectedTypes.includes(type);
                        const meta = TYPE_META[type] || { defaultLabel: type, color: '#64748b' };
                        return (
                          <label key={type} className="documents-page__type-checkbox-row">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleType(type)}
                            />
                            <span className="documents-page__type-dot" style={{ backgroundColor: meta.color }} />
                            <span>{t(meta.labelKey) || meta.defaultLabel}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm documents-page__reset-btn interactive"
                  onClick={resetAllFilters}
                  title="Reset semua filter"
                >
                  <RotateCcw size={13} />
                  <span>{t('documents.filter.resetAll') || 'Reset'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Chips Bar */}
      {hasActiveFilters && (
        <div className="documents-page__active-chips-row">
          <span className="documents-page__active-chips-label">
            {t('documents.filter.activeFilters') || 'Filter Aktif:'}
          </span>
          {startDate && endDate && (
            <span className="documents-page__active-chip">
              <Calendar size={12} />
              <span>
                {startDate === endDate
                  ? formatDateDisplay(startDate)
                  : `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)} (${getDaysDiff(startDate, endDate) + 1} hari)`}
              </span>
              <button
                type="button"
                className="documents-page__chip-remove-btn"
                onClick={() => { setStartDate(''); setEndDate(''); }}
                title="Hapus filter rentang tanggal"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {paymentFilter !== 'all' && (
            <span className={`documents-page__active-chip ${paymentFilter === 'unpaid' ? 'documents-page__active-chip--unpaid' : 'documents-page__active-chip--paid'}`}>
              <CreditCard size={12} />
              <span>{paymentFilter === 'unpaid' ? (t('documents.filter.unpaid') || 'Belum Lunas') : (t('documents.filter.paid') || 'Sudah Lunas')}</span>
              <button
                type="button"
                className="documents-page__chip-remove-btn"
                onClick={() => setPaymentFilter('all')}
                title="Hapus filter pembayaran"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {selectedTypes.length > 0 && (
            <span className="documents-page__active-chip">
              <Layers size={12} />
              <span>
                {selectedTypes.map((t) => TYPE_META[t]?.defaultLabel || t).join(', ')}
              </span>
              <button
                type="button"
                className="documents-page__chip-remove-btn"
                onClick={() => setSelectedTypes([])}
                title="Hapus filter tipe dokumen"
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <DocumentsSkeleton />
      ) : isError ? (
        <div className="documents-page__error-state">
          <AlertCircle size={40} className="documents-page__error-icon" />
          <h2 className="documents-page__state-title">{t('documents.errorTitle')}</h2>
          <button type="button" className="btn btn-secondary interactive" onClick={refetch}>
            {t('documents.retry')}
          </button>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="documents-page__empty-state">
          <div className="documents-page__empty-icon-wrap">
            <FileText size={36} />
          </div>
          <h2 className="documents-page__state-title">
            {search.trim() ? t('documents.searchNoMatch') : t('documents.emptyTitle')}
          </h2>
          {!search.trim() && (
            <>
              <p className="documents-page__state-sub">{t('documents.emptySub')}</p>
              <button
                type="button"
                className="btn btn-primary interactive"
                onClick={() => setShowCreate(true)}
              >
                <Plus size={16} />
                <span>{t('documents.createBtn')}</span>
              </button>
            </>
          )}
        </div>
      ) : (
        <DocumentsList docs={filteredDocs} onSelect={setSelectedDoc} canEditDocs={canEditDocs} />
      )}

      {showCreate && (
        <DocumentCreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {selectedDoc && (
        <DocumentDetailModal
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onUpdate={(updated) => {
            queryClient.setQueryData(['documents'], (prev) =>
              (prev ?? []).map((d) => d.id === updated.id ? { ...d, ...updated } : d)
            );
            setSelectedDoc(updated);
          }}
        />
      )}
    </div>
  );
}

function DocumentsSkeleton() {
  return (
    <div className="documents-skeleton">
      <div className="documents-skeleton__kpi-row">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="documents-skeleton__kpi-card">
            <div className="skeleton-block" style={{ width: 60, height: 11 }} />
            <div className="skeleton-block" style={{ width: 40, height: 22, marginTop: 6 }} />
          </div>
        ))}
      </div>
      <div className="documents-skeleton__list">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="documents-skeleton__row">
            <div className="skeleton-block" style={{ width: '35%', height: 13 }} />
            <div className="skeleton-block" style={{ width: '15%', height: 13 }} />
            <div className="skeleton-block" style={{ width: '25%', height: 13 }} />
            <div className="skeleton-block" style={{ width: '10%', height: 13 }} />
            <div className="skeleton-block" style={{ width: 60, height: 22, borderRadius: 99 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
