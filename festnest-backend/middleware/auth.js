// middleware/auth.js
import { verifyAccessToken }   from '../utils/jwt.js';
import { unauthorized }        from '../utils/response.js';
import User                    from '../models/User.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return unauthorized(res, 'No token provided');

  try {
    const decoded = verifyAccessToken(header.slice(7));
    // Attach fresh user doc (so downstream code always has up-to-date data)
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return unauthorized(res, 'User no longer exists');
    req.user = user;
    next();
  } catch {
    return unauthorized(res, 'Invalid or expired access token');
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
