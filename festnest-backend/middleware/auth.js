// middleware/auth.js
import { verifyAccessToken }   from '../utils/jwt.js';
import { unauthorized }        from '../utils/response.js';
import User                    from '../models/User.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return unauthorized(res, 'Please log in to continue.');

  try {
    const decoded = verifyAccessToken(header.slice(7));
    // Attach fresh user doc (so downstream code always has up-to-date data)
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return unauthorized(res, 'Your account could not be found. Please log in again.');
    req.user = user;
    next();
  } catch {
    return unauthorized(res, 'Your session has expired. Please log in again.');
  }
}

/** Attaches user if token exists but never blocks unauthenticated requests */
export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const decoded = verifyAccessToken(header.slice(7));
      req.user = await User.findById(decoded.id).select('-password');
    } catch { /* ignore */ }
  }
  next();
}
