import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setUnauthorizedHandler, tokenPayload, tokenStore } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => {
    const t = tokenStore.get();
    const p = t && tokenPayload(t);
    return p && p.exp * 1000 > Date.now() ? t : null;
  });
  const [user, setUser] = useState(null);

  const logout = useCallback(
    (reason) => {
      tokenStore.set(null);
      setToken(null);
      setUser(null);
      navigate('/login', { replace: true, state: reason === 'expired' ? { notice: 'Your session expired. Please sign in again.' } : undefined });
    },
    [navigate],
  );

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    tokenStore.set(data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  useEffect(() => setUnauthorizedHandler((reason) => logout(reason)), [logout]);

  // Load profile and schedule an automatic logout at token expiry.
  useEffect(() => {
    if (!token) return undefined;
    api.get('/auth/me').then((r) => setUser(r.data.user)).catch(() => {});
    const exp = tokenPayload(token)?.exp;
    if (!exp) return undefined;
    const ms = exp * 1000 - Date.now();
    const id = setTimeout(() => logout('expired'), Math.max(0, Math.min(ms, 2 ** 31 - 1)));
    return () => clearTimeout(id);
  }, [token, logout]);

  const value = useMemo(() => ({ token, user, login, logout }), [token, user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
