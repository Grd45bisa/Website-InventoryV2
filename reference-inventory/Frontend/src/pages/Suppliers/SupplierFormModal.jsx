import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './SupplierFormModal.css';

export default function SupplierFormModal({ supplier, onClose, onSuccess }) {
  const { t } = useApp();
  const queryClient = useQueryClient();
  const isEdit = !!supplier;

  const [form, setForm] = useState(() => ({
    name: supplier?.name || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    address: supplier?.address || '',
    city: supplier?.city || 'Jakarta',
    province: supplier?.province || '',
    taxId: supplier?.taxId || '',
    notes: supplier?.notes || '',
    status: supplier?.status || 'Active',
    tag: supplier?.tag || 'Regular',
  }));

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = t('suppliers.form.error.nameRequired');
    return errs;
  }

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = {
        type: 'supplier',
        name: form.name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        city: form.city || null,
        province: form.province || null,
        status: form.status.toLowerCase(),
        metadata: {
          taxId: form.taxId || '',
          notes: form.notes || '',
          tag: form.tag || 'Regular',
        },
      };
      const res = isEdit
        ? await api.patch(`/api/workspace/contacts/${supplier.id}`, body)
        : await api.post('/api/workspace/contacts', body);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || t('suppliers.form.error.submitFailed'));
      }
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      onSuccess();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sup-modal-overlay" onClick={() => { if (!submitting) onClose(); }}>
      <div className="sup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sup-modal__header">
          <div className="sup-modal__title-area">
            <h2 className="sup-modal__title">
              {t(isEdit ? 'suppliers.form.editTitle' : 'suppliers.form.createTitle')}
            </h2>
            <p className="sup-modal__subtitle">
              {t(isEdit ? 'suppliers.form.editSubtitle' : 'suppliers.form.createSubtitle')}
            </p>
          </div>
          <button
            type="button"
            className="sup-modal__close-btn"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="sup-modal__body">
          {submitError && (
            <div className="sup-modal__error">
              <AlertCircle size={14} />
              <span>{submitError}</span>
            </div>
          )}

          <form id="sup-form" onSubmit={handleSubmit} noValidate>
            <div className="sup-modal__fields">
              <div className="sup-modal__field sup-modal__field--span-2">
                <label className="sup-modal__field-label">
                  {t('suppliers.form.name')} <span className="sup-modal__required">*</span>
                </label>
                <input
                  type="text"
                  className={`input ${errors.name ? 'input--error' : ''}`}
                  placeholder={t('suppliers.form.namePlaceholder')}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  disabled={submitting}
                  autoComplete="off"
                />
                {errors.name && <span className="sup-modal__field-error">{errors.name}</span>}
              </div>

              <div className="sup-modal__field">
                <label className="sup-modal__field-label">{t('suppliers.form.phone')}</label>
                <input
                  type="text"
                  className="input"
                  placeholder={t('suppliers.form.phonePlaceholder')}
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="sup-modal__field">
                <label className="sup-modal__field-label">{t('suppliers.form.email')}</label>
                <input
                  type="email"
                  className="input"
                  placeholder={t('suppliers.form.emailPlaceholder')}
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="sup-modal__field">
                <label className="sup-modal__field-label">{t('suppliers.form.city')}</label>
                <input
                  type="text"
                  className="input"
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="sup-modal__field">
                <label className="sup-modal__field-label">{t('suppliers.form.province')}</label>
                <input
                  type="text"
                  className="input"
                  value={form.province}
                  onChange={(e) => set('province', e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="sup-modal__field">
                <label className="sup-modal__field-label">{t('suppliers.form.taxId')}</label>
                <input
                  type="text"
                  className="input"
                  value={form.taxId}
                  onChange={(e) => set('taxId', e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="sup-modal__field">
                <label className="sup-modal__field-label">{t('suppliers.form.status')}</label>
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => set('status', e.target.value)}
                  disabled={submitting}
                >
                  <option value="Active">{t('suppliers.status.active')}</option>
                  <option value="Pending">{t('suppliers.status.pending')}</option>
                  <option value="Archived">{t('suppliers.status.archived')}</option>
                </select>
              </div>

              <div className="sup-modal__field">
                <label className="sup-modal__field-label">{t('suppliers.form.tag')}</label>
                <select
                  className="input"
                  value={form.tag}
                  onChange={(e) => set('tag', e.target.value)}
                  disabled={submitting}
                >
                  <option value="Regular">{t('suppliers.tag.regular')}</option>
                  <option value="VIP">{t('suppliers.tag.vip')}</option>
                  <option value="New">{t('suppliers.tag.new')}</option>
                </select>
              </div>

              <div className="sup-modal__field sup-modal__field--span-2">
                <label className="sup-modal__field-label">{t('suppliers.form.address')}</label>
                <input
                  type="text"
                  className="input"
                  placeholder={t('suppliers.form.addressPlaceholder')}
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="sup-modal__field sup-modal__field--span-2">
                <label className="sup-modal__field-label">{t('suppliers.form.notes')}</label>
                <textarea
                  className="input"
                  style={{ minHeight: 64, resize: 'vertical' }}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          </form>
        </div>

        <div className="sup-modal__footer">
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={onClose}
            disabled={submitting}
          >
            {t('general.cancel')}
          </button>
          <button
            type="submit"
            form="sup-form"
            className="btn btn-primary btn-md"
            disabled={submitting}
          >
            {submitting
              ? t('general.submitting')
              : t(isEdit ? 'suppliers.form.save' : 'suppliers.form.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
