import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, X, Plus, Info, ZoomOut, Maximize2, ZoomIn, RotateCcw, Save } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api, getWorkspaceSettings } from '../../utils/api.js';
import { generateDocumentHtml } from '../../utils/documentTemplate.js';
import './CompanySetting.css';

const SAMPLE_DOC = {
  document_type: 'invoice',
  document_number: 'INV/20260630/0001',
  issue_date: '2026-06-30',
  contact_name: 'PT Customer Contoh',
  phone: '0812-3456-7890',
  address: 'Jl. Merdeka No. 123, Jakarta',
  notes: 'Dokumen contoh untuk pratinjau.',
  subtotal: 1500000,
  discount: 50000,
  tax: 145000,
  total: 1595000,
  items: [
    { itemName: 'Produk Contoh A', quantity: 2, unitPrice: 500000 },
    { itemName: 'Produk Contoh B', quantity: 1, unitPrice: 500000 },
    { itemName: 'Produk Contoh C', quantity: 5, unitPrice: 100000 },
  ],
  metadata: {},
};

export default function CompanySetting() {
  const { t } = useApp();
  const queryClient = useQueryClient();
  const logoInputRef = useRef(null);
  const iframeRef = useRef(null);

  const { data: settings } = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: getWorkspaceSettings,
    staleTime: 5 * 60 * 1000,
  });

  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [bankTransfer, setBankTransfer] = useState('');
  const [website, setWebsite] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const companyData = useMemo(() => {
    if (!settings) return {};
    return settings.company || settings.app?.company || settings.app || settings;
  }, [settings]);

  const settingsKey = useMemo(() => {
    if (!settings) return 'app';
    if (settings.app?.company) return 'app';
    if (settings.company) return 'company';
    return 'app';
  }, [settings]);

  useEffect(() => {
    if (settings && companyData && Object.keys(companyData).length > 0) {
      setCompanyName(companyData.companyName || companyData.name || '');
      setCompanyEmail(companyData.companyEmail || companyData.email || '');
      setCompanyPhone(companyData.companyPhone || companyData.phone || '');
      setCompanyAddress(companyData.companyAddress || companyData.address || '');
      setCompanyCity(companyData.companyCity || companyData.city || '');
      setBankTransfer(companyData.bankTransfer || companyData.paymentTransfer || '');
      setWebsite(companyData.website || '');
      setCompanyLogo(companyData.companyLogo || companyData.logoUrl || settings?.documents?.brandLogos?.[0] || '');
      setIsInitialized(true);
    }
  }, [settings, companyData]);

  const handleReset = () => {
    if (companyData) {
      setCompanyName(companyData.companyName || companyData.name || '');
      setCompanyEmail(companyData.companyEmail || companyData.email || '');
      setCompanyPhone(companyData.companyPhone || companyData.phone || '');
      setCompanyAddress(companyData.companyAddress || companyData.address || '');
      setCompanyCity(companyData.companyCity || companyData.city || '');
      setBankTransfer(companyData.bankTransfer || companyData.paymentTransfer || '');
      setWebsite(companyData.website || '');
      setCompanyLogo(companyData.companyLogo || companyData.logoUrl || settings?.documents?.brandLogos?.[0] || '');
      setIsInitialized(true);
      setMessage(null);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      let payload;
      if (settingsKey === 'app') {
        payload = {
          ...(settings?.app || {}),
          company: {
            // New flat structure
            companyName,
            companyEmail,
            companyPhone,
            companyAddress,
            companyCity,
            bankTransfer,
            website,
            companyLogo,
            // Database nested structure
            name: companyName,
            email: companyEmail,
            phone: companyPhone,
            address: companyAddress,
            city: companyCity,
            paymentTransfer: bankTransfer,
            logoUrl: companyLogo,
          }
        };
      } else {
        payload = {
          companyName,
          companyEmail,
          companyPhone,
          companyAddress,
          companyCity,
          bankTransfer,
          website,
          companyLogo,
          // Support both
          name: companyName,
          email: companyEmail,
          phone: companyPhone,
          address: companyAddress,
          city: companyCity,
          paymentTransfer: bankTransfer,
          logoUrl: companyLogo,
        };
      }

      const res = await api.patch(`/api/workspace/settings/${settingsKey}`, { value: payload });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed');
      }

      setMessage({ type: 'success', text: t('settings.company.saveSuccess') });
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('settings.error.save') });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUploadClick = () => {
    logoInputRef.current?.click();
  };

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: t('settings.company.logo.sizeError') });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl === 'string') {
        setCompanyLogo(dataUrl);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const [zoomMode, setZoomMode] = useState('fit');
  const [customZoom, setCustomZoom] = useState(1);
  const [docHeight, setDocHeight] = useState(500);
  const [containerWidth, setContainerWidth] = useState(794);
  const wrapperRef = useRef(null);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return undefined;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitScale = useMemo(() => {
    if (!containerWidth) return 1;
    return Math.min(1, (containerWidth - 24) / 794);
  }, [containerWidth]);

  const scale = zoomMode === 'fit' ? fitScale : customZoom;

  const zoomIn = useCallback(() => {
    setZoomMode('custom');
    setCustomZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 100) / 100));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomMode('custom');
    setCustomZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 100) / 100));
  }, []);

  const resetZoom = useCallback(() => {
    setZoomMode('fit');
  }, []);

  const handleIframeLoad = useCallback(() => {
    try {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      const body = win.document?.body;
      const html = win.document?.documentElement;
      const h = Math.max(body?.scrollHeight || 0, html?.scrollHeight || 0, 200);
      if (h > 100) setDocHeight(h);
    } catch {
      // cross-origin fallback
    }
  }, []);

  // Build live preview settings
  const previewSettings = useMemo(() => {
    return {
      documents: settings?.documents || {},
      company: {
        companyName,
        email: companyEmail,
        phone: companyPhone,
        address: companyAddress,
        city: companyCity,
        paymentTransfer: bankTransfer,
        website,
        companyLogo,
      },
      companyName,
      companyEmail,
      companyPhone,
      companyAddress,
      companyCity,
      bankTransfer,
      website,
      companyLogo,
      custom_units: settings?.custom_units,
    };
  }, [settings, companyName, companyEmail, companyPhone, companyAddress, companyCity, bankTransfer, website, companyLogo]);

  const previewHtml = useMemo(() => {
    return generateDocumentHtml(SAMPLE_DOC, previewSettings, null);
  }, [previewSettings]);

  return (
    <form className="settings-form settings-company-form" onSubmit={handleSave}>
      <div className="company-header">
        <div className="company-header__avatar">
          <Building2 size={24} />
        </div>
        <div className="company-header__text">
          <h2 className="company-header__title">{t('settings.company.title')}</h2>
          <p className="company-header__subtitle">{t('settings.company.subtitle')}</p>
        </div>
      </div>

      <div className="settings-form__row">
        <div className="settings-form__group">
          <label className="settings-form__label">{t('settings.company.name')}</label>
          <input
            className="input"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            placeholder={t('settings.company.namePlaceholder')}
          />
        </div>
        <div className="settings-form__group">
          <label className="settings-form__label">{t('settings.company.email')}</label>
          <input
            className="input"
            type="email"
            value={companyEmail}
            onChange={(e) => setCompanyEmail(e.target.value)}
            required
            placeholder={t('settings.company.emailPlaceholder')}
          />
        </div>
      </div>

      <div className="settings-form__row">
        <div className="settings-form__group">
          <label className="settings-form__label">{t('settings.company.phone')}</label>
          <input
            className="input"
            value={companyPhone}
            onChange={(e) => setCompanyPhone(e.target.value)}
            placeholder={t('settings.company.phonePlaceholder')}
          />
        </div>
        <div className="settings-form__group">
          <label className="settings-form__label">{t('settings.company.website')}</label>
          <input
            className="input"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder={t('settings.company.websitePlaceholder')}
          />
        </div>
      </div>

      <div className="settings-form__group">
        <label className="settings-form__label">{t('settings.company.address')}</label>
        <textarea
          className="input"
          style={{ height: 80, paddingTop: 'var(--space-2)', resize: 'vertical' }}
          value={companyAddress}
          onChange={(e) => setCompanyAddress(e.target.value)}
          placeholder={t('settings.company.addressPlaceholder')}
        />
      </div>

      <details className="company-extra-details">
        <summary className="company-extra-summary">{t('settings.company.extraSettings')}</summary>
        <div className="company-extra-content">
          <div className="settings-form__row">
            <div className="settings-form__group">
              <label className="settings-form__label">{t('settings.company.city')}</label>
              <input
                className="input"
                value={companyCity}
                onChange={(e) => setCompanyCity(e.target.value)}
                placeholder={t('settings.company.cityPlaceholder')}
              />
            </div>
            <div className="settings-form__group">
              <label className="settings-form__label">{t('settings.company.bankTransfer')}</label>
              <input
                className="input"
                value={bankTransfer}
                onChange={(e) => setBankTransfer(e.target.value)}
                placeholder={t('settings.company.bankTransferPlaceholder')}
              />
            </div>
          </div>
        </div>
      </details>

      <div className="settings-form__divider" />

      <div className="company-logo-section">
        <h3 className="company-logo-section__title">{t('settings.company.logo.title')}</h3>
        <p className="company-logo-section__desc">{t('settings.company.logo.desc')}</p>

        <div className="company-logo-uploader">
          {companyLogo ? (
            <div className="company-logo-item">
              <img src={companyLogo} alt={t('settings.company.logo.alt')} className="company-logo-item__img" />
              <button
                type="button"
                className="company-logo-item__delete"
                onClick={() => setCompanyLogo('')}
                title={t('settings.company.logo.delete')}
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="company-logo-dropzone"
              onClick={handleLogoUploadClick}
            >
              <Plus size={20} className="company-logo-dropzone__icon" />
              <span className="company-logo-dropzone__label">{t('settings.company.logo.add')}</span>
              <span className="company-logo-dropzone__specs">{t('settings.company.logo.specs')}</span>
            </button>
          )}

          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleLogoChange}
          />
        </div>

        <div className="company-logo-hint">
          <Info size={14} className="company-logo-hint__icon" />
          <span className="company-logo-hint__text">{t('settings.company.logo.hint')}</span>
        </div>
      </div>

      <div className="settings-form__divider" />

      <div className="company-preview-section">
        <div className="settings-preview" style={{ marginTop: 'var(--space-3)' }}>
          <div className="draft-page__preview-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
            <h3 className="settings-form__subtitle" style={{ margin: 0 }}>{t('settings.documents.previewTitle')}</h3>
            <div className="draft-page__zoom-controls" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '2px 4px' }} role="group" aria-label="Zoom">
              <button
                type="button"
                className="draft-page__zoom-btn"
                onClick={zoomOut}
                disabled={scale <= 0.4}
                aria-label="Zoom out"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}
              >
                <ZoomOut size={14} />
              </button>
              <button
                type="button"
                className="draft-page__zoom-value"
                onClick={resetZoom}
                aria-label="Reset zoom to fit"
                title={t('settings.company.preview.fitToWidth')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '600', padding: '0 6px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-primary)' }}
              >
                {zoomMode === 'fit' ? <Maximize2 size={12} /> : null}
                <span>{Math.round(scale * 100)}%</span>
              </button>
              <button
                type="button"
                className="draft-page__zoom-btn"
                onClick={zoomIn}
                disabled={scale >= 1.5}
                aria-label="Zoom in"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}
              >
                <ZoomIn size={14} />
              </button>
            </div>
          </div>
          <div className="settings-preview__frame-window">
            <div className="settings-preview__window-header">
              <span className="dot dot--red"></span>
              <span className="dot dot--yellow"></span>
              <span className="dot dot--green"></span>
              <span className="window-title-address">https://www.docuflow.id/document-preview</span>
            </div>
            <div className="settings-preview__frame-wrap" ref={wrapperRef}>
              {isInitialized ? (
                <div
                  className="draft-page__scaler"
                  style={{ width: 794 * scale, height: docHeight * scale, flexShrink: 0, margin: '0 auto' }}
                >
                  <div
                    className="draft-page__scaler-inner"
                    style={{ width: 794, height: docHeight, transform: `scale(${scale})`, transformOrigin: 'top left' }}
                  >
                    <iframe
                      ref={iframeRef}
                      className="settings-preview__frame"
                      title="Document Preview"
                      sandbox="allow-scripts"
                      srcDoc={previewHtml}
                      onLoad={handleIframeLoad}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: '500' }}>
                  {t('settings.company.preview.loading')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className={`settings-message settings-message--${message.type}`} style={{
          marginTop: 'var(--space-4)',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-md)',
          background: message.type === 'success' ? 'var(--color-success-surface)' : 'var(--color-danger-surface)',
          color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
          border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(220,38,38,0.1)'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '13px'
        }}>
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'inherit',
            fontWeight: '600'
          }}>X</button>
        </div>
      )}

      <div className="company-footer">
        <button
          type="button"
          className="btn btn-secondary btn-reset"
          onClick={handleReset}
        >
          <RotateCcw size={14} />
          <span>{t('settings.company.reset')}</span>
        </button>

        <div className="company-footer__right">
          <button
            type="button"
            className="btn btn-secondary btn-cancel"
            onClick={handleReset}
          >
            {t('settings.company.cancel')}
          </button>

          <button
            className="btn btn-primary btn-save"
            type="submit"
            disabled={saving}
          >
            <Save size={16} />
            <span>{saving ? t('settings.saving') : t('settings.save')}</span>
          </button>
        </div>
      </div>
    </form>
  );
}
