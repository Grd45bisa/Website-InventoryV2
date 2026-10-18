import React, { useState } from 'react';
import { X, AlertCircle, User, Phone, Mail, MapPin, Building2, Map, FileText, Shield, Tag, MessageSquare, Store, UserCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './CustomerFormModal.css';

export default function CustomerFormModal({ customer, onClose, onSuccess }) {
  const { t, user } = useApp();
  const queryClient = useQueryClient();
  const isEdit = !!customer;

  const [form, setForm] = useState(() => ({
    name: customer?.name || '',
    storeName: customer?.storeName || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
    city: customer?.city || 'Jakarta',
    province: customer?.province || '',
    taxId: customer?.taxId || '',
    picSales: customer?.picSales || '',
    notes: customer?.notes || '',
    status: customer?.status || 'Active',
    tag: customer?.tag || 'Regular',
  }));

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = t('customers.form.error.nameRequired');
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
        type: 'customer',
        name: form.name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        city: form.city || null,
        province: form.province || null,
        status: form.status.toLowerCase(),
        metadata: {
          storeName: form.storeName || '',
          taxId: form.taxId || '',
          picSales: user?.role?.toLowerCase() === 'sales_person'
            ? (user?.fullName || user?.full_name || user?.email)
            : (form.picSales || ''),
          notes: form.notes || '',
          tag: form.tag || 'Regular',
        },
      };
      const res = isEdit
        ? await api.patch(`/api/workspace/contacts/${customer.id}`, body)
        : await api.post('/api/workspace/contacts', body);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || t('customers.form.error.submitFailed'));
      }
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onSuccess();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cust-modal-overlay" onClick={() => { if (!submitting) onClose(); }}>
      <div className="cust-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cust-modal__header">
          <div className="cust-modal__header-icon">
            <User size={22} />
          </div>
          <div className="cust-modal__title-area">
            <h2 className="cust-modal__title">
              {t(isEdit ? 'customers.form.editTitle' : 'customers.form.createTitle')}
            </h2>
            <p className="cust-modal__subtitle">
              {t(isEdit ? 'customers.form.editSubtitle' : 'customers.form.createSubtitle')}
            </p>
          </div>
          <button
            type="button"
            className="cust-modal__close-btn"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="cust-modal__body">
          {submitError && (
            <div className="cust-modal__error">
              <AlertCircle size={14} />
              <span>{submitError}</span>
            </div>
          )}

          <form id="cust-form" onSubmit={handleSubmit} noValidate>
            <div className="cust-modal__bento">
              <div className="cust-modal__bento-card cust-modal__bento-card--full">
                <div className="cust-modal__section-header">
                  <span className="cust-modal__section-title">{t('customers.form.contactSection')}</span>
                </div>
                <div className="cust-modal__fields cust-modal__fields--3">
                  <div className="cust-modal__field cust-modal__field--span-2">
                    <label className="cust-modal__field-label">
                      <Store size={13} />
                      {t('customers.form.name')} <span className="cust-modal__required">*</span>
                    </label>
                    <input
                      type="text"
                      className={`input ${errors.name ? 'input--error' : ''}`}
                      placeholder={t('customers.form.namePlaceholder')}
                      value={form.name}
                      onChange={(e) => set('name', e.target.value)}
                      disabled={submitting}
                      autoComplete="off"
                    />
                    {errors.name && <span className="cust-modal__field-error">{errors.name}</span>}
                  </div>

                  <div className="cust-modal__field">
                    <label className="cust-modal__field-label">
                      <User size={13} />
                      {t('customers.form.storeName')}
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder={t('customers.form.storeNamePlaceholder')}
                      value={form.storeName}
                      onChange={(e) => set('storeName', e.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  <div className="cust-modal__field">
                    <label className="cust-modal__field-label">
                      <Phone size={13} />
                      {t('customers.form.phone')}
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder={t('customers.form.phonePlaceholder')}
                      value={form.phone}
                      onChange={(e) => set('phone', e.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  <div className="cust-modal__field cust-modal__field--span-2">
                    <label className="cust-modal__field-label">
                      <Mail size={13} />
                      {t('customers.form.email')}
                    </label>
                    <input
                      type="email"
                      className="input"
                      placeholder={t('customers.form.emailPlaceholder')}
                      value={form.email}
                      onChange={(e) => set('email', e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                </div>
              </div>

              <div className="cust-modal__bento-card">
                <div className="cust-modal__section-header">
                  <span className="cust-modal__section-title">{t('customers.form.locationSection')}</span>
                </div>
                <div className="cust-modal__fields">
                  <div className="cust-modal__field">
                    <label className="cust-modal__field-label">
                      <MapPin size={13} />
                      {t('customers.form.city')}
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={form.city}
                      onChange={(e) => set('city', e.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  <div className="cust-modal__field">
                    <label className="cust-modal__field-label">
                      <Building2 size={13} />
                      {t('customers.form.province')}
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={form.province}
                      onChange={(e) => set('province', e.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  <div className="cust-modal__field cust-modal__field--span-2">
                    <label className="cust-modal__field-label">
                      <Map size={13} />
                      {t('customers.form.address')}
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder={t('customers.form.addressPlaceholder')}
                      value={form.address}
                      onChange={(e) => set('address', e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                </div>
              </div>

              <div className="cust-modal__bento-card">
                <div className="cust-modal__section-header">
                  <span className="cust-modal__section-title">{t('customers.form.additionalSection')}</span>
                </div>
                <div className="cust-modal__fields">
                  <div className="cust-modal__field">
                    <label className="cust-modal__field-label">
                      <FileText size={13} />
                      {t('customers.form.taxId')}
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={form.taxId}
                      onChange={(e) => set('taxId', e.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  {user?.role?.toLowerCase() !== 'sales_person' && (
                    <div className="cust-modal__field">
                      <label className="cust-modal__field-label">
                        <UserCheck size={13} />
                        {t('customers.form.picSales')}
                      </label>
                      <input
                        type="text"
                        className="input"
                        placeholder={t('customers.form.picSalesPlaceholder')}
                        value={form.picSales}
                        onChange={(e) => set('picSales', e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                  )}

                  <div className="cust-modal__field">
                    <label className="cust-modal__field-label">
                      <Shield size={13} />
                      {t('customers.form.status')}
                    </label>
                    <select
                      className="input"
                      value={form.status}
                      onChange={(e) => set('status', e.target.value)}
                      disabled={submitting}
                    >
                      <option value="Active">{t('customers.status.active')}</option>
                      <option value="Pending">{t('customers.status.pending')}</option>
                      <option value="Archived">{t('customers.status.archived')}</option>
                    </select>
                  </div>

                  <div className="cust-modal__field">
                    <label className="cust-modal__field-label">
                      <Tag size={13} />
                      {t('customers.form.tag')}
                    </label>
                    <select
                      className="input"
                      value={form.tag}
                      onChange={(e) => set('tag', e.target.value)}
                      disabled={submitting}
                    >
                      <option value="Regular">{t('customers.tag.regular')}</option>
                      <option value="VIP">{t('customers.tag.vip')}</option>
                      <option value="New">{t('customers.tag.new')}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="cust-modal__bento-card cust-modal__bento-card--full">
                <div className="cust-modal__section-header">
                  <span className="cust-modal__section-title">{t('customers.form.notes')}</span>
                  <span className="cust-modal__section-optional">{t('customers.form.optional')}</span>
                </div>
                <textarea
                  className="input"
                  style={{ minHeight: 80, resize: 'vertical' }}
                  placeholder={t('customers.form.notesPlaceholder')}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          </form>
        </div>

        <div className="cust-modal__footer">
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
            form="cust-form"
            className="btn btn-primary btn-md"
            disabled={submitting}
          >
            {submitting
              ? t('general.submitting')
              : t(isEdit ? 'customers.form.save' : 'customers.form.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
