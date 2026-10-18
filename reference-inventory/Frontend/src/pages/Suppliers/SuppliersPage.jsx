import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, AlertCircle, RefreshCw, Users, SearchX } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import SupplierFilters from './SupplierFilters.jsx';
import SuppliersList from './SuppliersList.jsx';
import SupplierFormModal from './SupplierFormModal.jsx';
import SupplierDetailModal from './SupplierDetailModal.jsx';
import './SuppliersPage.css';

function mapSupplier(c) {
  return {
    id: c.id,
    name: c.name || '',
    phone: c.phone || '',
    email: c.email || '',
    address: c.address || '',
    city: c.city || '',
    province: c.province || '',
    taxId: c.metadata?.taxId || '',
    notes: c.metadata?.notes || '',
    status: c.status === 'archived' ? 'Archived' : c.status === 'pending' ? 'Pending' : 'Active',
    tag: c.metadata?.tag || 'Regular',
  };
}

function SupplierSkeleton() {
  return (
    <div className="suppliers-page">
      <div className="suppliers-page__header">
        <div>
          <div className="skeleton-block" style={{ width: 200, height: 28, marginBottom: 8 }} />
          <div className="skeleton-block" style={{ width: 260, height: 16 }} />
        </div>
      </div>
      <div className="suppliers-page__filters">
        <div className="skeleton-block" style={{ width: 320, height: 36 }} />
        <div className="skeleton-block" style={{ width: 320, height: 32 }} />
      </div>
      <div className="skeleton-block" style={{ width: '100%', height: 400, borderRadius: 'var(--radius-lg)' }} />
    </div>
  );
}

export default function SuppliersPage() {
  const { t } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    const create = params.get('create');
    let changed = false;

    if (q !== null) {
      setSearch(q);
      params.delete('q');
      changed = true;
    }
    if (create === 'true') {
      setShowForm(true);
      params.delete('create');
      changed = true;
    }

    if (changed) {
      navigate({ search: params.toString() }, { replace: true });
    }
  }, [location.search, navigate]);

  const {
    data: rawData, isLoading, isError, refetch,
  } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/contacts?limit=100&type=supplier');
      if (!res.ok) throw new Error('Failed to load suppliers');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
  });

  const suppliers = useMemo(() => (rawData ?? []).map(mapSupplier), [rawData]);

  const filtered = useMemo(() => {
    let result = suppliers;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status.toLowerCase() === statusFilter);
    }
    return result;
  }, [suppliers, search, statusFilter]);

  const isSearching = !!search.trim() || statusFilter !== 'all';

  const kpi = useMemo(() => ({
    total: suppliers.length,
    active: suppliers.filter((c) => c.status === 'Active').length,
    pending: suppliers.filter((c) => c.status === 'Pending').length,
    archived: suppliers.filter((c) => c.status === 'Archived').length,
  }), [suppliers]);

  function handleOpenCreate() {
    setEditTarget(null);
    setShowForm(true);
  }

  function handleOpenEdit(c) {
    setEditTarget(c);
    setShowForm(true);
    setDetailTarget(null);
  }

  function handleFormSuccess() {
    setShowForm(false);
    setEditTarget(null);
  }

  function handleCloseForm() {
    setShowForm(false);
    setEditTarget(null);
  }

  if (isLoading) return <SupplierSkeleton />;

  return (
    <div className="suppliers-page">
      <div className="suppliers-page__header">
        <div>
          <h1 className="suppliers-page__title">{t('suppliers.title')}</h1>
          <p className="suppliers-page__subtitle">{t('suppliers.subtitle')}</p>
        </div>
        <button className="btn btn-primary btn-md" onClick={handleOpenCreate}>
          <Plus size={16} /> {t('suppliers.createBtn')}
        </button>
      </div>

      <div className="suppliers-page__kpi-row">
        <div className="suppliers-page__kpi-card">
          <span className="suppliers-page__kpi-value">{kpi.total}</span>
          <span className="suppliers-page__kpi-label">{t('suppliers.kpi.total')}</span>
        </div>
        <div className="suppliers-page__kpi-card">
          <span className="suppliers-page__kpi-value">{kpi.active}</span>
          <span className="suppliers-page__kpi-label">{t('suppliers.kpi.active')}</span>
        </div>
        <div className="suppliers-page__kpi-card">
          <span className="suppliers-page__kpi-value">{kpi.pending}</span>
          <span className="suppliers-page__kpi-label">{t('suppliers.kpi.pending')}</span>
        </div>
        <div className="suppliers-page__kpi-card">
          <span className="suppliers-page__kpi-value">{kpi.archived}</span>
          <span className="suppliers-page__kpi-label">{t('suppliers.kpi.archived')}</span>
        </div>
      </div>

      <SupplierFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
      />

      {isError ? (
        <div className="suppliers-page__state">
          <div className="suppliers-page__state-icon suppliers-page__state-icon--error">
            <AlertCircle size={32} />
          </div>
          <h3 className="suppliers-page__state-title">{t('suppliers.error.title')}</h3>
          <p className="suppliers-page__state-desc">{t('suppliers.error.desc')}</p>
          <button className="btn btn-secondary btn-md" onClick={() => refetch()}>
            <RefreshCw size={16} /> {t('general.retry')}
          </button>
        </div>
      ) : filtered.length === 0 && suppliers.length === 0 ? (
        <div className="suppliers-page__state">
          <div className="suppliers-page__state-icon">
            <Users size={32} />
          </div>
          <h3 className="suppliers-page__state-title">{t('suppliers.empty.title')}</h3>
          <p className="suppliers-page__state-desc">{t('suppliers.empty.desc')}</p>
        </div>
      ) : filtered.length === 0 && isSearching ? (
        <div className="suppliers-page__state">
          <div className="suppliers-page__state-icon">
            <SearchX size={32} />
          </div>
          <h3 className="suppliers-page__state-title">{t('suppliers.emptySearch.title')}</h3>
          <p className="suppliers-page__state-desc">{t('suppliers.emptySearch.desc')}</p>
        </div>
      ) : (
        <SuppliersList
          suppliers={filtered}
          onView={setDetailTarget}
          onEdit={handleOpenEdit}
          onDelete={setDetailTarget}
        />
      )}

      {showForm && (
        <SupplierFormModal
          supplier={editTarget}
          onClose={handleCloseForm}
          onSuccess={handleFormSuccess}
        />
      )}

      {detailTarget && (
        <SupplierDetailModal
          supplier={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={handleOpenEdit}
        />
      )}
    </div>
  );
}
