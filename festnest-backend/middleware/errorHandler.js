// middleware/errorHandler.js
//
// Global error handler — converts any thrown error into a consistent,
// human-readable JSON envelope: { success: false, message, errors? }.
//
// Status code policy:
//   400 bad input · 401 unauth · 403 forbidden · 404 not found
//   409 conflict (duplicate) · 422 validation · 429 rate limit · 500 server
//
export function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  /* ── Mongoose validation error → 422 with all field messages joined ── */
  if (err.name === 'ValidationError') {
    const fieldMsgs = Object.values(err.errors).map(e => e.message);
    return res.status(422).json({
      success: false,
      message: fieldMsgs.join(' ') || 'Some of the information you entered is invalid.',
      errors:  fieldMsgs,
    });
  }

  /* ── Mongoose / Mongo duplicate key (code 11000) → 409 ── */
  if (err.code === 11000) {
    const keys = Object.keys(err.keyValue || {});
    let readable;
    if (keys.includes('email')) {
      readable = 'This email is already registered. Please log in instead.';
    } else if (keys.includes('referralCode')) {
      readable = 'That referral code is already taken. Please choose another.';
    } else if (keys.includes('idempotencyKey')) {
      readable = 'A request with this key has already been processed.';
    } else if (keys.includes('user') && keys.includes('milestoneIndex')) {
      readable = 'This spin milestone has already been consumed.';
    } else if (keys.includes('user')) {
      readable = 'A conflicting record already exists for this user.';
    } else {
      const field = keys[0] || 'value';
      readable = `That ${field} is already taken. Please choose another.`;
    }
    return res.status(409).json({ success: false, message: readable });
  }

  /* ── Mongoose CastError (bad ObjectId etc.) → 400 ── */
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'The request contained an invalid value. Please check and try again.',
    });
  }

  /* ── JWT errors → 401 with a clear, actionable message ── */
  if (err.name === 'JsonWebTokenError')
    return res.status(401).json({ success: false, message: 'Your session is invalid. Please log in again.' });
  if (err.name === 'TokenExpiredError')
    return res.status(401).json({ success: false, message: 'Your session has expired. Please log in again.' });

  /* ── Multer file size error → 413 ── */
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ success: false, message: 'That file is too large. Please upload a smaller file.' });

  /* ── Anything with an explicit status passes its own message through ── */
  const status = err.status || err.statusCode || 500;
  if (status !== 500) {
    return res.status(status).json({ success: false, message: err.message || 'Request failed.' });
  }

  /* ── Unhandled server error → 500 with a safe generic message ── */
  res.status(500).json({
    success: false,
    message: 'Something went wrong. Please try again.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

// middleware/notFound.js
export function notFound(req, res) {
  res.status(404).json({ success: false, message: "We couldn't find what you were looking for." });
}
