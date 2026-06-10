// utils/response.js
export const ok      = (res, data = {}, message = 'Success', code = 200) =>
  res.status(code).json({ success: true, message, data });

export const created = (res, data = {}, message = 'Created') =>
  ok(res, data, message, 201);

export const fail    = (res, message = 'Bad request', code = 400, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(code).json(body);
};

export const unauthorized = (res, message = 'Unauthorized') =>
  fail(res, message, 401);

export const forbidden    = (res, message = 'Forbidden') =>
  fail(res, message, 403);

export const notFoundRes  = (res, message = 'Not found') =>
  fail(res, message, 404);

// utils/asyncHandler.js  – wraps async route handlers so errors go to next()
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
