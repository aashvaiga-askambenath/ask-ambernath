const { z } = require('zod');
const { HttpError } = require('../lib/errors');

const roles = ['customer', 'business_owner', 'admin', 'super_admin'];

async function authenticate(req, _res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) throw new HttpError(401, 'AUTH_REQUIRED', 'Please sign in to continue');
    const { data: { user }, error: authError } = await req.supabase.auth.getUser(token);
    if (authError || !user) throw new HttpError(401, 'INVALID_SESSION', 'Your session is invalid or expired');
    const { data: profile, error } = await req.supabase.from('profiles')
      .select('id,full_name,phone,role,is_active,avatar_url').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!profile || !profile.is_active) throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account is unavailable');
    if (!roles.includes(profile.role)) throw new HttpError(403, 'INVALID_ROLE', 'This account does not have an allowed role');
    req.user = { id: profile.id, name: profile.full_name, email: user.email, phone: profile.phone, role: profile.role, avatarUrl: profile.avatar_url };
    next();
  } catch (error) {
    next(error);
  }
}

function optionalAuthenticate(req, res, next) {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, next);
}

function requireRole(...allowed) {
  return (req, _res, next) => allowed.includes(req.user?.role)
    ? next()
    : next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to do that'));
}

function validateUuidParam(name = 'id') {
  return (req, _res, next) => {
    if (!z.string().uuid().safeParse(req.params[name]).success) {
      return next(new HttpError(400, 'INVALID_ID', 'The requested identifier is invalid'));
    }
    next();
  };
}

module.exports = { authenticate, optionalAuthenticate, requireRole, validateUuidParam };
