import React, { useState } from 'react';
import { Warehouse, Plus, CheckCircle2, MapPin, Building, Info, Edit3, Trash2, Check, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { createWarehouse, updateWarehouse, archiveWarehouse } from '../../utils/api.js';
import './UsersSetting.css';
import './WarehousesSetting.css';

export default function WarehousesSetting() {
  const { lang, warehouses = [], activeWarehouse, switchWarehouse, refetchWarehouses } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleOpenCreate = () => {
    setEditingWarehouse(null);
    setFormData({
      name: '',
      code: '',
      address: '',
    });
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleOpenEdit = (wh) => {
    setEditingWarehouse(wh);
    setFormData({
      name: wh.name || '',
      code: wh.code || '',
      address: wh.address || '',
    });
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      setErrorMsg(lang === 'id' ? 'Nama dan kode gudang wajib diisi.' : 'Warehouse name and code are required.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      if (editingWarehouse) {
        await updateWarehouse(editingWarehouse.id, {
          name: formData.name.trim(),
          code: formData.code.trim().toUpperCase(),
          address: formData.address.trim() || null,
        });
      } else {
        await createWarehouse({
          name: formData.name.trim(),
          code: formData.code.trim().toUpperCase(),
          address: formData.address.trim() || null,
          status: 'active',
        });
      }
      await refetchWarehouses();
      setModalOpen(false);
    } catch (err) {
      setErrorMsg(err.message || 'Gagal menyimpan data gudang.');
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async (wh) => {
    if (wh.is_default) {
      alert(lang === 'id' ? 'Gudang utama tidak dapat dihapus.' : 'Default warehouse cannot be deleted.');
      return;
    }
    const confirm = window.confirm(
      lang === 'id'
        ? `Apakah Anda yakin ingin mengarsipkan gudang "${wh.name}"?`
        : `Are you sure you want to archive warehouse "${wh.name}"?`
    );
    if (!confirm) return;

    try {
      await archiveWarehouse(wh.id);
      if (activeWarehouse?.id === wh.id) {
        const remaining = warehouses.filter((w) => w.id !== wh.id);
        if (remaining.length > 0) {
          switchWarehouse(remaining[0].id);
        }
      }
      await refetchWarehouses();
    } catch (err) {
      alert(err.message || 'Gagal mengarsipkan gudang.');
    }
  };

  return (
    <div className="settings-form">
      <div className="settings-form__header-row">
        <div>
          <h2 className="settings-form__title">
            {lang === 'id' ? 'Gudang & Cabang' : 'Warehouses & Storages'}
          </h2>
          <p className="settings-form__desc">
            {lang === 'id'
              ? 'Kelola lokasi penyimpanan fisik, gudang pusat, dan cabang operasional inventaris Anda.'
              : 'Manage physical storage locations, main warehouse, and branch operations for your inventory.'}
          </p>
        </div>
        <div className="settings-form__actions-row">
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleOpenCreate}
          >
            <Plus size={16} />
            <span>{lang === 'id' ? 'Tambah Gudang' : 'Add Warehouse'}</span>
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="warehouses-setting__banner">
        <Info size={20} style={{ color: 'var(--color-interactive, #4f46e5)', flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong>
            {lang === 'id'
              ? `Status: ${warehouses.length} Gudang Terdaftar (${activeWarehouse?.name || 'Gudang Utama'} Aktif)`
              : `Status: ${warehouses.length} Registered Storages (${activeWarehouse?.name || 'Main Warehouse'} Active)`}
          </strong>
          {lang === 'id'
            ? 'Setiap gudang memiliki stok dan transaksi terisolasi. Anda dapat beralih gudang aktif melalui menu Profil di pojok kanan atas.'
            : 'Each warehouse has isolated stock and transactions. You can switch active warehouses from the Profile menu at the top right.'}
        </div>
      </div>

      {/* Warehouses Table Card */}
      <div className="warehouses-setting__card">
        <div className="warehouses-setting__table-wrap">
          <table className="warehouses-setting__table">
            <thead>
              <tr>
                <th>{lang === 'id' ? 'Nama Gudang' : 'Warehouse Name'}</th>
                <th>{lang === 'id' ? 'Kode' : 'Code'}</th>
                <th>{lang === 'id' ? 'Tipe' : 'Type'}</th>
                <th>Status</th>
                <th>{lang === 'id' ? 'Alamat / Lokasi' : 'Location'}</th>
                <th style={{ textAlign: 'right', width: '110px' }}>{lang === 'id' ? 'Aksi' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map((wh) => {
                const isActive = activeWarehouse?.id === wh.id;
                return (
                  <tr key={wh.id} style={{ background: isActive ? 'var(--color-surface-alt)' : 'transparent' }}>
                    <td>
                      <div className="wh-cell">
                        <span className={`wh-avatar ${isActive ? 'wh-avatar--active' : 'wh-avatar--inactive'}`}>
                          <Warehouse size={20} />
                        </span>
                        <div className="wh-cell__info">
                          <span className="wh-cell__name">{wh.name}</span>
                          <span className="wh-cell__sub">
                            {wh.is_default ? (lang === 'id' ? 'Gudang Utama (Pusat)' : 'Default Primary Storage') : (lang === 'id' ? 'Cabang Operasional' : 'Branch Storage')}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="wh-code-badge">{wh.code}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                        {wh.is_default ? (lang === 'id' ? 'Utama (Default)' : 'Primary (Default)') : (lang === 'id' ? 'Cabang' : 'Branch')}
                      </span>
                    </td>
                    <td>
                      {isActive ? (
                        <span className="wh-status-active">
                          <CheckCircle2 size={14} />
                          <span>{lang === 'id' ? 'Aktif Saat Ini' : 'Currently Active'}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="wh-btn-select"
                          onClick={() => switchWarehouse(wh.id)}
                        >
                          <Check size={14} />
                          <span>{lang === 'id' ? 'Pilih Aktif' : 'Select'}</span>
                        </button>
                      )}
                    </td>
                    <td style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
                      {wh.address ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <MapPin size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                          <span>{wh.address}</span>
                        </div>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="wh-actions-group">
                        <button
                          type="button"
                          className="wh-action-btn"
                          title={lang === 'id' ? 'Edit Profil Gudang' : 'Edit Warehouse'}
                          onClick={() => handleOpenEdit(wh)}
                        >
                          <Edit3 size={16} />
                        </button>
                        {!wh.is_default && (
                          <button
                            type="button"
                            className="wh-action-btn wh-action-btn--delete"
                            title={lang === 'id' ? 'Arsipkan Gudang' : 'Archive Warehouse'}
                            onClick={() => handleArchive(wh)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form Tambah / Edit Gudang */}
      {modalOpen && (
        <div className="settings-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal__header">
              <h3 className="settings-modal__title">
                {editingWarehouse
                  ? (lang === 'id' ? 'Edit Profil Gudang' : 'Edit Warehouse')
                  : (lang === 'id' ? 'Tambah Gudang / Cabang' : 'Add New Warehouse')}
              </h3>
              <button
                type="button"
                className="settings-modal__close"
                onClick={() => setModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="settings-modal__body">
                {errorMsg && (
                  <div className="settings-message settings-message--error" style={{ margin: '0 0 var(--space-4) 0' }}>
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="settings-form__group">
                  <label className="settings-form__label">
                    {lang === 'id' ? 'Nama Gudang / Cabang' : 'Warehouse / Branch Name'}{' '}
                    <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder={lang === 'id' ? 'Contoh: Gudang Surabaya' : 'e.g. Surabaya Warehouse'}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="settings-form__group">
                  <label className="settings-form__label">
                    {lang === 'id' ? 'Kode Singkatan' : 'Warehouse Code'}{' '}
                    <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder={lang === 'id' ? 'Contoh: SBY-01' : 'e.g. SBY-01'}
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    required
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>

                <div className="settings-form__group">
                  <label className="settings-form__label">
                    {lang === 'id' ? 'Alamat Fisik' : 'Physical Address'}
                  </label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder={lang === 'id' ? 'Alamat lengkap gudang / cabang' : 'Full warehouse address'}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
              </div>

              <div className="settings-modal__footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={loading}
                >
                  {lang === 'id' ? 'Batal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading
                    ? (lang === 'id' ? 'Menyimpan...' : 'Saving...')
                    : (editingWarehouse ? (lang === 'id' ? 'Simpan Perubahan' : 'Save Changes') : (lang === 'id' ? 'Buat Gudang' : 'Create Warehouse'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
