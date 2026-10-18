import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Award, PlusCircle, MinusCircle, ChevronDown, ChevronUp, History, Check } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './CustomerDetailModal.css';

const STATUS_CLASS = {
  Active: 'customers-status-badge--active',
  Pending: 'customers-status-badge--pending',
  Archived: 'customers-status-badge--archived',
};

function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

export default function CustomerDetailModal({ customer, onClose, onEdit }) {
  const { t, user } = useApp();
  const queryClient = useQueryClient();

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Points state
  const [showHistory, setShowHistory] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustType, setAdjustType] = useState('add'); // 'add' | 'deduct'
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDesc, setAdjustDesc] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState(null);

  const isOwnerOrSuper = user?.role === 'owner' || user?.role === 'super_admin';

  // Fetch points & history
  const { data: pointsData, refetch: refetchPoints } = useQuery({
    queryKey: ['customer-points', customer.id],
    queryFn: async () => {
      const res = await api.get(`/api/workspace/contacts/${customer.id}/points?limit=50`);
      if (!res.ok) return { data: [], balance: 0, count: 0 };
      return res.json();
    },
    enabled: !!customer.id,
  });

  const pointBalance = pointsData?.balance ?? 0;
  const pointHistory = pointsData?.data ?? [];

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !deleting && !showAdjustModal) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, deleting, showAdjustModal]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await api.delete(`/api/workspace/contacts/${customer.id}`);
      if (!res.ok) throw new Error(t('customers.detail.error.deleteFailed'));
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['contacts-point-balances'] });
      onClose();
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  }

  async function handleAdjustSubmit(e) {
    e.preventDefault();
    const val = Number(adjustAmount);
    if (!val || val <= 0) {
      setAdjustError('Jumlah point harus lebih besar dari 0');
      return;
    }
    if (!adjustDesc.trim()) {
      setAdjustError('Keterangan / alasan penyesuaian harus diisi');
      return;
    }

    setAdjusting(true);
    setAdjustError(null);

    const delta = adjustType === 'add' ? val : -val;

    try {
      const res = await api.post(`/api/workspace/contacts/${customer.id}/points/adjust`, {
        amount: delta,
        description: adjustDesc.trim(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.message || 'Gagal mengubah point');
      }
      setShowAdjustModal(false);
      setAdjustAmount('');
      setAdjustDesc('');
      refetchPoints();
      queryClient.invalidateQueries({ queryKey: ['contacts-point-balances'] });
    } catch (err) {
      setAdjustError(err.message);
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <div className="cust-detail-overlay" onClick={() => { if (!deleting && !showAdjustModal) onClose(); }}>
      <div className="cust-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cust-detail__header">
          <div className="cust-detail__title-area">
            <h2 className="cust-detail__title">{(customer.name && customer.name.trim() && customer.name !== '-') ? customer.name.trim() : customer.storeName}</h2>
          </div>
          <button
            type="button"
            className="cust-detail__close-btn"
            onClick={onClose}
            disabled={deleting}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="cust-detail__body">
          {deleteError && (
            <div className="cust-detail__error">
              <AlertCircle size={14} />
              <span>{deleteError}</span>
            </div>
          )}

          <div className="cust-detail__badge-row">
            <span className={`customers-status-badge ${STATUS_CLASS[customer.status] || ''}`}>
              {t(`customers.status.${customer.status.toLowerCase()}`)}
            </span>
            <span className="customers-tag-pill">{customer.tag}</span>
          </div>

          <div className="cust-detail__info-grid">
            <div className="cust-detail__info-item">
              <span className="cust-detail__info-label">{t('documents.modal.storeName') || 'Nama Toko'}</span>
              <span className="cust-detail__info-value">{(customer.name && customer.name.trim() && customer.name !== '-') ? customer.name.trim() : (customer.storeName || '—')}</span>
            </div>
            <div className="cust-detail__info-item">
              <span className="cust-detail__info-label">{t('documents.modal.ownerName') || 'Nama Lengkap Pemilik'}</span>
              <span className="cust-detail__info-value">{(customer.name && customer.name.trim() && customer.name !== '-') ? (customer.storeName || '—') : '—'}</span>
            </div>
            <div className="cust-detail__info-item">
              <span className="cust-detail__info-label">{t('customers.form.phone')}</span>
              <span className="cust-detail__info-value">{customer.phone || '—'}</span>
            </div>
            <div className="cust-detail__info-item">
              <span className="cust-detail__info-label">{t('customers.form.email')}</span>
              <span className="cust-detail__info-value">{customer.email || '—'}</span>
            </div>
            <div className="cust-detail__info-item">
              <span className="cust-detail__info-label">{t('customers.form.picSales')}</span>
              <span className="cust-detail__info-value">{customer.picSales || '—'}</span>
            </div>
            <div className="cust-detail__info-item">
              <span className="cust-detail__info-label">{t('customers.form.taxId')}</span>
              <span className="cust-detail__info-value">{customer.taxId || '—'}</span>
            </div>
            <div className="cust-detail__info-item">
              <span className="cust-detail__info-label">{t('customers.form.city')}</span>
              <span className="cust-detail__info-value">{customer.city || '—'}</span>
            </div>
            <div className="cust-detail__info-item">
              <span className="cust-detail__info-label">{t('customers.form.province')}</span>
              <span className="cust-detail__info-value">{customer.province || '—'}</span>
            </div>
            <div className="cust-detail__info-item">
              <span className="cust-detail__info-label">{t('customers.form.status')}</span>
              <span className="cust-detail__info-value">{t(`customers.status.${customer.status.toLowerCase()}`)}</span>
            </div>
          </div>

          {/* ── Loyalty Points / Cashback Card ─────────────────── */}
          <div className="cust-detail__points-card">
            <div className="cust-detail__points-header">
              <div className="cust-detail__points-title-wrap">
                <Award size={18} />
                <span>Saldo Cashback Toko</span>
              </div>
              {isOwnerOrSuper && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--color-interactive)' }}
                  onClick={() => { setShowAdjustModal(true); setAdjustError(null); }}
                >
                  <PlusCircle size={14} />
                  <span>Sesuaikan Saldo</span>
                </button>
              )}
            </div>

            <div className="cust-detail__points-val-box">
              <div>
                <span className="cust-detail__points-val">{formatCurrency(pointBalance)}</span>
              </div>
              <span className="cust-detail__points-val-sub">Dapat dipakai di faktur berikutnya</span>
            </div>

            {pointHistory.length > 0 && (
              <div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '4px 0', fontSize: 'var(--text-caption)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => setShowHistory(!showHistory)}
                >
                  <History size={13} />
                  <span>{showHistory ? 'Sembunyikan Riwayat' : `Lihat Riwayat Mutasi (${pointHistory.length})`}</span>
                  {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {showHistory && (
                  <div className="cust-detail__points-history-list">
                    {pointHistory.map((item) => {
                      const isPos = Number(item.amount) > 0;
                      return (
                        <div key={item.id} className="cust-detail__points-history-item">
                          <div className="cust-detail__points-history-desc">
                            <span className="cust-detail__points-history-title">{item.description || item.type}</span>
                            <span className="cust-detail__points-history-date">
                              {new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <span className={`cust-detail__points-history-amount ${isPos ? 'cust-detail__points-history-amount--pos' : 'cust-detail__points-history-amount--neg'}`}>
                            {isPos ? `+${formatCurrency(item.amount)}` : `-${formatCurrency(Math.abs(item.amount))}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {customer.address && (
            <div className="cust-detail__section">
              <h4 className="cust-detail__section-title">{t('customers.detail.address')}</h4>
              <p className="cust-detail__section-content">{customer.address}</p>
            </div>
          )}

          {customer.notes && (
            <div className="cust-detail__section">
              <h4 className="cust-detail__section-title">{t('customers.form.notes')}</h4>
              <p className="cust-detail__section-content">{customer.notes}</p>
            </div>
          )}
        </div>

        <div className="cust-detail__footer">
          {showDelete ? (
            <div className="cust-detail__delete-confirm">
              <span>{t('customers.detail.deleteConfirm')}</span>
              <div className="cust-detail__delete-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setShowDelete(false); setDeleteError(null); }}
                  disabled={deleting}
                >
                  {t('general.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? t('general.deleting') : t('customers.detail.deleteBtn')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-danger btn-md"
                onClick={() => setShowDelete(true)}
              >
                {t('customers.detail.deleteBtn')}
              </button>
              <div className="cust-detail__footer-right">
                <button
                  type="button"
                  className="btn btn-secondary btn-md"
                  onClick={() => onEdit(customer)}
                >
                  {t('customers.detail.editBtn')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-md"
                  onClick={onClose}
                >
                  {t('customers.detail.closeBtn')}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Adjust Points Modal Subdialog ──────────────────── */}
        {showAdjustModal && (
          <div className="doc-modal-overlay" style={{ zIndex: 2100 }} onClick={() => setShowAdjustModal(false)}>
            <div className="doc-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
              <div className="doc-modal__header">
                <div>
                  <h3 className="doc-modal__title">Sesuaikan Saldo Cashback</h3>
                  <p className="doc-modal__subtitle">Saldo saat ini: {formatCurrency(pointBalance)}</p>
                </div>
                <button type="button" className="doc-modal__close-btn" onClick={() => setShowAdjustModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAdjustSubmit} style={{ padding: 'var(--space-5)' }}>
                {adjustError && (
                  <div className="cust-detail__error" style={{ marginBottom: 'var(--space-4)' }}>
                    <AlertCircle size={14} />
                    <span>{adjustError}</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${adjustType === 'add' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setAdjustType('add')}
                  >
                    <PlusCircle size={15} />
                    <span>Tambah Saldo</span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${adjustType === 'deduct' ? 'btn-danger' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setAdjustType('deduct')}
                  >
                    <MinusCircle size={15} />
                    <span>Kurangi Saldo</span>
                  </button>
                </div>

                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="doc-modal__discount-label" style={{ marginBottom: 'var(--space-1)', display: 'block' }}>
                    Jumlah Saldo (Rp)
                  </label>
                  <input
                    type="number"
                    className="input"
                    min="1"
                    placeholder="Contoh: 100000"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div style={{ marginBottom: 'var(--space-5)' }}>
                  <label className="doc-modal__discount-label" style={{ marginBottom: 'var(--space-1)', display: 'block' }}>
                    Alasan / Keterangan Penyesuaian
                  </label>
                  <textarea
                    className="input"
                    rows="3"
                    placeholder="Contoh: Bonus reward penjualan / Koreksi faktur"
                    value={adjustDesc}
                    onChange={(e) => setAdjustDesc(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-md"
                    onClick={() => setShowAdjustModal(false)}
                    disabled={adjusting}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-md"
                    disabled={adjusting}
                  >
                    {adjusting ? 'Menyimpan...' : (
                      <><Check size={16} /><span>Simpan Penyesuaian</span></>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
