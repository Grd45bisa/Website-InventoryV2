import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside.js';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './Topbar.css';

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/inventory/overview': 'Inventory Overview',
  '/inventory/products': 'Products',
  '/inventory/goods-in': 'Goods In',
  '/inventory/goods-out': 'Goods Out',
  '/inventory/reports': 'Reports',
  '/partners/customers': 'Customers',
  '/partners/suppliers': 'Suppliers',
  '/documents/create': 'New Document',
  '/settings': 'Settings',
};

export default function Topbar({ onToggleSidebar }) {
  const { t, user, lang, theme, updatePreference, logout, warehouses = [], activeWarehouse, switchWarehouse } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const userMenuRef = useRef(null);
  const notifRef = useRef(null);
  const overdueRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (mobileSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [mobileSearchOpen]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const query = searchValue.trim();
    if (query) {
      const path = location.pathname;
      let targetPath = '/inventory/products';
      if (path.includes('/documents')) {
        targetPath = '/documents';
      } else if (path.includes('/partners/customers')) {
        targetPath = '/partners/customers';
      } else if (path.includes('/partners/suppliers')) {
        targetPath = '/partners/suppliers';
      }
      navigate(`${targetPath}?q=${encodeURIComponent(query)}`);
    }
    setMobileSearchOpen(false);
  };

  useClickOutside(userMenuRef, () => setUserMenuOpen(false));

  useEffect(() => {
    if (!userMenuOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [userMenuOpen]);

  useClickOutside(notifRef, () => setNotifOpen(false));

  useEffect(() => {
    if (!notifOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [notifOpen]);

  useClickOutside(overdueRef, () => setOverdueOpen(false));

  useEffect(() => {
    if (!overdueOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setOverdueOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [overdueOpen]);

  // Generate stock alerts on mount (fire-and-forget)
  useEffect(() => {
    api.post('/api/workspace/notifications/generate-stock-alerts').catch(() => {});
  }, []);

  // Fetch notifications
  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/notifications');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      return json;
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const filteredNotifications = useMemo(() => {
    const list = notifData?.data || [];
    const isUserAdmin = user?.role?.toLowerCase() === 'staff';
    const isSalesPerson = user?.role?.toLowerCase() === 'sales_person';

    if (isSalesPerson) {
      return list.filter((notif) => {
        const type = (notif.type || '').toLowerCase();
        const refType = (notif.reference_type || '').toLowerCase();
        const title = (notif.title || '').toLowerCase();
        const msg = (notif.message || '').toLowerCase();

        return (
          type.startsWith('po_') ||
          refType === 'purchase_order' ||
          title.includes('purchase order') ||
          title.includes('po ') ||
          msg.includes('purchase order') ||
          msg.includes('po ')
        );
      });
    }

    if (!isUserAdmin) return list;

    return list.filter((notif) => {
      const msg = (notif.message || '').toLowerCase();
      const title = (notif.title || '').toLowerCase();
      if (title.includes('stok habis') || msg.includes('stok: 0') || msg.includes('sudah habis') || msg.includes('stock: 0')) {
        return false;
      }
      return true;
    });
  }, [notifData, user]);

  const notifications = filteredNotifications;
  const unreadCount = filteredNotifications.filter(n => !n.is_read).length;

  const { data: overdueDocs } = useQuery({
    queryKey: ['overdue-invoices'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/documents?type=invoice&status=completed&limit=500');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
    refetchInterval: 60000,
    enabled: user?.role?.toLowerCase() !== 'sales_person',
  });

  const { overdueList, upcomingList } = useMemo(() => {
    const docs = overdueDocs ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const in2Days = new Date(today);
    in2Days.setDate(in2Days.getDate() + 2);
    const in5Days = new Date(today);
    in5Days.setDate(in5Days.getDate() + 5);

    const unpaid = docs.filter((d) => {
      const terms = d.payment_terms || 'unpaid:0';
      const [payStatus] = terms.split(':');
      if (payStatus === 'paid') return false;
      return !!d.due_date;
    });

    const overdue = [];
    const upcoming = [];

    unpaid.forEach((d) => {
      const due = new Date(d.due_date);
      if (due < today) {
        const daysLate = Math.floor((today - due) / (1000 * 60 * 60 * 24));
        overdue.push({ ...d, daysLate });
      } else if (due <= in5Days) {
        const daysLeft = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
        upcoming.push({ ...d, daysLeft });
      }
    });

    overdue.sort((a, b) => b.daysLate - a.daysLate);
    upcoming.sort((a, b) => a.daysLeft - b.daysLeft);

    return { overdueList: overdue, upcomingList: upcoming };
  }, [overdueDocs]);

  const overdueCount = overdueList.length;
  const upcomingCount = upcomingList.length;
  const totalReminderCount = overdueCount + upcomingCount;

  const handleMarkRead = useCallback(async (notif) => {
    if (notif.is_read) return;
    await api.patch(`/api/workspace/notifications/${notif.id}/read`).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [queryClient]);

  const handleMarkAllRead = useCallback(async () => {
    await api.post('/api/workspace/notifications/mark-all-read').catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [queryClient]);

  const handleNotifClick = useCallback((notif) => {
    handleMarkRead(notif);
    if (notif.reference_type === 'product' && notif.reference_id) {
      const products = queryClient.getQueryData(['products']);
      if (products) {
        const product = products.find((p) => p.id === notif.reference_id);
        if (product && product.sku) {
          navigate(`/inventory/products/${encodeURIComponent(product.sku)}`);
          setNotifOpen(false);
          return;
        }
      }
      navigate(`/inventory/products`);
      setNotifOpen(false);
    } else if (notif.reference_type === 'purchase_order' && notif.reference_id) {
      navigate(`/purchase-orders/${notif.reference_id}`);
      setNotifOpen(false);
    }
  }, [handleMarkRead, navigate, queryClient]);

  const formatNotifTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return lang === 'id' ? 'Baru saja' : 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  };

  const pageTitle = PAGE_TITLES[location.pathname] || 'Page';
  const initials = user?.fullName
    ? user.fullName.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '?';

  return (
    <header className="topbar">
      <div className="topbar__left">
        <button className="topbar__hamburger" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className={`topbar__page-title ${mobileSearchOpen ? 'topbar__page-title--hidden' : ''}`}>
          <span className="topbar__page-label">{pageTitle}</span>
        </div>
      </div>

      <div className={`topbar__center ${mobileSearchOpen ? 'topbar__center--mobile-open' : ''}`}>
        <form className={`topbar__search ${searchFocused ? 'topbar__search--focused' : ''}`} onSubmit={handleSearchSubmit} role="search">
          <svg className="topbar__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            className="topbar__search-input"
            placeholder={t('nav.searchPlaceholder')}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </form>
      </div>

      <div className="topbar__right">
        <button
          className="topbar__icon-btn topbar__mobile-search-btn"
          onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
          aria-label={mobileSearchOpen ? 'Close search' : 'Open search'}
        >
          {mobileSearchOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          )}
        </button>

        {/* Notification Bell */}
        <div className="topbar__notif-wrapper" ref={notifRef}>
          <button
            className="topbar__icon-btn topbar__notif-btn"
            onClick={() => setNotifOpen(!notifOpen)}
            aria-expanded={notifOpen}
            aria-haspopup="true"
            aria-label={t('nav.notifications') || 'Notifications'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="topbar__notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          <div className={`topbar__dropdown topbar__notif-dropdown ${notifOpen ? 'topbar__dropdown--open' : ''}`}>
            <div className="topbar__notif-header">
              <span className="topbar__notif-header-title">{t('nav.notifications') || 'Notifikasi'}</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="topbar__notif-mark-all"
                  onClick={handleMarkAllRead}
                >
                  {t('nav.markAllRead') || 'Tandai dibaca'}
                </button>
              )}
            </div>
            <div className="topbar__notif-list">
              {notifications.length === 0 ? (
                <div className="topbar__notif-empty">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="32" height="32">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span>{t('nav.noNotifications') || 'Tidak ada notifikasi'}</span>
                </div>
              ) : (
                notifications.map((notif) => (
                  <button
                    key={notif.id}
                    type="button"
                    className={`topbar__notif-item ${notif.is_read ? 'topbar__notif-item--read' : ''} ${notif.type === 'out_of_stock' ? 'topbar__notif-item--danger' : 'topbar__notif-item--warning'}`}
                    onClick={() => handleNotifClick(notif)}
                  >
                    <div className="topbar__notif-item-icon">
                      {notif.type === 'out_of_stock' ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      )}
                    </div>
                    <div className="topbar__notif-item-body">
                      <span className="topbar__notif-item-title">{notif.title}</span>
                      <span className="topbar__notif-item-msg">{notif.message}</span>
                    </div>
                    <span className="topbar__notif-item-time">{formatNotifTime(notif.created_at)}</span>
                    {!notif.is_read && <span className="topbar__notif-item-dot" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Overdue Reminder */}
        {user?.role?.toLowerCase() !== 'staff' && user?.role?.toLowerCase() !== 'sales_person' && (
          <div className="topbar__notif-wrapper" ref={overdueRef}>
            <button
              className={`topbar__icon-btn topbar__overdue-btn ${overdueCount === 0 && upcomingCount > 0 ? 'topbar__overdue-btn--warning' : ''}`}
              onClick={() => setOverdueOpen(!overdueOpen)}
              aria-expanded={overdueOpen}
              aria-haspopup="true"
              aria-label="Overdue invoices"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {totalReminderCount > 0 && (
                <span className="topbar__overdue-badge">{totalReminderCount > 9 ? '9+' : totalReminderCount}</span>
              )}
            </button>

            <div className={`topbar__dropdown topbar__overdue-dropdown ${overdueOpen ? 'topbar__dropdown--open' : ''}`}>
              <div className="topbar__overdue-header">
                <span className="topbar__overdue-header-title">
                  {t('dashboard.overdue.title') || 'Reminders'}
                </span>
                {totalReminderCount > 0 && (
                  <span className="topbar__overdue-header-count">{totalReminderCount}</span>
                )}
              </div>
              <div className="topbar__overdue-list">
                {totalReminderCount === 0 ? (
                  <div className="topbar__overdue-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span>{t('dashboard.overdue.empty') || 'All paid'}</span>
                  </div>
                ) : (
                  <>
                    {/* Upcoming section */}
                    {upcomingList.length > 0 && (
                      <>
                        <div className="topbar__overdue-subhead">
                          {t('dashboard.overdue.dueSoon') || 'Due Soon'}
                        </div>
                        {upcomingList.slice(0, 5).map((doc) => (
                          <button
                            key={doc.id}
                            type="button"
                            className={`topbar__overdue-item topbar__overdue-item--upcoming ${doc.daysLeft <= 2 ? 'topbar__overdue-item--urgent' : ''}`}
                            onClick={() => { setOverdueOpen(false); navigate('/document/' + doc.id); }}
                          >
                            <div className="topbar__overdue-item-body">
                              <span className="topbar__overdue-item-name">{doc.contact_name || '—'}</span>
                              <span className="topbar__overdue-item-meta">
                                {new Date(doc.due_date).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                            <span className="topbar__overdue-item-days">
                              {doc.daysLeft === 0
                                ? (lang === 'id' ? 'Hari ini' : 'Today')
                                : doc.daysLeft === 1
                                ? (lang === 'id' ? 'Besok' : 'Tomorrow')
                                : `${doc.daysLeft}${lang === 'id' ? ' hr' : 'd'}`}
                            </span>
                          </button>
                        ))}
                      </>
                    )}

                    {/* Overdue section */}
                    {overdueList.length > 0 && (
                      <>
                        <div className="topbar__overdue-subhead topbar__overdue-subhead--danger">
                          {t('dashboard.overdue.overdue') || 'Overdue'}
                        </div>
                        {overdueList.slice(0, 5).map((doc) => (
                          <button
                            key={doc.id}
                            type="button"
                            className="topbar__overdue-item topbar__overdue-item--overdue"
                            onClick={() => { setOverdueOpen(false); navigate('/document/' + doc.id); }}
                          >
                            <div className="topbar__overdue-item-body">
                              <span className="topbar__overdue-item-name">{doc.contact_name || '—'}</span>
                              <span className="topbar__overdue-item-meta">
                                {new Date(doc.due_date).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                            <span className="topbar__overdue-item-days">
                              {doc.daysLate}{lang === 'id' ? ' hr' : 'd'}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
              {totalReminderCount > 8 && (
                <button
                  type="button"
                  className="topbar__overdue-view-all"
                  onClick={() => { setOverdueOpen(false); navigate('/documents?type=invoice'); }}
                >
                  {lang === 'id' ? `Lihat semua (${totalReminderCount})` : `View all (${totalReminderCount})`}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="topbar__divider" />

        <button
          className="topbar__icon-btn topbar__lang-btn"
          onClick={() => updatePreference({ lang: lang === 'id' ? 'en' : 'id' })}
          aria-label={t('nav.switchLang')}
        >
          <span className="topbar__lang-text">{lang === 'id' ? 'EN' : 'ID'}</span>
        </button>

        <button
          className="topbar__icon-btn topbar__theme-btn"
          onClick={() => updatePreference({ theme: theme === 'light' ? 'dark' : 'light' })}
          aria-label={t('nav.switchTheme')}
        >
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>

        <div className="topbar__divider" />

        <div className="topbar__user-wrapper" ref={userMenuRef}>
          <button
            className="topbar__avatar-btn"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
            aria-label={t('nav.userMenu')}
          >
            {initials}
            <svg className={`topbar__avatar-chevron ${userMenuOpen ? 'topbar__avatar-chevron--open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <div className={`topbar__dropdown topbar__user-dropdown ${userMenuOpen ? 'topbar__dropdown--open' : ''}`}>
            <div className="topbar__dropdown-header">
              <div className="topbar__dropdown-avatar">{initials}</div>
              <div>
                <div className="topbar__dropdown-name">{user?.fullName || '—'}</div>
                <div className="topbar__dropdown-email">{user?.email || '—'}</div>
              </div>
            </div>

            <div className="topbar__dropdown-body">
              {/* Warehouse / Gudang Section */}
              <div style={{ padding: '6px 12px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {lang === 'id' ? 'Gudang Aktif' : 'Active Storage'}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border-subtle)' }}>
                  {warehouses.length > 1 ? `${warehouses.length} ${lang === 'id' ? 'Gudang' : 'Storages'}` : (lang === 'id' ? '1 Gudang' : '1 Storage')}
                </span>
              </div>

              {/* Warehouse list switcher */}
              {warehouses.length > 1 && (user?.role === 'owner' || user?.role === 'super_admin') ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '2px 0' }}>
                  {warehouses.map((wh) => {
                    const isSelected = activeWarehouse?.id === wh.id;
                    return (
                      <button
                        key={wh.id}
                        type="button"
                        className="topbar__dropdown-item"
                        onClick={() => {
                          switchWarehouse(wh.id);
                          setUserMenuOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 12px',
                          background: isSelected ? 'var(--color-interactive-light, #eef2ff)' : 'transparent',
                          color: isSelected ? 'var(--color-interactive, #4f46e5)' : 'var(--color-text-primary)',
                          borderRadius: '6px',
                          margin: '0 4px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <svg className="topbar__dropdown-icon" style={{ color: isSelected ? 'var(--color-interactive, #4f46e5)' : 'var(--color-text-muted)', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 21h18" />
                            <path d="M5 21V7l8-4v18" />
                            <path d="M19 21V11l-6-4" />
                            <path d="M9 9v.01" />
                            <path d="M9 12v.01" />
                            <path d="M9 15v.01" />
                            <path d="M9 18v.01" />
                          </svg>
                          <div style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: isSelected ? 700 : 500, fontSize: '13px', lineHeight: 1.2 }}>
                              {wh.name}
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                              {wh.code} {wh.is_default ? `• ${lang === 'id' ? 'Utama' : 'Default'}` : ''}
                            </span>
                          </div>
                        </div>
                        {isSelected && (
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success, #10b981)', flexShrink: 0 }} title="Aktif" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div
                  className="topbar__dropdown-item"
                  style={{
                    cursor: 'default',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    marginBottom: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg className="topbar__dropdown-icon" style={{ color: 'var(--color-interactive, #4f46e5)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 21h18" />
                      <path d="M5 21V7l8-4v18" />
                      <path d="M19 21V11l-6-4" />
                      <path d="M9 9v.01" />
                      <path d="M9 12v.01" />
                      <path d="M9 15v.01" />
                      <path d="M9 18v.01" />
                    </svg>
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {activeWarehouse?.name || (lang === 'id' ? 'Gudang Utama' : 'Main Warehouse')}
                    </span>
                  </div>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success, #10b981)' }} title="Aktif" />
                </div>
              )}

              <div style={{ height: '1px', background: 'var(--color-border-subtle)', margin: '4px 0 6px' }} />

              <button className="topbar__dropdown-item" onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}>
                <svg className="topbar__dropdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>Settings</span>
              </button>
            </div>

            <div className="topbar__dropdown-footer">
              <button className="topbar__dropdown-item topbar__dropdown-item--danger" onClick={() => { setUserMenuOpen(false); logout(); }}>
                <svg className="topbar__dropdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>{t('nav.signOut')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
