import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, AlertCircle, RefreshCw, Users, SearchX } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import CustomerFilters from './CustomerFilters.jsx';
import CustomersList from './CustomersList.jsx';
import CustomerFormModal from './CustomerFormModal.jsx';
import CustomerDetailModal from './CustomerDetailModal.jsx';
import './CustomersPage.css';

function mapCustomer(c) {
  return {
    id: c.id,
    name: c.name || '',
    storeName: c.metadata?.storeName || '',
    phone: c.phone || '',
    email: c.email || '',
    address: c.address || '',
    city: c.city || '',
    province: c.province || '',
    taxId: c.metadata?.taxId || '',
    picSales: c.metadata?.picSales || '',
    notes: c.metadata?.notes || '',
    status: c.status === 'archived' ? 'Archived' : c.status === 'pending' ? 'Pending' : 'Active',
    tag: c.metadata?.tag || 'Regular',
  };
}

function CustomerSkeleton() {
  return (
    <div className="customers-page">
      <div className="customers-page__header">
        <div>
          <div className="skeleton-block" style={{ width: 200, height: 28, marginBottom: 8 }} />
          <div className="skeleton-block" style={{ width: 260, height: 16 }} />
        </div>
      </div>
      <div className="customers-page__filters">
        <div className="skeleton-block" style={{ width: 320, height: 36 }} />
        <div className="skeleton-block" style={{ width: 320, height: 32 }} />
      </div>
      <div className="skeleton-block" style={{ width: '100%', height: 400, borderRadius: 'var(--radius-lg)' }} />
    </div>
  );
}

export default function CustomersPage() {
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
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/contacts?limit=100&type=customer');
      if (!res.ok) throw new Error('Failed to load customers');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
  });

  const customers = useMemo(() => (rawData ?? []).map(mapCustomer), [rawData]);

  const filtered = useMemo(() => {
    let result = customers;
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
  }, [customers, search, statusFilter]);

  const isSearching = !!search.trim() || statusFilter !== 'all';

  const kpi = useMemo(() => ({
    total: customers.length,
    active: customers.filter((c) => c.status === 'Active').length,
    pending: customers.filter((c) => c.status === 'Pending').length,
    archived: customers.filter((c) => c.status === 'Archived').length,
  }), [customers]);

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

  if (isLoading) return <CustomerSkeleton />;

  return (
    <div className="customers-page">
      <div className="customers-page__header">
        <div>
          <h1 className="customers-page__title">{t('customers.title')}</h1>
          <p className="customers-page__subtitle">{t('customers.subtitle')}</p>
        </div>
        <button className="btn btn-primary btn-md" onClick={handleOpenCreate}>
          <Plus size={16} /> {t('customers.createBtn')}
        </button>
      </div>

      <div className="customers-page__kpi-row">
        <div className="customers-page__kpi-card">
          <span className="customers-page__kpi-value">{kpi.total}</span>
          <span className="customers-page__kpi-label">{t('customers.kpi.total')}</span>
        </div>
        <div className="customers-page__kpi-card">
          <span className="customers-page__kpi-value">{kpi.active}</span>
          <span className="customers-page__kpi-label">{t('customers.kpi.active')}</span>
        </div>
        <div className="customers-page__kpi-card">
          <span className="customers-page__kpi-value">{kpi.pending}</span>
          <span className="customers-page__kpi-label">{t('customers.kpi.pending')}</span>
        </div>
        <div className="customers-page__kpi-card">
          <span className="customers-page__kpi-value">{kpi.archived}</span>
          <span className="customers-page__kpi-label">{t('customers.kpi.archived')}</span>
        </div>
      </div>

      <CustomerFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
      />

      {isError ? (
        <div className="customers-page__state">
          <div className="customers-page__state-icon customers-page__state-icon--error">
            <AlertCircle size={32} />
          </div>
          <h3 className="customers-page__state-title">{t('customers.error.title')}</h3>
          <p className="customers-page__state-desc">{t('customers.error.desc')}</p>
          <button className="btn btn-secondary btn-md" onClick={() => refetch()}>
            <RefreshCw size={16} /> {t('general.retry')}
          </button>
        </div>
      ) : filtered.length === 0 && customers.length === 0 ? (
        <div className="customers-page__state">
          <div className="customers-page__state-icon">
            <Users size={32} />
          </div>
          <h3 className="customers-page__state-title">{t('customers.empty.title')}</h3>
          <p className="customers-page__state-desc">{t('customers.empty.desc')}</p>
        </div>
      ) : filtered.length === 0 && isSearching ? (
        <div className="customers-page__state">
          <div className="customers-page__state-icon">
            <SearchX size={32} />
          </div>
          <h3 className="customers-page__state-title">{t('customers.emptySearch.title')}</h3>
          <p className="customers-page__state-desc">{t('customers.emptySearch.desc')}</p>
        </div>
      ) : (
        <CustomersList
          customers={filtered}
          onView={setDetailTarget}
          onEdit={handleOpenEdit}
          onDelete={setDetailTarget}
        />
      )}

      {showForm && (
        <CustomerFormModal
          customer={editTarget}
          onClose={handleCloseForm}
          onSuccess={handleFormSuccess}
        />
      )}

      {detailTarget && (
        <CustomerDetailModal
          customer={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={handleOpenEdit}
        />
      )}
    </div>
  );
}
