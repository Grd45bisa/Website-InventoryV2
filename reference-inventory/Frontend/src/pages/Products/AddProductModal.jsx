import React, { useState, useMemo } from 'react';
import { X, Upload, AlertCircle, Lock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext.jsx';
import { api, getWorkspaceSettings } from '../../utils/api.js';
import './AddProductModal.css';

function processProductImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        const MAX_DIM = 400;
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result);
          return;
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        try {
          const webpDataUrl = canvas.toDataURL('image/webp', 0.85);
          if (webpDataUrl.startsWith('data:image/webp')) {
            resolve(webpDataUrl);
          } else {
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          }
        } catch (e) {
          resolve(reader.result);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function AddProductModal({ isOpen, onClose, products = [], onSuccess }) {
  const { t, user } = useApp();
  const role = user?.role?.toLowerCase();

  const { data: wsSettings } = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: getWorkspaceSettings,
    staleTime: 5 * 60 * 1000,
  });

  // Determine if current user can view/edit price fields
  const canViewPrice = useMemo(() => {
    if (role === 'owner' || role === 'super_admin') return true;
    if (user?.id && wsSettings?.staff_permissions?.[user.id]) {
      return wsSettings.staff_permissions[user.id]?.canViewPrice === true;
    }
    const raw = wsSettings?.modules_owner || wsSettings?.modules || {};
    return raw.products?.canViewPrice === true;
  }, [role, user?.id, wsSettings]);
  const [active, setActive] = useState(true);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: '',
    trackingMode: 'non_serial',
    priceMode: 'pcs',
    sellingPrice: '',
    dozenPrice: '',
    unitCost: '',
    minStock: '10',
    discountType: 'none',
    discountValue: '',
    description: '',
    imageUrl: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const availableCategories = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const categorySuggestions = useMemo(() => {
    if (!form.category.trim()) return [];
    return availableCategories.filter((c) =>
      c.toLowerCase().includes(form.category.toLowerCase())
    ).slice(0, 6);
  }, [form.category, availableCategories]);

  if (!isOpen) return null;

  const setValue = (key, val) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    setError(null);
  };

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const result = await processProductImage(file);
        setValue('imageUrl', result);
      } catch (err) {
        setError(err.message);
      } finally {
        event.target.value = '';
      }
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    const sku = form.sku.trim();

    if (!name) {
      setError(t('products.modal.nameRequired'));
      return;
    }
    if (!sku) {
      setError(t('products.modal.skuRequired'));
      return;
    }

    setSubmitting(true);

    try {
      const sellingPriceNum = form.priceMode === 'pcs' ? (Number(form.sellingPrice) || 0) : 0;
      const dozenPriceNum = form.priceMode === 'lusin' ? (Number(form.dozenPrice) || 0) : 0;

      const payload = {
        sku,
        name,
        category: form.category.trim() || null,
        stock: 0,
        unitCost: Number(form.unitCost) || 0,
        sellingPrice: form.priceMode === 'pcs' ? sellingPriceNum : dozenPriceNum,
        discountType: form.discountType,
        discountValue: form.discountType === 'none' ? 0 : (Number(form.discountValue) || 0),
        status: active ? 'active' : 'disabled',
        metadata: {
          description: form.description.trim(),
          imageUrl: form.imageUrl,
          hasDozenPrice: form.priceMode === 'lusin',
          dozenPrice: dozenPriceNum,
          stockNonSerial: 0,
          minStock: Number(form.minStock) || 0,
        },
      };

      const res = await api.post('/api/workspace/products', payload);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.message || t('products.modal.error'));
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || t('products.modal.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="reports-modal-overlay" onClick={() => { if (!submitting) onClose(); }}>
      <section
        className="add-product-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-product-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="add-product-modal__header">
          <div className="add-product-modal__title-area">
            <h2 id="add-product-modal-title" className="add-product-modal__title">
              {t('products.modal.createTitle')}
            </h2>
            <p className="add-product-modal__subtitle">{t('products.modal.createDesc')}</p>
          </div>
          <div className="add-product-modal__controls">
            {/* Draft / Active Toggle Pills */}
            <div className="add-product-modal__toggle-pills">
              <button
                type="button"
                className={`add-product-modal__toggle-btn add-product-modal__toggle-btn--draft ${!active ? 'active' : ''}`}
                onClick={() => { if (!submitting) setActive(false); }}
              >
                {t('products.modal.statusDraft')}
              </button>
              <button
                type="button"
                className={`add-product-modal__toggle-btn add-product-modal__toggle-btn--active ${active ? 'active' : ''}`}
                onClick={() => { if (!submitting) setActive(true); }}
              >
                {t('products.modal.statusActive')}
              </button>
            </div>
            {/* Close Button */}
            <button
              type="button"
              className="add-product-modal__close-btn"
              onClick={onClose}
              disabled={submitting}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="add-product-modal__body">
          <form id="product-form" onSubmit={handleCreateProduct} className="gi-form-vertical">
            {/* Error Banner */}
            {error && (
              <div className="add-product-modal__error-banner" role="alert">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* Section 1: Product Identity */}
            <section className="add-product-modal__section">
              <div className="add-product-modal__section-header">
                <h3 className="add-product-modal__section-title">{t('products.modal.identityTitle')}</h3>
                <p className="add-product-modal__section-desc">{t('products.modal.identityDesc')}</p>
              </div>

              <div className="add-product-modal__identity-grid">
                {/* Product Image */}
                <div className="add-product-modal__image-field">
                  <span className="add-product-modal__image-label">{t('products.modal.imageTitle')}</span>
                  <div className="add-product-modal__image-box">
                    {form.imageUrl ? (
                      <>
                        <img src={form.imageUrl} alt="Product preview" className="add-product-modal__preview-img" />
                        <button
                          type="button"
                          className="add-product-modal__remove-overlay"
                          onClick={() => { if (!submitting) setValue('imageUrl', ''); }}
                          disabled={submitting}
                        >
                          {t('products.modal.removePhoto')}
                        </button>
                      </>
                    ) : (
                      <label className="add-product-modal__upload-label">
                        <Upload size={28} className="add-product-modal__upload-icon" />
                        <span className="add-product-modal__upload-text">{t('products.modal.uploadPhoto')}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={submitting}
                          onChange={handleImageChange}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Main Fields */}
                <div className="add-product-modal__fields-main">
                  {/* Product Name */}
                  <div className="add-product-modal__field add-product-modal__field--span-2">
                    <label className="add-product-modal__field-label">
                      {t('products.modal.nameLabel')} <span className="add-product-modal__required">*</span>
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder={t('products.modal.namePlaceholder')}
                      value={form.name}
                      onChange={(e) => setValue('name', e.target.value)}
                      disabled={submitting}
                      autoComplete="off"
                    />
                  </div>

                  {/* SKU */}
                  <div className="add-product-modal__field">
                    <label className="add-product-modal__field-label">
                      {t('products.modal.skuLabel')} <span className="add-product-modal__required">*</span>
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder={t('products.modal.skuPlaceholder')}
                      value={form.sku}
                      onChange={(e) => setValue('sku', e.target.value)}
                      disabled={submitting}
                      autoComplete="off"
                    />
                  </div>

                  {/* Category Autocomplete */}
                  <div className="add-product-modal__field">
                    <label className="add-product-modal__field-label">{t('products.modal.categoryLabel')}</label>
                    <div className="add-product-modal__category-wrap">
                      <input
                        type="text"
                        className="input"
                        placeholder={t('products.modal.categoryPlaceholder')}
                        value={form.category}
                        onFocus={() => setCategoryOpen(true)}
                        onBlur={() => setTimeout(() => setCategoryOpen(false), 200)}
                        onChange={(e) => setValue('category', e.target.value)}
                        disabled={submitting}
                        autoComplete="off"
                      />
                      {categoryOpen && categorySuggestions.length > 0 && (
                        <ul className="add-product-modal__category-suggestions">
                          {categorySuggestions.map((cat) => (
                            <li
                              key={cat}
                              className="add-product-modal__category-suggestion-item"
                              onMouseDown={() => setValue('category', cat)}
                            >
                              {cat}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <p className="add-product-modal__field-helper">{t('products.modal.categoryDesc')}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Price, Stock & Discount */}
            <div className="add-product-modal__price-discount-grid">
              {!canViewPrice ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: 'var(--space-5)',
                  background: 'var(--color-surface-alt)',
                  border: '1px dashed var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  gridColumn: '1 / -1',
                }}>
                  <Lock size={20} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                  <div>
                    <p style={{ margin: 0, fontWeight: '600', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Harga &amp; Diskon</p>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>Informasi harga disembunyikan. Hubungi owner untuk mengaktifkan akses.</p>
                  </div>
                </div>
              ) : (<>
              {/* Card A: Price & Stock */}
              <section className="add-product-modal__section">
                <div className="add-product-modal__section-header">
                  <h3 className="add-product-modal__section-title">{t('products.modal.priceStockTitle')}</h3>
                  <p className="add-product-modal__section-desc">{t('products.modal.priceStockDesc')}</p>
                </div>

                <div className="add-product-modal__btn-tabs">
                  <button
                    type="button"
                    className={`add-product-modal__btn-tab ${form.priceMode === 'pcs' ? 'active' : ''}`}
                    onClick={() => { if (!submitting) setValue('priceMode', 'pcs'); }}
                  >
                    {t('products.modal.pricePerPcs')}
                  </button>
                  <button
                    type="button"
                    className={`add-product-modal__btn-tab ${form.priceMode === 'lusin' ? 'active' : ''}`}
                    onClick={() => { if (!submitting) setValue('priceMode', 'lusin'); }}
                  >
                    {t('products.modal.pricePerDozen')}
                  </button>
                </div>

                {form.priceMode === 'pcs' ? (
                  <div className="add-product-modal__field">
                    <label className="add-product-modal__field-label">{t('products.modal.priceLabel')}</label>
                    <div className="add-product-modal__currency-input">
                      <span className="add-product-modal__currency-prefix">Rp</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className="add-product-modal__currency-field"
                        placeholder="0"
                        value={form.sellingPrice}
                        onChange={(e) => setValue('sellingPrice', e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="add-product-modal__field">
                    <label className="add-product-modal__field-label">{t('products.modal.pricePerDozen')}</label>
                    <div className="add-product-modal__currency-input">
                      <span className="add-product-modal__currency-prefix">Rp</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className="add-product-modal__currency-field"
                        placeholder="0"
                        value={form.dozenPrice}
                        onChange={(e) => setValue('dozenPrice', e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                  </div>
                )}

                <div className="add-product-modal__field">
                  <label className="add-product-modal__field-label">{t('products.modal.minStockLabel')}</label>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    className="input"
                    placeholder="0"
                    value={form.minStock}
                    onChange={(e) => setValue('minStock', e.target.value)}
                    disabled={submitting}
                  />
                  <p className="add-product-modal__field-helper">{t('products.modal.minStockDesc')}</p>
                </div>
              </section>

              {/* Card B: Discount details */}
              <section className="add-product-modal__section">
                <div className="add-product-modal__section-header">
                  <h3 className="add-product-modal__section-title">{t('products.modal.discountTitle')}</h3>
                  <p className="add-product-modal__section-desc">{t('products.modal.discountDesc')}</p>
                </div>

                <div className="add-product-modal__discount-tabs">
                  <div
                    role="button"
                    tabIndex={0}
                    className={`add-product-modal__discount-tab ${form.discountType === 'none' ? 'active' : ''}`}
                    onClick={() => { if (!submitting) setValue('discountType', 'none'); }}
                    onKeyDown={(e) => { if (!submitting && (e.key === 'Enter' || e.key === ' ')) setValue('discountType', 'none'); }}
                  >
                    <span className="add-product-modal__disc-tab-title">{t('products.modal.discNone')}</span>
                    <span className="add-product-modal__disc-tab-desc">{t('products.modal.discNoneDesc')}</span>
                  </div>

                  <div
                    role="button"
                    tabIndex={0}
                    className={`add-product-modal__discount-tab ${form.discountType === 'percentage' ? 'active' : ''}`}
                    onClick={() => { if (!submitting) setValue('discountType', 'percentage'); }}
                    onKeyDown={(e) => { if (!submitting && (e.key === 'Enter' || e.key === ' ')) setValue('discountType', 'percentage'); }}
                  >
                    <span className="add-product-modal__disc-tab-title">{t('products.modal.discPercent')}</span>
                    <span className="add-product-modal__disc-tab-desc">{t('products.modal.discPercentDesc')}</span>
                  </div>

                  <div
                    role="button"
                    tabIndex={0}
                    className={`add-product-modal__discount-tab ${form.discountType === 'fixed' ? 'active' : ''}`}
                    onClick={() => { if (!submitting) setValue('discountType', 'fixed'); }}
                    onKeyDown={(e) => { if (!submitting && (e.key === 'Enter' || e.key === ' ')) setValue('discountType', 'fixed'); }}
                  >
                    <span className="add-product-modal__disc-tab-title">{t('products.modal.discFixed')}</span>
                    <span className="add-product-modal__disc-tab-desc">{t('products.modal.discFixedDesc')}</span>
                  </div>
                </div>

                <div className="add-product-modal__discount-value-card">
                  {form.discountType === 'none' && (
                    <div>
                      <p className="add-product-modal__disc-val-title">{t('products.modal.discNoneDesc')}</p>
                      <p className="add-product-modal__disc-val-desc">{t('products.modal.discNoneInfo')}</p>
                    </div>
                  )}

                  {form.discountType === 'percentage' && (
                    <div className="add-product-modal__field">
                      <label className="add-product-modal__field-label">{t('products.modal.discPercentLabel')}</label>
                      <div className="add-product-modal__currency-input">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          inputMode="numeric"
                          className="add-product-modal__currency-field"
                          placeholder={t('products.modal.discValuePlaceholder')}
                          value={form.discountValue}
                          onChange={(e) => setValue('discountValue', e.target.value)}
                          disabled={submitting}
                        />
                        <span className="add-product-modal__currency-suffix">%</span>
                      </div>
                    </div>
                  )}

                  {form.discountType === 'fixed' && (
                    <div className="add-product-modal__field">
                      <label className="add-product-modal__field-label">{t('products.modal.discFixedLabel')}</label>
                      <div className="add-product-modal__currency-input">
                        <span className="add-product-modal__currency-prefix">Rp</span>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          className="add-product-modal__currency-field"
                          placeholder="0"
                          value={form.discountValue}
                          onChange={(e) => setValue('discountValue', e.target.value)}
                          disabled={submitting}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </>)}
            </div>

            {/* Section 3: Notes & Description */}
            <section className="add-product-modal__section">
              <div className="add-product-modal__field">
                <label className="add-product-modal__field-label">{t('products.modal.descLabel')}</label>
                <textarea
                  className="input"
                  style={{ minHeight: 96, resize: 'vertical' }}
                  placeholder={t('products.modal.descPlaceholder')}
                  value={form.description}
                  onChange={(e) => setValue('description', e.target.value)}
                  disabled={submitting}
                />
              </div>
            </section>
          </form>
        </div>

        {/* Footer Area */}
        <div className="add-product-modal__footer">
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={onClose}
            disabled={submitting}
          >
            {t('products.modal.cancel')}
          </button>
          <button
            type="submit"
            form="product-form"
            className="btn btn-primary btn-md"
            disabled={submitting}
          >
            {submitting ? t('products.modal.submitting') : t('products.modal.submit')}
          </button>
        </div>
      </section>
    </div>
  );
}