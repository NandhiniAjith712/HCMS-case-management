import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { buildApiUrl, getAuthHeaders, getTenantId } from '../../utils/api';
import HeaderNotificationBell from '../common/HeaderNotificationBell';
import AgdashNavIcon from './AgdashNavIcon';
import './AgentDashboard.css';
import './AgentDashboard.ref.css';

/** Sidebar status icons (stroke icons for nav rows). */
function AdrSidebarIcon({ name }) {
  const c = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  };
  switch (name) {
    case 'overview':
      return (
        <svg {...c}>
          <path d="M3 3v18h18" />
          <path d="M18 17V9" />
          <path d="M13 17V5" />
          <path d="M8 17v-3" />
        </svg>
      );
    case 'new':
      return (
        <svg {...c}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 7l-10 6L2 7" />
        </svg>
      );
    case 'in_progress':
      return (
        <svg {...c} fill="currentColor" stroke="none">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case 'escalated':
      return (
        <svg {...c}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'closed':
      return (
        <svg {...c}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'knowledge':
      return (
        <svg {...c}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5V4.5A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    default:
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

/** Normalized bucket for agent list tabs (matches backend agent_tab_status / ticket.status). */
function agentTabKey(ticket) {
  // Always bucket from parent ticket lifecycle status to avoid UI drift from
  // assignment-level derived states (grouped task completion, etc.).
  const raw = ticket?.status;
  if (raw === undefined || raw === null) return '';
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'reopened') return 'in_progress';
  if (ticket?.closed_at) return 'closed';
  return normalized;
}

function ticketActivityMs(t) {
  const c = t?.created_at ? new Date(t.created_at).getTime() : 0;
  const u = t?.updated_at ? new Date(t.updated_at).getTime() : 0;
  const x = Math.max(c, u);
  return Number.isFinite(x) ? x : 0;
}

function buildConversationKeyAgentUser({ ticketId, agentId, userId }) {
  const a = { side: 'agent', id: String(agentId || 'agent') };
  const b = { side: 'user', id: String(userId || 'user') };
  const ordered = [a, b].sort((x, y) => `${x.side}:${x.id}`.localeCompare(`${y.side}:${y.id}`));
  return `tk:${ticketId}::${ordered[0].side}:${ordered[0].id}__${ordered[1].side}:${ordered[1].id}`;
}

const AgentDashboard = ({ agent, onLogout }) => {
  const navigate = useNavigate();
  // SECURITY CHECK: Ensure only agents can access this dashboard
  useEffect(() => {
    console.log('🔒 AgentDashboard: Checking user role...');
    console.log('👤 Agent prop:', agent);
    
    // Temporarily disable security check for debugging
    console.log('🔍 TEMPORARILY DISABLED SECURITY CHECK FOR DEBUGGING');
    /*
    // Check if user is actually an agent (support_agent or admin)
    if (!agent || (agent.role !== 'support_agent' && agent.role !== 'admin')) {
      console.log('❌ Access denied - User is not an agent:', agent?.role);
      console.log('🔄 Redirecting to login...');
      navigate('/login', { replace: true });
      return;
    }
    */
    
    console.log('✅ AgentDashboard: Access granted for agent:', agent?.name);
  }, [agent, navigate]);
  
  const [tickets, setTickets] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedProduct, setSelectedProduct] = useState('all'); // 'all' or product ID
  
  // Chat state
  const [ticketReplies, setTicketReplies] = useState({});
  
  // Quick reply state
  const [quickReplies, setQuickReplies] = useState({});
  const [sendingReplies, setSendingReplies] = useState({});
  
  // SLA Timer state
  const [slaTimers, setSlaTimers] = useState({});
  
  // SLA Configurations state
  const [slaConfigurations, setSlaConfigurations] = useState({});
  const [slaConfigsLoading, setSlaConfigsLoading] = useState(true);
  
  // Notification state
  const [notifications, setNotifications] = useState([]);
  
  // New ticket assignment notification state
  const [showNewTicketNotification, setShowNewTicketNotification] = useState(false);
  const [newTicketCount, setNewTicketCount] = useState(0);
  const notifiedNewTicketIdsRef = useRef(new Set());
  const lastCustomerReplyRef = useRef({});
  
  // Ticket status change notification state
  const [showStatusNotification, setShowStatusNotification] = useState(false);
  const [statusNotificationMessage, setStatusNotificationMessage] = useState('');
  const [statusNotificationType, setStatusNotificationType] = useState('');
  const [showUserReplyNotification, setShowUserReplyNotification] = useState(false);
  const [userReplyNotificationMessage, setUserReplyNotificationMessage] = useState('');
  const seenGroupedTaskIdsRef = useRef(new Set());
  const groupedTaskNotifInitializedRef = useRef(false);
  
  // Real-time timer updates
  const [currentTime, setCurrentTime] = useState(new Date());
  // SLA timers map (server-computed; snapshot-based)
  const [slaTimersByTicketId, setSlaTimersByTicketId] = useState({});

  // Sorting state
  const [sortConfig, setSortConfig] = useState({
    key: 'updated_at',
    direction: 'desc'
  });
  const [statsSortConfig, setStatsSortConfig] = useState({
    key: 'count',
    direction: 'desc'
  });

  // Ticket filter state
  const [agents, setAgents] = useState([]);
  const [selectedAgentFilter, setSelectedAgentFilter] = useState('');
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [taskProgressMap, setTaskProgressMap] = useState({});

  const location = useLocation();
  const wsRef = useRef(null);

  const handleLogout = () => {
    if (onLogout) {
      onLogout(); // Clears sessionStorage + localStorage, sets user null → redirects to login
    } else {
      ['userData', 'userToken', 'tickUser', 'token', 'agentData', 'agentToken', 'is_logged_in', 'session_expires', 'login_timestamp', 'remembered_login_id', 'remembered_password'].forEach(k => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });
      navigate('/login');
    }
  };
  
  // Fetch tickets from API - Only tickets assigned to this agent (fresh from DB each time)
  const fetchTickets = async () => {
    try {
      setLoading(true);
      
      // Get agent ID: prefer prop, then staffData (never customerData - prevents tab confusion)
      let agentId = agent?.id;
      if (!agentId) {
        const userData = sessionStorage.getItem('staffData') || localStorage.getItem('staffData') ||
          sessionStorage.getItem('userData') || localStorage.getItem('agentData');
        if (userData) {
          try {
            const parsed = JSON.parse(userData);
            agentId = parsed.id;
          } catch {}
        }
      }
      
      if (!agentId) {
        console.error('❌ Agent ID not found');
        setTickets([]);
        return;
      }
      
      const response = await fetch(buildApiUrl(`/api/tickets/agent/${agentId}`), {
        method: 'GET',
        headers: getAuthHeaders()
      });
      
      console.log('📡 Agent Dashboard - Tickets response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        const ticketsArray = Array.isArray(result.data) ? result.data : [];
        const groupedProgressMap = {};
        ticketsArray.forEach((ticket) => {
          if (!ticket?.id) return;
          const total = Number(ticket.total_tasks || 0);
          const completed = Number(ticket.completed_tasks || 0);
          if (total > 0) groupedProgressMap[ticket.id] = { total, completed };
        });
        setTaskProgressMap(groupedProgressMap);
        
        // Check for truly new actionable tickets:
        // - created in last 5 minutes
        // - still in NEW status (not moved to in_progress/resolved/closed)
        // - not already notified in this session
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const newTickets = ticketsArray.filter(ticket => {
          const ticketCreatedAt = new Date(ticket.created_at);
          const tab = agentTabKey(ticket);
          const isStillNew = tab === 'new';
          const ticketKey = String(ticket.id);
          const isAlreadyNotified = notifiedNewTicketIdsRef.current.has(ticketKey);
          return ticketCreatedAt > fiveMinutesAgo && isStillNew && !isAlreadyNotified;
        });
        
        // Show notification if there are new tickets
        if (newTickets.length > 0) {
          newTickets.forEach((ticket) => {
            notifiedNewTicketIdsRef.current.add(String(ticket.id));
          });
          setNewTicketCount(newTickets.length);
          setShowNewTicketNotification(true);
          console.log(`🎉 Found ${newTickets.length} new tickets assigned to agent!`);
          
          // Auto-hide notification after 5 seconds
          setTimeout(() => {
            setShowNewTicketNotification(false);
            setNewTicketCount(0);
          }, 5000);
        }
        
        setTickets(ticketsArray);
        // Fetch SLA timers in ONE bulk call (server uses stored SLA snapshot due times).
        try {
          const ids = ticketsArray.map((t) => Number(t?.id || 0)).filter(Boolean).slice(0, 200);
          if (ids.length) {
            const r = await fetch(buildApiUrl('/api/sla/timers/bulk-remaining'), {
              method: 'POST',
              headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticketIds: ids })
            });
            const j = await r.json().catch(() => ({}));
            if (r.ok && j?.success && j?.data && typeof j.data === 'object') {
              setSlaTimersByTicketId(j.data);
            } else {
              setSlaTimersByTicketId({});
            }
          } else {
            setSlaTimersByTicketId({});
          }
        } catch {
          setSlaTimersByTicketId({});
        }
        console.log('✅ Agent Dashboard - Fetched tickets for agent:', ticketsArray.length);
        console.log('📊 Agent Dashboard - Tickets data:', ticketsArray);
      } else {
        console.error('❌ Agent Dashboard - Failed to fetch tickets:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('❌ Agent Dashboard - Error response:', errorText);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
      setTaskProgressMap({});
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignedTasks = async () => {
    try {
      let agentId = agent?.id;
      if (!agentId) {
        const userData = sessionStorage.getItem('staffData') || localStorage.getItem('staffData') ||
          sessionStorage.getItem('userData') || localStorage.getItem('agentData');
        if (userData) {
          try {
            const parsed = JSON.parse(userData);
            agentId = parsed.id;
          } catch {}
        }
      }
      if (!agentId) return;
      const response = await fetch(buildApiUrl(`/api/ticket-tasks/agent/${agentId}`), {
        method: 'GET',
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (response.ok && result.success) {
        const tasks = Array.isArray(result.data) ? result.data : [];
        if (!groupedTaskNotifInitializedRef.current) {
          tasks.forEach((task) => {
            if (task?.id) seenGroupedTaskIdsRef.current.add(String(task.id));
          });
          groupedTaskNotifInitializedRef.current = true;
        } else {
          const newTasks = tasks.filter((task) => task?.id && !seenGroupedTaskIdsRef.current.has(String(task.id)));
          if (newTasks.length > 0) {
            newTasks.forEach((task) => seenGroupedTaskIdsRef.current.add(String(task.id)));
            const firstTask = newTasks[0];
            const groupedAgents = firstTask?.grouped_assigned_agents || 'assigned agents';
            const msg = newTasks.length === 1
              ? `Grouped ticket #${firstTask.ticket_id} task assigned to you. Assigned agents: ${groupedAgents}`
              : `${newTasks.length} new grouped tasks assigned to you.`;
            setStatusNotificationMessage(msg);
            setStatusNotificationType('grouped_task');
            setShowStatusNotification(true);
            setTimeout(() => setShowStatusNotification(false), 2000);
          }
        }
        setAssignedTasks(tasks);
      }
    } catch (e) {
      console.error('Error fetching assigned tasks:', e);
      setAssignedTasks([]);
    }
  };

  // Single refresh action for tickets + tasks + dashboard data
  const handleRefreshDashboard = async () => {
    await Promise.all([
      fetchTickets(),
      fetchAssignedTasks(),
      fetchProducts(),
      fetchSLAConfigurations(),
      fetchCurrentAgentInfo()
    ]);
  };

  // Fetch products for the dropdown
  const fetchProducts = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/sla/products'), {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setProducts(result.data);
        }
      } else {
        console.error('Failed to fetch products');
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  // Get current agent information (storage, then prop fallback)
  const [currentAgent, setCurrentAgent] = useState(() =>
    agent
      ? {
          id: agent.id,
          name: agent.name,
          email: agent.email,
          availability_status: agent.availability_status || 'available'
        }
      : null
  );

  const NAV_TICKET_TABS = ['new', 'in_progress', 'escalated', 'closed'];
  const agentTabSeenStorageKey =
    currentAgent?.id != null || agent?.id != null
      ? `agentDashTabLastSeen:${currentAgent?.id ?? agent?.id}`
      : null;
  const [tabLastSeenMs, setTabLastSeenMs] = useState(null);
  const tabSeenPrevTabRef = useRef(undefined);

  useEffect(() => {
    if (!agentTabSeenStorageKey) return;
    try {
      const raw = localStorage.getItem(agentTabSeenStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const next = {};
        for (const k of NAV_TICKET_TABS) {
          next[k] = typeof parsed[k] === 'number' && Number.isFinite(parsed[k]) ? parsed[k] : Date.now();
        }
        setTabLastSeenMs(next);
        localStorage.setItem(agentTabSeenStorageKey, JSON.stringify(next));
      } else {
        const initial = Object.fromEntries(NAV_TICKET_TABS.map((k) => [k, Date.now()]));
        localStorage.setItem(agentTabSeenStorageKey, JSON.stringify(initial));
        setTabLastSeenMs(initial);
      }
    } catch {
      const initial = Object.fromEntries(NAV_TICKET_TABS.map((k) => [k, Date.now()]));
      try {
        localStorage.setItem(agentTabSeenStorageKey, JSON.stringify(initial));
      } catch {}
      setTabLastSeenMs(initial);
    }
  }, [agentTabSeenStorageKey]);

  useEffect(() => {
    if (!agentTabSeenStorageKey || !tabLastSeenMs) return;
    const prev = tabSeenPrevTabRef.current;
    if (!NAV_TICKET_TABS.includes(activeTab)) {
      tabSeenPrevTabRef.current = activeTab;
      return;
    }
    const arrived = prev !== activeTab;
    tabSeenPrevTabRef.current = activeTab;
    if (!arrived) return;
    setTabLastSeenMs((p) => {
      if (!p) return p;
      const next = { ...p, [activeTab]: Date.now() };
      try {
        localStorage.setItem(agentTabSeenStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [activeTab, agentTabSeenStorageKey, tabLastSeenMs]);

  const [availabilityUpdating, setAvailabilityUpdating] = useState(false);
  const availabilityOptions = [
    { value: 'available', label: 'Available' },
    { value: 'unavailable', label: 'Unavailable' },
    { value: 'on_leave', label: 'On Leave' }
  ];
  const getAvailabilityLabel = (value) =>
    availabilityOptions.find((opt) => opt.value === value)?.label || 'Available';
  const getNormalizedAvailability = (value) => {
    const normalized = String(value || '').toLowerCase();
    if (['available', 'unavailable', 'on_leave'].includes(normalized)) return normalized;
    return 'available';
  };
  const persistAvailabilityToStaffStorage = (nextStatus) => {
    const keys = ['staffData', 'userData', 'agentData'];
    keys.forEach((key) => {
      const existing = sessionStorage.getItem(key) || localStorage.getItem(key);
      if (!existing) return;
      try {
        const parsed = JSON.parse(existing);
        const updated = {
          ...parsed,
          availability_status: nextStatus,
          availabilityStatus: nextStatus
        };
        if (sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, JSON.stringify(updated));
        }
        if (localStorage.getItem(key)) {
          localStorage.setItem(key, JSON.stringify(updated));
        }
      } catch (_) {
        // Ignore malformed storage values
      }
    });
  };
  
  const fetchCurrentAgentInfo = async () => {
    console.log('🔍 fetchCurrentAgentInfo - Starting...');
    let hydratedFromStorage = false;

    // Preferred: current agent profile from backend (includes persisted availability status)
    try {
      const profileRes = await fetch(buildApiUrl('/api/agents/profile'), { headers: getAuthHeaders() });
      if (profileRes.ok) {
        const profileJson = await profileRes.json();
        if (profileJson.success && profileJson.data?.id) {
          const profile = profileJson.data;
          setCurrentAgent({
            id: profile.id,
            name: profile.name || 'Agent',
            email: profile.email || 'No email available',
            availability_status: getNormalizedAvailability(profile.availability_status || profile.availabilityStatus)
          });
          persistAvailabilityToStaffStorage(getNormalizedAvailability(profile.availability_status || profile.availabilityStatus));
          console.log('✅ Loaded agent profile from /api/agents/profile');
          return;
        }
      }
    } catch (e) {
      console.warn('Could not fetch /api/agents/profile:', e?.message);
    }
    
    // Use staffData first - prevents customer tab from overwriting agent name
    const staffData = sessionStorage.getItem('staffData') || localStorage.getItem('staffData');
    const userData = localStorage.getItem('userData');
    const agentData = localStorage.getItem('agentData');
    
    const dataToUse = staffData || userData || agentData;
    if (dataToUse) {
      try {
        const parsed = JSON.parse(dataToUse);
        // Only use if it looks like staff (not customer)
        if (!parsed.role || ['support_agent', 'support_manager', 'ceo', 'admin'].includes(parsed.role)) {
          const name = parsed.name || parsed.login_id;
          if (name && name !== 'Agent') {
            setCurrentAgent({
              id: parsed.id,
              name,
              email: parsed.email || 'No email available',
              availability_status: getNormalizedAvailability(parsed.availability_status || parsed.availabilityStatus)
            });
            hydratedFromStorage = true;
            console.log('✅ Using staff/agent data:', name);
          }
        }
      } catch (e) {
        console.error('Error parsing agent data:', e);
      }
    }
    
    // Fallback: use agent prop from App
    if (!hydratedFromStorage && agent?.name && agent.name !== 'Agent') {
      setCurrentAgent({
        id: agent.id,
        name: agent.name,
        email: agent.email || 'No email available',
        availability_status: getNormalizedAvailability(agent.availability_status || agent.availabilityStatus)
      });
      console.log('✅ Using agent prop:', agent.name);
    }
    
    // Last resort: fetch from API /api/auth/profile (JWT identifies current user)
    try {
      const res = await fetch(buildApiUrl('/api/auth/profile'), { headers: getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.name) {
          setCurrentAgent({
            id: json.data.id,
            name: json.data.name,
            email: json.data.email || 'No email available',
            availability_status: getNormalizedAvailability(json.data.availability_status || json.data.availabilityStatus)
          });
          console.log('✅ Fetched agent name from API:', json.data.name);
          return;
        }
      }
    } catch (e) {
      console.warn('Could not fetch agent profile:', e?.message);
    }
    
    // Only use generic "Agent" if all else fails
    setCurrentAgent({
      id: agent?.id || null,
      name: 'Agent',
      email: 'No email available',
      availability_status: 'available'
    });
    console.log('⚠️ No agent name found, using default');
  };

  const handleAvailabilityStatusChange = async (nextStatus) => {
    if (!nextStatus || availabilityUpdating) return;
    const previous = currentAgent?.availability_status || 'available';
    if (nextStatus === previous) return;

    setAvailabilityUpdating(true);
    setCurrentAgent((prev) => (prev ? { ...prev, availability_status: nextStatus } : prev));
    try {
      const response = await fetch(buildApiUrl('/api/agents/profile/availability'), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ availabilityStatus: nextStatus })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.message || 'Failed to update availability');
      }
      const savedStatus = getNormalizedAvailability(result?.data?.availability_status || result?.data?.availabilityStatus || nextStatus);
      setCurrentAgent((prev) => (prev ? { ...prev, availability_status: savedStatus } : prev));
      persistAvailabilityToStaffStorage(savedStatus);
    } catch (error) {
      console.error('Failed to update availability status:', error);
      setCurrentAgent((prev) => (prev ? { ...prev, availability_status: previous } : prev));
    } finally {
      setAvailabilityUpdating(false);
    }
  };

  // Fetch SLA configurations for timer calculations (requires auth for tenant filtering)
  const fetchSLAConfigurations = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/sla/configurations'), {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Create a lookup map for quick access
          const configMap = {};
          result.data.forEach(config => {
            const key = `${config.product_id}_${config.module_id}_${config.issue_name}`;
            configMap[key] = config;
            // Fallback: module-level key (first config for product+module wins)
            const moduleKey = `${config.product_id}_${config.module_id}`;
            if (!configMap[moduleKey]) configMap[moduleKey] = config;
          });

          setSlaConfigurations(configMap);
        } else {
          console.error('❌ Failed to fetch SLA configurations:', result.message);
        }
      } else {
        console.error('❌ Failed to fetch SLA configurations');
      }
    } catch (error) {
      console.error('❌ Error fetching SLA configurations:', error);
    } finally {
      setSlaConfigsLoading(false);
    }
  };

  // WebSocket for real-time ticket updates (e.g. priority change by manager)
  useEffect(() => {
    let agentId = currentAgent?.id ?? agent?.id;
    if (!agentId) {
      const staffData = sessionStorage.getItem('staffData') || localStorage.getItem('staffData') ||
        sessionStorage.getItem('userData') || localStorage.getItem('agentData');
      if (staffData) {
        try {
          const parsed = JSON.parse(staffData);
          if (parsed?.id) agentId = parsed.id;
        } catch {}
      }
    }
    if (!agentId) return;
    const WS_URL = (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace(/^http/, 'ws').replace(/\/api\/?$/, '') + '/ws';
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'SUBSCRIBE_AGENT_DASHBOARD',
        userId: agentId,
        tenantId: getTenantId() || 1
      }));
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'TICKET_UPDATED' && data.priority) {
          setTickets(prev => prev.map(t =>
            t.id === data.ticketId ? { ...t, priority: data.priority } : t
          ));
          setStatusNotificationMessage(`Ticket #${data.ticketId} priority changed to ${data.priority}`);
          setStatusNotificationType('info');
          setShowStatusNotification(true);
          setTimeout(() => setShowStatusNotification(false), 2000);
        }
      } catch {}
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [currentAgent?.id, agent?.id]);

  useEffect(() => {
    fetchTickets();
    fetchAssignedTasks();
    fetchProducts();
    fetchSLAConfigurations();
    fetchCurrentAgentInfo();
    
    // Check if we're returning from a ticket detail page with preserved state
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }
    if (location.state?.selectedProduct) {
      setSelectedProduct(location.state.selectedProduct);
    }
    
    return () => {
      // Cleanup
    };
  }, []); // Changed from [location.state] to [] to run on mount

  // Auto-refresh disabled: agents reported it is disruptive while viewing the dashboard.

  // Handle location state changes separately
  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab === 'grouped_tasks' ? 'in_progress' : location.state.activeTab);
    }
    if (location.state?.selectedProduct) {
      setSelectedProduct(location.state.selectedProduct);
    }
  }, [location.state]);

  // Real-time timer updates every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Update filtered tickets when tickets change (no agent filtering needed since we only fetch agent's tickets)
  useEffect(() => {
    setFilteredTickets(tickets);
  }, [tickets]);

  // Check SLA breach and show notification
  const checkSLABreach = async (ticketId) => {
    try {
      const response = await fetch(buildApiUrl(`/api/sla/timers/${ticketId}/remaining`), {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.length > 0) {
          const timer = data.data[0];
          
          // Check if ticket was auto-escalated
          if (timer.auto_escalated) {
            // Intentionally suppressed: SLA breach notifications should not appear on screen.
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error checking SLA breach:', error);
    }
  };

  // Ensure any legacy SLA breach notifications never render
  useEffect(() => {
    setNotifications((prev) => (Array.isArray(prev) ? prev.filter((n) => n?.type !== 'sla_breach') : []));
  }, []);

  // Calculate SLA timer for a ticket (tries issue_type, issue_name, then module-level fallback)
  const calculateSLATimer = (ticket) => {
    if (!ticket?.id) return null;
    const t = slaTimersByTicketId?.[Number(ticket.id)] || null;
    if (!t) return null;
    // Bulk timers endpoint doesn't include total minutes; derive from ticket fields with safe fallback.
    const derivedTotal = Number(ticket?.sla_resolution_time_minutes || ticket?.sla_response_time_minutes || 0) || 480;
    return {
      remainingMinutes: Number(t.remaining_minutes ?? 0),
      isBreached: !!t.is_breached,
      isWarning: !!t.is_warning,
      slaTimeMinutes: derivedTotal
    };
  };

  // Format time for display
  const formatSLATime = (minutes) => {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m < 0) return '—';
    if (m < 60) {
      return `${m}m`;
    } else if (m < 1440) {
      const hours = Math.floor(m / 60);
      const mins = m % 60;
      return `${hours}h ${mins}m`;
    } else {
      const days = Math.floor(m / (60 * 24));
      const hours = Math.floor((m % (60 * 24)) / 60);
      return `${days}d ${hours}h`;
    }
  };

  // Recalculate tabList when selectedProduct changes
  useEffect(() => {
    // This will trigger a re-render when selectedProduct changes
  }, [selectedProduct]);

  // Move ticket to In Progress
  const handleOpenTicket = async (ticketId) => {
    try {
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/status`), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'in_progress' })
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        await fetchTickets();
        showStatusChangeNotification(
          data.updated_scope === 'my_assignment' ? 'assignment_in_progress' : 'in_progress'
        );
      } else {
        console.error('Failed to update ticket status', data?.message);
      }
    } catch (error) {
      console.error('Error updating ticket status:', error);
    }
  };


  // Handle status change for centralized ticket component
  const handleStatusChange = async (ticketId, newStatus) => {
    try {
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/status`), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        const result = await response.json();
        await fetchTickets();
        if (newStatus === 'in_progress' && result.updated_scope === 'my_assignment') {
          showStatusChangeNotification('assignment_in_progress');
        } else if (newStatus === 'escalated' && result.updated_scope === 'my_assignment') {
          showStatusChangeNotification('assignment_escalated');
        } else {
          showStatusChangeNotification(newStatus);
        }

        if (result.whatsappSent === false) {
          console.log('ℹ️ WhatsApp notification disabled (token expired)');
        }
      } else {
        console.error(`Failed to change ticket status to ${newStatus}`);
      }
    } catch (error) {
      console.error('Error changing ticket status:', error);
    }
  };



  const getTicketsByStatus = (status) => {
    const want = String(status || '').trim().toLowerCase();
    let filteredTickets = tickets.filter((ticket) => agentTabKey(ticket) === want);
    
    // Apply product filter if a specific product is selected
    if (selectedProduct !== 'all') {
      filteredTickets = filteredTickets.filter(ticket => {
        // Check if ticket has product_id that matches
        if (ticket.product_id === parseInt(selectedProduct)) {
          return true;
        }
        
        // If no product_id, check if product name matches (case-insensitive)
        if (ticket.product && typeof ticket.product === 'string') {
          const selectedProductObj = products.find(p => p.id === parseInt(selectedProduct));
          if (selectedProductObj) {
            const ticketProduct = ticket.product.toLowerCase().trim();
            const productName = selectedProductObj.name.toLowerCase().trim();
            
            return ticketProduct === productName || 
                   ticketProduct.includes(productName) || 
                   productName.includes(ticketProduct);
          }
        }
        
        return false;
      });
    }
    
    return filteredTickets;
  };

  const navUnreadCounts = useMemo(() => {
    const empty = { new: 0, in_progress: 0, escalated: 0, closed: 0 };
    if (!tabLastSeenMs) return empty;

    const byStatus = (status) => {
      const want = String(status || '').trim().toLowerCase();
      let filtered = tickets.filter((ticket) => agentTabKey(ticket) === want);
      if (selectedProduct !== 'all') {
        filtered = filtered.filter((ticket) => {
          if (ticket.product_id === parseInt(selectedProduct, 10)) return true;
          if (ticket.product && typeof ticket.product === 'string') {
            const selectedProductObj = products.find((p) => p.id === parseInt(selectedProduct, 10));
            if (selectedProductObj) {
              const ticketProduct = ticket.product.toLowerCase().trim();
              const productName = selectedProductObj.name.toLowerCase().trim();
              return (
                ticketProduct === productName ||
                ticketProduct.includes(productName) ||
                productName.includes(ticketProduct)
              );
            }
          }
          return false;
        });
      }
      return filtered;
    };

    const countUnread = (list, tabKey) => {
      const seen = tabLastSeenMs[tabKey];
      if (typeof seen !== 'number' || !Number.isFinite(seen)) return 0;
      return list.filter((t) => ticketActivityMs(t) > seen).length;
    };

    return {
      new: countUnread(byStatus('new'), 'new'),
      in_progress: countUnread(byStatus('in_progress'), 'in_progress'),
      escalated: countUnread(byStatus('escalated'), 'escalated'),
      closed: countUnread([...byStatus('closed'), ...byStatus('resolved')], 'closed')
    };
  }, [tickets, products, selectedProduct, tabLastSeenMs]);

  const filteredAllTickets = getTicketsByStatus('new')
    .concat(getTicketsByStatus('in_progress'))
    .concat(getTicketsByStatus('resolved'))
    .concat(getTicketsByStatus('escalated'))
    .concat(getTicketsByStatus('closed'));
  const assignedTotalCount = filteredAllTickets.length;
  const openCount = getTicketsByStatus('new').length + getTicketsByStatus('in_progress').length;
  const closedCount = getTicketsByStatus('closed').length + getTicketsByStatus('resolved').length;
  const escalatedCount = getTicketsByStatus('escalated').length;
  const activeCount = getTicketsByStatus('new').length + getTicketsByStatus('in_progress').length + getTicketsByStatus('escalated').length;
  const slaEvaluatedCount = filteredAllTickets.filter(t => t && (t.sla_first_response_met === 1 || t.sla_first_response_met === 0 || t.sla_first_response_met === true || t.sla_first_response_met === false)).length;
  const slaMetCount = filteredAllTickets.filter(t => t && (t.sla_first_response_met === 1 || t.sla_first_response_met === true)).length;
  const slaMetPercent = slaEvaluatedCount > 0 ? Math.round((slaMetCount / slaEvaluatedCount) * 100) : 0;

  const newStatCount = getTicketsByStatus('new').length;
  const inProgressStatCount = getTicketsByStatus('in_progress').length;

  const MAX_FIRST_RESPONSE_MINUTES_OVERVIEW = 30 * 24 * 60;
  const firstResponseMinutesList = filteredAllTickets
    .filter(t => t?.first_response_at && t?.created_at)
    .map(t => {
      const created = new Date(t.created_at).getTime();
      const firstResp = new Date(t.first_response_at).getTime();
      return (firstResp - created) / (60 * 1000);
    })
    .filter(m => m <= MAX_FIRST_RESPONSE_MINUTES_OVERVIEW && m >= 0);
  const avgResponseMinutes =
    firstResponseMinutesList.length > 0
      ? Math.round(firstResponseMinutesList.reduce((a, b) => a + b, 0) / firstResponseMinutesList.length)
      : null;

  const resolutionRatePercent =
    assignedTotalCount > 0 ? Math.round((closedCount / assignedTotalCount) * 100) : 0;

  const overdueTicketsCount = filteredAllTickets.filter((t) => {
    const tab = agentTabKey(t);
    if (tab === 'closed') return false;
    const timer = calculateSLATimer(t);
    return Boolean(timer?.isBreached);
  }).length;

  const tabList = [
    { key: 'overview', label: 'Overview', icon: 'overview', trackUnread: false },
    { key: 'new', label: 'New', icon: 'new', trackUnread: true },
    { key: 'in_progress', label: 'In Progress', icon: 'in_progress', trackUnread: true },
    { key: 'escalated', label: 'Escalated', icon: 'escalated', trackUnread: true },
    { key: 'closed', label: 'Closed', icon: 'closed', trackUnread: true }
  ];

  // Chat helper functions
  const fetchTicketReplies = useCallback(async (ticketId) => {
    try {
      const response = await fetch(buildApiUrl(`/api/chat/messages/${ticketId}`), {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      
      if (data.success) {
        const replies = Array.isArray(data.data) ? data.data : [];
        const customerReplies = replies.filter((r) => {
          const senderType = (r?.sender_type || r?.senderType || '').toLowerCase();
          return senderType === 'user' || senderType === 'customer';
        });

        if (customerReplies.length > 0) {
          const latestCustomerReply = customerReplies.reduce((latest, current) => {
            const latestTs = new Date(latest?.created_at || latest?.createdAt || 0).getTime();
            const currentTs = new Date(current?.created_at || current?.createdAt || 0).getTime();
            return currentTs >= latestTs ? current : latest;
          }, customerReplies[0]);

          const latestReplyId = String(
            latestCustomerReply?.id ??
            latestCustomerReply?.message_id ??
            `${latestCustomerReply?.created_at || latestCustomerReply?.createdAt || ''}_${latestCustomerReply?.message || ''}`
          );
          const previousReplyId = lastCustomerReplyRef.current[ticketId];

          if (previousReplyId && previousReplyId !== latestReplyId) {
            const ticket = tickets.find((t) => t && Number(t.id) === Number(ticketId));
            const customerName = latestCustomerReply?.sender_name || latestCustomerReply?.customer_name || 'User';
            setUserReplyNotificationMessage(
              `New message from ${customerName} on ticket #${ticketId}${ticket?.issue_title ? ` (${ticket.issue_title})` : ''}`
            );
            setShowUserReplyNotification(true);
            setTimeout(() => setShowUserReplyNotification(false), 5000);
          }
          lastCustomerReplyRef.current[ticketId] = latestReplyId;
        }

        setTicketReplies(prev => ({
          ...prev,
          [ticketId]: replies
        }));
      }
    } catch (error) {
      console.error('Error fetching ticket replies:', error);
    }
  }, [tickets]);

  // Fetch ticket replies when tickets are loaded
  useEffect(() => {
    if (tickets.length > 0) {
      tickets.forEach(ticket => fetchTicketReplies(ticket.id));
      // Stagger SLA breach checks for open tickets only (avoids burst of API calls)
      const openTickets = tickets.filter((t) => {
        const tab = agentTabKey(t);
        return tab && tab !== 'closed';
      });
      openTickets.forEach((ticket, i) => {
        setTimeout(() => checkSLABreach(ticket.id), i * 150);
      });
    }
  }, [tickets, fetchTicketReplies]);

  // Auto-polling disabled: agents reported it is disruptive while viewing the dashboard.

  // Handle quick reply submission
  const handleQuickReply = async (ticketId, message) => {
    if (!message.trim() || sendingReplies[ticketId]) return;
    
    try {
      setSendingReplies(prev => ({ ...prev, [ticketId]: true }));
      
      const ticket = tickets.find((t) => Number(t?.id) === Number(ticketId));
      const conversationKey = buildConversationKeyAgentUser({
        ticketId,
        agentId: agent?.id || ticket?.assigned_to || ticket?.agent_id || null,
        userId: ticket?.user_id || ticket?.email || ticket?.user_email || null
      });

      const response = await fetch(buildApiUrl('/api/chat/messages'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ticketId: ticketId,
          senderType: 'agent',
          senderId: null, // Will be set by backend based on agent session
          senderName: 'Support Agent',
          message: message.trim(),
          messageType: 'text',
          conversationKey
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Clear the quick reply input
        setQuickReplies(prev => ({ ...prev, [ticketId]: '' }));
        
        // Refresh ticket replies
        await fetchTicketReplies(ticketId);
        
        // Show success feedback
        console.log('✅ Quick reply sent successfully');
      } else {
        console.error('Failed to send quick reply:', data.message);
      }
    } catch (error) {
      console.error('Error sending quick reply:', error);
    } finally {
      setSendingReplies(prev => ({ ...prev, [ticketId]: false }));
    }
  };

  // Handle quick reply input change
  const handleQuickReplyChange = (ticketId, value) => {
    setQuickReplies(prev => ({ ...prev, [ticketId]: value }));
  };

  // Handle quick reply key press (Enter to send)
  const handleQuickReplyKeyPress = (e, ticketId) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const message = quickReplies[ticketId] || '';
      if (message.trim()) {
        handleQuickReply(ticketId, message);
      }
    }
  };

  // Get priority color from ticket priority only.
  const getPriorityColor = (priority) => {
    const p = (priority || '').toLowerCase();
    if (p === 'urgent') return '#ff4444';
    if (p === 'high') return '#ff8800';
    if (p === 'medium') return '#ffaa00';
    if (p === 'low') return '#44aa44';
    return '#666666';
  };

  // Format ticket priority for display.
  const formatPriorityLabel = (priority) => {
    const p = (priority || '').toLowerCase();
    if (['urgent', 'high', 'medium', 'low'].includes(p)) {
      return p.charAt(0).toUpperCase() + p.slice(1);
    }
    return 'Medium';
  };

  // Priority badge for list view - final active ticket priority only.
  const PriorityBadge = ({ ticket }) => {
    const priority = String(ticket.priority || 'medium').toLowerCase();
    const color = getPriorityColor(priority);
    return (
      <span
        className="priority-badge"
        style={{
          background: color,
          color: '#fff',
          padding: '2px 8px',
          borderRadius: '6px',
          fontSize: '0.75rem',
          fontWeight: 600
        }}
        title={`Priority: ${formatPriorityLabel(priority)}`}
      >
        {formatPriorityLabel(priority)}
      </span>
    );
  };

  // Sorting functions
  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleStatsSort = (key) => {
    setStatsSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortTickets = (ticketsToSort) => {
    if (!sortConfig.key) return ticketsToSort;

    return [...ticketsToSort].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle date sorting
      if (sortConfig.key === 'created_at' || sortConfig.key === 'updated_at' || sortConfig.key === 'closed_at') {
        aValue = new Date(aValue || 0);
        bValue = new Date(bValue || 0);
      }

      // Handle priority sorting from ticket.priority only.
      if (sortConfig.key === 'priority') {
        const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
        const getPriorityVal = (t) => {
          const p = String(t.priority || 'medium').toLowerCase();
          return priorityOrder[p] || 0;
        };
        aValue = getPriorityVal(a);
        bValue = getPriorityVal(b);
      }

      // Handle status sorting (use agent tab bucket)
      if (sortConfig.key === 'status') {
        const statusOrder = { new: 1, in_progress: 2, resolved: 3, escalated: 4, closed: 5 };
        aValue = statusOrder[agentTabKey(a)] || 0;
        bValue = statusOrder[agentTabKey(b)] || 0;
      }

      // Handle string sorting
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  const sortStats = (statsData) => {
    return statsData.sort((a, b) => {
      let aValue, bValue;

      if (statsSortConfig.key === 'count') {
        aValue = a.count;
        bValue = b.count;
      } else if (statsSortConfig.key === 'label') {
        aValue = a.label.toLowerCase();
        bValue = b.label.toLowerCase();
      } else if (statsSortConfig.key === 'key') {
        aValue = a.key.toLowerCase();
        bValue = b.key.toLowerCase();
      }

      if (aValue < bValue) {
        return statsSortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return statsSortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' ? '⬆️' : '⬇️';
  };

  const getStatsSortIcon = (key) => {
    if (statsSortConfig.key !== key) return '';
    return statsSortConfig.direction === 'asc' ? '⬆️' : '⬇️';
  };

  const resetAllSorting = () => {
    setSortConfig({ key: 'updated_at', direction: 'desc' });
    setStatsSortConfig({ key: 'count', direction: 'desc' });
  };

  // Helper function to get product display name
  const getProductDisplayName = (ticket) => {
    // If ticket has a product string, use it
    if (ticket.product && typeof ticket.product === 'string' && ticket.product.trim()) {
      return ticket.product;
    }
    
    // If ticket has product_id, look up the product name
    if (ticket.product_id && products.length > 0) {
      const productObj = products.find(p => p.id === ticket.product_id);
      if (productObj && productObj.name) {
        return productObj.name;
      }
    }
    
    // Fallback
    return 'No Product';
  };

  const truncateText = (str, maxLen) => {
    if (!str || typeof str !== 'string') return '';
    const t = str.trim();
    if (t.length <= maxLen) return t;
    return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
  };

  const formatTabStatusLabel = (ticket) => {
    const k = agentTabKey(ticket);
    const labels = {
      new: 'NEW',
      in_progress: 'IN PROGRESS',
      resolved: 'RESOLVED',
      escalated: 'ESCALATED',
      closed: 'CLOSED'
    };
    return labels[k] || (k ? String(k).replace(/_/g, ' ').toUpperCase() : '—');
  };

  const renderIssueTableCell = (ticket) => {
    const progress = taskProgressMap[ticket.id] || null;
    const total = Number(progress?.total || ticket.total_tasks || 0);
    const completed = Number(progress?.completed || ticket.completed_tasks || 0);
    const isGrouped = Number(ticket?.is_grouped || 0) === 1 || total > 0;
    const groupedAgents = isGrouped
      ? (ticket?.grouped_assigned_agents || '')
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
          .join(', ')
      : '';
    const desc = ticket.description && String(ticket.description).trim();
    let sub = '';
    if (desc) sub = truncateText(desc, 100);
    else if (isGrouped) {
      sub = `Grouped • ${completed}/${total} completed`;
      if (groupedAgents) sub += ` • Agents: ${groupedAgents}`;
    } else if (ticket.issue_type || ticket.issue_name) {
      sub = String(ticket.issue_type || ticket.issue_name);
    }
    return (
      <div className="adr-table-issue">
        <div className="adr-table-issue__title">{ticket.issue_title || 'No Title'}</div>
        {sub ? <div className="adr-table-issue__sub">{sub}</div> : null}
      </div>
    );
  };

  // Simple Inline SLA Timer Component - shows SLA time, remaining time, and within/breach status
  const SLATimerIndicator = ({ ticket }) => {
    if (slaConfigsLoading) {
      return (
        <div className="sla-timer-indicator loading">
          Loading...
        </div>
      );
    }

    const slaTimer = calculateSLATimer(ticket);

    if (!slaTimer) {
      return (
        <div className="sla-timer-indicator no-config">
          No SLA
        </div>
      );
    }

    const { remainingMinutes, isBreached, isWarning, slaTimeMinutes } = slaTimer;

    let statusClass = 'normal';
    if (isBreached) statusClass = 'breached';
    else if (isWarning) statusClass = 'warning';

    return (
      <div className={`sla-timer-indicator ${statusClass}`} title={`SLA: ${formatSLATime(slaTimeMinutes)} resolution | ${isBreached ? 'Breached' : isWarning ? 'Close to breach' : 'Within SLA'}`}>
        <span className="sla-total">Total: {formatSLATime(slaTimeMinutes)}</span>
        <span className="sla-sep">|</span>
        {isBreached ? (
          <span className="sla-overdue">{formatSLATime(Math.abs(remainingMinutes))} OVERDUE</span>
        ) : (
          <span className="sla-remaining">{formatSLATime(remainingMinutes)} left</span>
        )}
      </div>
    );
  };

  // Function to close the new ticket notification
  const closeNewTicketNotification = () => {
    setShowNewTicketNotification(false);
    setNewTicketCount(0);
  };

  // Function to show status change notification
  const showStatusChangeNotification = (status) => {
    let message = '';
    let type = '';
    
    switch (status) {
      case 'assignment_in_progress':
        message = 'Your assignment is now in progress';
        type = 'in_progress';
        break;
      case 'assignment_escalated':
        message = 'Your assignment was escalated';
        type = 'escalated';
        break;
      case 'in_progress':
        message = 'Ticket In Progress';
        type = 'in_progress';
        break;
      case 'closed':
        message = 'Ticket Closed';
        type = 'closed';
        break;
      case 'escalated':
        message = 'Ticket Escalated';
        type = 'escalated';
        break;
      default:
        message = `Ticket ${status}`;
        type = status;
    }
    
    setStatusNotificationMessage(message);
    setStatusNotificationType(type);
    setShowStatusNotification(true);
    
    // Auto-hide notification after 3 seconds
    setTimeout(() => {
      setShowStatusNotification(false);
      setStatusNotificationMessage('');
      setStatusNotificationType('');
    }, 3000);
  };

  // Function to close the status notification
  const closeStatusNotification = () => {
    setShowStatusNotification(false);
    setStatusNotificationMessage('');
    setStatusNotificationType('');
  };

  const openTicketDetail = (ticketId) => {
    navigate(`/agent/ticket/${ticketId}`, {
      state: {
        from: 'agent-dashboard',
        returnPath: '/agentdashboard',
        activeTab,
        selectedProduct
      }
    });
  };

  const ticketsForListTab = (() => {
    switch (activeTab) {
      case 'new':
        return getTicketsByStatus('new');
      case 'in_progress':
        return getTicketsByStatus('in_progress');
      case 'escalated':
        return getTicketsByStatus('escalated');
      case 'closed':
        return [...getTicketsByStatus('closed'), ...getTicketsByStatus('resolved')];
      default:
        return [];
    }
  })();

  const rawAgentName = (currentAgent?.name || agent?.name || '').trim();
  const welcomeAgentLabel =
    rawAgentName && rawAgentName !== 'Agent'
      ? /^agent\s+/i.test(rawAgentName)
        ? rawAgentName
        : `Agent ${rawAgentName}`
      : 'Agent';

  if (loading) {
    return (
      <div className="agent-dashboard agent-dashboard-ref adr-loading-screen">
        <div className="adr-loading-spinner" aria-hidden />
        <p className="adr-loading-text">Loading tickets...</p>
      </div>
    );
  }

  return (
    <div className="agent-dashboard agent-dashboard-ref">
      {/* New Ticket Assignment Notification Popup */}
      {showNewTicketNotification && (
        <div className="new-ticket-notification-popup">
          <div className="notification-content">
            <div className="notification-text">
              <h3>New Ticket Assigned!</h3>
              <p>
                {newTicketCount === 1 
                  ? 'You have been assigned 1 new ticket.' 
                  : `You have been assigned ${newTicketCount} new tickets.`
                }
              </p>
            </div>
            <button 
              className="notification-close-btn"
              onClick={closeNewTicketNotification}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Ticket Status Change Notification Popup */}
      {showStatusNotification && (
        <div className="status-notification-popup">
          <div className="notification-content">
            <div className="notification-icon">
              {statusNotificationType === 'in_progress' && '⚡'}
              {statusNotificationType === 'closed' && '✅'}
              {statusNotificationType === 'escalated' && '🚨'}
            </div>
            <div className="notification-text">
              <h3>{statusNotificationMessage}</h3>
            </div>
            <button 
              className="notification-close-btn"
              onClick={closeStatusNotification}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {showUserReplyNotification && (
        <div className="status-notification-popup">
          <div className="notification-content">
            <div className="notification-icon">💬</div>
            <div className="notification-text">
              <h3>{userReplyNotificationMessage}</h3>
            </div>
            <button
              className="notification-close-btn"
              onClick={() => setShowUserReplyNotification(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}
      
      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="notifications-container">
          {notifications.map(notification => (
            <div key={notification.id} className={`notification ${notification.type}`}>
              <span className="notification-message">{notification.message}</span>
              <button 
                className="notification-close"
                onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      
      <header className="adr-header">
        <div className="adr-header__inner">
          <div className="adr-header__left">
            <div className="adr-header__text">
              <h1 className="adr-header__title">Agent Dashboard</h1>
              <p className="adr-header__welcome">Welcome, {welcomeAgentLabel} 👋</p>
              <p className="adr-header__email">{currentAgent?.email || 'No email available'}</p>
            </div>
            <div className="adr-availability">
              <span
                className={`adr-availability__dot${
                  (currentAgent?.availability_status || 'available') === 'available' ? '' : ' adr-availability__dot--muted'
                }`}
                aria-hidden
              />
              <select
                className="adr-availability__select"
                value={currentAgent?.availability_status || 'available'}
                onChange={(e) => handleAvailabilityStatusChange(e.target.value)}
                disabled={availabilityUpdating}
                aria-label="Availability status"
              >
                {availabilityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="adr-header__actions">
            <button type="button" className="adr-btn adr-btn--ghost" onClick={handleRefreshDashboard}>
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh Tickets
            </button>
            <button type="button" className="adr-btn adr-btn--ghost" onClick={() => navigate('/products')}>
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
              Product Dashboard
            </button>
            <HeaderNotificationBell />
            <button type="button" className="adr-btn adr-btn--ghost adr-btn--logout" onClick={handleLogout}>
              <svg className="adr-btn__icon adr-btn__icon--danger" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="adr-shell">
        <nav className="adr-sidebar" aria-label="Ticket status">
          <div className="adr-sidebar__title">Ticket status</div>
          {tabList.map((tab) => (
            <button
              key={tab.key}
              type="button"
              data-tab={tab.key}
              className={`adr-nav-row${activeTab === tab.key ? ' adr-nav-row--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className={`adr-nav-icon adr-nav-icon--${tab.icon}`}>
                <AdrSidebarIcon name={tab.icon} />
              </span>
              <span className="adr-nav-label">{tab.label}</span>
              {tab.trackUnread && navUnreadCounts[tab.key] > 0 ? (
                <span className="adr-nav-badge">{navUnreadCounts[tab.key]}</span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            className="adr-nav-row"
            onClick={() => navigate('/agent/knowledge-base')}
          >
            <span className="adr-nav-icon adr-nav-icon--knowledge">
              <AdrSidebarIcon name="knowledge" />
            </span>
            <span className="adr-nav-label">Knowledge Base</span>
          </button>
        </nav>

        <main className="adr-main">
          {activeTab === 'overview' && (
            <div className="adr-dashboard">
              <div className="adr-dashboard__head">
                <h2 className="adr-dashboard__title">Dashboard Statistics</h2>
                <p className="adr-dashboard__sub">Your ticket overview at a glance</p>
              </div>
              <div className="adr-kpi-row">
                <article className="adr-kpi adr-kpi--purple">
                  <div className="adr-kpi__icon-wrap">
                    <AgdashNavIcon name="overview" />
                  </div>
                  <div className="adr-kpi__body">
                    <span className="adr-kpi__num">{assignedTotalCount}</span>
                    <span className="adr-kpi__label">Total tickets</span>
                  </div>
                </article>
                <article className="adr-kpi adr-kpi--blue">
                  <div className="adr-kpi__icon-wrap">
                    <AgdashNavIcon name="new" />
                  </div>
                  <div className="adr-kpi__body">
                    <span className="adr-kpi__num">{newStatCount}</span>
                    <span className="adr-kpi__label">New tickets</span>
                  </div>
                </article>
                <article className="adr-kpi adr-kpi--amber">
                  <div className="adr-kpi__icon-wrap">
                    <AgdashNavIcon name="in_progress_kpi" />
                  </div>
                  <div className="adr-kpi__body">
                    <span className="adr-kpi__num">{inProgressStatCount}</span>
                    <span className="adr-kpi__label">In progress</span>
                  </div>
                </article>
                <article className="adr-kpi adr-kpi--green">
                  <div className="adr-kpi__icon-wrap">
                    <AgdashNavIcon name="closed" />
                  </div>
                  <div className="adr-kpi__body">
                    <span className="adr-kpi__num">{closedCount}</span>
                    <span className="adr-kpi__label">Closed</span>
                  </div>
                </article>
              </div>
              <div className="adr-metric-row">
                <article className="adr-metric-card">
                  <div className="adr-metric-card__hd">
                    <div className="adr-metric-card__ico" aria-hidden>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                    </div>
                    <span className="adr-metric-card__label">Avg. response time</span>
                  </div>
                  <div className="adr-metric-card__value">
                    {avgResponseMinutes != null ? `${avgResponseMinutes}m` : '—'}
                  </div>
                  <p className="adr-metric-card__trend adr-metric-card__trend--pos">
                    <span aria-hidden>↓</span> 12% from last week
                  </p>
                </article>
                <article className="adr-metric-card">
                  <div className="adr-metric-card__hd">
                    <div className="adr-metric-card__ico adr-metric-card__ico--fill" aria-hidden>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
                      </svg>
                    </div>
                    <span className="adr-metric-card__label">Resolution rate</span>
                  </div>
                  <div className="adr-metric-card__value">{resolutionRatePercent}%</div>
                  <p className="adr-metric-card__trend adr-metric-card__trend--pos">
                    <span aria-hidden>↑</span> 5% from last week
                  </p>
                </article>
                <article className="adr-metric-card adr-metric-card--overdue">
                  <div className="adr-metric-card__hd">
                    <div className="adr-metric-card__ico adr-metric-card__ico--warn" aria-hidden>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </div>
                    <span className="adr-metric-card__label">Overdue tickets</span>
                  </div>
                  <div className="adr-metric-card__value adr-metric-card__value--danger">{overdueTicketsCount}</div>
                  <p className="adr-metric-card__foot">Requires attention</p>
                </article>
              </div>
            </div>
          )}

          {activeTab !== 'overview' && (
            <div className="adr-tickets">
              <div className="adr-tickets__head">
                <h2 className="adr-tickets__title">
                  {activeTab === 'new' && 'New Tickets'}
                  {activeTab === 'in_progress' && 'In Progress Tickets'}
                  {activeTab === 'escalated' && 'Escalated Tickets'}
                  {activeTab === 'closed' && 'Closed Tickets'}
                </h2>
                <p className="adr-tickets__sub">Sort columns from the table header.</p>
              </div>
              <div className="adr-table-scroll">
                <table className="adr-ticket-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        <button type="button" className="adr-th-btn" onClick={() => handleSort('id')}>
                          Ticket {getSortIcon('id')}
                        </button>
                      </th>
                      <th scope="col">
                        <button type="button" className="adr-th-btn" onClick={() => handleSort('issue_title')}>
                          Issue name {getSortIcon('issue_title')}
                        </button>
                      </th>
                      <th scope="col">
                        <button type="button" className="adr-th-btn" onClick={() => handleSort('status')}>
                          Status {getSortIcon('status')}
                        </button>
                      </th>
                      <th scope="col">
                        <button type="button" className="adr-th-btn" onClick={() => handleSort('priority')}>
                          Priority {getSortIcon('priority')}
                        </button>
                      </th>
                      <th scope="col">
                        <button type="button" className="adr-th-btn" onClick={() => handleSort('product')}>
                          Product {getSortIcon('product')}
                        </button>
                      </th>
                      <th scope="col">
                        <button type="button" className="adr-th-btn" onClick={() => handleSort('created_at')}>
                          SLA timer {getSortIcon('created_at')}
                        </button>
                      </th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortTickets(ticketsForListTab).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="adr-ticket-table__empty">
                          No tickets in this view.
                        </td>
                      </tr>
                    ) : (
                      sortTickets(ticketsForListTab).map((ticket) => {
                        const sk = agentTabKey(ticket) || 'unknown';
                        return (
                          <tr key={ticket.id}>
                            <td className="adr-td-ticket">
                              <span className="adr-td-ticket__id">#{ticket.id}</span>
                            </td>
                            <td>{renderIssueTableCell(ticket)}</td>
                            <td>
                              <span className={`adr-status-pill adr-status-pill--${sk}`}>
                                {formatTabStatusLabel(ticket)}
                              </span>
                            </td>
                            <td>
                              <PriorityBadge ticket={ticket} />
                            </td>
                            <td className="adr-td-muted">{getProductDisplayName(ticket)}</td>
                            <td className="adr-td-sla">
                              <SLATimerIndicator ticket={ticket} />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="adr-table-view-btn"
                                onClick={() => openTicketDetail(ticket.id)}
                              >
                                <svg
                                  className="adr-table-view-btn__ico"
                                  viewBox="0 0 24 24"
                                  width="14"
                                  height="14"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  aria-hidden
                                >
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                                View Ticket
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

export default AgentDashboard;