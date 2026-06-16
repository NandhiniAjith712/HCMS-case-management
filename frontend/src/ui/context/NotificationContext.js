import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from 'react';
import { buildApiUrl, getAuthHeaders, getBearerToken, getTenantId } from '../utils/api';

const initialState = {
  items: []
};

function notificationReducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      return { items: Array.isArray(action.items) ? action.items.slice(0, 200) : [] };
    case 'ADD_DEDUP': {
      const p = action.payload;
      if (!p?.id) return state;
      const idx = state.items.findIndex((n) => n.id === p.id);
      if (idx >= 0) {
        const next = [...state.items];
        next[idx] = { ...next[idx], ...p };
        return { items: next };
      }
      return { items: [p, ...state.items].slice(0, 200) };
    }
    case 'MARK_READ':
      return {
        items: state.items.map((n) => (n.id === action.id ? { ...n, isRead: true } : n))
      };
    case 'MARK_ALL_READ':
      return {
        items: state.items.map((n) => ({ ...n, isRead: true }))
      };
    default:
      return state;
  }
}

const NotificationContext = createContext(null);

function buildTicketHref(ticketId) {
  if (!ticketId) return null;
  const tid = String(ticketId).trim();
  if (!tid) return null;
  try {
    const raw =
      sessionStorage.getItem('staffData') ||
      localStorage.getItem('staffData') ||
      sessionStorage.getItem('userData') ||
      localStorage.getItem('agentData');
    if (raw) {
      const u = JSON.parse(raw);
      const r = String(u.role || '').toLowerCase();
      if (['support_manager', 'manager'].includes(r)) return `/manager/ticket/${tid}`;
      if (['ceo', 'admin'].includes(r)) return `/ticket/${tid}`;
      if (['support_agent', 'agent', 'admin'].includes(r)) return `/agent/ticket/${tid}`;
    }
  } catch (_) {}
  const p = typeof window !== 'undefined' ? window.location.pathname || '' : '';
  if (p.startsWith('/userdashboard') || p.startsWith('/customer/')) {
    return `/user/ticket/${tid}`;
  }
  return `/agent/ticket/${tid}`;
}

function mapApiToItem(row) {
  const createdAtMs = row.createdAt ? new Date(row.createdAt).getTime() : Date.now();
  return {
    id: row.id,
    title: row.title || 'Notification',
    description: row.description || '',
    type: String(row.type || 'info'),
    isRead: !!row.isRead,
    createdAtMs,
    ticketId: row.ticketId || '',
    href: buildTicketHref(row.ticketId)
  };
}

function makeLocalId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Legacy client-only toast row (e.g. ephemeral dashboard hints). */
function normalizeLocalPush(input) {
  const createdAtMs = Date.now();
  const description = input.description ?? input.message ?? '';
  return {
    id: makeLocalId(),
    title: input.title || 'Notification',
    description,
    type: String(input.type || 'info'),
    isRead: false,
    createdAtMs,
    ticketId: input.ticketId != null ? String(input.ticketId) : '',
    href: input.href || buildTicketHref(input.ticketId)
  };
}

export function NotificationProvider({ children }) {
  const [state, dispatch] = useReducer(notificationReducer, initialState);
  const wsRef = useRef(null);

  const loadFromApi = useCallback(async () => {
    const token = getBearerToken();
    if (!token) {
      dispatch({ type: 'HYDRATE', items: [] });
      return;
    }
    try {
      const res = await fetch(buildApiUrl('/api/notifications?limit=50&offset=0'), {
        headers: getAuthHeaders()
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success || !Array.isArray(j.data)) {
        dispatch({ type: 'HYDRATE', items: [] });
        return;
      }
      dispatch({ type: 'HYDRATE', items: j.data.map(mapApiToItem) });
    } catch {
      dispatch({ type: 'HYDRATE', items: [] });
    }
  }, []);

  useEffect(() => {
    loadFromApi();
  }, [loadFromApi]);

  useEffect(() => {
    const token = getBearerToken();
    if (!token) return undefined;

    const WS_URL = (process.env.REACT_APP_API_URL || 'http://localhost:5000')
      .replace(/^http/, 'ws')
      .replace(/\/api\/?$/, '') + '/ws';
    let ws;
    try {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;
    } catch {
      return undefined;
    }

    ws.onopen = () => {
      try {
        ws.send(
          JSON.stringify({
            type: 'SUBSCRIBE_APP_NOTIFICATIONS',
            token,
            tenantId: getTenantId()
          })
        );
      } catch (_) {}
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'new_notification' && msg.data) {
          dispatch({ type: 'ADD_DEDUP', payload: mapApiToItem(msg.data) });
        }
      } catch (_) {}
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') loadFromApi();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      try {
        ws.close();
      } catch (_) {}
      wsRef.current = null;
    };
  }, [loadFromApi]);

  const pushNotification = useCallback((payload) => {
    dispatch({ type: 'ADD_DEDUP', payload: normalizeLocalPush(payload) });
  }, []);

  const markRead = useCallback(
    async (id) => {
      dispatch({ type: 'MARK_READ', id });
      const token = getBearerToken();
      if (!token || String(id).startsWith('demo_') || String(id).startsWith('local_')) return;
      try {
        const res = await fetch(buildApiUrl(`/api/notifications/${encodeURIComponent(id)}/read`), {
          method: 'PATCH',
          headers: getAuthHeaders()
        });
        if (!res.ok) await loadFromApi();
      } catch {
        await loadFromApi();
      }
    },
    [loadFromApi]
  );

  const markAllRead = useCallback(async () => {
    dispatch({ type: 'MARK_ALL_READ' });
    const token = getBearerToken();
    if (!token) return;
    try {
      const res = await fetch(buildApiUrl('/api/notifications/mark-all-read'), {
        method: 'PATCH',
        headers: getAuthHeaders()
      });
      if (!res.ok) await loadFromApi();
    } catch {
      await loadFromApi();
    }
  }, [loadFromApi]);

  const unreadCount = useMemo(
    () => state.items.filter((n) => !n.isRead).length,
    [state.items]
  );

  const value = useMemo(
    () => ({
      notifications: state.items,
      unreadCount,
      pushNotification,
      markRead,
      markAllRead,
      refreshNotifications: loadFromApi
    }),
    [state.items, unreadCount, pushNotification, markRead, markAllRead, loadFromApi]
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return ctx;
}
