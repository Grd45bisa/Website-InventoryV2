import { supabaseAdmin } from '../lib/supabase.js';
import { httpError } from '../utils/httpError.js';

const TENANT_CACHE = new Map();
const TENANT_CACHE_TTL_MS = 20_000; // 20 seconds

export function invalidateTenantCache(userId) {
  if (!userId) {
    TENANT_CACHE.clear();
    return;
  }
  for (const key of TENANT_CACHE.keys()) {
    if (key.startsWith(`${userId}:`)) {
      TENANT_CACHE.delete(key);
    }
  }
}

export async function loadTenant(req, _res, next) {
  try {
    if (!req.auth || !req.auth.user) {
      throw httpError(401, 'Unauthorized');
    }

    const requestedWarehouseId = req.headers['x-warehouse-id'];
    const cacheKey = `${req.auth.user.id}:${requestedWarehouseId || 'none'}`;
    const cachedTenant = TENANT_CACHE.get(cacheKey);

    let profile;
    let effectiveRole;
    let activeWarehouseId;

    if (cachedTenant && Date.now() - cachedTenant.cachedAt < TENANT_CACHE_TTL_MS) {
      profile = cachedTenant.profile;
      effectiveRole = cachedTenant.effectiveRole;
      activeWarehouseId = cachedTenant.activeWarehouseId;
      req.auth.role = effectiveRole;
      req.auth.ownerId = profile.owner_id;
      req.auth.warehouseId = activeWarehouseId;
    } else {
      const { data: dbProfile, error } = await supabaseAdmin
        .from('profiles')
        .select('id, role, owner_id, status, warehouse_id')
        .eq('id', req.auth.user.id)
        .maybeSingle();

      if (error) throw httpError(500, 'Failed to load user profile', error.message);
      if (!dbProfile) throw httpError(401, 'User profile not found');
      if (dbProfile.status === 'disabled') throw httpError(403, 'Access denied: Your account has been disabled.');

      // Keep legacy accounts usable even if the database migration has not yet
      // updated their old role value in every environment.
      effectiveRole = dbProfile.role === 'admin' ? 'staff' : dbProfile.role;
      profile = dbProfile;
      req.auth.role = effectiveRole;
      req.auth.ownerId = profile.owner_id;

      // Resolve active warehouse
      activeWarehouseId = null;

      if (effectiveRole === 'owner' || effectiveRole === 'super_admin') {
        if (requestedWarehouseId) {
          let query = supabaseAdmin
            .from('warehouses')
            .select('id')
            .eq('id', requestedWarehouseId)
            .eq('status', 'active')
            .eq('owner_id', profile.owner_id);
          const { data: wh } = await query.maybeSingle();
          if (wh) {
            activeWarehouseId = wh.id;
          }
        }
        if (!activeWarehouseId) {
          let query = supabaseAdmin
            .from('warehouses')
            .select('id')
            .eq('status', 'active')
            .eq('owner_id', profile.owner_id);
          const { data: defWh } = await query.order('is_default', { ascending: false }).limit(1).maybeSingle();
          activeWarehouseId = defWh?.id ?? null;
        }
      } else {
        // Older staff accounts predate warehouse assignment and can have a null,
        // archived, or foreign warehouse_id. Resolve the owner's active default
        // warehouse and self-heal the profile instead of leaving the account unusable.
        if (profile.warehouse_id) {
          const { data: assignedWarehouse } = await supabaseAdmin
            .from('warehouses')
            .select('id')
            .eq('id', profile.warehouse_id)
            .eq('owner_id', profile.owner_id)
            .eq('status', 'active')
            .maybeSingle();
          activeWarehouseId = assignedWarehouse?.id ?? null;
        }

        if (!activeWarehouseId) {
          const { data: fallbackWarehouse } = await supabaseAdmin
            .from('warehouses')
            .select('id')
            .eq('owner_id', profile.owner_id)
            .eq('status', 'active')
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          activeWarehouseId = fallbackWarehouse?.id ?? null;
          if (activeWarehouseId) {
            await supabaseAdmin
              .from('profiles')
              .update({ warehouse_id: activeWarehouseId })
              .eq('id', profile.id);
          }
        }
      }

      req.auth.warehouseId = activeWarehouseId;

      TENANT_CACHE.set(cacheKey, {
        profile,
        effectiveRole,
        activeWarehouseId,
        cachedAt: Date.now(),
      });
    }

    if (effectiveRole !== 'super_admin') {
      const path = req.path;
      let targetModule = null;

      if (path.startsWith('/products')) targetModule = 'products';
      else if (path.startsWith('/inventory')) targetModule = 'inventory';
      else if (path.startsWith('/contacts')) targetModule = 'contacts';
      else if (path.startsWith('/templates')) targetModule = 'templates';
      else if (path.startsWith('/history')) targetModule = 'history';
      else if (path.startsWith('/settings')) targetModule = 'settings';
      else if (path.startsWith('/documents')) targetModule = 'documents';
      else if (path.startsWith('/purchase-orders')) targetModule = 'purchase-orders';
      else if (path.startsWith('/sales-dashboard')) targetModule = 'sales-dashboard';
      else if (path.startsWith('/dashboard')) targetModule = 'dashboard';

      // Role sales_person hanya boleh akses purchase-orders, contacts, sales-dashboard, dan settings (GET).
      // Modul lain (products, inventory, documents, history, dll) diblokir tegas.
      if (effectiveRole === 'sales_person') {
        const isAllowedSettings = targetModule === 'settings' && req.method === 'GET';
        const isAllowedContacts = targetModule === 'contacts';
        const isAllowedPO = targetModule === 'purchase-orders';
        const isAllowedSalesDashboard = targetModule === 'sales-dashboard';

        if (targetModule && !isAllowedPO && !isAllowedContacts && !isAllowedSettings && !isAllowedSalesDashboard) {
          throw httpError(403, 'Access denied: Sales Person role does not have access to this module.');
        }
      }

      if (targetModule) {
        // Always allow GET requests to /settings so workspace members can load configurations/permissions
        if (targetModule === 'settings' && req.method === 'GET') {
          // Bypassed
        } else {
          // Load workspace settings
          const { data, error } = await supabaseAdmin
            .from('workspace_settings')
            .select('value')
            .eq('owner_id', profile.owner_id)
            .eq('key', 'modules_owner')
            .maybeSingle();

          let modulesSetting = data;
          if (!modulesSetting) {
            const { data: defaultData } = await supabaseAdmin
              .from('workspace_settings')
              .select('value')
              .eq('owner_id', profile.owner_id)
              .eq('key', 'modules')
              .maybeSingle();
            modulesSetting = defaultData;
          }

          if (modulesSetting?.value) {
            const config = modulesSetting.value[targetModule];
            if (config) {
              const isEnabled = config.enabled !== false;
              const allowedRoles = config.roles ?? [];
              const isRoleAllowed =
                allowedRoles.includes(effectiveRole) ||
                effectiveRole === 'staff' ||
                effectiveRole === 'owner' ||
                (effectiveRole === 'sales_person' && (targetModule === 'contacts' || targetModule === 'purchase-orders' || targetModule === 'sales-dashboard'));

              if (!isEnabled || !isRoleAllowed) {
                throw httpError(403, `Access denied: This module is disabled or restricted in this workspace.`);
              }

              // If it's the documents module, also check the specific documentType
              if (targetModule === 'documents') {
                let requestedType = req.body?.documentType ?? req.query?.type;

                // If type is not in body/query, check if accessing a specific document by UUID
                const docIdMatch = path.match(/^\/documents\/([0-9a-fA-F-]{36})/);
                if (!requestedType && docIdMatch) {
                  const docId = docIdMatch[1];
                  const { data: doc, error: docError } = await supabaseAdmin
                    .from('documents')
                    .select('document_type')
                    .eq('id', docId)
                    .eq('owner_id', req.auth.ownerId)
                    .maybeSingle();

                  if (!docError && doc) {
                    requestedType = doc.document_type;
                  }
                }

                if (requestedType) {
                  const configKey = requestedType.toLowerCase().replace(/[\s-]/g, '_');
                  const typeConfig = config.documentTypes?.[configKey];
                  if (typeConfig) {
                    const typeAllowedRoles = typeConfig.roles ?? [];
                    if (typeConfig.enabled === false || (!typeAllowedRoles.includes(effectiveRole) && effectiveRole !== 'staff')) {
                      throw httpError(403, `Access denied: This document type is disabled or restricted in this workspace.`);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}
