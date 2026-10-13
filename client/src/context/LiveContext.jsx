import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../api.js';
import { useAuth } from './AuthContext.jsx';
import { playAlert } from '../sound.js';

const LiveContext = createContext(null);
const MUTE_KEY = 'sentinel_muted';

/**
 * Owns the Socket.io connection, toast queue and alert sound for the whole app.
 * Pages subscribe to socket events with useLiveEvent().
 */
export function LiveProvider({ children }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  useEffect(() => {
    if (!token) return undefined;
    const s = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('new_incident', (incident) => {
      const id = incident._id || String(Date.now());
      setToasts((t) => [{ id, incident }, ...t].slice(0, 4));
      setTimeout(() => dismiss(id), 9000);
      if (!mutedRef.current) playAlert(incident.level);
    });
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token, dismiss]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      try {
        localStorage.setItem(MUTE_KEY, m ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !m;
    });
  }, []);

  return (
    <LiveContext.Provider value={{ socket, connected, toasts, dismiss, muted, toggleMute }}>{children}</LiveContext.Provider>
  );
}

export const useLive = () => useContext(LiveContext);

/** Subscribe to a socket event for the lifetime of the component. */
export function useLiveEvent(event, handler) {
  const { socket } = useLive();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return undefined;
    const fn = (...args) => ref.current(...args);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [socket, event]);
}
