// src/services/api.js
// Drop this into festnest-react/src/services/api.js
// Add VITE_API_URL=http://localhost:5000/api to your frontend .env

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/* ─── Token helpers ─────────────────────────────────────── */
export const tokens = {
  getAccess:   ()        => localStorage.getItem('fn_access'),
  getRefresh:  ()        => localStorage.getItem('fn_refresh'),
  set:         (a, r)    => {
    localStorage.setItem('fn_access', a);
    if (r) localStorage.setItem('fn_refresh', r);
  },
  clear:       ()        => {
    localStorage.removeItem('fn_access');
    localStorage.removeItem('fn_refresh');
  },
  isLoggedIn:  ()        => !!localStorage.getItem('fn_access'),
};

/* ─── Core fetch wrapper with auto token-refresh ────────── */
let _refreshing = false;
let _queue      = [];

async function request(path, options = {}) {
  const headers = { ...options.headers };

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const access = tokens.getAccess();
  if (access) headers['Authorization'] = `Bearer ${access}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  // ── Auto-refresh on 401 ──
  if (res.status === 401 && !options._retry) {
    if (_refreshing) {
      await new Promise((res, rej) => _queue.push({ res, rej }));
      return request(path, { ...options, _retry: true });
    }

    _refreshing = true;
    try {
      const rfRes = await fetch(`${BASE}/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken: tokens.getRefresh() }),
      });

      if (!rfRes.ok) throw new Error('refresh_failed');
      const { data } = await rfRes.json();
      tokens.set(data.accessToken, data.refreshToken);
      _queue.forEach(p => p.res());
    } catch {
      tokens.clear();
      _queue.forEach(p => p.rej());
      window.dispatchEvent(new CustomEvent('festnest:logout'));
      throw new Error('Session expired. Please log in again.');
    } finally {
      _queue      = [];
      _refreshing = false;
    }

    return request(path, { ...options, _retry: true });
  }

  const json = await res.json();
  if (!json.success) {
    const err = Object.assign(new Error(json.message || 'Request failed'), {
      status: res.status, errors: json.errors,
    });
    throw err;
  }
  return json;
}

const get    = (path, opts)       => request(path, { method: 'GET',    ...opts });
const post   = (path, body, opts) => request(path, { method: 'POST',   body: body instanceof FormData ? body : JSON.stringify(body), ...opts });
const patch  = (path, body, opts) => request(path, { method: 'PATCH',  body: JSON.stringify(body), ...opts });
const del    = (path, body, opts) => request(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined, ...opts });

/* ═══════════════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════════════ */
export const auth = {
  /** Step 1 of registration/login – sends OTP to email */
  sendOtp: (email, purpose = 'verify_email') =>
    post('/auth/send-otp', { email, purpose }),

  /** Step 2 – register with name + OTP-verified email */
  register: async (body) => {
    const r = await post('/auth/register', body);
    tokens.set(r.data.accessToken, r.data.refreshToken);
    return r;
  },

  login: async (email, password) => {
    const r = await post('/auth/login', { email, password });
    tokens.set(r.data.accessToken, r.data.refreshToken);
    return r;
  },

  loginOtp: async (email, otp) => {
    const r = await post('/auth/login-otp', { email, otp });
    tokens.set(r.data.accessToken, r.data.refreshToken);
    return r;
  },

  logout: async () => {
    try { await post('/auth/logout', { refreshToken: tokens.getRefresh() }); } catch { /* noop */ }
    tokens.clear();
  },

  logoutAll: () => post('/auth/logout-all'),

  forgotPassword:  (email)                   => post('/auth/forgot-password', { email }),
  resetPassword:   (email, otp, newPassword) => post('/auth/reset-password',  { email, otp, newPassword }),

  me:          () => get('/auth/me'),
  isLoggedIn:  () => tokens.isLoggedIn(),
};

/* ═══════════════════════════════════════════════════════════
   EVENTS
═══════════════════════════════════════════════════════════ */
export const events = {
  /**
   * List events with optional filters.
   * @param {Object} params - { category, entryType, city, search, sort, page, limit }
   */
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
    ).toString();
    return get(`/events${qs ? '?' + qs : ''}`);
  },

  trending:  ()     => get('/events/trending'),
  urgent:    ()     => get('/events/urgent'),
  saved:     ()     => get('/events/saved'),
  get:       (slug) => get(`/events/${slug}`),

  save:              (slug) => post(`/events/${slug}/save`),
  unsave:            (slug) => del(`/events/${slug}/save`),
  register:          (slug) => post(`/events/${slug}/register`),
  cancelRegistration:(slug) => del(`/events/${slug}/register`),

  /**
   * Host / submit an event (multipart with optional bannerImage).
   * @param {FormData} formData
   */
  host: (formData) => post('/events/host', formData),
};

/* ═══════════════════════════════════════════════════════════
   USERS
═══════════════════════════════════════════════════════════ */
export const users = {
  me:             ()      => get('/users/me'),
  update:         (body)  => patch('/users/me', body),
  changePassword: (body)  => patch('/users/me/password', body),

  /** Upload avatar image – pass a File object */
  uploadAvatar: (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return post('/users/me/avatar', fd);
  },

  registrations:  () => get('/users/me/registrations'),
  points:         () => get('/users/me/points'),
  hosted:         () => get('/users/me/hosted'),
};

/* ═══════════════════════════════════════════════════════════
   NOTIFICATIONS
═══════════════════════════════════════════════════════════ */
export const notifications = {
  list:       (type)  => get(`/notifications${type && type !== 'all' ? '?type=' + type : ''}`),
  markRead:   (id)    => patch(`/notifications/${id}/read`),
  markAllRead:()      => patch('/notifications/read-all'),
  delete:     (id)    => del(`/notifications/${id}`),
  clearAll:   ()      => del('/notifications'),
};

/* ═══════════════════════════════════════════════════════════
   LEADERBOARD
═══════════════════════════════════════════════════════════ */
export const leaderboard = {
  get: (period = 'all') => get(`/leaderboard?period=${period}`),
};

/* ═══════════════════════════════════════════════════════════
   COLLEGE
═══════════════════════════════════════════════════════════ */
export const college = {
  list:  (q)    => get(`/college/list${q ? '?q=' + encodeURIComponent(q) : ''}`),
  my:    (name) => get(`/college/my${name ? '?college=' + encodeURIComponent(name) : ''}`),
  setMy: (name) => patch('/college/my', { college: name }),
};

/* ═══════════════════════════════════════════════════════════
   SUPPORT
═══════════════════════════════════════════════════════════ */
export const support = {
  faqs:         (category) => get(`/support/faqs${category && category !== 'all' ? '?category=' + category : ''}`),
  submitTicket: (body)     => post('/support/contact', body),
  myTickets:    ()         => get('/support/tickets'),
};

/* ─── Default grouped export ─────────────────────────────── */
export default { auth, events, users, notifications, leaderboard, college, support, tokens };
