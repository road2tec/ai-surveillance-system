import axios from 'axios';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
export const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || API_URL).replace(/\/$/, '');
const TOKEN_KEY = 'sentinel_token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: session lasts until reload */
    }
  },
};

export const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 25000 });

api.interceptors.request.use((cfg) => {
  const t = tokenStore.get();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// AuthContext registers this so any 401 (expired / invalid token) logs the user out.
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/login')) {
      onUnauthorized(err.response.data?.expired ? 'expired' : 'invalid');
    }
    return Promise.reject(err);
  },
);

export const errorMessage = (err, fallback = 'Something went wrong') =>
  err?.response?.data?.error || (err?.code === 'ERR_NETWORK' ? 'Cannot reach the API server' : err?.message) || fallback;

export const assetUrl = (p) => (p ? `${API_URL}${p}` : '');

/** Decoded JWT payload (no verification, only used for the expiry timer). */
export function tokenPayload(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}
