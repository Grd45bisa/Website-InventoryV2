import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside.js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Plus, AlertCircle, ClipboardList, ArrowLeft, Trash2, CheckCircle2, XCircle, X, Search, ChevronDown, ChevronRight, User, Printer, FileText, Loader2, Pencil, Truck, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api, getWorkspaceSettings } from '../../utils/api.js';
import { useUnits } from '../../hooks/useUnits.js';
import { ConfirmModal } from '../../components/ConfirmModal/ConfirmModal.jsx';
import { generateDocumentHtml } from '../../utils/documentTemplate.js';
import './PurchaseOrdersPage.css';

function isPrivileged(role) {
  const r = String(role || '').toLowerCase();
  return r === 'owner' || r === 'staff' || r === 'super_admin';
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function statusKey(status) {
  return `po.status.${status || 'draft'}`;
}

function poStatusChip(status) {
  const map = {
    draft: 'doc-chip--draft',
    pending: 'doc-chip--pending',
    submitted: 'doc-chip--submitted',
    approved: 'doc-chip--paid',
    fulfilled: 'doc-chip--completed',
    cancelled: 'doc-chip--overdue',
  };
  return map[status] || 'doc-chip--draft';
}

function formatPOStatusLabel(status, t) {
  if (status === 'approved') return 'Approved (Siap Keluar)';
  if (status === 'fulfilled') return 'Fulfilled (Barang Keluar)';
  if (status === 'pending') return 'Pending ACC';
  return t ? t(statusKey(status)) : status;
}

function cleanVendorName(name) {
  if (!name) return '';
  if (name.endsWith(' (-)')) {
    return name.slice(0, -4).trim();
  }
  if (name.includes('(')) {
    const match = name.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      const store = match[1].trim();
      const owner = match[2].trim();
      if (owner === '-') return store;
      return `${store} (${owner})`;
    }
  }
  return name;
}

// ---------------------------------------------------------------------------
// Root component — routes internal
// ---------------------------------------------------------------------------
export default function PurchaseOrdersPage() {
  return (
    <div className="po-page">
      <Routes>
        <Route path="create" element={<POCreateView />} />
        <Route path=":id/edit" element={<POEditView />} />
        <Route path=":id" element={<PODetailView />} />
        <Route path="/" element={<POListView />} />
      </Routes>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LIST VIEW
// ---------------------------------------------------------------------------
function POListView() {
  const { t } = useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);

  const handlePrintPO = async (poId) => {
    try {
      const res = await api.get(`/api/workspace/purchase-orders/${poId}/pdf`);
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `PO-${poId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (err) {
      setToast({ type: 'error', text: t('po.toast.pdfFailed') });
    }
  };

  const { data: purchaseOrders, isLoading, error } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/purchase-orders?limit=1000');
      if (!res.ok) throw new Error('Failed to load purchase orders');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
  });

  // Recovery toast message jika redirect dari create detail.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const msg = params.get('toast');
    if (msg) {
      setToast({ type: 'success', text: msg });
      params.delete('toast');
      navigate({ search: params.toString() }, { replace: true });
      const tm = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(tm);
    }
  }, [navigate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchaseOrders ?? [];
    return (purchaseOrders ?? []).filter((po) => {
      return (
        String(po.po_number || '').toLowerCase().includes(q) ||
        String(po.vendor_name || '').toLowerCase().includes(q) ||
        String(po.status || '').toLowerCase().includes(q)
      );
    });
  }, [purchaseOrders, search]);

  return (
    <>
      <div className="po-page__header">
        <div>
          <h1 className="po-page__header-title">{t('po.list.title')}</h1>
          <p className="po-page__header-subtitle">{t('po.list.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary interactive btn-md"
          onClick={() => navigate('/purchase-orders/create')}
        >
          <Plus size={16} />
          <span>{t('po.list.create')}</span>
        </button>
      </div>

      <div className="po-page__toolbar">
        <input
          type="text"
          className="po-page__search"
          placeholder={t('po.form.itemSearchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {toast && (
        <div className={`po-toast po-toast--${toast.type}`} role="status" aria-live="polite">
          {toast.type === 'success' ? (
            <CheckCircle2 size={18} className="po-toast__icon" />
          ) : (
            <XCircle size={18} className="po-toast__icon" />
          )}
          <span className="po-toast__text">{toast.text}</span>
          <button className="po-toast__close" onClick={() => setToast(null)} aria-label="close">
            <X size={14} />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="po-page__state">
          <p className="po-page__state-text">{t('po.list.loading')}</p>
        </div>
      ) : error ? (
        <div className="po-page__state">
          <AlertCircle className="po-page__state-icon po-page__state-icon--error" size={40} />
          <p className="po-page__state-text">{t('po.toast.createFailed')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="po-page__state">
          <ClipboardList className="po-page__state-icon" size={40} />
          <h2 className="po-page__state-title">{t('po.list.title')}</h2>
          <p className="po-page__state-text">{t('po.list.noData')}</p>
          <button
            type="button"
            className="btn btn-primary interactive"
            onClick={() => navigate('/purchase-orders/create')}
          >
            <Plus size={16} />
            <span>{t('po.list.create')}</span>
          </button>
        </div>
      ) : (
        <div className="product-table-wrapper doc-list-wrapper">
          <table className="table product-table doc-list-table">
            <thead>
              <tr>
                <th className="doc-list__th--ref">{t('po.list.col.poNumber')}</th>
                <th className="doc-list__th--type">{t('po.list.col.type')}</th>
                <th className="doc-list__th--customer">{t('po.list.col.vendor')}</th>
                <th className="doc-list__th--date">{t('po.list.col.date')}</th>
                <th className="doc-list__th--payment-status">{t('po.list.col.status')}</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((po) => (
                <tr
                  key={po.id}
                  className="product-table__row doc-list__row interactive"
                  onClick={() => navigate(`/purchase-orders/${po.id}`)}
                >
                  <td className="doc-list__cell--ref" data-label={t('po.list.col.poNumber')}>
                    <div className="doc-list__ref-wrap">
                      <FileText size={13} className="doc-list__type-icon doc-chip--po" />
                      <span className="doc-list__ref-text">{po.po_number}</span>
                    </div>
                  </td>

                  <td className="doc-list__cell--type" data-label={t('po.list.col.type')}>
                    <span className="doc-chip doc-chip--po">PO</span>
                  </td>

                  <td className="doc-list__cell--customer" data-label={t('po.list.col.vendor')}>
                    <span className="doc-list__customer-name">{cleanVendorName(po.vendor_name) || <span className="doc-list__cell--muted">{'\u2014'}</span>}</span>
                    <span className="doc-list__sub-dot">·</span>
                    <span className="doc-list__sub-date">{formatDate(po.po_date)}</span>
                  </td>

                  <td className="doc-list__cell--date" data-label={t('po.list.col.date')}>
                    {formatDate(po.po_date)}
                  </td>

                  <td className="doc-list__cell--payment-status" data-label={t('po.list.col.status')}>
                    <span className={`doc-chip ${poStatusChip(po.status)}`}>
                      {formatPOStatusLabel(po.status, t)}
                    </span>
                  </td>

                  <td className="doc-list__cell--chevron">
                    <ChevronRight size={15} className="doc-list__chevron" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// CREATE VIEW
// ---------------------------------------------------------------------------
function POCreateView({ editId }) {
  const { t, user } = useApp();
  const { units, formatUnitOption } = useUnits();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const isEdit = !!editId;

  const parseVendor = (vendorName) => {
    const v = String(vendorName || '').trim();
    const match = v.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      return { store: match[1].trim(), owner: match[2].trim() === '-' ? '' : match[2].trim() };
    }
    return { store: v, owner: '' };
  };

  const { data: editPo, isLoading: editLoading } = useQuery({
    queryKey: ['purchase-order', editId],
    queryFn: async () => {
      const res = await api.get(`/api/workspace/purchase-orders/${editId}`);
      if (!res.ok) throw new Error('Failed to load purchase order');
      const json = await res.json();
      return json.data;
    },
    enabled: isEdit,
    staleTime: 0,
  });

  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ item_name: '', sku: '', qty: 1, unit: 'lusin' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Customer Select Card States
  const [contactId, setContactId] = useState(null);
  const [customer, setCustomer] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [picSales, setPicSales] = useState(user?.fullName || user?.full_name || user?.email || '');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  const customerRef = useRef(null);

  // Populate form from existing PO when editing.
  useEffect(() => {
    if (!isEdit || !editPo) return;
    const { store, owner } = parseVendor(editPo.vendor_name);
    setCustomer(store);
    setOwnerName(owner);
    setNotes(editPo.notes || '');
    const parsedItems = (editPo.items || []).map((it) => {
      let cleanSku = String(it.sku || '');
      let unit = 'lusin';
      if (cleanSku.includes('|')) {
        const parts = cleanSku.split('|');
        cleanSku = parts[0];
        unit = parts[1] || unit;
      }
      return { item_name: it.item_name || '', sku: cleanSku, qty: Number(it.qty) || 1, unit };
    });
    setItems(parsedItems.length ? parsedItems : [{ item_name: '', sku: '', qty: 1, unit: 'lusin' }]);
    setContactId(null);
  }, [isEdit, editPo]);

  // Handle AI OCR pending import for PO
  useEffect(() => {
    if (isEdit) return;

    const applyAiData = (aiData) => {
      if (aiData.vendor_name) {
        const { store, owner } = parseVendor(aiData.vendor_name);
        setCustomer(store);
        setOwnerName(owner);
      }
      if (aiData.notes) {
        setNotes((prev) => (prev ? `${prev} - ${aiData.notes}` : aiData.notes));
      }
      if (Array.isArray(aiData.items) && aiData.items.length > 0) {
        const parsedItems = aiData.items.map((it) => ({
          item_name: it.itemName || '',
          sku: it.sku || 'NON-SKU',
          qty: Number(it.qty) || 1,
          unit: it.qtyUnit || 'lusin',
        }));
        setItems(parsedItems);
      }
    };

    const checkPendingAi = () => {
      try {
        const raw = sessionStorage.getItem('docuflow_ai_pending_import');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.type === 'po' && parsed.data) {
            sessionStorage.removeItem('docuflow_ai_pending_import');
            applyAiData(parsed.data);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    checkPendingAi();

    const handleAiEvent = (e) => {
      if (e.detail?.type === 'po' && e.detail.data) {
        applyAiData(e.detail.data);
      }
    };

    window.addEventListener('docuflow_ai_import_event', handleAiEvent);
    return () => window.removeEventListener('docuflow_ai_import_event', handleAiEvent);
  }, [isEdit]);

  // Load Contacts list
  const { data: rawContacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/contacts?limit=500');
      if (res.status === 403) return [];
      if (!res.ok) throw new Error('Failed to load contacts');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60000,
  });

  const contacts = rawContacts ?? [];

  // Autocomplete customer
  const filteredContacts = useMemo(() => {
    if (!customer.trim()) return [];
    const q = customer.toLowerCase();
    return contacts.filter((c) => {
      const nameMatch = (c.name ?? '').toLowerCase().includes(q);
      const storeNameMatch = (c.metadata?.storeName ?? '').toLowerCase().includes(q);
      return nameMatch || storeNameMatch;
    });
  }, [contacts, customer]);

  const isExistingContact = useMemo(() => {
    if (!customer.trim() || !filteredContacts.length) return null;
    return filteredContacts.some((c) => {
      const nameMatch = (c.name ?? '').toLowerCase() === customer.trim().toLowerCase();
      const storeNameMatch = (c.metadata?.storeName ?? '').toLowerCase() === customer.trim().toLowerCase();
      return nameMatch || storeNameMatch;
    });
  }, [filteredContacts, customer]);

  useClickOutside(customerRef, () => setCustomerDropdownOpen(false));

  const handleCreateNewContact = async (mode = 'customer') => {
    const nameVal = customer.trim();
    if (!nameVal) return;
    if (creatingContact) return;
    setCreatingContact(true);
    try {
      const contactName = mode === 'store' ? nameVal : '-';
      const storeNameVal = mode === 'customer' ? nameVal : '';
      const res = await api.post('/api/workspace/contacts', {
        name: contactName,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        status: 'active',
        metadata: {
          storeName: storeNameVal || null,
          picSales: picSales.trim() || null,
        }
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      const newContact = json.data;
      setContactId(newContact.id);
      setCustomer(newContact.name);
      setOwnerName(newContact.metadata?.storeName || '');
      setPhone(newContact.phone || '');
      setEmail(newContact.email || '');
      setAddress(newContact.address || '');
      setPicSales(newContact.metadata?.picSales || '');
      setCustomerDropdownOpen(false);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (err) {
      setError(t('documents.error.createContactFailed') || 'Failed to create contact');
    } finally {
      setCreatingContact(false);
    }
  };

  // Items search — minimal loading & query. Hanya {id, name, sku}.
  const [itemSearch, setItemSearch] = useState('');
  const [openIdx, setOpenIdx] = useState(null);
  const searchDebounceRef = useRef(null);
  const itemNameRefs = useRef([]);
  const itemSkuRefs = useRef([]);
  const itemQtyRefs = useRef([]);

  const focusField = (refs, idx) => {
    const el = refs.current[idx];
    if (el) {
      el.focus();
      if (typeof el.select === 'function') el.select();
    }
  };

  const { data: itemsList, isFetching: itemsFetching } = useQuery({
    queryKey: ['purchase-orders-items', itemSearch],
    queryFn: async () => {
      const search = itemSearch ? `&search=${encodeURIComponent(itemSearch)}` : '';
      const res = await api.get(`/api/workspace/purchase-orders/items?limit=200${search}`);
      if (!res.ok) throw new Error('Failed to load items');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 15000,
  });

  // Debounce item search input.
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  // Click outside untuk tutup dropdown.
  useEffect(() => {
    function handleClick(e) {
      if (!e.target.closest('.po-item-picker') && !e.target.closest('.po-item-picker__search')) {
        setOpenIdx(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { item_name: '', sku: '', qty: 1, unit: 'lusin' }]);
  };

  const removeItem = (idx) => {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const pickItem = (idx, product) => {
    updateItem(idx, { item_name: product.name, sku: product.sku });
    setOpenIdx(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const store = customer.trim();
    const owner = ownerName.trim();
    if (!store) {
      setError(t('po.form.storeRequired') || 'Nama Toko wajib diisi.');
      return;
    }

    // Auto-create contact in the background if it's new
    let finalContactId = contactId;
    if (!isEdit && !finalContactId) {
      try {
        const res = await api.post('/api/workspace/contacts', {
          name: store,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          status: 'active',
          metadata: {
            storeName: owner || null,
            picSales: picSales.trim() || null,
          }
        });
        if (res.ok) {
          const json = await res.json();
          finalContactId = json.data?.id;
          queryClient.invalidateQueries({ queryKey: ['contacts'] });
        }
      } catch (err) {
        console.error('Failed to auto-create contact:', err);
      }
    }

    const vendor = owner ? `${store} (${owner})` : store;

    const cleanItems = items
      .map((it) => ({
        item_name: String(it.item_name || '').trim(),
        sku: `${String(it.sku || '').trim()}|${it.unit || 'lusin'}`,
        qty: Number(it.qty) || 0,
      }))
      .filter((it) => it.item_name && it.sku.split('|')[0] && it.qty >= 1);

    if (cleanItems.length === 0) {
      setError(t('po.form.noItems'));
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        const res = await api.patch(`/api/workspace/purchase-orders/${editId}`, {
          vendor_name: vendor,
          notes: notes.trim() || null,
          items: cleanItems,
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error?.message || json?.message || t('po.toast.updateFailed'));
        }
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
        queryClient.invalidateQueries({ queryKey: ['purchase-order', editId] });
        navigate(`/purchase-orders/${editId}?toast=${encodeURIComponent(t('po.toast.updateSuccess'))}`);
      } else {
        const res = await api.post('/api/workspace/purchase-orders', {
          vendor_name: vendor,
          notes: notes.trim() || null,
          items: cleanItems,
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error?.message || json?.message || t('po.toast.createFailed'));
        }
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
        const newId = json.data?.id;
        if (newId) {
          navigate(`/purchase-orders/${newId}?toast=${encodeURIComponent(t('po.toast.createSuccess'))}`);
        } else {
          navigate(`/purchase-orders?toast=${encodeURIComponent(t('po.toast.createSuccess'))}`);
        }
      }
    } catch (err) {
      setError(err?.message || t('po.toast.updateFailed'));
      setSubmitting(false);
    }
  };

  const today = new Date().toLocaleDateString();
  const isSalesPerson = user?.role?.toLowerCase() === 'sales_person';

  return (
    <>
      <div className="po-page__header">
        <div>
          <h1 className="po-page__header-title">{isEdit ? t('po.form.editTitle') : t('po.form.title')}</h1>
          <p className="po-page__header-subtitle">{isEdit ? t('po.form.editSubtitle') : t('po.form.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary interactive btn-md"
          onClick={() => navigate('/purchase-orders')}
        >
          <ArrowLeft size={16} />
          <span>{t('po.form.back')}</span>
        </button>
      </div>

      {isEdit && editLoading ? (
        <div className="po-page__state">
          <p className="po-page__state-text">{t('po.list.loading')}</p>
        </div>
      ) : (
      <form className="po-form" onSubmit={handleSubmit}>
        {error && (
          <div className="po-form__error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="po-form__grid">
          <div className="po-field">
            <label className="po-field__label">{t('po.form.poNumber')}</label>
            <input
              type="text"
              className="po-field__input po-field__input--readonly"
              value={t('po.form.poNumberPlaceholder')}
              readOnly
              disabled
            />
          </div>
          <div className="po-field">
            <label className="po-field__label">{t('po.form.date')}</label>
            <input type="text" className="po-field__input po-field__input--readonly" value={today} readOnly disabled />
          </div>

          {/* Customer select card */}
          <div className="doc-modal__bento-card doc-modal__bento-card--customer po-field--full" ref={customerRef} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'none' }}>
            <div className="doc-modal__bento-card-head">
              <span className="doc-modal__bento-card-icon"><User size={15} /></span>
              <h3 className="doc-modal__bento-card-title">{t('documents.modal.customer')}</h3>
            </div>

            <div className="doc-modal__field">
              <div className="doc-modal__customer-wrap">
                {contactId ? (
                  <div className="doc-modal__selected-customer-wrap">
                    <div className="doc-modal__bento-card-row">
                      <div className="doc-modal__field">
                        <label className="doc-modal__field-label">
                          {t('documents.modal.storeName')} <span className="doc-modal__required" style={{ color: 'var(--color-danger)' }}>*</span>
                        </label>
                        <input type="text" className="po-field__input" value={customer} onChange={(e) => setCustomer(e.target.value)} required />
                      </div>
                      <div className="doc-modal__field">
                        <label className="doc-modal__field-label">
                          {t('documents.modal.ownerName')}
                        </label>
                        <input type="text" className="po-field__input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="doc-modal__change-contact-btn"
                      onClick={() => {
                        setContactId(null);
                        setCustomerDropdownOpen(true);
                      }}
                    >
                      {t('documents.modal.changeCustomer')}
                    </button>
                    <div className="doc-modal__field" style={{ marginTop: 8 }}>
                      <label className="doc-modal__field-label">{t('documents.modal.picSales')}</label>
                      <input
                        type="text"
                        className="po-field__input"
                        value={picSales}
                        onChange={(e) => setPicSales(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="doc-modal__customer-input-wrap">
                      <Search size={14} className="doc-modal__search-icon" />
                      <input
                        type="text"
                        className="po-field__input doc-modal__customer-input"
                        placeholder={t('po.form.customerSearchPlaceholder')}
                        value={customer}
                        onChange={(e) => {
                          setCustomer(e.target.value);
                          setContactId(null);
                          if (e.target.value.trim()) setCustomerDropdownOpen(true);
                          else setCustomerDropdownOpen(false);
                        }}
                        onFocus={() => { if (customer.trim()) setCustomerDropdownOpen(true); }}
                      />
                      <ChevronDown size={14} className="doc-modal__chevron" />
                    </div>
                    {customerDropdownOpen && (
                      <div className="doc-modal__customer-dropdown">
                        {filteredContacts.length > 0 ? (
                          filteredContacts.map((c) => {
                            const hasOwner = !!c.metadata?.storeName;
                            const displayName = c.name;
                            const subName = hasOwner ? `${t('po.form.owner')}: ${c.metadata.storeName}` : '';
                            const picSalesLabel = c.metadata?.picSales ? `${t('po.form.pic')}: ${c.metadata.picSales}` : '';
                            const details = [c.phone, c.email, c.address].filter(Boolean).join(' · ');
                            return (
                              <button
                                key={c.id}
                                type="button"
                                className="doc-modal__customer-dropdown-item"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setCustomer(c.name);
                                  setContactId(c.id);
                                  setCustomerDropdownOpen(false);
                                  setOwnerName(c.metadata?.storeName || '');
                                  setPhone(c.phone || '');
                                  setEmail(c.email || '');
                                  setAddress(c.address || '');
                                  setPicSales(c.metadata?.picSales || user?.email || '');
                                }}
                              >
                                <span className="doc-modal__customer-dropdown-name">
                                  {displayName} {subName && <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>({subName})</span>}
                                </span>
                                {(details || picSalesLabel) && (
                                  <span className="doc-modal__customer-dropdown-meta">
                                    {details}{picSalesLabel ? `${details ? ' · ' : ''}${picSalesLabel}` : ''}
                                  </span>
                                )}
                              </button>
                            );
                          })
                        ) : null}
                        {customer.trim() && !isExistingContact && (
                          <>
                            <button
                              type="button"
                              className="doc-modal__customer-dropdown-create"
                              onMouseDown={(e) => { e.preventDefault(); handleCreateNewContact('store'); }}
                              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                              disabled={creatingContact}
                            >
                              <Plus size={14} />
                              <span>{creatingContact ? t('po.form.submitting') : t('po.form.addAsStore', { name: customer.trim() })}</span>
                            </button>
                            <button
                              type="button"
                              className="doc-modal__customer-dropdown-create"
                              onMouseDown={(e) => { e.preventDefault(); handleCreateNewContact('customer'); }}
                              disabled={creatingContact}
                            >
                              <Plus size={14} />
                              <span>{creatingContact ? t('po.form.submitting') : t('po.form.addAsCustomer', { name: customer.trim() })}</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="doc-modal__bento-card-row">
              <div className="doc-modal__field">
                <label className="doc-modal__field-label">{t('documents.modal.phone')}</label>
                <input type="text" className="po-field__input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="doc-modal__field">
                <label className="doc-modal__field-label">{t('documents.modal.email')}</label>
                <input type="email" className="po-field__input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            <div className="doc-modal__field">
              <label className="doc-modal__field-label">{t('documents.modal.address')}</label>
              <input type="text" className="po-field__input" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>

          <div className="po-field po-field--full">
            <label className="po-field__label">{t('po.detail.notes')}</label>
            <textarea
              className="po-field__textarea"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="po-form__items">
          <div className="po-form__items-header">
            <span className="po-form__items-title">{t('po.form.items')}</span>
            <button
              type="button"
              className="btn btn-secondary interactive btn-sm"
              onClick={addItem}
            >
              <Plus size={14} />
              <span>{t('po.form.addItem')}</span>
            </button>
          </div>

          <div className="po-form__items-list">
            {items.map((item, idx) => (
              <div className="po-item-row" key={idx}>
                <div className="po-item-picker">
                  <label className="po-item-row__label">{t('po.form.itemName')}</label>
                  <input
                    type="text"
                    className="po-item-picker__search"
                    placeholder={t('po.form.itemSearchPlaceholder')}
                    value={item.item_name}
                    ref={(el) => (itemNameRefs.current[idx] = el)}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateItem(idx, { item_name: v });
                      // Trigger debounced search.
                      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                      searchDebounceRef.current = setTimeout(() => {
                        setItemSearch(v);
                        setOpenIdx(idx);
                      }, 250);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setOpenIdx(null);
                        focusField(itemSkuRefs, idx);
                      }
                    }}
                    onFocus={() => setOpenIdx(idx)}
                    autoComplete="off"
                  />
                  {openIdx === idx && (itemsList?.length || itemSearch || item.item_name) ? (
                    <div className="po-item-picker__dropdown">
                      {itemsFetching ? (
                        <div className="po-item-picker__hint">{t('po.form.loadingItems')}</div>
                      ) : itemsList && itemsList.length > 0 ? (
                        itemsList.slice(0, 50).map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            className="po-item-picker__option"
                            onClick={() => pickItem(idx, p)}
                          >
                            <span className="po-item-picker__name">{p.name}</span>
                            <span className="po-item-picker__sku">{p.sku}</span>
                          </button>
                        ))
                      ) : (
                        <div className="po-item-picker__hint">{t('po.form.noItemsFound')}</div>
                      )}

                      {/* Custom Non-Catalog Item Option */}
                      {item.item_name?.trim() ? (
                        <button
                          type="button"
                          className="po-item-picker__option po-item-picker__option--custom"
                          onClick={() => {
                            updateItem(idx, {
                              item_name: item.item_name.trim(),
                              sku: 'NON-SKU',
                            });
                            setOpenIdx(null);
                            focusField(itemQtyRefs, idx);
                          }}
                          style={{
                            borderTop: '1px solid var(--color-border)',
                            background: 'var(--color-surface-alt)',
                            color: 'var(--color-interactive)',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Plus size={14} />
                            <span>Gunakan nama: <strong>"{item.item_name.trim()}"</strong></span>
                          </div>
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-xs)',
                              background: 'var(--color-warning-surface)',
                              color: 'var(--color-warning)',
                              border: '1px solid var(--color-warning)',
                              fontWeight: '700',
                            }}
                          >
                            Non-Katalog
                          </span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="po-item-row__field">
                  <label className="po-item-row__label">{t('po.form.sku')}</label>
                  <input
                    type="text"
                    className="po-field__input po-field__input--sm"
                    placeholder="Otomatis / NON-SKU"
                    value={item.sku === 'NON-SKU' ? '' : item.sku}
                    ref={(el) => (itemSkuRefs.current[idx] = el)}
                    onChange={(e) => updateItem(idx, { sku: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        focusField(itemQtyRefs, idx);
                      }
                    }}
                  />
                </div>

                <div className="po-item-row__field po-item-row__field--qty">
                  <label className="po-item-row__label">{t('po.form.qty')}</label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    className="po-field__input po-field__input--sm"
                    value={item.qty === 0 || item.qty === '' ? '' : item.qty}
                    ref={(el) => (itemQtyRefs.current[idx] = el)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        updateItem(idx, { qty: '' });
                      } else {
                        const num = parseFloat(raw.replace(',', '.'));
                        updateItem(idx, { qty: isNaN(num) ? raw : num });
                      }
                    }}
                    onBlur={(e) => {
                      const raw = e.target.value;
                      const num = parseFloat(String(raw).replace(',', '.'));
                      if (isNaN(num) || num <= 0) {
                        updateItem(idx, { qty: 1 });
                      } else {
                        updateItem(idx, { qty: Number(num.toFixed(2)) });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const newIdx = items.length;
                        addItem();
                        setTimeout(() => focusField(itemNameRefs, newIdx), 0);
                      }
                    }}
                  />
                </div>

                <div className="po-item-row__field po-item-row__field--unit">
                  <label className="po-item-row__label">{t('documents.modal.unit')}</label>
                  <select
                    className="po-field__input po-field__input--sm"
                    value={item.unit || 'lusin'}
                    onChange={(e) => updateItem(idx, { unit: e.target.value })}
                    style={{
                      width: '100%',
                      height: '36px',
                      padding: '0 8px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    {units.map((u) => (
                      <option key={u.key} value={u.key}>
                        {formatUnitOption(u.key)}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="po-item-row__remove"
                  onClick={() => removeItem(idx)}
                  aria-label={t('po.form.removeItem')}
                  disabled={items.length === 1}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="po-form__actions">
          <button
            type="button"
            className="btn btn-secondary interactive"
            onClick={() => navigate('/purchase-orders')}
            disabled={submitting}
          >
            {t('po.form.cancel')}
          </button>
          <button type="submit" className="btn btn-primary interactive" disabled={submitting}>
            {submitting ? t('po.form.submitting') : (isEdit ? t('po.form.saveChanges') : t('po.form.submit'))}
          </button>
        </div>
      </form>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// EDIT VIEW
// ---------------------------------------------------------------------------
function POEditView() {
  const { id } = useParams();
  return <POCreateView editId={id} />;
}

// ---------------------------------------------------------------------------
// DETAIL VIEW
// ---------------------------------------------------------------------------
function PODetailView() {
  const { t, lang } = useApp();
  const { id } = useParams();
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const iframeRef = useRef(null);

  // Toast from query string.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const msg = params.get('toast');
    if (msg) {
      setToast({ type: 'success', text: msg });
      params.delete('toast');
      navigate({ search: params.toString() }, { replace: true });
      const tm = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(tm);
    }
  }, [navigate]);

  const { data: po, isLoading, error } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () => {
      const res = await api.get(`/api/workspace/purchase-orders/${id}`);
      if (!res.ok) throw new Error('Failed to load purchase order');
      const json = await res.json();
      return json.data;
    },
    enabled: !!id,
  });

  const { data: settings } = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: getWorkspaceSettings,
    staleTime: 5 * 60 * 1000,
  });

  const queryClient = useQueryClient();
  const { user } = useApp();
  const canDelete = isPrivileged(user?.role);

  const handleDelete = () => {
    if (!po) return;
    setConfirm({
      open: true,
      message: t('po.toast.confirmDelete'),
      onConfirm: async () => {
        setConfirm(null);
        setSubmitting(true);
        try {
          const res = await api.delete(`/api/workspace/purchase-orders/${po.id}`);
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j?.error?.message || t('po.toast.deleteFailed'));
          }
          await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
          await queryClient.refetchQueries({ queryKey: ['purchase-orders'], type: 'active' });
          setToast({ type: 'success', text: t('po.toast.deleteSuccess') });
          setTimeout(() => {
            navigate('/purchase-orders');
          }, 400);
        } catch (err) {
          setToast({ type: 'error', text: err?.message || t('po.toast.deleteFailed') });
          setSubmitting(false);
        }
      },
    });
  };

  const handlePrint = async () => {
    if (!po) return;
    try {
      const isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (isMobile) {
        setToast({ type: 'success', text: lang === 'id' ? 'Mengunduh PDF PO...' : 'Downloading PO PDF...' });
        try {
          const res = await api.get(`/api/workspace/purchase-orders/${po.id}/pdf`, { responseType: 'blob' });
          if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `PO-${po.po_number || 'document'}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            setToast({ type: 'success', text: lang === 'id' ? 'PDF PO berhasil diunduh' : 'PO PDF downloaded successfully' });
            return;
          }
        } catch (e) {
          console.warn('Backend PDF endpoint failed, fallback to HTML file download:', e);
        }
      }

      // 1. Prepare doc data formatted for generateDocumentHtml
      const printableDoc = {
        document_type: 'purchase_order',
        document_number: po.po_number,
        contact_name: po.vendor_name,
        issue_date: po.po_date,
        items: (po.items || []).map((it) => {
          let cleanSku = String(it.sku || '');
          let unit = 'lusin';
          if (cleanSku.includes('|')) {
            const parts = cleanSku.split('|');
            cleanSku = parts[0];
            unit = parts[1];
          }
          return {
            itemName: it.item_name,
            sku: cleanSku,
            quantity: it.qty,
            metadata: { unit }
          };
        }),
        sales_person_name: po.sales_person_name || po.sales_person || 'Sales Tester'
      };

      // 2. Generate HTML
      const html = generateDocumentHtml(printableDoc, settings, null, { id: '21x12', label: 'Kertas PO', width: '21cm', height: '12cm' });

      // 3. Write to iframe and print on desktop and mobile
      const frameWindow = iframeRef.current?.contentWindow;
      if (frameWindow) {
        frameWindow.document.open();
        frameWindow.document.write(html);
        frameWindow.document.close();
        frameWindow.focus();
        setTimeout(() => {
          try {
            frameWindow.print();
          } catch (e) {
            console.error('frameWindow.print error:', e);
            // Fallback to PDF download
            if (po?.id) {
              api.get(`/api/workspace/purchase-orders/${po.id}/pdf`, { responseType: 'blob' })
                .then(async (res) => {
                  if (res.ok) {
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `PO-${po.po_number || 'document'}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.URL.revokeObjectURL(url);
                    setToast({ type: 'success', text: lang === 'id' ? 'Dokumen PO berhasil diunduh' : 'PO document downloaded' });
                  }
                })
                .catch(() => {});
            }
          }
        }, 150);
        return;
      }

      const printWindow = window.open('', '_blank', 'noopener,noreferrer');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.document.title = `Purchase Order - ${po.po_number}`;
        printWindow.focus();
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 250);
      } else {
        alert('Mohon izinkan pop-up untuk mencetak dokumen PO');
      }
    } catch (err) {
      console.error('Failed to print PO:', err);
      setToast({ type: 'error', text: 'Gagal mencetak dokumen PO' });
    }
  };

  const handleApprovePO = () => {
    if (!po) return;
    setConfirm({
      open: true,
      message: `Apakah Anda yakin ingin menyetujui (ACC) Purchase Order ${po.po_number}? Setelah disetujui, tim gudang dapat langsung mengeluarkan barang di modul Goods Out.`,
      confirmLabel: 'Ya, Setujui PO',
      onConfirm: async () => {
        setConfirm(null);
        setSubmitting(true);
        try {
          const res = await api.post(`/api/workspace/purchase-orders/${po.id}/approve`, {});
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j?.error?.message || j?.message || 'Gagal menyetujui Purchase Order');
          }
          queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
          queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
          setToast({ type: 'success', text: `Purchase Order ${po.po_number} berhasil disetujui!` });
        } catch (err) {
          setToast({ type: 'error', text: err?.message || 'Gagal menyetujui Purchase Order' });
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const handleApproveInvoice = () => {
    if (!po) return;
    setConfirm({
      open: true,
      message: t('po.detail.confirmApprove', { poNumber: po.po_number }),
      confirmLabel: t('po.detail.confirmApproveBtn') || 'Ya, Setujui & Buat Invoice',
      onConfirm: async () => {
        setConfirm(null);
        setSubmitting(true);
        try {
          const res = await api.post(`/api/workspace/purchase-orders/${po.id}/approve-invoice`, {});
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j?.error?.message || j?.message || t('po.toast.approveFailed'));
          }
          const json = await res.json();
          queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
          queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
          queryClient.invalidateQueries({ queryKey: ['documents'] });
          setToast({ type: 'success', text: t('po.toast.approveSuccess', { invoiceNumber: json.data.invoice_number }) });
          setTimeout(() => navigate(`/document/${json.data.invoice_id}`), 1800);
        } catch (err) {
          setToast({ type: 'error', text: err?.message || t('po.toast.approveFailed') });
          setSubmitting(false);
        }
      },
    });
  };

  const handleDirectFulfillPO = () => {
    if (!po) return;
    setConfirm({
      open: true,
      message: `Apakah Anda yakin ingin menyelesaikan Purchase Order ${po.po_number} tanpa melalui modul Barang Keluar? Status PO akan berubah menjadi Fulfilled (Selesai).`,
      confirmLabel: 'Ya, Selesaikan PO',
      onConfirm: async () => {
        setConfirm(null);
        setSubmitting(true);
        try {
          const res = await api.patch(`/api/workspace/purchase-orders/${po.id}`, {
            status: 'fulfilled',
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j?.error?.message || j?.message || 'Gagal menyelesaikan Purchase Order');
          }
          queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
          queryClient.invalidateQueries({ queryKey: ['purchase-orders-approved'] });
          queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
          setToast({ type: 'success', text: `Purchase Order ${po.po_number} berhasil diselesaikan!` });
        } catch (err) {
          setToast({ type: 'error', text: err?.message || 'Gagal menyelesaikan Purchase Order' });
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const onCancelConfirm = () => setConfirm(null);

  const userRole = String(user?.role || '').toLowerCase();
  const isOwnerOrSuperAdmin = userRole === 'owner' || userRole === 'super_admin';
  const canApprove = canDelete && po && (po.status === 'pending' || po.status === 'draft' || po.status === 'submitted');
  const canDispatch = po && po.status === 'approved';
  const canDirectFulfill = isOwnerOrSuperAdmin && po && po.status === 'approved';
  const canEdit = po && (po.status === 'pending' || po.status === 'draft');

  return (
    <>
      <div className="po-page__header">
        <div>
          <h1 className="po-page__header-title">{t('po.detail.title')}</h1>
          <p className="po-page__header-subtitle">{t('po.detail.subtitle')}</p>
        </div>
        <div className="po-page__header-actions">
          {canApprove && (
            <button
              type="button"
              className="btn btn-primary interactive btn-md"
              onClick={handleApprovePO}
              disabled={submitting}
            >
              <Check size={16} />
              <span>Setujui PO (ACC)</span>
            </button>
          )}
          {canDispatch && (
            <button
              type="button"
              className="btn btn-primary interactive btn-md"
              onClick={() => navigate(`/goods-out?source_po_id=${po.id}`)}
              disabled={submitting}
              style={{ backgroundColor: 'var(--color-success, #10b981)', borderColor: 'var(--color-success, #10b981)' }}
            >
              <Truck size={16} />
              <span>Keluarkan Barang (Goods Out)</span>
            </button>
          )}
          {canDirectFulfill && (
            <button
              type="button"
              className="btn btn-secondary interactive btn-md"
              onClick={handleDirectFulfillPO}
              disabled={submitting}
              title="Selesaikan PO langsung tanpa melalui modul Barang Keluar"
              style={{
                borderColor: 'var(--color-interactive)',
                color: 'var(--color-interactive)',
              }}
            >
              <CheckCircle2 size={16} />
              <span>Selesaikan PO</span>
            </button>
          )}
          {canApprove && (
            <button
              type="button"
              className="btn btn-secondary interactive btn-md"
              onClick={handleApproveInvoice}
              disabled={submitting}
            >
              <FileText size={16} />
              <span>{t('po.detail.approveAndInvoice')}</span>
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className="btn btn-secondary interactive btn-md"
              onClick={() => navigate(`/purchase-orders/${po.id}/edit`)}
              disabled={submitting}
            >
              <Pencil size={16} />
              <span>{t('po.detail.edit')}</span>
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="btn btn-danger interactive btn-md"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              <span>
                {submitting
                  ? (lang === 'id' ? 'Menghapus...' : 'Deleting...')
                  : (t('po.detail.delete') || (lang === 'id' ? 'Hapus PO' : 'Delete PO'))}
              </span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary interactive btn-md"
            onClick={handlePrint}
            disabled={submitting}
          >
            <Printer size={16} />
            <span>{t('po.detail.print')}</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary interactive btn-md"
            onClick={() => navigate('/purchase-orders')}
            disabled={submitting}
          >
            <ArrowLeft size={16} />
            <span>{t('po.detail.back')}</span>
          </button>
        </div>
      </div>

      {toast && (
        <div className={`po-toast po-toast--${toast.type}`} role="status" aria-live="polite">
          {toast.type === 'success' ? (
            <CheckCircle2 size={18} className="po-toast__icon" />
          ) : (
            <XCircle size={18} className="po-toast__icon" />
          )}
          <span className="po-toast__text">{toast.text}</span>
          <button className="po-toast__close" onClick={() => setToast(null)} aria-label="close">
            <X size={14} />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="po-page__state">
          <p className="po-page__state-text">{t('po.list.loading')}</p>
        </div>
      ) : error || !po ? (
        <div className="po-page__state">
          <AlertCircle className="po-page__state-icon po-page__state-icon--error" size={40} />
          <p className="po-page__state-text">{t('po.detail.notFound')}</p>
        </div>
      ) : (
        <>
          <div className="po-detail__card">
            <div className="po-detail__grid">
              <div className="po-detail__field">
                <span className="po-detail__label">{t('po.form.poNumber')}</span>
                <span className="po-detail__value po-detail__value--mono">{po.po_number}</span>
              </div>
              <div className="po-detail__field">
                <span className="po-detail__label">{t('po.form.date')}</span>
                <span className="po-detail__value">{formatDate(po.po_date)}</span>
              </div>
              <div className="po-detail__field">
                <span className="po-detail__label">{t('po.form.vendor')}</span>
                <span className="po-detail__value">{cleanVendorName(po.vendor_name)}</span>
              </div>
              <div className="po-detail__field">
                <span className="po-detail__label">{t('po.detail.status')}</span>
                <span className="po-detail__value">
                  <span className={`po-status po-status--${po.status || 'draft'}`}>
                    {t(statusKey(po.status))}
                  </span>
                </span>
              </div>
              <div className="po-detail__field po-detail__field--full">
                <span className="po-detail__label">{t('po.detail.notes')}</span>
                <span className="po-detail__value">{po.notes || t('po.detail.noNotes')}</span>
              </div>
            </div>
          </div>

          <div className="po-detail__items">
            <h2 className="po-detail__items-title">{t('po.form.items')}</h2>
            <div className="po-table">
              <table className="po-table__el">
                <thead>
                  <tr>
                    <th>{t('po.form.itemName')}</th>
                    <th>{t('po.form.sku')}</th>
                    <th>{t('po.form.qty')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(po.items ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="po-table__empty">
                        {t('po.form.emptyItems')}
                      </td>
                    </tr>
                  ) : (
                    po.items.map((it) => {
                      let cleanSku = String(it.sku || '');
                      let unit = 'lusin';
                      if (cleanSku.includes('|')) {
                        const parts = cleanSku.split('|');
                        cleanSku = parts[0];
                        unit = parts[1];
                      }
                      const isNonCatalog = cleanSku === 'NON-SKU' || !cleanSku;
                      return (
                        <tr key={it.id || `${it.sku}-${it.qty}`}>
                          <td className="po-table__cell">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{it.item_name}</span>
                              {isNonCatalog && (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    padding: '1px 6px',
                                    borderRadius: 'var(--radius-xs)',
                                    background: 'var(--color-warning-surface)',
                                    color: 'var(--color-warning)',
                                    border: '1px solid var(--color-warning)',
                                    fontWeight: '700',
                                  }}
                                >
                                  Non-Katalog
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="po-table__cell po-table__cell--mono">
                            {isNonCatalog ? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Non-Katalog</span> : cleanSku}
                          </td>
                          <td className="po-table__cell">{it.qty} {unit}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {po.status === 'approved' && (
            <div className="po-approved-banner">
              <CheckCircle2 size={18} className="po-approved-banner__icon" />
              <div>
                <p className="po-approved-banner__title">{t('po.detail.approvedBanner.title')}</p>
                {user?.role === 'sales_person' ? (
                  <p className="po-approved-banner__desc">{t('po.detail.approvedBanner.salesDesc')}</p>
                ) : (
                  <p className="po-approved-banner__desc" dangerouslySetInnerHTML={{ __html: t('po.detail.approvedBanner.desc', { poNumber: po.po_number }) }} />
                )}
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={confirm?.open}
        title={confirm?.title || 'Konfirmasi'}
        message={confirm?.message || ''}
        confirmLabel={confirm?.confirmLabel}
        cancelLabel={confirm?.cancelLabel}
        onConfirm={confirm?.onConfirm || (() => {})}
        onCancel={onCancelConfirm}
      />

      <iframe
        ref={iframeRef}
        style={{ position: 'fixed', right: 0, bottom: 0, width: 0, height: 0, border: 'none', opacity: 0, pointerEvents: 'none' }}
        title="PO Print Frame"
      />
    </>
  );
}
