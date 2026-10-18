import { supabaseAdmin } from '../lib/supabase.js';
import { httpError } from '../utils/httpError.js';

function readBearerToken(header) {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

const AUTH_CACHE = new Map();
const AUTH_CACHE_TTL_MS = 20_000; // 20 seconds

export function invalidateAuthCache(userId) {
  if (!userId) {
    AUTH_CACHE.clear();
    return;
  }
  for (const [token, entry] of AUTH_CACHE.entries()) {
    if (entry.user?.id === userId) {
      AUTH_CACHE.delete(token);
    }
  }
}

export async function requireAuth(req, _res, next) {
  try {
    const token = readBearerToken(req.headers.authorization);
    if (!token) throw httpError(401, 'Missing bearer token');

    const cached = AUTH_CACHE.get(token);
    if (cached && Date.now() - cached.cachedAt < AUTH_CACHE_TTL_MS) {
      if (cached.disabled) {
        throw httpError(401, 'User account is disabled');
      }
      req.auth = {
        token,
        user: cached.user,
      };
      return next();
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw httpError(401, 'Invalid or expired session');

    // Load user profile status from database to enforce immediate account suspension
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('status')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError) {
      throw httpError(500, 'Failed to verify account status');
    }

    const isDisabled = profile?.status === 'disabled';
    AUTH_CACHE.set(token, {
      user: data.user,
      disabled: isDisabled,
      cachedAt: Date.now(),
    });

    if (isDisabled) {
      throw httpError(401, 'User account is disabled');
    }

    req.auth = {
      token,
      user: data.user,
    };
    next();
  } catch (error) {
    next(error);
  }
}

