import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  X,
  Package,
  Barcode,
  Boxes,
  FileText,
  Loader2,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Sparkles,
} from 'lucide-react';
import { api } from '../../utils/api.js';

export default function WriteOffMissingModal({
  isOpen,
  onClose,
  activeSession,
  productSummary = [],
  discrepancyItems = [],
  productSerialsMap,
  activeWarehouse,
  customUnits = [],
  isSerialFromSoGoodsIn,
  soCreatedSerialsSet,
  soGoodsInDocIds,
  onSuccess,
}) {
  const [selectedItems, setSelectedItems] = useState({});
  const [defaultReason, setDefaultReason] = useState('missing_physical_so');
  const [createGoodsOutDoc, setCreateGoodsOutDoc] = useState(true);
  const [notes, setNotes] = useState('');
  const [forceOverride, setForceOverride] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSkus, setExpandedSkus] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Safety check: periksa apakah ada area yang belum selesai
  const uncompletedAreas = useMemo(() => {
    return (activeSession?.areas || []).filter((a) => a.status !== 'completed');
  }, [activeSession]);

  const isSafetyBlocked = uncompletedAreas.length > 0 && !forceOverride;

  // Kumpulkan seluruh nomor seri yang berhasil di-scan di seluruh area sesi ini
  const allScannedSerialsGlobal = useMemo(() => {
    const set = new Set();
    (activeSession?.areas || []).forEach((area) => {
      (area.items || []).forEach((it) => {
        (it.scannedSerials || []).forEach((sn) => {
          if (sn) set.add(String(sn).trim().toLowerCase());
        });
      });
    });
    return set;
  }, [activeSession]);

  // Bangun daftar kandidat barang hilang/kurang
  const shortageCandidates = useMemo(() => {
    if (!activeSession) return [];

    const candidates = [];

    // Ambil data produk yang memiliki selisih negatif (shortage) atau belum ditemukan
    const sourceList = discrepancyItems.length > 0
      ? discrepancyItems.filter((it) => it.difference < 0 || it.status === 'not_found' || it.status === 'shortage')
      : (productSummary || []).filter((p) => (p.difference !== null && p.difference < 0) || (p.diff !== null && p.diff < 0));

    sourceList.forEach((item) => {
      const pId = item.productId || null;
      const sku = item.sku || '';
      const name = item.name || sku || 'Barang';
      const shortagePcs = Math.abs(item.difference ?? item.diff ?? 0);

      // Kumpulkan nomor seri yang terdaftar di database untuk produk ini
      let registeredSerials = [];
      if (pId && productSerialsMap?.has(pId)) {
        registeredSerials = (productSerialsMap.get(pId) || []).filter((s) => s.status === 'available');
      } else if (sku && productSerialsMap) {
        const skuToken = sku.toLowerCase();
        productSerialsMap.forEach((serials) => {
          serials.forEach((s) => {
            if (s.status === 'available' && s.serialNumber && s.serialNumber.toLowerCase().includes(skuToken)) {
              registeredSerials.push(s);
            }
          });
        });
      }

      // Filter nomor seri yang BELUM ter-scan di area manapun dan BUKAN nomor seri temuan Goods In SO sesi ini
      const missingSerials = registeredSerials.filter((s) => {
        const snClean = String(s.serialNumber || '').trim().toLowerCase();
        const isScanned = allScannedSerialsGlobal.has(snClean);
        const isFromSoGoodsIn = isSerialFromSoGoodsIn
          ? isSerialFromSoGoodsIn(s.serialNumber, s)
          : (soCreatedSerialsSet?.has(snClean) || (s.goodsInDocId && soGoodsInDocIds?.has(s.goodsInDocId)));
        return !isScanned && !isFromSoGoodsIn;
      });

      // Tentukan apakah barang berseri atau non-seri
      const isSerialProduct = missingSerials.length > 0;
      const nonSerialShortage = !isSerialProduct ? shortagePcs : 0;

      if (missingSerials.length > 0 || nonSerialShortage > 0) {
        candidates.push({
          productId: pId,
          sku,
          name,
          unit: item.unit || 'pcs',
          systemQty: item.systemQty ?? item.systemStock ?? 0,
          totalPhysical: item.totalPhysical ?? item.physicalQty ?? 0,
          shortagePcs,
          isSerialProduct,
          missingSerials: missingSerials.map((s) => ({
            serialNumber: s.serialNumber,
            unit: s.unit || 'pcs',
          })),
          nonSerialShortage,
        });
      }
    });

    return candidates;
  }, [activeSession, discrepancyItems, productSummary, productSerialsMap, allScannedSerialsGlobal]);

  // Inisialisasi seleksi awal saat modal dibuka atau shortageCandidates berubah
  React.useEffect(() => {
    if (isOpen) {
      const initialSelected = {};
      const initialExpanded = {};
      shortageCandidates.forEach((c) => {
        const key = c.sku || c.productId;
        if (!key) return;
        initialExpanded[key] = true;
        initialSelected[key] = {
          enabled: true,
          selectedSerials: new Set(c.missingSerials.map((s) => s.serialNumber)),
          nonSerialQty: c.nonSerialShortage,
          reason: defaultReason,
        };
      });
      setSelectedItems(initialSelected);
      setExpandedSkus(initialExpanded);
    }
  }, [isOpen, shortageCandidates]);

  // Filter pencarian
  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) return shortageCandidates;
    const q = searchQuery.toLowerCase().trim();
    return shortageCandidates.filter((c) => {
      const matchName = c.name?.toLowerCase().includes(q);
      const matchSku = c.sku?.toLowerCase().includes(q);
      const matchSerial = c.missingSerials.some((s) => s.serialNumber?.toLowerCase().includes(q));
      return matchName || matchSku || matchSerial;
    });
  }, [shortageCandidates, searchQuery]);

  // Hitung total terpilih
  const totalSummary = useMemo(() => {
    let totalItemsCount = 0;
    let totalSerialsCount = 0;
    let totalPcs = 0;

    shortageCandidates.forEach((c) => {
      const key = c.sku || c.productId;
      const sel = selectedItems[key];
      if (!sel || !sel.enabled) return;

      totalItemsCount++;
      if (c.isSerialProduct) {
        const count = sel.selectedSerials?.size || 0;
        totalSerialsCount += count;
        // Asumsi estimasi 1 SN mewakili unit pcs atau multiplier
        totalPcs += count;
      } else {
        totalPcs += Number(sel.nonSerialQty || 0);
      }
    });

    return { totalItemsCount, totalSerialsCount, totalPcs };
  }, [shortageCandidates, selectedItems]);

  const handleToggleItemEnabled = (key) => {
    setSelectedItems((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      return {
        ...prev,
        [key]: { ...cur, enabled: !cur.enabled },
      };
    });
  };

  const handleToggleSerial = (itemKey, serialNumber) => {
    setSelectedItems((prev) => {
      const cur = prev[itemKey];
      if (!cur) return prev;
      const nextSet = new Set(cur.selectedSerials);
      if (nextSet.has(serialNumber)) nextSet.delete(serialNumber);
      else nextSet.add(serialNumber);
      return {
        ...prev,
        [itemKey]: {
          ...cur,
          selectedSerials: nextSet,
          enabled: nextSet.size > 0,
        },
      };
    });
  };

  const handleSelectAllSerialsForItem = (itemKey, allSerials, selectAll = true) => {
    setSelectedItems((prev) => {
      const cur = prev[itemKey];
      if (!cur) return prev;
      const nextSet = selectAll ? new Set(allSerials.map((s) => s.serialNumber)) : new Set();
      return {
        ...prev,
        [itemKey]: {
          ...cur,
          selectedSerials: nextSet,
          enabled: selectAll,
        },
      };
    });
  };

  const handleToggleAllItems = (selectAll = true) => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      shortageCandidates.forEach((c) => {
        const key = c.sku || c.productId;
        if (!key || !next[key]) return;
        next[key] = {
          ...next[key],
          enabled: selectAll,
          selectedSerials: selectAll ? new Set(c.missingSerials.map((s) => s.serialNumber)) : new Set(),
        };
      });
      return next;
    });
  };

  const handleSubmit = async () => {
    if (isSafetyBlocked) {
      alert('Pemeriksaan fisik belum selesai di semua area. Centang konfirmasi bypass risiko jika tetap ingin melanjutkan.');
      return;
    }

    const payloadItems = [];

    shortageCandidates.forEach((c) => {
      const key = c.sku || c.productId;
      const sel = selectedItems[key];
      if (!sel || !sel.enabled) return;

      const serialNumbers = c.isSerialProduct ? Array.from(sel.selectedSerials || []) : [];
      const nonSerialQty = !c.isSerialProduct ? Number(sel.nonSerialQty || 0) : 0;

      if (serialNumbers.length === 0 && nonSerialQty === 0) return;

      payloadItems.push({
        productId: c.productId,
        sku: c.sku,
        name: c.name,
        unit: c.unit,
        serialNumbers,
        nonSerialQty,
        reason: sel.reason || defaultReason,
      });
    });

    if (payloadItems.length === 0) {
      alert('Pilih setidaknya 1 nomor seri atau kuantitas barang yang ingin dikeluarkan.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post(`/api/workspace/inventory/stock-opname/sessions/${activeSession.id}/write-off-missing`, {
        items: payloadItems,
        defaultReason,
        createGoodsOutDoc,
        notes,
        force: forceOverride,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || errJson?.message || 'Gagal memproses pengeluaran barang hilang.');
      }

      const resJson = await res.json();
      alert(resJson.message || 'Berhasil mengeluarkan barang & nomor seri hilang dari inventory.');
      if (onSuccess) onSuccess(resJson.data);
      onClose();
    } catch (err) {
      console.error('[WriteOffMissingModal] submit error:', err);
      alert(err.message || 'Terjadi kesalahan saat memproses pengeluaran barang.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1050 }}>
      <div
        className="modal-content so-writeoff-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '850px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius-lg, 12px)',
          padding: 0,
          overflow: 'hidden',
          background: 'var(--color-surface, #ffffff)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
        }}
      >
        {/* Header Modal */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(to right, #f8fafc, #ffffff)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Package size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                Keluarkan Barang & Serial Hilang (SO Write-Off)
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Sesi: <strong>{activeSession?.sessionNumber}</strong> &bull; Gudang: <strong>{activeWarehouse?.name || 'Gudang Terpilih'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Modal (Scrollable) */}
        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Safety Guard Warning jika ada area belum selesai */}
          {uncompletedAreas.length > 0 && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#b45309' }}>
                <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>
                    Peringatan: Masih ada {uncompletedAreas.length} Bagian/Area yang belum selesai diperiksa fisik!
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '3px', color: '#92400e' }}>
                    Area yang belum selesai: <strong>{uncompletedAreas.map((a) => a.areaName || a.name).join(', ')}</strong>.
                    Barang fisik mungkin masih berada di rak tersebut. Sebaiknya selesaikan pemeriksaan seluruh area terlebih dahulu.
                  </div>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#78350f', cursor: 'pointer', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  checked={forceOverride}
                  onChange={(e) => setForceOverride(e.target.checked)}
                />
                <span>Saya memahami risiko ini dan ingin tetap melanjutkan pengeluaran (Bypass Safety Guard)</span>
              </label>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '10px',
            }}
          >
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Total SKU Terindikasi Hilang</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                {shortageCandidates.length} Produk
              </div>
            </div>
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca' }}>
              <div style={{ fontSize: '11px', color: '#991b1b', fontWeight: 600 }}>Serial Terpilih untuk Dikeluarkan</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#dc2626', marginTop: '2px' }}>
                {totalSummary.totalSerialsCount} Serial
              </div>
            </div>
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 600 }}>Total Fisik Pengurangan Stok</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#2563eb', marginTop: '2px' }}>
                ~{totalSummary.totalPcs} pcs
              </div>
            </div>
          </div>

          {/* Alasan & Opsi Pembuatan Dokumen */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              background: '#f8fafc',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px', color: 'var(--color-text-main)' }}>
                Alasan Pengeluaran / Write-Off:
              </label>
              <select
                className="input input-sm"
                value={defaultReason}
                onChange={(e) => setDefaultReason(e.target.value)}
                style={{ width: '100%', fontSize: '12px' }}
              >
                <option value="missing_physical_so">Selisih Fisik Stock Opname / Tidak Ditemukan</option>
                <option value="damaged">Barang Rusak / Cacat Fisik</option>
                <option value="expired">Afkir / Kadaluarsa</option>
                <option value="adjustment">Penyesuaian Selisih Lainnya</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px', color: 'var(--color-text-main)' }}>
                Catatan Penyesuaian:
              </label>
              <input
                type="text"
                className="input input-sm"
                placeholder="Contoh: Hasil audit SO gudang blok M tuntas"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: '100%', fontSize: '12px' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1', marginTop: '2px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, color: 'var(--color-text-main)' }}>
                <input
                  type="checkbox"
                  checked={createGoodsOutDoc}
                  onChange={(e) => setCreateGoodsOutDoc(e.target.checked)}
                />
                <span>Terbitkan Dokumen Resmi Goods Out (Status Selesai / Completed)</span>
              </label>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '24px', marginTop: '2px' }}>
                Menghasilkan nomor bukti pengeluaran resmi (contoh: <code>GO/20261013/XXXX</code>) di modul Goods Out sebagai arsip pembukuan mutasi.
              </div>
            </div>
          </div>

          {/* Toolbar Seleksi & Pencarian */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => handleToggleAllItems(true)}
              >
                Pilih Semua Item
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs text-muted"
                onClick={() => handleToggleAllItems(false)}
              >
                Kosongkan Pilihan
              </button>
            </div>
            <div style={{ width: '220px' }}>
              <input
                type="text"
                className="input input-sm"
                placeholder="Cari SKU / Serial..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ fontSize: '12px', width: '100%' }}
              />
            </div>
          </div>

          {/* Daftar Barang & Serial Hilang */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredCandidates.length === 0 ? (
              <div
                style={{
                  padding: '30px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px dashed var(--color-border)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <CheckCircle2 size={32} style={{ color: '#10b981', margin: '0 auto 8px auto' }} />
                <div style={{ fontWeight: 600 }}>Tidak ada barang hilang yang terdeteksi!</div>
                <div style={{ fontSize: '12px', marginTop: '2px' }}>
                  Seluruh fisik cocok persis dengan data sistem gudang ini.
                </div>
              </div>
            ) : (
              filteredCandidates.map((cand) => {
                const key = cand.sku || cand.productId;
                const sel = selectedItems[key] || { enabled: false, selectedSerials: new Set(), nonSerialQty: 0 };
                const isExpanded = expandedSkus[key] ?? true;

                return (
                  <div
                    key={key}
                    style={{
                      border: sel.enabled ? '1px solid #fca5a5' : '1px solid var(--color-border)',
                      borderRadius: '8px',
                      background: sel.enabled ? 'rgba(254, 242, 242, 0.4)' : '#ffffff',
                      overflow: 'hidden',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {/* Item Card Header */}
                    <div
                      style={{
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: sel.enabled ? 'rgba(254, 242, 242, 0.7)' : '#f8fafc',
                        borderBottom: isExpanded ? '1px solid var(--color-border)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={sel.enabled}
                          onChange={() => handleToggleItemEnabled(key)}
                          style={{ cursor: 'pointer' }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-text-main)' }}>
                            {cand.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                            {cand.sku} &bull; Selisih Kurang: <strong className="text-danger">-{cand.shortagePcs} pcs</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {cand.isSerialProduct ? (
                          <span
                            className="so-badge"
                            style={{
                              background: sel.selectedSerials?.size > 0 ? '#fee2e2' : '#f1f5f9',
                              color: sel.selectedSerials?.size > 0 ? '#b91c1c' : '#64748b',
                              fontSize: '11px',
                              fontWeight: 600,
                            }}
                          >
                            {sel.selectedSerials?.size || 0} dari {cand.missingSerials.length} SN dipilih
                          </span>
                        ) : (
                          <span className="so-badge" style={{ background: '#fee2e2', color: '#b91c1c', fontSize: '11px' }}>
                            Non-Seri: -{cand.nonSerialShortage} pcs
                          </span>
                        )}

                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => setExpandedSkus((prev) => ({ ...prev, [key]: !isExpanded }))}
                          style={{ padding: '2px 4px' }}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Item Card Body */}
                    {isExpanded && (
                      <div style={{ padding: '12px 14px', background: '#ffffff' }}>
                        {cand.isSerialProduct ? (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                                Nomor seri yang terdaftar di sistem tapi TIDAK DITEMUKAN di rak manapun:
                              </span>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs"
                                  onClick={() => handleSelectAllSerialsForItem(key, cand.missingSerials, true)}
                                  style={{ fontSize: '10px', padding: '1px 6px' }}
                                >
                                  Pilih Semua SN
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs text-muted"
                                  onClick={() => handleSelectAllSerialsForItem(key, cand.missingSerials, false)}
                                  style={{ fontSize: '10px', padding: '1px 6px' }}
                                >
                                  Batal Pilih
                                </button>
                              </div>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '160px', overflowY: 'auto', padding: '4px 0' }}>
                              {cand.missingSerials.map((s) => {
                                const isChecked = sel.selectedSerials?.has(s.serialNumber);
                                return (
                                  <label
                                    key={s.serialNumber}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      padding: '4px 8px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontFamily: 'monospace',
                                      background: isChecked ? '#fee2e2' : '#f8fafc',
                                      border: isChecked ? '1px solid #f87171' : '1px solid #e2e8f0',
                                      color: isChecked ? '#991b1b' : '#64748b',
                                      cursor: 'pointer',
                                      userSelect: 'none',
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleToggleSerial(key, s.serialNumber)}
                                      style={{ cursor: 'pointer' }}
                                    />
                                    <span>{s.serialNumber}</span>
                                    {s.unit && s.unit !== 'pcs' && (
                                      <span style={{ fontSize: '9px', opacity: 0.8 }}>({s.unit})</span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                              Jumlah non-seri yang dikeluarkan:
                            </span>
                            <input
                              type="number"
                              min="1"
                              max={cand.shortagePcs}
                              className="input input-sm"
                              value={sel.nonSerialQty}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setSelectedItems((prev) => ({
                                  ...prev,
                                  [key]: { ...prev[key], nonSerialQty: val, enabled: val > 0 },
                                }));
                              }}
                              style={{ width: '90px', fontSize: '12px' }}
                            />
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>{cand.unit || 'pcs'}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer Modal */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--color-surface, #ffffff)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Total dikeluarkan: <strong style={{ color: '#dc2626' }}>{totalSummary.totalSerialsCount} Serial</strong> &bull; ~<strong style={{ color: '#2563eb' }}>{totalSummary.totalPcs} pcs</strong>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn btn-danger btn-md"
              onClick={handleSubmit}
              disabled={isSubmitting || totalSummary.totalPcs === 0 || isSafetyBlocked}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Memproses Pengeluaran...</span>
                </>
              ) : (
                <>
                  <Package size={16} />
                  <span>Keluarkan {totalSummary.totalSerialsCount} Serial ({totalSummary.totalPcs} pcs)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
