import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, RefreshCw, X, Plus, Trash2, Pencil, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import { ConfirmModal } from '../../components/ConfirmModal/ConfirmModal.jsx';
import './UsersSetting.css';

const ROLE_HIERARCHY = {
  super_admin: ['super_admin', 'owner', 'staff', 'sales_person'],
  owner: ['staff', 'sales_person'],
  staff: [],
};

export default function UsersSetting() {
  const { t, user, lang, warehouses = [], activeWarehouseId } = useApp();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'staff', status: 'active', ownerId: '', warehouseId: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const [passwordTarget, setPasswordTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [warehouseFilter, setWarehouseFilter] = useState('all');

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const userRole = user?.role?.toLowerCase();
  const allowedRoles = ROLE_HIERARCHY[userRole] || [];

  const { data: usersData, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await api.get('/api/auth/accounts');
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
    staleTime: 60000,
  });

  const usersList = useMemo(() => {
    return Array.isArray(usersData) ? usersData : usersData?.data || [];
  }, [usersData]);

  const ownersList = useMemo(() => {
    if (usersData?.owners && Array.isArray(usersData.owners)) {
      return usersData.owners;
    }
    return usersList
      .filter((u) => u.role === 'owner')
      .map((u) => ({ id: u.id, name: u.fullName || u.email }));
  }, [usersData, usersList]);

  const allWarehousesList = useMemo(() => {
    if (usersData?.warehouses && Array.isArray(usersData.warehouses)) {
      return usersData.warehouses;
    }
    return warehouses;
  }, [usersData, warehouses]);

  // Form warehouse options based on selected form owner (for super admin) or current owner
  const formWarehouseOptions = useMemo(() => {
    if (userRole === 'super_admin' && form.ownerId) {
      return allWarehousesList.filter((w) => w.owner_id === form.ownerId);
    }
    if (userRole === 'owner') {
      return warehouses;
    }
    return allWarehousesList;
  }, [userRole, form.ownerId, allWarehousesList, warehouses]);

  // Filtering
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const name = (u.fullName || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const s = search.toLowerCase();
      const matchesSearch = name.includes(s) || email.includes(s);

      const matchesRole = roleFilter === 'all' || u.role === roleFilter;

      const matchesOwner =
        ownerFilter === 'all' ||
        u.ownerId === ownerFilter ||
        (u.role === 'owner' && u.id === ownerFilter);

      const matchesWarehouse =
        warehouseFilter === 'all' ||
        u.warehouseId === warehouseFilter ||
        u.role === 'owner' ||
        u.role === 'super_admin';

      return matchesSearch && matchesRole && matchesOwner && matchesWarehouse;
    });
  }, [usersList, search, roleFilter, ownerFilter, warehouseFilter]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, ownerFilter, warehouseFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const visibleUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page, pageSize]);

  const handleDeleteUser = (u) => {
    const confirmMsg = t('settings.users.deleteConfirm') || 'Apakah Anda yakin ingin menghapus pengguna ini?';
    setConfirm({
      open: true,
      message: confirmMsg.replace('{name}', u.fullName || u.email),
      onConfirm: async () => {
        setConfirm(null);
        setSaving(true);
        setMessage(null);
        try {
          const res = await api.delete(`/api/auth/accounts/${u.id}`);
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || err.message || 'Failed to delete user');
          }
          queryClient.invalidateQueries({ queryKey: ['accounts'] });
          setMessage({ type: 'success', text: t('settings.users.deleteSuccess') || 'User deleted successfully' });
        } catch (err) {
          setMessage({ type: 'error', text: err.message });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const onCancelConfirm = () => setConfirm(null);

  const handleToggleStatus = async (u) => {
    setSaving(true);
    setMessage(null);
    try {
      const nextStatus = u.status === 'disabled' ? 'active' : 'disabled';
      const res = await api.patch(`/api/auth/accounts/${u.id}/status`, { status: nextStatus });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || err.message || 'Failed to update user status');
      }
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setMessage({ type: 'success', text: t('settings.users.statusSuccess') || 'Status akun berhasil diperbarui' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitUser = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
        status: form.status || 'active',
        ownerId: (userRole === 'super_admin' && (form.role === 'staff' || form.role === 'sales_person')) ? (form.ownerId || null) : null,
        warehouseId: (form.role === 'staff' || form.role === 'sales_person') && form.warehouseId ? form.warehouseId : null,
      };
      const res = await api.post('/api/auth/accounts', payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || err.message || 'Failed to add user');
      }
      setShowForm(false);
      setForm({ fullName: '', email: '', password: '', role: 'staff', status: 'active', ownerId: '', warehouseId: '' });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setMessage({ type: 'success', text: t('settings.users.addSuccess') || 'User added successfully' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!newPassword.trim() || newPassword.length < 6) {
      setMessage({ type: 'error', text: t('settings.profile.error.passwordTooShort') || 'Password minimal 6 karakter' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.patch(`/api/auth/accounts/${passwordTarget.id}/password`, { password: newPassword });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || err.message || 'Failed to update password');
      }
      setPasswordTarget(null);
      setNewPassword('');
      setMessage({ type: 'success', text: t('settings.users.passwordSuccess') || 'Kata sandi berhasil diperbarui' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const canManageUser = (u) => {
    if (u.id === user.id) return false;
    if (userRole === 'super_admin') return true;
    if (userRole === 'owner' && (u.role === 'staff' || u.role === 'sales_person')) return true;
    return false;
  };

  const getInitials = (u) => {
    if (u.fullName) {
      return u.fullName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
    }
    return u.email.slice(0, 2).toUpperCase();
  };

  const formatLastActive = (dateStr) => {
    if (!dateStr) return t('settings.users.lastActiveNever') || 'Belum pernah aktif';
    const d = new Date(dateStr);
    return d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (userRole === 'staff') {
    return (
      <div className="settings-form settings-users-empty">
        <Users size={48} className="settings-users-empty__icon" />
        <h3>{t('settings.users.accessDenied')}</h3>
        <p>{t('settings.users.accessDeniedDesc')}</p>
      </div>
    );
  }

  const handleOpenAddUser = () => {
    const defaultOwnerId = ownersList[0]?.id || '';
    setForm({
      fullName: '',
      email: '',
      password: '',
      role: userRole === 'super_admin' ? 'owner' : 'staff',
      status: 'active',
      ownerId: defaultOwnerId,
      warehouseId: activeWarehouseId || (warehouses[0]?.id || ''),
    });
    setMessage(null);
    setShowForm(true);
  };

  return (
    <div className="users-page settings-form">
      <div className="settings-form__header-row">
        <div>
          <h2 className="settings-form__title">{t('settings.users.title')}</h2>
          <p className="settings-form__desc">{t('settings.users.subtitle')}</p>
        </div>
        <div className="settings-form__actions-row">
          <button className="btn btn-primary" type="button" onClick={handleOpenAddUser}>
            <Plus size={16} />
            <span>{t('settings.users.addUser')}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`settings-message settings-message--${message.type}`}>
          <span>{message.text}</span>
          <button type="button" className="settings-message__close" onClick={() => setMessage(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="users-toolbar">
        <div className="users-toolbar__search">
          <Search size={16} className="users-toolbar__search-icon" />
          <input
            className="input users-toolbar__search-input"
            placeholder={t('settings.users.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="users-toolbar__filters">
          <select className="input users-toolbar__select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">{t('settings.users.allRoles')}</option>
            {userRole === 'super_admin' && (
              <>
                <option value="super_admin">{t('settings.users.role.super_admin')}</option>
                <option value="owner">{t('settings.users.role.owner')}</option>
                <option value="staff">{t('settings.users.role.staff')}</option>
                <option value="sales_person">{t('settings.users.role.sales_person')}</option>
              </>
            )}
            {userRole === 'owner' && (
              <>
                <option value="staff">{t('settings.users.role.staff')}</option>
                <option value="sales_person">{t('settings.users.role.sales_person')}</option>
              </>
            )}
          </select>

          {userRole === 'super_admin' && ownersList.length > 0 && (
            <select className="input users-toolbar__select" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
              <option value="all">{lang === 'id' ? 'Semua Pemilik' : 'All Owners'}</option>
              {ownersList.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}

          {allWarehousesList.length > 0 && (
            <select className="input users-toolbar__select" value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}>
              <option value="all">{lang === 'id' ? 'Semua Gudang' : 'All Warehouses'}</option>
              {allWarehousesList.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          )}

          <button
            type="button"
            className="btn btn-secondary users-toolbar__refresh"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['accounts'] })}
            disabled={isFetching}
          >
            <RefreshCw size={16} className={isFetching ? 'spin' : ''} />
            <span>{t('settings.users.refresh')}</span>
          </button>
        </div>
      </div>

      {showForm && (
        <div className="settings-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal__header">
              <h3 className="settings-modal__title">{t('settings.users.addUser')}</h3>
              <button
                type="button"
                className="settings-modal__close"
                onClick={() => setShowForm(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmitUser}>
              <div className="settings-modal__body">
                <div className="settings-form__group">
                  <label className="settings-form__label">{t('settings.users.name')}</label>
                  <input
                    className="input"
                    value={form.fullName}
                    onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                    required
                    placeholder={t('settings.users.namePlaceholder')}
                  />
                </div>
                <div className="settings-form__group">
                  <label className="settings-form__label">{t('settings.users.email')}</label>
                  <input
                    className="input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    required
                    placeholder={t('settings.users.emailPlaceholder')}
                  />
                </div>
                <div className="settings-form__group">
                  <label className="settings-form__label">{t('settings.users.password')}</label>
                  <input
                    className="input"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    required
                    minLength={6}
                    placeholder={t('settings.users.passwordPlaceholder')}
                  />
                </div>
                <div className="settings-form__group">
                  <label className="settings-form__label">{t('settings.users.role')}</label>
                  <select
                    className="input select"
                    value={form.role}
                    onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                  >
                    {allowedRoles.map((r) => (
                      <option key={r} value={r}>{t(`settings.users.role.${r}`)}</option>
                    ))}
                  </select>
                  {form.role === 'owner' && (
                    <small style={{ color: 'var(--color-text-muted)', marginTop: '4px', display: 'block', fontSize: '11px' }}>
                      {lang === 'id' ? 'Akun Pemilik baru akan dibuatkan workspace dan Gudang Utama otomatis.' : 'New Owner account will be provisioned with their own workspace & default warehouse.'}
                    </small>
                  )}
                </div>

                {userRole === 'super_admin' && (form.role === 'staff' || form.role === 'sales_person') && (
                  <div className="settings-form__group">
                    <label className="settings-form__label">
                      {lang === 'id' ? 'Pilih Pemilik / Workspace' : 'Select Owner / Workspace'}
                    </label>
                    <select
                      className="input select"
                      value={form.ownerId || ''}
                      onChange={(e) => {
                        const nextOwnerId = e.target.value;
                        const matchingWh = allWarehousesList.find((w) => w.owner_id === nextOwnerId);
                        setForm((p) => ({
                          ...p,
                          ownerId: nextOwnerId,
                          warehouseId: matchingWh?.id || '',
                        }));
                      }}
                      required
                    >
                      <option value="">{lang === 'id' ? '-- Pilih Pemilik --' : '-- Select Owner --'}</option>
                      {ownersList.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(form.role === 'staff' || form.role === 'sales_person') && (
                  <div className="settings-form__group">
                    <label className="settings-form__label">
                      {lang === 'id' ? 'Tugaskan di Gudang' : 'Assign to Warehouse'}
                    </label>
                    <select
                      className="input select"
                      value={form.warehouseId || ''}
                      onChange={(e) => setForm((p) => ({ ...p, warehouseId: e.target.value }))}
                    >
                      <option value="">{lang === 'id' ? '-- Pilih Lokasi Gudang --' : '-- Select Warehouse --'}</option>
                      {formWarehouseOptions.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code}){w.is_default ? ` - ${lang === 'id' ? 'Utama' : 'Default'}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="settings-modal__footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  {t('general.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? t('settings.saving') : t('settings.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="settings-users-table-container">
        {isLoading ? (
          <div className="settings-users-empty">
            <Users size={32} className="settings-users-empty__icon" />
            <p className="settings-users-empty__text">{t('settings.users.loading')}</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="settings-users-empty">
            <Users size={32} className="settings-users-empty__icon" />
            <p className="settings-users-empty__text">{t('settings.users.noUsers')}</p>
            <p className="settings-users-empty__hint">{t('settings.users.emptyHint')}</p>
          </div>
        ) : (
          <table className="settings-table users-table">
            <thead>
              <tr>
                <th>{t('settings.users.name')}</th>
                <th>{t('settings.users.email')}</th>
                <th>{t('settings.users.role')}</th>
                {userRole === 'super_admin' && <th>{lang === 'id' ? 'Workspace / Pemilik' : 'Workspace / Owner'}</th>}
                <th>{lang === 'id' ? 'Gudang' : 'Warehouse'}</th>
                {userRole === 'super_admin' && <th>Status</th>}
                <th>{t('settings.users.lastActive')}</th>
                <th className="users-table__actions-head">{t('settings.users.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u, i) => (
                <tr key={u.id || i}>
                  <td data-label={t('settings.users.name')}>
                    <div className="user-cell">
                      <span className={`user-avatar user-avatar--${i % 5}`}>{getInitials(u)}</span>
                      <span className="user-cell__text">
                        <strong>{u.fullName || '-'}</strong>
                        <small>@{u.username || '-'}</small>
                      </span>
                    </div>
                  </td>
                  <td data-label={t('settings.users.email')} className="users-table__email">{u.email}</td>
                  <td data-label={t('settings.users.role')}>
                    <span className={`user-role-badge user-role-badge--${u.role}`}>
                      {t(`settings.users.role.${u.role}`)}
                    </span>
                  </td>
                  {userRole === 'super_admin' && (
                    <td data-label={lang === 'id' ? 'Workspace / Pemilik' : 'Workspace / Owner'}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                        {u.role === 'super_admin' ? 'System' : (u.ownerName || (u.role === 'owner' ? u.fullName : '-'))}
                      </span>
                    </td>
                  )}
                  <td data-label={lang === 'id' ? 'Gudang' : 'Warehouse'}>
                    {u.role === 'owner' || u.role === 'super_admin' ? (
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {lang === 'id' ? 'Semua Gudang' : 'All Storages'}
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {u.warehouseName || allWarehousesList.find((w) => w.id === u.warehouseId)?.name || (lang === 'id' ? 'Gudang Utama' : 'Main Warehouse')}
                      </span>
                    )}
                  </td>
                  {userRole === 'super_admin' && (
                    <td data-label="Status">
                      <button
                        type="button"
                        className={`settings-toggle ${u.status !== 'disabled' ? 'settings-toggle--on' : ''}`}
                        onClick={() => handleToggleStatus(u)}
                        disabled={saving || !canManageUser(u)}
                        role="switch"
                        aria-checked={u.status !== 'disabled'}
                        title={u.status === 'disabled' ? 'Aktifkan Akun' : 'Nonaktifkan Akun'}
                      >
                        <span className="settings-toggle__knob" />
                      </button>
                    </td>
                  )}
                  <td data-label={t('settings.users.lastActive')} className="users-table__last-active">{formatLastActive(u.lastActive)}</td>
                  <td data-label={t('settings.users.actions')}>
                    <div className="user-actions">
                      {canManageUser(u) ? (
                        <>
                          <button
                            type="button"
                            className="user-action-btn"
                            onClick={() => { setPasswordTarget(u); setNewPassword(''); }}
                            disabled={saving}
                            title={t('settings.users.editUser')}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="user-action-btn user-action-btn--danger"
                            onClick={() => handleDeleteUser(u)}
                            disabled={saving}
                            title={t('settings.users.deleteUser')}
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="user-action-btn" disabled title={t('settings.users.editUser')}>
                            <Pencil size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && filteredUsers.length > 0 && (
        <div className="users-pagination">
          <span className="users-pagination__summary">
            {t('settings.users.showing')
              .replace('{start}', String((page - 1) * pageSize + 1))
              .replace('{end}', String(Math.min(page * pageSize, filteredUsers.length)))
              .replace('{total}', String(filteredUsers.length))}
          </span>
          <div className="users-pagination__controls">
            <button type="button" className="user-page-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t('settings.users.prev')}
            </button>
            <span className="users-pagination__page">{t('settings.users.pageOf').replace('{page}', String(page)).replace('{total}', String(pageCount))}</span>
            <button type="button" className="user-page-btn" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
              {t('settings.users.next')}
            </button>
          </div>
        </div>
      )}

      {passwordTarget && (
        <div className="settings-modal-overlay" onClick={() => setPasswordTarget(null)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal__header">
              <h3 className="settings-modal__title">{t('settings.profile.password')}</h3>
              <button
                type="button"
                className="settings-modal__close"
                onClick={() => setPasswordTarget(null)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpdatePassword}>
              <div className="settings-modal__body">
                <div style={{ marginBottom: 'var(--space-2)' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                    {passwordTarget.fullName || passwordTarget.email}
                  </strong>
                </div>
                <div className="settings-form__group">
                  <label className="settings-form__label">{t('settings.profile.newPassword')}</label>
                  <input
                    className="input"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder={t('settings.users.passwordPlaceholder') || 'Kata Sandi Baru'}
                  />
                </div>
              </div>
              <div className="settings-modal__footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPasswordTarget(null)}
                  disabled={saving}
                >
                  {t('settings.company.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? t('settings.saving') : t('settings.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
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
    </div>
  );
}
