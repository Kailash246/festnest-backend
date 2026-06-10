// middleware/adminAuth.js
import { verifyAccessToken }    from '../utils/jwt.js';
import { unauthorized, forbidden } from '../utils/response.js';
import User from '../models/User.js';

/** Must be logged in AND have role admin or superadmin */
export async function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return unauthorized(res, 'No token provided');

  try {
    const decoded = verifyAccessToken(header.slice(7));
    const user    = await User.findById(decoded.id).select('-password');
    if (!user) return unauthorized(res, 'User not found');
    if (user.isBanned) return forbidden(res, 'Account banned');
    if (!user.isAdmin()) return forbidden(res, 'Admin access required');
    req.user = user;
    next();
  } catch {
    return unauthorized(res, 'Invalid or expired token');
  }
}

/** Only superadmin can call this (e.g. promote other admins) */
export async function requireSuperAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return unauthorized(res, 'No token provided');

  try {
    const decoded = verifyAccessToken(header.slice(7));
    const user    = await User.findById(decoded.id).select('-password');
    if (!user) return unauthorized(res, 'User not found');
    if (user.role !== 'superadmin') return forbidden(res, 'Superadmin access required');
    req.user = user;
    next();
  } catch {
    return unauthorized(res, 'Invalid or expired token');
  }
}
