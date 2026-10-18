import React, { useRef, useMemo, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, PenLine, Printer, FileText, AlertCircle, ZoomIn, ZoomOut, Maximize2, User, Tag, CalendarDays, Wallet, Package, Trash2, Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api, getWorkspaceSettings, isWorkspaceModuleEnabled } from '../../utils/api.js';
import { generateDocumentHtml, PAPER_SIZES } from '../../utils/documentTemplate.js';
import DocumentEditModal from './DocumentEditModal.jsx';
import './DraftPage.css';

// Assumed rendered width of the document template (≈ A4 at 96dpi).
// Adjust this if documentTemplate.js uses a different fixed width.
const DOC_WIDTH = 794;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;

function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function cleanContactName(name) {
  if (!name) return '';
  if (name.endsWith(' (-)')) {
    return name.slice(0, -4).trim();
  }
  if (name.includes('(–)')) {
    return name.replace(/\s*\(–\)$/, '').trim();
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

function StatusBadge({ status, t }) {
  const statusMap = {
    draft: { label: t('documents.status.draft'), cls: 'draft-status--draft' },
    processing: { label: t('documents.status.processing'), cls: 'draft-status--processing' },
    completed: { label: t('documents.status.completed'), cls: 'draft-status--completed' },
    cancelled: { label: t('documents.status.cancelled'), cls: 'draft-status--cancelled' },
  };
  const s = statusMap[status] ?? statusMap.draft;
  return <span className={`draft-status-badge ${s.cls}`}>{s.label}</span>;
}

export default function DraftPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, user, lang } = useApp();
  const iframeRef = useRef(null);
  const wrapperRef = useRef(null);
  const [printError, setPrintError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaperPicker, setShowPaperPicker] = useState(false);
  const [selectedPaperSize, setSelectedPaperSize] = useState(PAPER_SIZES[0]);
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const originalTitleRef = useRef(document.title);

  // --- Zoom / fit-to-width state for the document preview ---
  const [docHeight, setDocHeight] = useState(1100); // fallback while content loads
  const [containerWidth, setContainerWidth] = useState(DOC_WIDTH);
  const [zoomMode, setZoomMode] = useState('fit'); // 'fit' | 'custom'
  const [customZoom, setCustomZoom] = useState(1);

  const { data: doc, isLoading, isError, refetch } = useQuery({
    queryKey: ['document', id],
    queryFn: async () => {
      const res = await api.get(`/api/workspace/documents/${id}`);
      if (!res.ok) throw new Error('Failed to load document');
      const json = await res.json();
      return json.data;
    },
    staleTime: 30000,
  });

  const { data: settings } = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: getWorkspaceSettings,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (doc) {
      if (doc.document_type === 'sample') {
        const sampleSize = PAPER_SIZES.find((p) => p.id === '21x12') || PAPER_SIZES[2] || PAPER_SIZES[0];
        setSelectedPaperSize(sampleSize);
      } else {
        setSelectedPaperSize(PAPER_SIZES[0]);
      }
    }
  }, [doc]);

  const printTitle = useMemo(() => {
    if (!doc || !settings) return '';
    const preferDefined = (...args) => args.find(v => v !== undefined && v !== null && String(v).trim() !== '');
    const companyName = preferDefined(
      settings?.company?.companyName,
      settings?.company?.name,
      settings?.companyName,
      'Hoga Baby'
    );
    const docNumber = doc.document_number || doc.number || '';
    return `${companyName} - ${docNumber}`;
  }, [doc, settings]);

  const contactsEnabled = user?.role?.toLowerCase() === 'super_admin' ||
    (settings ? isWorkspaceModuleEnabled(settings, 'contacts', user) : false);

  const documentPermissions = useMemo(() => {
    if (!settings || !user) return { canEdit: true, printLimit: 'all' };
    const userRole = user.role?.toLowerCase();
    if (userRole === 'super_admin' || userRole === 'owner') {
      return { canEdit: true, printLimit: 'all' };
    }

    // Check individual staff permissions
    const perms = settings.staff_permissions?.[user.id] || settings.admin_permissions?.[user.id];
    if (userRole === 'staff' && perms) {
      return {
        canEdit: perms.canEditDocs !== false,
        printLimit: perms.printPeriodLimit || 'all',
      };
    }

    // Check default staff permissions
    const raw = settings.modules_owner || settings.modules || {};
    const docsConfig = raw.documents;
    return {
      canEdit: docsConfig?.canEditDocs !== false,
      printLimit: docsConfig?.printPeriodLimit || 'all',
    };
  }, [settings, user]);

  const isPrintAllowed = useMemo(() => {
    if (!doc || documentPermissions.printLimit === 'all') return true;

    // Parse the date (try issue_date first, fallback to created_at)
    const docDateStr = doc.issue_date || doc.created_at;
    if (!docDateStr) return true;

    const docDate = new Date(docDateStr);
    const today = new Date();

    // Reset hours to compare just calendar dates
    const dDate = new Date(docDate.getFullYear(), docDate.getMonth(), docDate.getDate());
    const dToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (documentPermissions.printLimit === 'today') {
      return dDate.getTime() === dToday.getTime();
    }

    if (documentPermissions.printLimit === 'week') {
      const diffTime = dToday.getTime() - dDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    }

    return true;
  }, [doc, documentPermissions]);

  const { data: rawContacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/contacts?limit=500');
      if (res.status === 403) return [];
      if (!res.ok) throw new Error('Failed to load contacts');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: contactsEnabled,
    staleTime: 60000,
  });

  const contact = useMemo(() => {
    if (!doc) return null;
    if (rawContacts.length) {
      const matchVendor = (doc.contact_name || '').match(/^(.*?)\s*\((.*?)\)$/);
      const storeName = matchVendor ? matchVendor[1].trim() : (doc.contact_name || '').trim();

      const found = rawContacts.find((c) =>
        (doc.contact_id && String(c.id) === String(doc.contact_id)) ||
        (storeName && (c.name ?? '').toLowerCase() === storeName.toLowerCase()) ||
        (doc.contact_name && (c.name ?? '').toLowerCase() === doc.contact_name.toLowerCase()) ||
        (doc.contact_name && (c.metadata?.storeName ?? '').toLowerCase() === doc.contact_name.toLowerCase())
      );
      if (found) return found;
    }
    return {
      name: doc.contact_name,
      address: doc.address || doc.metadata?.address || doc.metadata?.customer_address || '',
      city: doc.city || doc.metadata?.city || '',
      province: doc.province || doc.metadata?.province || '',
      phone: doc.phone || doc.metadata?.phone || doc.metadata?.customer_phone || '',
    };
  }, [doc, rawContacts]);

  const previewHtml = useMemo(() => {
    if (!doc) return '';
    return generateDocumentHtml(doc, settings, contact, selectedPaperSize);
  }, [doc, settings, contact, selectedPaperSize]);

  // Track the available width of the preview area so the document can
  // automatically scale down to fit on narrow / mobile screens.
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
    return Math.min(1, containerWidth / DOC_WIDTH);
  }, [containerWidth]);

  const scale = zoomMode === 'fit' ? fitScale : customZoom;

  const handleIframeLoad = useCallback(() => {
    try {
      const win = iframeRef.current?.contentWindow;
      const height = win?.document?.documentElement?.scrollHeight;
      if (height) setDocHeight(height);
    } catch {
      // Cross-origin or not yet ready — keep the fallback height.
    }
  }, []);

  const zoomIn = useCallback(() => {
    setZoomMode('custom');
    setCustomZoom((z) => Math.min(MAX_ZOOM, Math.round((z + 0.1) * 100) / 100));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomMode('custom');
    setCustomZoom((z) => Math.max(MIN_ZOOM, Math.round((z - 0.1) * 100) / 100));
  }, []);

  const resetZoom = useCallback(() => {
    setZoomMode('fit');
  }, []);

  // Re-fit whenever a different document is opened.
  useEffect(() => {
    setZoomMode('fit');
    setDocHeight(1100);
  }, [id]);

  const doPrint = useCallback((html) => {
    try {
      const frameWindow = iframeRef.current?.contentWindow;

      originalTitleRef.current = document.title;
      if (printTitle) {
        document.title = printTitle;
      }

      if (frameWindow) {
        const iframeHtml = html;
        frameWindow.document.open();
        frameWindow.document.write(iframeHtml);
        frameWindow.document.close();
        if (printTitle) {
          frameWindow.document.title = printTitle;
        }
        frameWindow.focus();
        setTimeout(() => {
          try {
            frameWindow.print();
            setShowPrintPrompt(true);
          } catch (e) {
            console.error('frameWindow.print error:', e);
            // Fallback to PDF if frame print fails
            if (doc?.id) {
              api.get(`/api/workspace/documents/${doc.id}/pdf`, { responseType: 'blob' })
                .then(async (res) => {
                  if (res.ok) {
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${doc.document_number || 'document'}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.URL.revokeObjectURL(url);
                    setShowPrintPrompt(true);
                  }
                })
                .catch(() => {});
            }
          }
        }, 150);
        return;
      }

      const printWindow = window.open('', '_blank', 'noopener,noreferrer');
      if (!printWindow) {
        // Fallback to PDF download if popup blocked
        if (doc?.id) {
          api.get(`/api/workspace/documents/${doc.id}/pdf`, { responseType: 'blob' })
            .then(async (res) => {
              if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${doc.document_number || 'document'}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                setShowPrintPrompt(true);
                return;
              }
              throw new Error('PDF failed');
            })
            .catch(() => {
              setPrintError(t('documents.draft.allowPopups') || 'Allow popups to print');
              document.title = originalTitleRef.current;
            });
          return;
        }
        setPrintError(t('documents.draft.allowPopups') || 'Allow popups to print');
        document.title = originalTitleRef.current;
        return;
      }

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      if (printTitle) {
        printWindow.document.title = printTitle;
      }
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        setShowPrintPrompt(true);
      }, 250);
    } catch {
      setPrintError('Gagal mencetak. Coba lagi.');
      document.title = originalTitleRef.current;
    }
  }, [t, printTitle, doc?.id, doc?.document_number]);

  const handlePrint = useCallback(() => {
    setPrintError(null);
    if (!isPrintAllowed) {
      const limitText = documentPermissions.printLimit === 'today' ? 'hari ini saja' : '7 hari terakhir saja';
      setPrintError(`Maaf, Anda hanya diperbolehkan mencetak dokumen untuk ${limitText}.`);
      return;
    }

    const isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      if (doc?.id) {
        api.get(`/api/workspace/documents/${doc.id}/pdf`, { responseType: 'blob' })
          .then(async (res) => {
            if (res.ok) {
              const blob = await res.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${doc.document_number || 'document'}.pdf`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              window.URL.revokeObjectURL(url);
              setShowPrintPrompt(true);
              return;
            }
            throw new Error('PDF failed');
          })
          .catch(() => {
            setPrintError('Gagal mengunduh PDF. Coba lagi.');
          });
        return;
      }
    }

    setShowPaperPicker(true);
  }, [isPrintAllowed, documentPermissions, doc?.id, doc?.document_number]);

  const handleConfirmPrint = async (success) => {
    setShowPrintPrompt(false);
    document.title = originalTitleRef.current;
    if (!success || !doc) return;

    try {
      const terms = doc.payment_terms || 'unpaid:0';
      const [payStatus, printCountStr] = terms.split(':');
      const currentCount = parseInt(printCountStr, 10) || 0;
      const nextCount = currentCount + 1;
      const nextTerms = `${payStatus || 'unpaid'}:${nextCount}`;

      const res = await api.patch(`/api/workspace/documents/${doc.id}`, {
        documentType: doc.document_type || 'invoice',
        documentNumber: doc.document_number,
        contactId: doc.contact_id,
        contactName: doc.contact_name,
        status: doc.status,
        issueDate: doc.issue_date,
        notes: doc.notes,
        subtotal: doc.subtotal || 0,
        discount: doc.discount || 0,
        tax: doc.tax || 0,
        total: doc.total || 0,
        paymentTerms: nextTerms,
        metadata: doc.metadata || {},
      });

      if (!res.ok) throw new Error('Failed to update print count');
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['document', id] });
    } catch (err) {
      console.error('Failed to update print count:', err);
    }
  };

  const items = doc?.items ?? [];
  const isInvoice = doc?.document_type === 'invoice';

  const deleteKeyword = t('documents.delete.keyword');
  const canDelete = deleteInput.trim() === deleteKeyword;

  const handleDelete = useCallback(async () => {
    if (!canDelete || !doc) return;
    setDeleting(true);
    try {
      const res = await api.delete(`/api/workspace/documents/${doc.id}`);
      if (!res.ok) throw new Error(t('documents.delete.failed'));
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.removeQueries({ queryKey: ['document', id] });
      navigate('/documents');
    } catch (err) {
      console.error('Failed to delete document:', err);
      setDeleting(false);
    }
  }, [canDelete, doc, navigate, queryClient, t]);

  const terms = doc?.payment_terms || 'unpaid:0';
  const [payStatus, printCountStr] = terms.split(':');
  const isPaid = payStatus === 'paid';
  const printCount = parseInt(printCountStr, 10) || 0;

  const isOverdue = useMemo(() => {
    if (isPaid || !doc?.due_date) return false;
    const due = new Date(doc.due_date);
    due.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return due <= tomorrow;
  }, [isPaid, doc?.due_date]);

  const overdueDays = useMemo(() => {
    if (!doc?.due_date) return 0;
    const due = new Date(doc.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((today - due) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [doc?.due_date]);

  function formatDateTime(dateStr) {
    if (!dateStr) return '\u2014';
    try {
      return new Date(dateStr).toLocaleString('id-ID', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  if (isLoading) {
    return (
      <div className="draft-page">
        <div className="draft-page__loading">
          <FileText size={36} className="draft-page__loading-icon" />
          <p>{t('page.loading')}</p>
        </div>
      </div>
    );
  }

  if (isError || !doc) {
    return (
      <div className="draft-page">
        <div className="draft-page__error">
          <AlertCircle size={36} />
          <h2>{t('documents.draft.notFound')}</h2>
          <button type="button" className="btn btn-secondary btn-md interactive" onClick={() => navigate('/documents')}>
            {t('documents.draft.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="draft-page">
      <div className="draft-page__header">
        <button type="button" className="draft-page__back-btn" onClick={() => navigate('/documents')}>
          <ChevronLeft size={16} />
          <span>{t('documents.draft.back')}</span>
        </button>
        <div className="draft-page__header-left">
          <div className="draft-page__ref-row">
            <h1 className="draft-page__ref" title={doc.document_number}>{doc.document_number}</h1>
            <StatusBadge status={doc.status} t={t} />
          </div>
          <p className="draft-page__subtitle">{t('documents.draft.subtitle')}</p>
        </div>
        <div className="draft-page__header-actions">
          {documentPermissions.canEdit && (
            <button type="button" className="btn btn-secondary btn-md interactive" onClick={() => setShowEditModal(true)}>
              <PenLine size={15} />
              <span>{t('documents.draft.editData')}</span>
            </button>
          )}
          <button type="button" className="btn btn-primary btn-md interactive" onClick={handlePrint}>
            <Printer size={15} />
            <span>{t('documents.draft.printExport')}</span>
          </button>
          {documentPermissions.canEdit && (
            <button type="button" className="btn btn-danger btn-md interactive" onClick={() => { setDeleteInput(''); setShowDeleteModal(true); }}>
              <Trash2 size={15} />
              <span>{t('documents.draft.deleteBtn')}</span>
            </button>
          )}
        </div>
      </div>

      {printError && (
        <div className="draft-page__print-error" role="alert">
          <AlertCircle size={14} />
          <span>{printError}</span>
        </div>
      )}

      <div className="draft-page__grid">
        <div className="draft-page__preview">
          <div className="draft-page__preview-header">
            <h3 className="draft-page__preview-title">{t('documents.draft.previewLabel')}</h3>
            <div className="draft-page__zoom-controls" role="group" aria-label="Zoom">
              <button
                type="button"
                className="draft-page__zoom-btn"
                onClick={zoomOut}
                disabled={scale <= MIN_ZOOM}
                aria-label="Zoom out"
              >
                <ZoomOut size={14} />
              </button>
              <button
                type="button"
                className="draft-page__zoom-value"
                onClick={resetZoom}
                aria-label="Reset zoom to fit"
                title={t('documents.draft.fitToWidth') || 'Fit to width'}
              >
                {zoomMode === 'fit' ? <Maximize2 size={12} /> : null}
                {Math.round(scale * 100)}%
              </button>
              <button
                type="button"
                className="draft-page__zoom-btn"
                onClick={zoomIn}
                disabled={scale >= MAX_ZOOM}
                aria-label="Zoom in"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          </div>
          <div className="draft-page__preview-frame" ref={wrapperRef}>
            <div
              className="draft-page__scaler"
              style={{ width: DOC_WIDTH * scale, height: docHeight * scale }}
            >
              <div
                className="draft-page__scaler-inner"
                style={{ width: DOC_WIDTH, height: docHeight, transform: `scale(${scale})` }}
              >
                <iframe
                  ref={iframeRef}
                  title={t('documents.draft.previewLabel')}
                  srcDoc={previewHtml}
                  className="draft-page__iframe"
                  style={{ width: DOC_WIDTH, height: docHeight }}
                  onLoad={handleIframeLoad}
                  sandbox="allow-scripts allow-same-origin allow-modals"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="draft-page__sidebar">
          <div className="draft-page__sidebar-card">
            <h4 className="draft-page__sidebar-card-title">{t('documents.draft.sidebar.theme')}</h4>
            <p className="draft-page__sidebar-card-desc">{t('documents.draft.sidebar.themeDesc')}</p>
            <div className="draft-page__theme-selector">
              <label className="draft-page__theme-label" htmlFor="draft-template-select">
                {t('documents.draft.sidebar.selectedTemplate')}
              </label>
              <select id="draft-template-select" className="input" value="default" disabled>
                <option value="default">{t('documents.draft.defaultTemplate')}</option>
              </select>
            </div>
          </div>

          <div className="draft-page__sidebar-card">
            <h4 className="draft-page__sidebar-card-title">{t('documents.draft.sidebar.metadataTitle')}</h4>
            <div className="draft-page__metadata">
              <div className="draft-page__metadata-row">
                <span className="draft-page__metadata-icon"><User size={14} /></span>
                <span className="draft-page__metadata-label">{t('documents.draft.sidebar.customer')}</span>
                <span className="draft-page__metadata-value" title={cleanContactName(doc.contact_name) || ''}>{cleanContactName(doc.contact_name) || '\u2014'}</span>
              </div>
              <div className="draft-page__metadata-row">
                <span className="draft-page__metadata-icon"><Tag size={14} /></span>
                <span className="draft-page__metadata-label">{t('documents.draft.sidebar.type')}</span>
                <span className="draft-page__metadata-value">
                  {doc.document_type === 'invoice' ? t('documents.type.invoice') : doc.document_type}
                </span>
              </div>
              <div className="draft-page__metadata-row">
                <span className="draft-page__metadata-icon"><CalendarDays size={14} /></span>
                <span className="draft-page__metadata-label">{t('documents.draft.sidebar.date')}</span>
                <span className="draft-page__metadata-value">{formatDate(doc.issue_date)}</span>
              </div>
              <div className="draft-page__metadata-row">
                <span className="draft-page__metadata-icon"><Package size={14} /></span>
                <span className="draft-page__metadata-label">{t('documents.draft.sidebar.itemsCount')}</span>
                <span className="draft-page__metadata-value">{items.length} item{items.length === 1 ? '' : 's'}</span>
              </div>
              {isInvoice && (
                <div className="draft-page__metadata-row">
                  <span className="draft-page__metadata-icon"><Wallet size={14} /></span>
                  <span className="draft-page__metadata-label">{t('documents.detail.paymentStatus')}</span>
                  <span className="draft-page__metadata-value">
                    <span className={`doc-chip ${isPaid ? 'doc-chip--paid' : isOverdue ? 'doc-chip--overdue' : 'doc-chip--unpaid'}`}>
                      {isPaid ? t('documents.paymentStatus.paid') : t('documents.paymentStatus.unpaid')}
                      {overdueDays > 0 && ` \u00b7 ${t('documents.detail.overdue', { days: overdueDays })}`}
                    </span>
                  </span>
                </div>
              )}
              {isInvoice && doc?.due_date && (
                <div className="draft-page__metadata-row">
                  <span className="draft-page__metadata-icon"><Clock size={14} /></span>
                  <span className="draft-page__metadata-label">{t('documents.detail.dueDate')}</span>
                  <span className="draft-page__metadata-value">{formatDateTime(doc.due_date)}</span>
                </div>
              )}
              {isInvoice && (
                <div className="draft-page__metadata-row">
                  <span className="draft-page__metadata-icon"><Printer size={14} /></span>
                  <span className="draft-page__metadata-label">{t('documents.detail.printCount')}</span>
                  <span className="draft-page__metadata-value">
                    {printCount > 0 ? `${printCount}x` : '\u2014'}
                  </span>
                </div>
              )}
              {isInvoice && (
                <div className="draft-page__metadata-row draft-page__metadata-row--total">
                  <span className="draft-page__metadata-icon"><Wallet size={14} /></span>
                  <span className="draft-page__metadata-label">{t('documents.draft.sidebar.totalAmount')}</span>
                  <span className="draft-page__metadata-value draft-page__metadata-value--mono">{formatCurrency(doc.total || 0)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showPaperPicker && (
        <div className="draft-page__prompt-overlay" role="dialog" aria-modal="true">
          <div className="draft-page__prompt-modal">
            <h2 className="draft-page__prompt-title">Pilih Ukuran Kertas</h2>
            <p className="draft-page__prompt-message">Pilih ukuran kertas untuk mencetak dokumen ini.</p>
            <div className="draft-page__paper-options">
              {PAPER_SIZES.map((ps) => (
                <button
                  key={ps.id}
                  type="button"
                  className={`draft-page__paper-option ${selectedPaperSize.id === ps.id ? 'draft-page__paper-option--active' : ''}`}
                  onClick={() => setSelectedPaperSize(ps)}
                >
                  <strong>{ps.label}</strong>
                  <span className="draft-page__paper-desc">{ps.desc}</span>
                </button>
              ))}
            </div>
            <div className="draft-page__prompt-actions">
              <button
                type="button"
                className="btn btn-secondary btn-md"
                onClick={() => { setShowPaperPicker(false); setSelectedPaperSize(PAPER_SIZES[0]); }}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-primary btn-md"
                onClick={() => {
                  setShowPaperPicker(false);
                  const html = generateDocumentHtml(doc, settings, contact, selectedPaperSize);
                  doPrint(html);
                }}
              >
                Cetak ({selectedPaperSize.desc})
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrintPrompt && (
        <div className="draft-page__prompt-overlay" role="dialog" aria-modal="true">
          <div className="draft-page__prompt-modal">
            <h2 className="draft-page__prompt-title">{t('documents.printPrompt.title')}</h2>
            <p className="draft-page__prompt-message">{t('documents.printPrompt.message')}</p>
            <div className="draft-page__prompt-actions">
              <button
                type="button"
                className="btn btn-secondary btn-md"
                onClick={() => handleConfirmPrint(false)}
              >
                {t('documents.printPrompt.no')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-md"
                onClick={() => handleConfirmPrint(true)}
              >
                {t('documents.printPrompt.yes')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="draft-page__prompt-overlay" role="dialog" aria-modal="true">
          <div className="draft-page__prompt-modal draft-page__delete-modal">
            <h2 className="draft-page__prompt-title draft-page__delete-title">
              <Trash2 size={20} />
              {t('documents.delete.title')}
            </h2>
            <p className="draft-page__prompt-message">{t('documents.delete.message')}</p>
            <input
              type="text"
              className="input draft-page__delete-input"
              placeholder={t('documents.delete.placeholder')}
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              autoFocus
              disabled={deleting}
            />
            <div className="draft-page__prompt-actions">
              <button
                type="button"
                className="btn btn-secondary btn-md"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                {t('general.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-danger btn-md"
                onClick={handleDelete}
                disabled={!canDelete || deleting}
              >
                {deleting ? t('general.deleting') : t('documents.delete.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && doc && (
        <DocumentEditModal
          doc={doc}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
}
