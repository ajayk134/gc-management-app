import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../utils/api';

const DowntimeContext = createContext({
  active: false,
  downtime: null,
  upcoming: null,
  loading: true,
  refresh: () => {}
});

export const DowntimeProvider = ({ children }) => {
  const [state, setState] = useState({
    active: false,
    downtime: null,
    upcoming: null,
    serverTime: null
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/api/downtime/status');
      setState({
        active: Boolean(data.active),
        downtime: data.downtime || null,
        upcoming: data.upcoming || null,
        serverTime: data.serverTime || null
      });
    } catch {
      // Keep the last known state if the status endpoint is temporarily
      // unreachable. The API guard still blocks user data access server-side.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 20000);

    const onDowntimeActive = (event) => {
      setState(prev => ({
        ...prev,
        active: true,
        downtime: event.detail || prev.downtime
      }));
    };

    window.addEventListener('gc:downtime-active', onDowntimeActive);
    return () => {
      clearInterval(interval);
      window.removeEventListener('gc:downtime-active', onDowntimeActive);
    };
  }, [refresh]);

  // Refresh exactly when the current window starts or ends so the UI switches
  // without waiting for the next polling interval.
  useEffect(() => {
    const transitionAt = state.active ? state.downtime?.endAt : state.upcoming?.startAt;
    if (!transitionAt) return;

    const delay = new Date(transitionAt).getTime() - Date.now() + 500;
    if (!Number.isFinite(delay) || delay < 0 || delay > 2147483647) return;

    const timer = setTimeout(refresh, delay);
    return () => clearTimeout(timer);
  }, [state.active, state.downtime?.endAt, state.upcoming?.startAt, refresh]);

  return (
    <DowntimeContext.Provider value={{ ...state, loading, refresh }}>
      {children}
    </DowntimeContext.Provider>
  );
};

export const useDowntime = () => useContext(DowntimeContext);
