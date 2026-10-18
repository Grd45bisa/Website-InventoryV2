import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Save, RotateCcw, Barcode, SlidersHorizontal, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../utils/api.js';
import { useUnits } from '../../hooks/useUnits.js';
import {
  DEFAULT_SERIAL_SETTINGS,
  DEFAULT_UNIT_SHORT_CODES,
  SERIAL_TOKENS,
  buildSerialNumber,
} from '../../utils/serialGenerator.js';
import './SerialSettingsModal.css';

// Preset rekomendasi jika user ingin singkatan cepat
const RECOMMENDED_SHORT_CODES = {
  pcs: 'PCS',
  piece: 'PCS',
  lusin: 'LS',
  dozen: 'LS',
  pack: 'PK',
  bal10: 'BL10',
  bal15: 'BL15',
  bal20: 'BL20',
  bal25: 'BL25',
  bal: 'BL25',
};

export default function SerialSettingsModal({ isOpen, onClose, currentSettings, onSaved }) {
  const queryClient = useQueryClient();
  const { units } = useUnits();

  const [template, setTemplate] = useState(DEFAULT_SERIAL_SETTINGS.template);
  const [seqLength, setSeqLength] = useState(DEFAULT_SERIAL_SETTINGS.seqLength);
  const [unitShortCodes, setUnitShortCodes] = useState(DEFAULT_UNIT_SHORT_CODES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const s = currentSettings?.serial_number_settings || currentSettings;
      if (s?.template) setTemplate(s.template);
      else setTemplate(DEFAULT_SERIAL_SETTINGS.template);

      if (s?.seqLength) setSeqLength(Number(s.seqLength));
      else setSeqLength(DEFAULT_SERIAL_SETTINGS.seqLength);

      if (s?.unitShortCodes && typeof s.unitShortCodes === 'object') {
        setUnitShortCodes({ ...DEFAULT_UNIT_SHORT_CODES, ...s.unitShortCodes });
      } else {
        setUnitShortCodes(DEFAULT_UNIT_SHORT_CODES);
      }
      setError(null);
    }
  }, [isOpen, currentSettings]);

  if (!isOpen) return null;

  const handleUnitCodeChange = (unitKey, value) => {
    const clean = value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    setUnitShortCodes((prev) => ({
      ...prev,
      [unitKey]: clean,
    }));
  };

  const handleApplyRecommended = () => {
    setUnitShortCodes(RECOMMENDED_SHORT_CODES);
  };

  const handleResetToUnitNames = () => {
    setTemplate(DEFAULT_SERIAL_SETTINGS.template);
    setSeqLength(DEFAULT_SERIAL_SETTINGS.seqLength);
    setUnitShortCodes(DEFAULT_UNIT_SHORT_CODES);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        template: template.trim() || DEFAULT_SERIAL_SETTINGS.template,
        seqLength: Number(seqLength) || 4,
        unitShortCodes,
      };

      const res = await api.patch('/api/workspace/settings/serial_number_settings', {
        value: payload,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Gagal menyimpan pengaturan ke database.');
      }

      await queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });

      if (onSaved) {
        onSaved(payload);
      }

      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Terjadi kesalahan saat menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  // Live preview
  const sampleSku = 'HS110';
  const sampleUnitCode = unitShortCodes['pack'] || 'PACK';
  const previewExample = buildSerialNumber({
    sku: sampleSku,
    unitCode: sampleUnitCode,
    dateStr: new Date(),
    seqNum: 1,
    settings: {
      template,
      seqLength,
    },
  });

  return (
    <div className="serial-modal__backdrop" onClick={onClose}>
      <div className="serial-modal__dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="serial-modal__header">
          <div className="serial-modal__title-group">
            <div>
              <h3 className="serial-modal__title">Format & Satuan Serial Number</h3>
              <p className="serial-modal__subtitle">
                Atur formula penomoran otomatis dan singkatan satuan. Disimpan ke database.
              </p>
            </div>
          </div>
          <button type="button" className="serial-modal__close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="serial-modal__body">
          {error && (
            <div className="serial-modal__alert serial-modal__alert--error">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Template Input */}
          <div className="serial-modal__section">
            <div className="serial-modal__field-label-row">
              <label className="serial-modal__label">Pola Format</label>
              <div className="serial-modal__quick-actions">
                <button
                  type="button"
                  className="serial-modal__text-btn"
                  onClick={handleResetToUnitNames}
                >
                  <RotateCcw size={11} />
                  <span>Reset Default</span>
                </button>
              </div>
            </div>

            <input
              type="text"
              className="input serial-modal__template-input"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="{SKU}-{UNIT}-{DDMMYYYY}{SEQ}"
            />

            {/* Token Chips */}
            <div className="serial-modal__tokens">
              <div className="serial-modal__token-chips">
                {SERIAL_TOKENS.map(({ token, label }) => (
                  <button
                    key={token}
                    type="button"
                    className={`serial-modal__chip ${template.includes(token) ? 'serial-modal__chip--active' : ''}`}
                    onClick={() => {
                      if (!template.includes(token)) {
                        setTemplate((prev) => (prev ? `${prev}-${token}` : token));
                      }
                    }}
                    title={label}
                  >
                    <code>{token}</code>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sequence & Preview Grid */}
          <div className="serial-modal__grid-2">
            <div className="serial-modal__section">
              <label className="serial-modal__label">Digit Nomor Urut ({'{SEQ}'})</label>
              <select
                className="input select"
                value={seqLength}
                onChange={(e) => setSeqLength(Number(e.target.value))}
              >
                <option value={3}>3 Digit (001, 002, ...)</option>
                <option value={4}>4 Digit (0001, 0002, ...)</option>
                <option value={5}>5 Digit (00001, 00002, ...)</option>
                <option value={6}>6 Digit (000001, 000002, ...)</option>
              </select>
            </div>

            {/* Live Preview */}
            <div className="serial-modal__preview-card">
              <div className="serial-modal__preview-header">
                <span>Preview Output</span>
              </div>
              <code className="serial-modal__preview-code">{previewExample}</code>
              <span className="serial-modal__preview-hint">
                SKU: {sampleSku} • Satuan: {sampleUnitCode}
              </span>
            </div>
          </div>

          {/* Unit Short Codes Section */}
          <div className="serial-modal__section">
            <div className="serial-modal__field-label-row">
              <div>
                <label className="serial-modal__label">Singkatan Satuan</label>
                <p className="serial-modal__help-text">
                  Ketik singkatan yang diinginkan (misal: <code>LS</code> untuk Lusin, <code>BL25</code> untuk Bal25). Kosongkan jika ingin nama asli.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm serial-modal__recommend-btn"
                onClick={handleApplyRecommended}
              >
                <span>Pakai Singkatan Rekomendasi (LS, PK, BL25)</span>
              </button>
            </div>

            <div className="serial-modal__table-container">
              <table className="serial-modal__table">
                <thead>
                  <tr>
                    <th>Satuan</th>
                    <th>Nama Satuan</th>
                    <th style={{ width: '160px' }}>Singkatan di SN</th>
                    <th>Contoh Serial</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => {
                    const currentVal = unitShortCodes[u.key] || u.key.toUpperCase();
                    const sampleSN = buildSerialNumber({
                      sku: 'HS110',
                      unitCode: currentVal,
                      dateStr: new Date(),
                      seqNum: 1,
                      settings: { template, seqLength },
                    });

                    return (
                      <tr key={u.key}>
                        <td>
                          <code className="serial-modal__unit-key">{u.key}</code>
                        </td>
                        <td>
                          <span className="serial-modal__unit-name">
                            {u.name} {u.description ? `(${u.description})` : ''}
                          </span>
                        </td>
                        <td>
                          <input
                            type="text"
                            maxLength={10}
                            className="input serial-modal__unit-input"
                            value={unitShortCodes[u.key] ?? u.key.toUpperCase()}
                            placeholder={u.key.toUpperCase()}
                            onChange={(e) => handleUnitCodeChange(u.key, e.target.value)}
                          />
                        </td>
                        <td>
                          <span className="serial-modal__sample-sn">{sampleSN}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="serial-modal__footer">
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={15} />
            <span>{saving ? 'Menyimpan...' : 'Simpan ke Database'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
