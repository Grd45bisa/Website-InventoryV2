import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { httpError } from '../utils/httpError.js';

const router = Router();

const normalizeAccountRole = (role) => role === 'admin' ? 'staff' : role;

const rateLimitMap = new Map();
function rateLimit(ms, maxReqs) {
    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        if (!rateLimitMap.has(ip)) {
            rateLimitMap.set(ip, []);
        }
        const timestamps = rateLimitMap.get(ip).filter(t => now - t < ms);
        if (timestamps.length >= maxReqs) {
            return res.status(429).json({ error: { message: 'Too many requests. Please try again later.' } });
        }
        timestamps.push(now);
        rateLimitMap.set(ip, timestamps);
        next();
    };
}

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const signUpSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().max(50).optional().nullable(),
  password: z.string().min(6).optional(),
  language: z.string().trim().max(50).optional().nullable(),
  theme: z.string().trim().max(50).optional().nullable(),
  palette: z.string().trim().max(50).optional().nullable(),
  darkness: z.string().trim().max(50).optional().nullable(),
});

const accountCreateSchema = z.object({
  fullName: z.string().trim().min(1).max(255),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(50).optional().nullable(),
  role: z.enum(['super_admin', 'owner', 'staff', 'sales_person']),
  ownerId: z.preprocess(
    (val) => (!val || val === '' || val === 'null' ? null : val),
    z.string().uuid().nullable().optional()
  ),
  warehouseId: z.preprocess(
    (val) => (!val || val === '' || val === 'null' ? null : val),
    z.string().uuid().nullable().optional()
  ),
  password: z.string().min(6),
  status: z.enum(['active', 'disabled']).optional(),
});

function publicUser(user, profile = null) {
  const storedRole = profile?.role ?? user.user_metadata?.role ?? null;
  return {
    id: user.id,
    email: user.email,
    fullName: profile?.full_name ?? user.user_metadata?.full_name ?? null,
    phone: profile?.phone ?? user.user_metadata?.phone ?? null,
    role: normalizeAccountRole(storedRole),
    status: profile?.status ?? 'active',
    ownerId: profile?.owner_id ?? user.user_metadata?.owner_id ?? null,
    warehouseId: profile?.warehouse_id ?? user.user_metadata?.warehouse_id ?? null,
    language: user.user_metadata?.language ?? null,
    theme: user.user_metadata?.theme ?? null,
    palette: user.user_metadata?.palette ?? null,
    darkness: user.user_metadata?.darkness ?? null,
  };
}

// Minimal profile payload for the login/session-verification response.
// Only the fields required to establish identity + active warehouse are
// returned here; richer preference data (theme/lang/palette) is fetched
// separately via GET /api/auth/me once the app has mounted.
function loginUser(user, profile = null) {
  const storedRole = profile?.role ?? user.user_metadata?.role ?? null;
  return {
    id: user.id,
    email: user.email,
    full_name: profile?.full_name ?? user.user_metadata?.full_name ?? null,
    role: normalizeAccountRole(storedRole),
    status: profile?.status ?? 'active',
    owner_id: profile?.owner_id ?? user.user_metadata?.owner_id ?? null,
    warehouse_id: profile?.warehouse_id ?? user.user_metadata?.warehouse_id ?? null,
  };
}

async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, phone, role, status, owner_id, warehouse_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw httpError(500, 'Failed to load user profile', error.message);
  return data ? { ...data, role: normalizeAccountRole(data.role) } : data;
}

router.post('/login', rateLimit(60000, 10), async (req, res, next) => {
  try {
    const payload = signInSchema.parse(req.body);
    const { data, error } = await supabase.auth.signInWithPassword(payload);

    if (error || !data.session || !data.user) {
      return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Email atau kata sandi salah.' });
    }

    const profile = await getProfile(data.user.id);
    if (profile?.status === 'disabled') {
      throw httpError(403, 'User account is disabled');
    }

    res.json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: loginUser(data.user, profile),
    });
  } catch (error) {
    if (error.status === 401) {
      return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Email atau kata sandi salah.' });
    }
    next(error);
  }
});

router.post('/register', rateLimit(60000, 5), async (req, res, next) => {
  try {
    const payload = signUpSchema.parse(req.body);
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          full_name: payload.name,
          role: 'owner',
        },
      },
    });

    if (error) {
      if (error.status === 409 || error.message?.includes('already') || error.message?.includes('conflict')) {
        return res.status(409).json({ code: 'EMAIL_TAKEN', message: 'Email sudah digunakan. Coba masuk.' });
      }
      throw error;
    }

    if (!data.user) {
      throw httpError(400, 'Registration failed');
    }

    // Load created profile
    const profile = await getProfile(data.user.id);

    res.status(201).json({
      token: data.session?.access_token || null,
      refreshToken: data.session?.refresh_token || null,
      user: publicUser(data.user, profile),
    });
  } catch (error) {
    if (error.status === 409 || error.message?.includes('already') || error.message?.includes('conflict')) {
      return res.status(409).json({ code: 'EMAIL_TAKEN', message: 'Email sudah digunakan. Coba masuk.' });
    }
    next(error);
  }
});

router.post('/sign-in', rateLimit(60000, 10), async (req, res, next) => {
  try {
    const payload = signInSchema.parse(req.body);
    const { data, error } = await supabase.auth.signInWithPassword(payload);

    if (error || !data.session || !data.user) {
      throw httpError(401, 'Invalid email or password');
    }

    const profile = await getProfile(data.user.id);
    if (profile?.status === 'disabled') {
      throw httpError(403, 'User account is disabled');
    }

    res.json({
      user: loginUser(data.user, profile),
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        tokenType: data.session.token_type,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', rateLimit(60000, 10), async (req, res, next) => {
  try {
    const payload = refreshSchema.parse(req.body);
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: payload.refreshToken,
    });

    if (error || !data.session || !data.user) {
      throw httpError(401, 'Session refresh failed');
    }

    const profile = await getProfile(data.user.id);
    if (profile?.status === 'disabled') {
      throw httpError(403, 'User account is disabled');
    }

    res.json({
      user: loginUser(data.user, profile),
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        tokenType: data.session.token_type,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/sign-out', requireAuth, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.auth.admin.signOut(req.auth.token);
    if (error) throw httpError(500, 'Failed to sign out', error.message);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const profile = await getProfile(req.auth.user.id);
    res.json({
      user: publicUser(req.auth.user, profile),
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const payload = profileUpdateSchema.parse(req.body);
    const currentProfile = await getProfile(req.auth.user.id);
    const nextProfile = {
      id: req.auth.user.id,
      full_name: payload.fullName ?? currentProfile?.full_name ?? req.auth.user.user_metadata?.full_name ?? req.auth.user.email?.split('@')[0],
      phone: payload.phone ?? currentProfile?.phone ?? req.auth.user.user_metadata?.phone ?? null,
      role: currentProfile?.role ?? req.auth.user.user_metadata?.role ?? 'staff',
      owner_id: currentProfile?.owner_id ?? req.auth.user.user_metadata?.owner_id ?? null,
      status: currentProfile?.status ?? 'active',
    };

    const authUpdate = {
      user_metadata: {
        ...req.auth.user.user_metadata,
        full_name: nextProfile.full_name,
        phone: nextProfile.phone,
        role: nextProfile.role,
        language: payload.language ?? req.auth.user.user_metadata?.language ?? null,
        theme: payload.theme ?? req.auth.user.user_metadata?.theme ?? null,
        palette: payload.palette ?? req.auth.user.user_metadata?.palette ?? null,
        darkness: payload.darkness ?? req.auth.user.user_metadata?.darkness ?? null,
      },
    };
    if (payload.email && payload.email !== req.auth.user.email) authUpdate.email = payload.email;
    if (payload.password) authUpdate.password = payload.password;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.updateUserById(req.auth.user.id, authUpdate);
    if (authError) throw httpError(500, 'Failed to update auth user', authError.message);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(nextProfile, { onConflict: 'id' })
      .select('id, full_name, phone, role, status, owner_id')
      .single();

    if (profileError) throw httpError(500, 'Failed to update profile', profileError.message);

    res.json({
      user: publicUser(authData.user, profile),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/accounts', requireAuth, async (req, res, next) => {
  try {
    const creatorProfile = await getProfile(req.auth.user.id);
    const creatorRole = normalizeAccountRole(creatorProfile?.role ?? req.auth.user.user_metadata?.role ?? 'staff');
    const creatorOwnerId = creatorProfile?.owner_id ?? req.auth.user.id;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authError) throw httpError(500, 'Failed to fetch auth users', authError.message);

    let profileQuery = supabaseAdmin
      .from('profiles')
      .select('id, full_name, phone, role, status, owner_id, warehouse_id');

    if (creatorRole !== 'super_admin') {
      profileQuery = profileQuery.eq('owner_id', creatorOwnerId);
    }

    const { data: profiles, error: profileError } = await profileQuery;
    if (profileError) throw httpError(500, 'Failed to fetch profiles', profileError.message);

    // Fetch all active warehouses for warehouse name resolution
    const { data: allWarehouses } = await supabaseAdmin
      .from('warehouses')
      .select('id, name, code, owner_id, is_default, status');
    const warehouseMap = new Map((allWarehouses || []).map((w) => [w.id, w]));

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    // Build owner name lookup for Super Admin
    const ownerNameMap = new Map();
    (profiles || []).forEach((p) => {
      if (p.role === 'owner') {
        ownerNameMap.set(p.id, p.full_name || p.id);
      }
    });

    const allUsers = authData.users.map((u) => {
      const p = profileMap.get(u.id);
      const wh = p?.warehouse_id ? warehouseMap.get(p.warehouse_id) : null;
      const ownerName = p?.owner_id ? ownerNameMap.get(p.owner_id) : null;
      return {
        id: u.id,
        email: u.email,
        fullName: p?.full_name ?? u.user_metadata?.full_name ?? null,
        phone: p?.phone ?? u.user_metadata?.phone ?? null,
        role: normalizeAccountRole(p?.role ?? u.user_metadata?.role ?? null),
        status: p?.status ?? 'active',
        ownerId: p?.owner_id ?? u.user_metadata?.owner_id ?? null,
        ownerName: ownerName ?? (p?.role === 'super_admin' ? 'System' : null),
        warehouseId: p?.warehouse_id ?? null,
        warehouseName: wh ? `${wh.name} (${wh.code})` : null,
        createdAt: u.created_at,
        lastActive: u.last_sign_in_at,
      };
    });

    let filteredUsers;
    if (creatorRole === 'super_admin') {
      filteredUsers = allUsers;
    } else if (creatorRole === 'owner' || creatorRole === 'staff') {
      filteredUsers = allUsers.filter(
        (u) => u.ownerId === creatorOwnerId || u.id === creatorOwnerId
      );
    } else {
      filteredUsers = allUsers.filter((u) => u.id === req.auth.user.id);
    }

    res.json({
      data: filteredUsers,
      count: filteredUsers.length,
      owners: (profiles || []).filter((p) => p.role === 'owner').map((p) => ({
        id: p.id,
        name: p.full_name || p.id,
      })),
      warehouses: (allWarehouses || []).filter((w) => w.status !== 'archived'),
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/accounts/:id', requireAuth, async (req, res, next) => {
  try {
    const requesterProfile = await getProfile(req.auth.user.id);
    const requesterRole = normalizeAccountRole(requesterProfile?.role ?? req.auth.user.user_metadata?.role ?? 'staff');

    const targetId = req.params.id;

    if (targetId === req.auth.user.id) {
      throw httpError(400, 'You cannot delete your own account');
    }

    if (requesterRole !== 'super_admin' && requesterRole !== 'owner') {
      throw httpError(403, 'Only Super Admin or Owner can delete user accounts');
    }

    if (requesterRole === 'owner') {
      const targetProfile = await getProfile(targetId);
      if (!targetProfile || targetProfile.owner_id !== req.auth.user.id) {
        throw httpError(403, 'You are only allowed to delete user accounts in your workspace');
      }
    }

    const targetProfile = await getProfile(targetId);

    // If the deleted user is an owner, cascade delete to all their workspace members
    if (targetProfile && targetProfile.role === 'owner') {
      const { data: members, error: membersError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('owner_id', targetId);

      if (!membersError && Array.isArray(members)) {
        for (const member of members) {
          if (member.id === targetId) continue;
          // Delete from Supabase Auth
          await supabaseAdmin.auth.admin.deleteUser(member.id).catch(() => {});
          // Delete from profiles
          await supabaseAdmin.from('profiles').delete().eq('id', member.id).catch(() => {});
        }
      }
    }

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (authError) throw httpError(500, 'Failed to delete auth user', authError.message);

    // Also delete their profile record
    await supabaseAdmin.from('profiles').delete().eq('id', targetId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.patch('/accounts/:id/status', requireAuth, async (req, res, next) => {
  try {
    const requesterProfile = await getProfile(req.auth.user.id);
    const requesterRole = normalizeAccountRole(requesterProfile?.role ?? req.auth.user.user_metadata?.role ?? 'staff');

    const targetId = req.params.id;
    const accountStatusSchema = z.object({
      status: z.enum(['active', 'disabled']),
    });
    const payload = accountStatusSchema.parse(req.body);

    if (targetId === req.auth.user.id) {
      throw httpError(400, 'You cannot modify your own account status');
    }

    if (requesterRole !== 'super_admin' && requesterRole !== 'owner') {
      throw httpError(403, 'Only Super Admin or Owner can change account status');
    }

    if (requesterRole === 'owner') {
      const targetProfile = await getProfile(targetId);
      if (!targetProfile || targetProfile.owner_id !== req.auth.user.id) {
        throw httpError(403, 'You are only allowed to modify user status in your workspace');
      }
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ status: payload.status })
      .eq('id', targetId)
      .select('id, full_name, phone, role, status, owner_id')
      .single();

    if (profileError) throw httpError(500, 'Failed to update profile status', profileError.message);

    // If the status updated user is an owner, cascade the status to all their workspace members
    if (profile && profile.role === 'owner') {
      const { error: cascadeError } = await supabaseAdmin
        .from('profiles')
        .update({ status: payload.status })
        .eq('owner_id', targetId);
      if (cascadeError) throw httpError(500, 'Failed to update workspace members status', cascadeError.message);
    }

    res.json({
      data: profile,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/accounts/:id/password', requireAuth, async (req, res, next) => {
  try {
    const requesterProfile = await getProfile(req.auth.user.id);
    const requesterRole = normalizeAccountRole(requesterProfile?.role ?? req.auth.user.user_metadata?.role ?? 'staff');

    const targetId = req.params.id;

    if (requesterRole !== 'super_admin' && requesterRole !== 'owner') {
      throw httpError(403, 'Only Super Admin or Owner can update user passwords');
    }

    if (requesterRole === 'owner') {
      const targetProfile = await getProfile(targetId);
      if (!targetProfile || targetProfile.owner_id !== req.auth.user.id) {
        throw httpError(403, 'You are only allowed to update passwords for users in your workspace');
      }
    }

    const passwordSchema = z.object({
      password: z.string().min(6, 'Password must be at least 6 characters'),
    });
    const payload = passwordSchema.parse(req.body);

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
      password: payload.password,
    });
    if (authError) throw httpError(500, 'Failed to update user password', authError.message);

    res.json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/accounts', requireAuth, async (req, res, next) => {
  try {
    const payload = accountCreateSchema.parse(req.body);
    const creatorProfile = await getProfile(req.auth.user.id);
    const storedCreatorRole = creatorProfile?.role ?? req.auth.user.user_metadata?.role ?? 'staff';
    const creatorRole = storedCreatorRole === 'admin' ? 'staff' : storedCreatorRole;
    const allowedRoles = {
      super_admin: ['super_admin', 'owner', 'staff', 'sales_person'],
      owner: ['staff', 'sales_person'],
      staff: [],
    }[creatorRole] ?? [];

    if (!allowedRoles.includes(payload.role)) {
      throw httpError(403, 'You are not allowed to create an account with this role');
    }

    let newOwnerId;
    if (payload.role === 'super_admin') {
      newOwnerId = null;
    } else if (payload.role === 'owner') {
      newOwnerId = null;
    } else {
      if (creatorRole === 'super_admin' && payload.ownerId) {
        newOwnerId = payload.ownerId;
      } else {
        newOwnerId = creatorProfile?.owner_id ?? req.auth.user.id;
      }
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        full_name: payload.fullName,
        phone: payload.phone ?? null,
        role: payload.role,
        owner_id: newOwnerId,
        warehouse_id: payload.warehouseId ?? null,
      },
    });

    if (authError || !authData.user) {
      if (authError?.message?.toLowerCase().includes('already') || authError?.message?.toLowerCase().includes('exists')) {
        throw httpError(400, 'Email sudah terdaftar. Gunakan email lain.');
      }
      throw httpError(400, authError?.message ?? 'Failed to create account');
    }

    const resolvedOwnerId = (payload.role === 'owner' || payload.role === 'super_admin') ? authData.user.id : newOwnerId;
    const resolvedWarehouseId = (payload.role === 'staff' || payload.role === 'sales_person') ? (payload.warehouseId ?? null) : null;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authData.user.id,
        full_name: payload.fullName,
        phone: payload.phone ?? null,
        role: payload.role,
        owner_id: resolvedOwnerId,
        warehouse_id: resolvedWarehouseId,
        status: payload.status ?? 'active',
      }, { onConflict: 'id' })
      .select('id, full_name, phone, role, status, owner_id, warehouse_id')
      .single();

    if (profileError) throw httpError(500, 'Failed to create account profile', profileError.message);

    // If new owner or super admin created, auto-create their default warehouse if not present
    if (payload.role === 'owner' || payload.role === 'super_admin') {
      const { data: existingWh } = await supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('owner_id', authData.user.id)
        .maybeSingle();

      if (!existingWh) {
        await supabaseAdmin.from('warehouses').insert({
          owner_id: authData.user.id,
          name: 'Gudang Utama',
          code: 'GDG-MAIN',
          is_default: true,
          status: 'active',
        });
      }
    }

    res.status(201).json({
      user: publicUser(authData.user, profile),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
