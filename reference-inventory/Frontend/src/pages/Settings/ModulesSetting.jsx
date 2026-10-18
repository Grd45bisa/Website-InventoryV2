import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, User, Building2, ToggleLeft, Sun, Moon, Trash2, Eye, EyeOff, Users, X, LayoutGrid, Globe, Lock, Save, RotateCcw, Info, Plus, ZoomIn, ZoomOut, Maximize2, Hash, Search, MoreHorizontal, Copy, Package, FileText, FileInput, FileOutput, BarChart3, History, Download } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api, getWorkspaceSettings } from '../../utils/api.js';
import { ConfirmModal } from '../../components/ConfirmModal/ConfirmModal.jsx';
import './ModulesSetting.css';

function getDefaultModules(t) {
  return [
    {
      id: 'documents',
      name: t('settings.modules.documents'),
      description: t('settings.modules.documentsDesc'),
      enabled: true,
      required: false,
      category: t('settings.modules.category.navigation'),
    },
    {
      id: 'inventory',
      name: t('settings.modules.inventory'),
      description: t('settings.modules.inventoryDesc'),
      enabled: true,
      required: false,
      category: t('settings.modules.category.navigation'),
    },
    {
      id: 'contacts',
      name: t('settings.modules.contacts'),
      description: t('settings.modules.contactsDesc'),
      enabled: true,
      required: false,
      category: t('settings.modules.category.navigation'),
    },
  ];
}

export default function ModulesSetting() {
  const { t, user } = useApp();
  const queryClient = useQueryClient();
  const role = user?.role?.toLowerCase();

  const { data: settings } = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: getWorkspaceSettings,
    staleTime: 5 * 60 * 1000,
  });

  const [localModules, setLocalModules] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const { data: usersData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await api.get('/api/auth/accounts');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: role === 'owner',
    staleTime: 60000,
  });

  const adminUsers = useMemo(() => {
    const list = Array.isArray(usersData) ? usersData : usersData?.data || [];
    return list.filter((u) => u.role === 'staff');
  }, [usersData]);

  // Filters (Super Admin only)
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  const [defaultPerms, setDefaultPerms] = useState({
    dashboard: true,
    documents: true,
    products: true,
    goodsIn: true,
    goodsOut: true,
    contacts: true,
    auditLog: true,
    canViewPrice: false,
    canExportProducts: false,
  });

  const [userPermsState, setUserPermsState] = useState({});
  const [expandedAdminId, setExpandedAdminId] = useState(null);

  const defaultModules = useMemo(() => getDefaultModules(t), [t]);

  // Load configuration
  useEffect(() => {
    if (settings) {
      if (role === 'owner') {
        const raw = settings.modules_owner || settings.modules || {};

        const hasRole = (moduleConfig) => {
          if (!moduleConfig) return true; // default allowed
          const roles = moduleConfig.roles ?? [];
          return roles.includes('staff');
        };

        const hasDocTypeRole = (typeKey) => {
          const docTypes = raw.documents?.documentTypes || {};
          const config = docTypes[typeKey];
          if (!config) return true;
          const roles = config.roles ?? [];
          return roles.includes('staff');
        };

        const currentDefaults = {
          dashboard: hasRole(raw.dashboard),
          documents: hasRole(raw.documents),
          products: hasRole(raw.products),
          goodsIn: hasDocTypeRole('goods_in'),
          goodsOut: hasDocTypeRole('goods_out'),
          contacts: hasRole(raw.contacts || raw.customers),
          auditLog: hasRole(raw.history),
          canEditDocs: raw.documents?.canEditDocs !== false,
          printPeriodLimit: raw.documents?.printPeriodLimit || 'all',
          canViewPrice: raw.products?.canViewPrice === true,
          canExportProducts: raw.products?.canExportProducts === true,
        };

        setDefaultPerms(currentDefaults);

        const currentStaffPerms = settings?.staff_permissions || settings?.admin_permissions || {};
        setUserPermsState(currentStaffPerms);
      } else {
        const raw = settings.modules;
        const byId = {};

        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          Object.entries(raw).forEach(([key, val]) => {
            byId[key] = val;
          });
        } else if (Array.isArray(raw)) {
          raw.forEach((module) => {
            if (module?.id) byId[module.id] = module;
          });
        }

        const contactsConfig = byId.contacts || byId.customers || byId.suppliers;
        const parsed = defaultModules.map((module) => {
          const config = module.id === 'contacts' ? contactsConfig : byId[module.id];
          return {
            ...module,
            enabled: config ? config.enabled !== false : module.enabled,
            required: config?.required === true,
          };
        });

        setLocalModules(parsed);
      }
    }
  }, [settings, defaultModules, role]);

  const categories = useMemo(() => {
    const cats = new Set(localModules.map((m) => m.category).filter(Boolean));
    return ['all', ...Array.from(cats)];
  }, [localModules]);

  const stats = useMemo(() => {
    return {
      total: localModules.length,
      enabled: localModules.filter((m) => m.enabled).length,
      disabled: localModules.filter((m) => !m.enabled).length,
      required: localModules.filter((m) => m.required).length,
    };
  }, [localModules]);

  const filteredModules = useMemo(() => {
    return localModules.filter((m) => {
      const matchesSearch =
        (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.description || '').toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        selectedCategory === 'all' || m.category === selectedCategory;
      const matchesActive = !showActiveOnly || m.enabled;
      return matchesSearch && matchesCategory && matchesActive;
    });
  }, [localModules, search, selectedCategory, showActiveOnly]);

  const groupedModules = useMemo(() => {
    const groups = {};
    filteredModules.forEach((m) => {
      const cat = m.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(m);
    });
    return groups;
  }, [filteredModules]);

  const handleToggle = (id) => {
    setLocalModules((prev) =>
      prev.map((m) => {
        if (m.id === id) {
          if (m.required) return m;
          return { ...m, enabled: !m.enabled };
        }
        return m;
      })
    );
  };

  const handleReset = () => {
    setLocalModules(defaultModules);
  };

  const toggleDefaultPermission = (key) => {
    setDefaultPerms((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSaveDefault = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const currentModules = settings?.modules || {};

      const updateRoles = (config, isAllowed) => {
        const base = config || { enabled: true, roles: ['owner'] };
        const roles = base.roles ?? ['owner'];
        const nextRoles = isAllowed
          ? Array.from(new Set([...roles, 'staff']))
          : roles.filter((r) => r !== 'staff');
        return {
          ...base,
          roles: nextRoles,
        };
      };

      const currentDocs = currentModules.documents || { enabled: true, roles: ['owner', 'staff'] };
      const updatedDocsBase = updateRoles(currentDocs, defaultPerms.documents);

      const currentDocTypes = currentDocs.documentTypes || {
        invoice: { label: t('settings.numbering.docType.invoice'), enabled: true, roles: ['owner', 'staff'] },
        goods_in: { label: t('settings.numbering.docType.goods_in'), enabled: true, roles: ['owner', 'staff'] },
        goods_out: { label: t('settings.numbering.docType.goods_out'), enabled: true, roles: ['owner', 'staff'] },
        delivery_note: { label: t('settings.numbering.docType.delivery_note'), enabled: true, roles: ['owner', 'staff'] },
        receipt: { label: t('settings.numbering.docType.receipt'), enabled: true, roles: ['owner', 'staff'] }
      };

      const updatedDocTypes = {
        ...currentDocTypes,
        goods_in: updateRoles(currentDocTypes.goods_in, defaultPerms.goodsIn),
        goods_out: updateRoles(currentDocTypes.goods_out, defaultPerms.goodsOut),
      };

      const updatedProducts = updateRoles(currentModules.products, defaultPerms.products);

      const modulesObject = {
        ...currentModules,
        dashboard: updateRoles(currentModules.dashboard, defaultPerms.dashboard),
        products: {
          ...updatedProducts,
          canViewPrice: defaultPerms.canViewPrice === true,
          canExportProducts: defaultPerms.canExportProducts === true,
        },
        contacts: updateRoles(currentModules.contacts || currentModules.customers, defaultPerms.contacts),
        history: updateRoles(currentModules.history, defaultPerms.auditLog),
        documents: {
          ...updatedDocsBase,
          documentTypes: updatedDocTypes,
          canEditDocs: defaultPerms.canEditDocs !== false,
          printPeriodLimit: defaultPerms.printPeriodLimit || 'all',
        }
      };

      const res = await api.patch(`/api/workspace/settings/modules_owner`, { value: modulesObject });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to save settings');
      }
      setMessage({ type: 'success', text: t('settings.modules.defaultPermSaved') });
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleApplyDefaultToAll = () => {
    const confirmMsg = t('settings.modules.confirmApplyAll');
    setConfirm({
      open: true,
      message: confirmMsg,
      confirmLabel: 'Ya, Terapkan',
      onConfirm: async () => {
        setConfirm(null);
        setSaving(true);
        setMessage(null);
        try {
          const updatedStaffPerms = {};
          adminUsers.forEach((u) => {
            updatedStaffPerms[u.id] = defaultPerms;
          });

          const res = await api.patch('/api/workspace/settings/staff_permissions', {
            value: updatedStaffPerms,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to update permissions');
          }

          setMessage({ type: 'success', text: t('settings.modules.applyAllSuccess') });
          queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
        } catch (err) {
          setMessage({ type: 'error', text: err.message });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const onCancelConfirm = () => setConfirm(null);

  const handleCancelDefault = () => {
    if (settings) {
      const raw = settings.modules_owner || settings.modules || {};

      const hasRole = (moduleConfig) => {
        if (!moduleConfig) return true;
        const roles = moduleConfig.roles ?? [];
        return roles.includes('staff');
      };

      const hasDocTypeRole = (typeKey) => {
        const docTypes = raw.documents?.documentTypes || {};
        const config = docTypes[typeKey];
        if (!config) return true;
        const roles = config.roles ?? [];
        return roles.includes('staff');
      };

      setDefaultPerms({
        dashboard: hasRole(raw.dashboard),
        documents: hasRole(raw.documents),
        products: hasRole(raw.products),
        goodsIn: hasDocTypeRole('goods_in'),
        goodsOut: hasDocTypeRole('goods_out'),
        contacts: hasRole(raw.contacts || raw.customers),
        auditLog: hasRole(raw.history),
        canEditDocs: raw.documents?.canEditDocs !== false,
        printPeriodLimit: raw.documents?.printPeriodLimit || 'all',
        canViewPrice: raw.products?.canViewPrice === true,
        canExportProducts: raw.products?.canExportProducts === true,
      });
      setMessage({ type: 'info', text: t('settings.modules.changesCancelled') });
    }
  };

  const toggleUserPermission = (userId, key) => {
    const userCurrentPerms = userPermsState[userId] || { ...defaultPerms };
    setUserPermsState((prev) => ({
      ...prev,
      [userId]: {
        ...userCurrentPerms,
        [key]: !userCurrentPerms[key],
      },
    }));
  };

  const handleSaveUserPermissions = async (userId) => {
    setSaving(true);
    setMessage(null);
    try {
      const targetPerms = userPermsState[userId] || { ...defaultPerms };
      const currentStaffPerms = settings?.staff_permissions || settings?.admin_permissions || {};
      const updatedStaffPerms = {
        ...currentStaffPerms,
        [userId]: targetPerms,
      };

      const res = await api.patch('/api/workspace/settings/staff_permissions', {
        value: updatedStaffPerms,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update user permissions');
      }

      setMessage({ type: 'success', text: t('settings.modules.adminPermUpdated') });
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
      setExpandedAdminId(null);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleResetUserToDefault = async (userId) => {
    setSaving(true);
    setMessage(null);
    try {
      const currentStaffPerms = { ...(settings?.staff_permissions || settings?.admin_permissions) };
      delete currentStaffPerms[userId];

      const res = await api.patch('/api/workspace/settings/staff_permissions', {
        value: currentStaffPerms,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update user permissions');
      }

      setMessage({ type: 'success', text: t('settings.modules.adminResetDefault') });
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
      setExpandedAdminId(null);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSuperAdmin = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      let modulesObject = {};
      localModules.forEach((m) => {
        modulesObject[m.id] = {
          name: m.name,
          label: m.name,
          description: m.description,
          enabled: m.enabled,
          required: m.required,
          category: m.category,
          roles: ['owner', 'staff'],
        };

        if (m.id === 'documents') {
          const inventoryEnabled = localModules.find(x => x.id === 'inventory')?.enabled !== false;
          modulesObject[m.id].documentTypes = {
            invoice: { label: t('settings.numbering.docType.invoice'), enabled: m.enabled, roles: ['owner', 'staff'] },
            goods_in: { label: t('settings.numbering.docType.goods_in'), enabled: m.enabled && inventoryEnabled, roles: ['owner', 'staff'] },
            goods_out: { label: t('settings.numbering.docType.goods_out'), enabled: m.enabled && inventoryEnabled, roles: ['owner', 'staff'] },
            delivery_note: { label: t('settings.numbering.docType.delivery_note'), enabled: m.enabled, roles: ['owner', 'staff'] },
            receipt: { label: t('settings.numbering.docType.receipt'), enabled: m.enabled, roles: ['owner', 'staff'] }
          };
        }
      });

      const inventoryModule = localModules.find(m => m.id === 'inventory');
      if (inventoryModule) {
        modulesObject['products'] = {
          label: t('settings.modules.products'),
          enabled: inventoryModule.enabled,
          roles: ['owner', 'staff']
        };
      }

      ['templates', 'history', 'settings'].forEach((key) => {
        if (!modulesObject[key]) {
          let roles = ['owner'];
          if (key === 'settings') {
            roles = ['owner', 'staff', 'super_admin'];
          } else if (key === 'history') {
            roles = ['owner', 'staff'];
          }
          modulesObject[key] = {
            label: key.charAt(0).toUpperCase() + key.slice(1),
            enabled: true,
            roles: roles
          };
        }
      });

      const res = await api.patch(`/api/workspace/settings/modules`, { value: modulesObject });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to save settings');
      }
      setMessage({ type: 'success', text: t('settings.modules.saveSuccess') });
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('settings.error.save') || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const getModuleIcon = (id) => {
    switch (id?.toLowerCase()) {
      case 'inventory': return <Package size={20} />;
      case 'documents': return <FileText size={20} />;
      case 'contacts': return <Users size={20} />;
      default: return <LayoutGrid size={20} />;
    }
  };

  if (role === 'owner') {
    const permissions = [
      { key: 'dashboard', label: t('settings.modules.perm.dashboard'), icon: <LayoutGrid size={18} /> },
      { key: 'documents', label: t('settings.modules.perm.documents'), icon: <FileText size={18} /> },
      { key: 'products', label: t('settings.modules.perm.products'), icon: <Package size={18} /> },
      { key: 'goodsIn', label: t('settings.modules.perm.goodsIn'), icon: <FileInput size={18} /> },
      { key: 'goodsOut', label: t('settings.modules.perm.goodsOut'), icon: <FileOutput size={18} /> },
      { key: 'contacts', label: t('settings.modules.perm.contacts'), icon: <Users size={18} /> },
      { key: 'auditLog', label: t('settings.modules.perm.auditLog'), icon: <History size={18} /> },
      { key: 'canViewPrice', label: t('settings.modules.perm.canViewPrice') || 'Lihat Harga Produk', icon: <BarChart3 size={18} />, isFeature: true, featureDesc: 'Default: nonaktif (staff tidak bisa lihat harga)', userDesc: 'Izinkan staff melihat & mengubah harga' },
      { key: 'canExportProducts', label: t('settings.modules.perm.canExportProducts') || 'Ekspor Data Produk', icon: <Download size={18} />, isFeature: true, featureDesc: 'Di dev mode otomatis aktif; di mode build/produksi butuh izin owner ini.', userDesc: 'Izinkan staff mengekspor data produk & serial di versi build/produksi' },
    ];

    return (
      <>
      <div className="settings-form modules-tab">
        {/* Header Row */}
        <div className="settings-form__header-row" style={{ marginBottom: 'var(--space-4)' }}>
          <div>
            <h2 className="settings-form__title">{t('settings.modules.adminPermissions')}</h2>
            <p className="settings-form__desc">{t('settings.modules.adminPermissionsDesc')}</p>
          </div>
        </div>

        {/* Inline Feedback Messages */}
        {message && (
          <div className={`settings-message settings-message--${message.type}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <span>{message.text}</span>
            <button type="button" className="settings-message__close" onClick={() => setMessage(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* SECTION 1: DEFAULT SETTINGS */}
        <div className="settings-section-card" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-text-primary)', margin: 0 }}>{t('settings.modules.defaultPermTitle')}</h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 'var(--space-1) 0 0 0' }}>{t('settings.modules.defaultPermDesc')}</p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button type="button" className="btn btn-secondary" onClick={handleCancelDefault} disabled={saving} style={{ fontSize: '12px', padding: 'var(--space-1.5) var(--space-3)' }}>
                {t('settings.modules.cancel')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleApplyDefaultToAll} disabled={saving} style={{ fontSize: '12px', padding: 'var(--space-1.5) var(--space-3)' }}>
                {t('settings.modules.applyToAll')}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveDefault} disabled={saving} style={{ fontSize: '12px', padding: 'var(--space-1.5) var(--space-3)' }}>
                {saving ? t('settings.saving') : t('settings.modules.saveDefault')}
              </button>
            </div>
          </div>

          <div className="admin-perms-grid">
            {permissions.map((perm) => (
              <div key={perm.key} className={`admin-perm-card ${perm.isFeature ? 'admin-perm-card--feature' : ''}`}>
                <div className="admin-perm-card__left">
                  <div className="admin-perm-card__icon-wrap">
                    {perm.icon}
                  </div>
                  <div className="admin-perm-card__info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span className="admin-perm-card__label">{perm.label}</span>
                      {perm.isFeature && (
                        <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', background: 'var(--color-primary-surface, rgba(99,102,241,0.12))', color: 'var(--color-primary)' }}>FITUR</span>
                      )}
                    </div>
                    {perm.isFeature && (
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px', display: 'block' }}>{perm.featureDesc || 'Default: nonaktif'}</span>
                    )}
                  </div>
                </div>
                <div className="admin-perm-card__actions">
                  <button
                    type="button"
                    className={`settings-toggle ${defaultPerms[perm.key] ? 'settings-toggle--on' : ''}`}
                    onClick={() => toggleDefaultPermission(perm.key)}
                    role="switch"
                    aria-checked={defaultPerms[perm.key]}
                  >
                    <span className="settings-toggle__knob" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {defaultPerms.documents && (
            <div style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: '480px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Info size={16} style={{ color: 'var(--color-primary)' }} />
                <strong style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{t('settings.modules.docExtra.title')}</strong>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
                <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 'var(--space-1.5)' }}>
                                      <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)' }}>{t('settings.modules.docExtra.editLabel')}</span>
                  <select
                    className="input select"
                    style={{ fontSize: '12px', height: '32px' }}
                    value={defaultPerms.canEditDocs !== false ? 'edit' : 'view_print'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDefaultPerms(prev => ({
                        ...prev,
                        canEditDocs: val === 'edit'
                      }));
                    }}
                  >
                    <option value="edit">{t('settings.modules.docExtra.editAll')}</option>
                    <option value="view_print">{t('settings.modules.docExtra.viewPrint')}</option>
                  </select>
                </div>

                {defaultPerms.canEditDocs === false && (
                  <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 'var(--space-1.5)' }}>
                                        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)' }}>{t('settings.modules.docExtra.printPeriodLabel')}</span>
                    <select
                      className="input select"
                      style={{ fontSize: '12px', height: '32px' }}
                      value={defaultPerms.printPeriodLimit || 'all'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDefaultPerms(prev => ({
                          ...prev,
                          printPeriodLimit: val
                        }));
                      }}
                    >
                      <option value="all">{t('settings.modules.docExtra.allDays')}</option>
                      <option value="today">{t('settings.modules.docExtra.today')}</option>
                      <option value="week">{t('settings.modules.docExtra.last7Days')}</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: ADMIN MEMBER PERMISSIONS TABLE */}
        <div className="settings-section-card" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-text-primary)', margin: '0 0 var(--space-1) 0' }}>{t('settings.modules.adminListTitle')}</h3>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '0 0 var(--space-4) 0' }}>{t('settings.modules.adminListDesc')}</p>

          {adminUsers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>
              <Users size={36} style={{ marginBottom: 'var(--space-2)', opacity: 0.5 }} />
              <p style={{ fontSize: '13px', margin: 0 }}>{t('settings.modules.adminListEmpty')}</p>
            </div>
          ) : (
            <div className="settings-users-table-container" style={{ border: '1px solid var(--color-border-subtle)' }}>
              <table className="settings-table users-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-alt)' }}>
                    <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)' }}>{t('settings.modules.adminTable.name')}</th>
                    <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)' }}>{t('settings.modules.adminTable.email')}</th>
                    <th style={{ textAlign: 'center', padding: 'var(--space-3) var(--space-4)' }}>{t('settings.modules.adminTable.permType')}</th>
                    <th style={{ textAlign: 'right', padding: 'var(--space-3) var(--space-4)' }}>{t('settings.modules.adminTable.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((u, i) => {
                    const isExpanded = expandedAdminId === u.id;
                    const hasCustomPerms = !!(settings?.staff_permissions?.[u.id] || settings?.admin_permissions?.[u.id]);
                    const userPerms = userPermsState[u.id] || { ...defaultPerms };

                    return (
                      <React.Fragment key={u.id}>
                        {/* Member Row */}
                        <tr
                          onClick={() => setExpandedAdminId(isExpanded ? null : u.id)}
                          style={{ cursor: 'pointer', borderBottom: '1px solid var(--color-border-subtle)', background: isExpanded ? 'var(--color-surface-alt)' : 'transparent' }}
                        >
                          <td style={{ padding: 'var(--space-4)' }}>
                            <div className="user-cell">
                              <span className={`user-avatar user-avatar--${i % 5}`} style={{ width: '28px', height: '28px', minWidth: '28px', fontSize: '10px' }}>
                                {u.fullName ? u.fullName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : u.email.slice(0, 2).toUpperCase()}
                              </span>
                              <span style={{ fontWeight: '600', fontSize: '13px', color: 'var(--color-text-primary)' }}>{u.fullName || '-'}</span>
                            </div>
                          </td>
                          <td style={{ padding: 'var(--space-4)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{u.email}</td>
                          <td style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                fontSize: '11px',
                                fontWeight: '600',
                                padding: '2px 8px',
                                borderRadius: 'var(--radius-full)',
                                background: hasCustomPerms ? 'var(--color-warning-surface)' : 'var(--color-success-surface)',
                                color: hasCustomPerms ? 'var(--color-warning)' : 'var(--color-success)'
                              }}
                            >
                              {hasCustomPerms ? t('settings.modules.permType.custom') : t('settings.modules.permType.default')}
                            </span>
                          </td>
                          <td style={{ padding: 'var(--space-4)', textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ fontSize: '11px', padding: '4px 10px' }}
                            >
                              {isExpanded ? t('settings.modules.close') : t('settings.modules.editPerm')}
                            </button>
                          </td>
                        </tr>

                        {/* Collapsible Expanded Permissions Panel */}
                        {isExpanded && (
                          <tr>
                            <td colSpan="4" style={{ padding: 'var(--space-5)', background: 'var(--color-surface-alt)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                                <div>
                                  <strong style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{t('settings.modules.specialPermTitle', { name: u.fullName || u.email })}</strong>
                                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>{t('settings.modules.specialPermDesc')}</p>
                                </div>
                                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                  {hasCustomPerms && (
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      onClick={() => handleResetUserToDefault(u.id)}
                                      disabled={saving}
                                      style={{ fontSize: '11px', padding: '4px 10px', background: 'var(--color-danger-surface)', color: 'var(--color-danger)', border: 'none' }}
                                    >
                                      {t('settings.modules.useDefault')}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setExpandedAdminId(null)}
                                    disabled={saving}
                                    style={{ fontSize: '11px', padding: '4px 10px' }}
                                  >
                                    {t('settings.modules.cancel')}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => handleSaveUserPermissions(u.id)}
                                    disabled={saving}
                                    style={{ fontSize: '11px', padding: '4px 10px' }}
                                  >
                                    {saving ? t('settings.saving') : t('settings.modules.savePerm')}
                                  </button>
                                </div>
                              </div>

                              <div className="admin-perms-grid">
                                {permissions.map((perm) => (
                                  <div key={perm.key} className={`admin-perm-card ${perm.isFeature ? 'admin-perm-card--feature' : ''}`} style={{ background: 'var(--color-surface)' }}>
                                    <div className="admin-perm-card__left">
                                      <div className="admin-perm-card__icon-wrap">
                                        {perm.icon}
                                      </div>
                                      <div className="admin-perm-card__info">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                          <span className="admin-perm-card__label">{perm.label}</span>
                                          {perm.isFeature && (
                                            <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', background: 'var(--color-primary-surface, rgba(99,102,241,0.12))', color: 'var(--color-primary)' }}>FITUR</span>
                                          )}
                                        </div>
                                        {perm.isFeature && (
                                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px', display: 'block' }}>{perm.userDesc || 'Fitur khusus staf'}</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="admin-perm-card__actions">
                                      <button
                                        type="button"
                                        className={`settings-toggle ${userPerms[perm.key] ? 'settings-toggle--on' : ''}`}
                                        onClick={() => toggleUserPermission(u.id, perm.key)}
                                        role="switch"
                                        aria-checked={userPerms[perm.key]}
                                      >
                                        <span className="settings-toggle__knob" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {userPerms.documents && (
                                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: '480px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                    <Info size={16} style={{ color: 'var(--color-primary)' }} />
                                    <strong style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{t('settings.modules.docExtra.userTitle', { name: u.fullName || u.email })}</strong>
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
                                    <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 'var(--space-1.5)' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)' }}>{t('settings.modules.docExtra.editLabel')}</span>
                                      <select
                                        className="input select"
                                        style={{ fontSize: '12px', height: '32px' }}
                                        value={userPerms.canEditDocs !== false ? 'edit' : 'view_print'}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setUserPermsState(prev => ({
                                            ...prev,
                                            [u.id]: {
                                              ...userPerms,
                                              canEditDocs: val === 'edit'
                                            }
                                          }));
                                        }}
                                      >
                                        <option value="edit">{t('settings.modules.docExtra.editAll')}</option>
                                        <option value="view_print">{t('settings.modules.docExtra.viewPrint')}</option>
                                      </select>
                                    </div>

                                    {userPerms.canEditDocs === false && (
                                      <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 'var(--space-1.5)' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)' }}>{t('settings.modules.docExtra.printPeriodLabel')}</span>
                                        <select
                                          className="input select"
                                          style={{ fontSize: '12px', height: '32px' }}
                                          value={userPerms.printPeriodLimit || 'all'}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setUserPermsState(prev => ({
                                              ...prev,
                                              [u.id]: {
                                                ...userPerms,
                                                printPeriodLimit: val
                                              }
                                            }));
                                          }}
                                        >
                                          <option value="all">{t('settings.modules.docExtra.allDays')}</option>
                                          <option value="today">{t('settings.modules.docExtra.today')}</option>
                                          <option value="week">{t('settings.modules.docExtra.last7Days')}</option>
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirm?.open}
        title={confirm?.title || 'Konfirmasi'}
        message={confirm?.message || ''}
        confirmLabel={confirm?.confirmLabel}
        cancelLabel={confirm?.cancelLabel}
        onConfirm={confirm?.onConfirm || (() => {})}
        onCancel={onCancelConfirm}
      />
    </>
    );
  }

  return (
    <form className="settings-form modules-tab" onSubmit={handleSaveSuperAdmin}>
      <div className="settings-form__header-row">
        <div>
          <h2 className="settings-form__title">{t('settings.modules.title')}</h2>
          <p className="settings-form__desc">{t('settings.modules.subtitle')}</p>
        </div>
        <div className="settings-form__actions-row" style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn-secondary" type="button" onClick={handleReset}>
            <RotateCcw size={16} />
            <span>{t('settings.modules.reset')}</span>
          </button>
          <button className="btn btn-primary btn-save" type="submit" disabled={saving}>
            <Save size={16} />
            <span>{saving ? t('settings.saving') : t('settings.save')}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`settings-message settings-message--${message.type}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{message.text}</span>
          <button type="button" className="settings-message__close" onClick={() => setMessage(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Summary Statistics */}
      <div className="modules-stats">
        <div className="modules-stat-card">
          <span className="modules-stat-label">{t('settings.modules.stat.total')}</span>
          <span className="modules-stat-value">{stats.total}</span>
        </div>
        <div className="modules-stat-card">
          <span className="modules-stat-label">{t('settings.modules.stat.active')}</span>
          <span className="modules-stat-value modules-stat-value--active">{stats.enabled}</span>
        </div>
        <div className="modules-stat-card">
          <span className="modules-stat-label">{t('settings.modules.stat.disabled')}</span>
          <span className="modules-stat-value">{stats.disabled}</span>
        </div>
        <div className="modules-stat-card">
          <span className="modules-stat-label">{t('settings.modules.stat.required')}</span>
          <span className="modules-stat-value">{stats.required}</span>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="modules-toolbar">
        <div className="modules-toolbar__left">
          <div className="modules-toolbar__search-wrap">
            <Search size={14} className="modules-toolbar__search-icon" />
            <input
              type="text"
              className="input modules-toolbar__search"
              placeholder={t('settings.modules.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input modules-toolbar__select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="all">{t('settings.modules.allCategories')}</option>
            {categories.filter(c => c !== 'all').map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <label className="modules-toolbar__toggle">
          <input
            type="checkbox"
            checked={showActiveOnly}
            onChange={(e) => setShowActiveOnly(e.target.checked)}
          />
          <span>{t('settings.modules.showActiveOnly')}</span>
        </label>
      </div>

      {/* Modules List categorized */}
      {filteredModules.length === 0 ? (
        <div className="modules-empty">
          <div className="modules-empty__icon-wrap">
            <LayoutGrid size={24} />
          </div>
          <h3 className="modules-empty__title">{t('settings.modules.emptyTitle')}</h3>
          <p className="modules-empty__desc">{t('settings.modules.emptyDesc')}</p>
        </div>
      ) : (
        Object.entries(groupedModules).map(([category, list]) => (
          <div key={category} className="modules-category">
            <h3 className="modules-category__title">{category}</h3>
            <div className="modules-grid">
              {list.map((m) => (
                <div key={m.id} className="module-card">
                  <div className="module-card__icon-wrap">
                    {getModuleIcon(m.id)}
                  </div>
                  <div className="module-card__info">
                    <div className="module-card__name-row">
                      <span className="module-card__name">{m.name}</span>
                    </div>
                    <span className="module-card__desc">{m.description}</span>
                  </div>
                  <div className="module-card__badges">
                    {m.required && <span className="module-badge module-badge--wajib">{t('settings.modules.required')}</span>}
                    <span className={`module-badge ${m.enabled ? 'module-badge--aktif' : 'module-badge--nonaktif'}`}>
                      {m.enabled ? t('settings.modules.active') : t('settings.modules.disabled')}
                    </span>
                  </div>
                  <div className="module-card__actions">
                    <button type="button" className="module-card__btn" title={t('settings.modules.info')}>
                      <Info size={14} />
                    </button>
                    <div className="module-card__toggle-wrap">
                      {m.required ? (
                        <>
                          <Lock size={14} className="module-lock-icon" />
                          <button
                            type="button"
                            className="settings-toggle settings-toggle--on"
                            disabled
                            role="switch"
                            aria-checked={true}
                            style={{ opacity: 0.6, cursor: 'not-allowed' }}
                          >
                            <span className="settings-toggle__knob" style={{ transform: 'translateX(20px)' }} />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={`settings-toggle ${m.enabled ? 'settings-toggle--on' : ''}`}
                          onClick={() => handleToggle(m.id)}
                          role="switch"
                          aria-checked={m.enabled}
                        >
                          <span className="settings-toggle__knob" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </form>
  );
}
