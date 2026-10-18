import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, RotateCcw, Lock, CheckCircle2, AlertCircle, X, Layers, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api, getWorkspaceSettings } from '../../utils/api.js';
import { DEFAULT_UNITS, getDefaultUnitsForWarehouse } from '../../hooks/useUnits.js';
import './UsersSetting.css';
import './UnitsSetting.css';

export default function UnitsSetting() {
  const { t, lang, activeWarehouse } = useApp();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['workspace-settings', activeWarehouse?.id || 'default'],
    queryFn: getWorkspaceSettings,
    staleTime: 60000,
  });

  const fallbackUnits = useMemo(() => {
    return getDefaultUnitsForWarehouse(activeWarehouse);
  }, [activeWarehouse]);

  const [units, setUnits] = useState(fallbackUnits);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null); // null = add new
  const [formData, setFormData] = useState({
    key: '',
    name: '',
    baseType: 'lusin', // 'lusin' | 'pcs'
    baseValue: 1,
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', text: '' }

  useEffect(() => {
    if (settings?.custom_units && Array.isArray(settings.custom_units) && settings.custom_units.length > 0) {
      setUnits(settings.custom_units);
    } else {
      setUnits(fallbackUnits);
    }
  }, [settings?.custom_units, fallbackUnits]);

  const showFeedback = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleOpenAdd = () => {
    setEditingIndex(null);
    setFormData({
      key: '',
      name: '',
      baseType: 'lusin',
      baseValue: 1,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (unit, index) => {
    if (unit.isLocked) return;
    setEditingIndex(index);
    setFormData({
      key: unit.key,
      name: unit.name,
      baseType: unit.baseType || 'lusin',
      baseValue: unit.baseValue || 1,
    });
    setModalOpen(true);
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    const cleanKey = formData.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const cleanName = formData.name.trim();

    if (!cleanKey) {
      showFeedback('error', lang === 'id' ? 'Kode satuan (key) wajib diisi' : 'Unit code is required');
      return;
    }
    if (!cleanName) {
      showFeedback('error', lang === 'id' ? 'Nama satuan wajib diisi' : 'Unit name is required');
      return;
    }

    const baseVal = Math.max(1, Number(formData.baseValue) || 1);
    const multiplier = formData.baseType === 'lusin' ? baseVal * 12 : baseVal;

    // Enforce AGENTS.md system constraints
    if (cleanKey === 'pack' && multiplier !== 60) {
      showFeedback('error', lang === 'id'
        ? 'Kode satuan "pack" dicadangkan untuk 5 Lusin (60 Pcs). Gunakan kode "pack3" untuk 3 pcs atau "pack6" untuk 6 pcs.'
        : 'Unit code "pack" is reserved for 5 Dozen (60 Pcs). Use "pack3" for 3 pcs or "pack6" for 6 pcs.');
      return;
    }
    if ((cleanKey === 'bal' || cleanKey === 'bal25') && multiplier !== 300) {
      showFeedback('error', lang === 'id'
        ? 'Satuan "bal" dicadangkan untuk 25 Lusin (300 Pcs). Gunakan "bal10", "bal15", atau "bal20" untuk ukuran bal lainnya.'
        : 'Unit "bal" is reserved for 25 Dozen (300 Pcs). Use "bal10", "bal15", or "bal20" for other sizes.');
      return;
    }

    const description = formData.baseType === 'lusin'
      ? `${baseVal} Lusin (${multiplier} Pcs)`
      : `${baseVal} Pcs`;

    const newUnit = {
      key: cleanKey,
      name: cleanName,
      baseType: formData.baseType,
      baseValue: baseVal,
      multiplier,
      isLocked: false,
      description,
    };

    let updatedUnits = [...units];

    if (editingIndex !== null) {
      // Edit existing
      updatedUnits[editingIndex] = {
        ...updatedUnits[editingIndex],
        ...newUnit,
        isLocked: updatedUnits[editingIndex].isLocked, // preserve locked state
      };
    } else {
      // Check duplicate key
      if (updatedUnits.some((u) => u.key.toLowerCase() === cleanKey)) {
        showFeedback('error', lang === 'id' ? `Kode satuan "${cleanKey}" sudah digunakan!` : `Unit code "${cleanKey}" already exists!`);
        return;
      }
      updatedUnits.push(newUnit);
    }

    await saveUnitsToBackend(updatedUnits);
    setModalOpen(false);
  };

  const handleDeleteUnit = async (index) => {
    const target = units[index];
    if (target.isLocked) return;

    const confirmMsg = lang === 'id'
      ? `Apakah Anda yakin ingin menghapus satuan "${target.name}" (${target.key})?`
      : `Are you sure you want to delete unit "${target.name}" (${target.key})?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    const updatedUnits = units.filter((_, idx) => idx !== index);
    await saveUnitsToBackend(updatedUnits);
  };

  const handleResetDefaults = async () => {
    const whName = activeWarehouse?.name || (lang === 'id' ? 'gudang ini' : 'this warehouse');
    const confirmMsg = lang === 'id'
      ? `Apakah Anda yakin ingin mereset daftar satuan untuk ${whName} ke bawaan default?`
      : `Are you sure you want to reset units for ${whName} to defaults?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }
    const defaultUnits = getDefaultUnitsForWarehouse(activeWarehouse);
    await saveUnitsToBackend(defaultUnits);
  };

  const saveUnitsToBackend = async (nextUnits) => {
    setSaving(true);
    try {
      const res = await api.patch('/api/workspace/settings/custom_units', {
        value: nextUnits,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.message || 'Gagal menyimpan pengaturan satuan');
      }

      setUnits(nextUnits);
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
      showFeedback('success', lang === 'id' ? 'Pengaturan satuan berhasil disimpan' : 'Units settings saved successfully');
    } catch (err) {
      console.error(err);
      showFeedback('error', err.message || 'Terjadi kesalahan saat menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const previewMultiplier = useMemo(() => {
    const val = Math.max(1, Number(formData.baseValue) || 1);
    if (formData.baseType === 'lusin') {
      return `1 ${formData.name || 'Satuan'} = ${val} Lusin (${val * 12} Pcs)`;
    }
    return `1 ${formData.name || 'Satuan'} = ${val} Pcs`;
  }, [formData.name, formData.baseType, formData.baseValue]);

  return (
    <div className="units-setting">
      {/* Header */}
      <div className="units-setting__header">
        <div className="units-setting__title-wrap">
          <h2>{lang === 'id' ? 'Pengaturan Satuan Inventory' : 'Inventory Units Settings'}</h2>
          <p>
            {lang === 'id'
              ? `Kelola daftar satuan barang & konversi khusus untuk ${activeWarehouse?.name || 'Gudang ini'}.`
              : `Manage unit list and conversion for ${activeWarehouse?.name || 'this warehouse'}.`}
          </p>
        </div>

        <div className="units-setting__actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleResetDefaults}
            disabled={saving}
            title={lang === 'id' ? 'Reset ke pengaturan dasar (Pcs & Lusin)' : 'Reset to default units'}
          >
            <RotateCcw size={16} />
            <span>{lang === 'id' ? 'Reset Bawaan' : 'Reset Defaults'}</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenAdd}
            disabled={saving}
          >
            <Plus size={16} />
            <span>{lang === 'id' ? 'Tambah Satuan' : 'Add Unit'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div className={`settings-message settings-message--${feedback.type === 'success' ? 'success' : 'error'}`}>
          <span>{feedback.text}</span>
          <button type="button" className="settings-message__close" onClick={() => setFeedback(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Table Card */}
      <div className="units-setting__card">
        <div className="units-setting__table-wrap">
          <table className="units-setting__table">
            <thead>
              <tr>
                <th>{lang === 'id' ? 'Nama Satuan' : 'Unit Name'}</th>
                <th>{lang === 'id' ? 'Kode Sistem (Key)' : 'System Key'}</th>
                <th>{lang === 'id' ? 'Isi / Konversi' : 'Conversion'}</th>
                <th>{lang === 'id' ? 'Total (Pcs)' : 'Total (Pcs)'}</th>
                <th>{lang === 'id' ? 'Tipe' : 'Type'}</th>
                <th style={{ textAlign: 'right', width: '100px' }}>{lang === 'id' ? 'Aksi' : 'Action'}</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit, idx) => (
                <tr key={unit.key || idx}>
                  <td>
                    <span className="units-setting__name">{unit.name}</span>
                  </td>
                  <td>
                    <span className="units-setting__key-badge">{unit.key}</span>
                  </td>
                  <td>
                    <span className="units-setting__conversion">
                      {unit.key === 'pcs' ? '1 Pcs' : unit.key === 'lusin' ? '12 Pcs' : `${unit.baseValue || 1} ${unit.baseType || 'lusin'}`}
                    </span>
                  </td>
                  <td>
                    <span className="units-setting__total">{unit.multiplier || 1} Pcs</span>
                  </td>
                  <td>
                    {unit.isLocked ? (
                      <span className="units-setting__badge units-setting__badge--locked">
                        <Lock size={12} />
                        <span>{lang === 'id' ? 'Bawaan (Terkunci)' : 'Default (Locked)'}</span>
                      </span>
                    ) : (
                      <span className="units-setting__badge units-setting__badge--custom">
                        <Sparkles size={12} />
                        <span>{lang === 'id' ? 'Kustom' : 'Custom'}</span>
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="units-setting__action-btn"
                        onClick={() => handleOpenEdit(unit, idx)}
                        disabled={unit.isLocked || saving}
                        title={unit.isLocked ? (lang === 'id' ? 'Satuan bawaan tidak dapat diedit' : 'Default unit cannot be edited') : (lang === 'id' ? 'Edit satuan' : 'Edit unit')}
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        className="units-setting__action-btn units-setting__action-btn--delete"
                        onClick={() => handleDeleteUnit(idx)}
                        disabled={unit.isLocked || saving}
                        title={unit.isLocked ? (lang === 'id' ? 'Satuan bawaan tidak dapat dihapus' : 'Default unit cannot be deleted') : (lang === 'id' ? 'Hapus satuan' : 'Delete unit')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah / Edit Satuan */}
      {modalOpen && (
        <div className="settings-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal__header">
              <h3 className="settings-modal__title">
                {editingIndex !== null
                  ? (lang === 'id' ? 'Edit Satuan Unit' : 'Edit Unit')
                  : (lang === 'id' ? 'Tambah Satuan Baru' : 'Add New Unit')}
              </h3>
              <button
                type="button"
                className="settings-modal__close"
                onClick={() => setModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModal}>
              <div className="units-modal__body">
                <div className="settings-form__group">
                  <label className="settings-form__label">
                    {lang === 'id' ? 'Nama Satuan' : 'Unit Name'} <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder={lang === 'id' ? 'Contoh: Bal 15, Dus Kecil, Pack 5, Koli...' : 'e.g. Pack, Box, Large Box...'}
                    value={formData.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        name: val,
                        key: editingIndex === null && !prev.key ? val.toLowerCase().replace(/[^a-z0-9_]/g, '') : prev.key,
                      }));
                    }}
                    required
                    autoFocus
                  />
                </div>

                <div className="settings-form__group">
                  <label className="settings-form__label">
                    {lang === 'id' ? 'Kode Sistem (Key)' : 'System Key'} <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder={lang === 'id' ? 'Contoh: bal15, dus, pack5...' : 'e.g. pack, box...'}
                    value={formData.key}
                    onChange={(e) => setFormData((prev) => ({ ...prev, key: e.target.value }))}
                    disabled={editingIndex !== null} // key cannot be edited once created
                    required
                  />
                  <small style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    {lang === 'id'
                      ? 'Gunakan huruf kecil tanpa spasi. Digunakan sebagai pengenal unik di sistem dan barcode.'
                      : 'Use lowercase letters without spaces.'}
                  </small>
                </div>

                <div className="settings-form__group">
                  <label className="settings-form__label">
                    {lang === 'id' ? 'Basis Perhitungan Konversi' : 'Base Calculation Unit'} <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <div className="units-modal__radio-grid">
                    <label className={`units-modal__radio-card ${formData.baseType === 'lusin' ? 'is-selected' : ''}`}>
                      <input
                        type="radio"
                        name="baseType"
                        value="lusin"
                        checked={formData.baseType === 'lusin'}
                        onChange={() => setFormData((prev) => ({ ...prev, baseType: 'lusin' }))}
                      />
                      <span>{lang === 'id' ? 'Lusin (x12 pcs)' : 'Dozen (x12 pcs)'}</span>
                    </label>
                    <label className={`units-modal__radio-card ${formData.baseType === 'pcs' ? 'is-selected' : ''}`}>
                      <input
                        type="radio"
                        name="baseType"
                        value="pcs"
                        checked={formData.baseType === 'pcs'}
                        onChange={() => setFormData((prev) => ({ ...prev, baseType: 'pcs' }))}
                      />
                      <span>{lang === 'id' ? 'Pcs (x1 pc)' : 'Pieces (x1 pc)'}</span>
                    </label>
                  </div>
                </div>

                <div className="settings-form__group">
                  <label className="settings-form__label">
                    {lang === 'id'
                      ? `Jumlah ${formData.baseType === 'lusin' ? 'Lusin' : 'Pcs'}`
                      : `Number of ${formData.baseType === 'lusin' ? 'Dozens' : 'Pieces'}`}{' '}
                    <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="input"
                    value={formData.baseValue}
                    onChange={(e) => setFormData((prev) => ({ ...prev, baseValue: e.target.value }))}
                    required
                  />
                </div>

                <div className="units-modal__preview-box">
                  <span className="units-modal__preview-title">{lang === 'id' ? 'Hasil Konversi:' : 'Conversion Preview:'}</span>
                  <span className="units-modal__preview-value">{previewMultiplier}</span>
                </div>
              </div>

              <div className="settings-modal__footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalOpen(false)}
                >
                  {lang === 'id' ? 'Batal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? (lang === 'id' ? 'Menyimpan...' : 'Saving...')
                    : (lang === 'id' ? 'Simpan Satuan' : 'Save Unit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
