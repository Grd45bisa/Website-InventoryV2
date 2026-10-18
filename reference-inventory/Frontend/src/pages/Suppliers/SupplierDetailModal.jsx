import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './SupplierDetailModal.css';

const STATUS_CLASS = {
  Active: 'suppliers-status-badge--active',
  Pending: 'suppliers-status-badge--pending',
  Archived: 'suppliers-status-badge--archived',
};

export default function SupplierDetailModal({ supplier, onClose, onEdit }) {
  const { t } = useApp();
  const queryClient = useQueryClient();

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !deleting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, deleting]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await api.delete(`/api/workspace/contacts/${supplier.id}`);
      if (!res.ok) throw new Error(t('suppliers.detail.error.deleteFailed'));
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      onClose();
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="sup-detail-overlay" onClick={() => { if (!deleting) onClose(); }}>
      <div className="sup-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sup-detail__header">
          <div className="sup-detail__title-area">
            <h2 className="sup-detail__title">{supplier.name}</h2>
            <p className="sup-detail__subtitle">
              {supplier.city || supplier.province
                ? [supplier.city, supplier.province].filter(Boolean).join(', ')
                : t('suppliers.detail.noLocation')}
            </p>
          </div>
          <button
            type="button"
            className="sup-detail__close-btn"
            onClick={onClose}
            disabled={deleting}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="sup-detail__body">
          {deleteError && (
            <div className="sup-detail__error">
              <AlertCircle size={14} />
              <span>{deleteError}</span>
            </div>
          )}

          <div className="sup-detail__badge-row">
            <span className={`suppliers-status-badge ${STATUS_CLASS[supplier.status] || ''}`}>
              {t(`suppliers.status.${supplier.status.toLowerCase()}`)}
            </span>
            <span className="suppliers-tag-pill">{supplier.tag}</span>
          </div>

          <div className="sup-detail__info-grid">
            <div className="sup-detail__info-item">
              <span className="sup-detail__info-label">{t('suppliers.form.phone')}</span>
              <span className="sup-detail__info-value">{supplier.phone || '—'}</span>
            </div>
            <div className="sup-detail__info-item">
              <span className="sup-detail__info-label">{t('suppliers.form.email')}</span>
              <span className="sup-detail__info-value">{supplier.email || '—'}</span>
            </div>
            <div className="sup-detail__info-item">
              <span className="sup-detail__info-label">{t('suppliers.form.taxId')}</span>
              <span className="sup-detail__info-value">{supplier.taxId || '—'}</span>
            </div>
            <div className="sup-detail__info-item">
              <span className="sup-detail__info-label">{t('suppliers.form.city')}</span>
              <span className="sup-detail__info-value">{supplier.city || '—'}</span>
            </div>
            <div className="sup-detail__info-item">
              <span className="sup-detail__info-label">{t('suppliers.form.province')}</span>
              <span className="sup-detail__info-value">{supplier.province || '—'}</span>
            </div>
            <div className="sup-detail__info-item">
              <span className="sup-detail__info-label">{t('suppliers.form.status')}</span>
              <span className="sup-detail__info-value">{t(`suppliers.status.${supplier.status.toLowerCase()}`)}</span>
            </div>
          </div>

          {supplier.address && (
            <div className="sup-detail__section">
              <h4 className="sup-detail__section-title">{t('suppliers.detail.address')}</h4>
              <p className="sup-detail__section-content">{supplier.address}</p>
            </div>
          )}

          {supplier.notes && (
            <div className="sup-detail__section">
              <h4 className="sup-detail__section-title">{t('suppliers.form.notes')}</h4>
              <p className="sup-detail__section-content">{supplier.notes}</p>
            </div>
          )}
        </div>

        <div className="sup-detail__footer">
          {showDelete ? (
            <div className="sup-detail__delete-confirm">
              <span>{t('suppliers.detail.deleteConfirm')}</span>
              <div className="sup-detail__delete-actions">
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
                  {deleting ? t('general.deleting') : t('suppliers.detail.deleteBtn')}
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
                {t('suppliers.detail.deleteBtn')}
              </button>
              <div className="sup-detail__footer-right">
                <button
                  type="button"
                  className="btn btn-secondary btn-md"
                  onClick={() => onEdit(supplier)}
                >
                  {t('suppliers.detail.editBtn')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-md"
                  onClick={onClose}
                >
                  {t('suppliers.detail.closeBtn')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
