import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAuthHeaders } from '../../utils/api';
import UserForm from '../tickets/UserForm';
import { formatDateTimeIST } from '../../utils/dateTime';
import MdashKpiIcon from './MdashKpiIcon';
import FeedbackInsightsPage from '../feedback/FeedbackInsightsPage';
import ManagerEscalationRequests from './ManagerEscalationRequests';
import MailInbox from './MailInbox';
import HeaderNotificationBell from '../common/HeaderNotificationBell';
import './ManagerDashboard.css';
import './ManagerDashboard.ref.css';

/** Manager sidebar nav icons (manager-only; mirrors agent sidebar shapes + extra tabs). */
function MdrSidebarIcon({ name }) {
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
    case 'analytics':
      return (
        <svg {...c}>
          <path d="M18 20V10" />
          <path d="M12 20V4" />
          <path d="M6 20v-6" />
        </svg>
      );
    case 'team':
      return (
        <svg {...c}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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
    case 'feedback':
      return (
        <svg {...c}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M8 10h8" />
          <path d="M8 14h5" />
        </svg>
      );
    case 'knowledge':
      return (
        <svg {...c}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5V4.5A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case 'mail_review':
      return (
        <svg {...c}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
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

function ticketActivityMs(t) {
  const c = t?.created_at ? new Date(t.created_at).getTime() : 0;
  const u = t?.updated_at ? new Date(t.updated_at).getTime() : 0;
  const x = Math.max(c, u);
  return Number.isFinite(x) ? x : 0;
}

/** Ticket list views reachable from KPI clicks (not all appear in sidebar). */
const MANAGER_TICKET_LIST_TAB_KEYS = ['new', 'in_progress', 'escalated', 'closed', 'all', 'sla_overdue'];

const ManagerDashboard = ({ manager, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // SECURITY CHECK: Ensure only managers can access this dashboard
  useEffect(() => {
    console.log('🔒 ManagerDashboard: Checking user role...');
    console.log('👤 Manager prop:', manager);
    
    // Check if user is actually a manager (support_manager)
    if (!manager || manager.role !== 'support_manager') {
      console.log(' Access denied - User is not a manager:', manager?.role);
      console.log('🔄 Redirecting to login...');
      navigate('/login', { replace: true });
      return;
    }
    
    console.log('✅ ManagerDashboard: Access granted for manager:', manager.name);
  }, [manager, navigate]);
  const [tickets, setTickets] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [products, setProducts] = useState([]);
  const [slaConfigurations, setSlaConfigurations] = useState({});
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState('overview');
  const [selectedProduct, setSelectedProduct] = useState('all');
  const [ticketReplies, setTicketReplies] = useState({});
  const [taskProgressMap, setTaskProgressMap] = useState({});
  const [showManagerCreateTicket, setShowManagerCreateTicket] = useState(false);
  const [managerAssignAgentId, setManagerAssignAgentId] = useState('');
  
  // Escalated ticket detail view state
  const [selectedEscalatedTicket, setSelectedEscalatedTicket] = useState(null);
  const [escalatedTicketView, setEscalatedTicketView] = useState('ticket'); // 'ticket' or 'chat'
  
  // In Progress ticket detail view state
  const [selectedInProgressTicket, setSelectedInProgressTicket] = useState(null);
  const [inProgressTicketView, setInProgressTicketView] = useState('ticket'); // 'ticket' or 'chat'
  
  // Closed ticket detail view state
  const [selectedClosedTicket, setSelectedClosedTicket] = useState(null);
  const [closedTicketView, setClosedTicketView] = useState('ticket'); // 'ticket' or 'chat'
  
  // Reply functionality state
  const [replyText, setReplyText] = useState('');
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [selectedTicketForReply, setSelectedTicketForReply] = useState(null);
  const [buttonToggle, setButtonToggle] = useState(false); // For button color toggle
  const [pendingMailCount, setPendingMailCount] = useState(0);
  
  // New agent assignment notification state
  const [showNewAgentNotification, setShowNewAgentNotification] = useState(false);
  const [, setNewAgentCount] = useState(0);
  const seenAgentNotificationIdsRef = useRef(new Set());

  const managerSeenStorageKey = manager?.id
    ? `managerSeenAgentNotifications:${manager.id}`
    : null;

  const NAV_TICKET_TABS = ['new', 'in_progress', 'escalated', 'closed'];
  const managerTabSeenStorageKey =
    manager?.id != null ? `managerDashTabLastSeen:${manager.id}` : null;
  const [tabLastSeenMs, setTabLastSeenMs] = useState(null);
  const tabSeenPrevTabRef = useRef(undefined);

  useEffect(() => {
    if (!managerTabSeenStorageKey) return;
    try {
      const raw = localStorage.getItem(managerTabSeenStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const next = {};
        for (const k of NAV_TICKET_TABS) {
          next[k] = typeof parsed[k] === 'number' && Number.isFinite(parsed[k]) ? parsed[k] : Date.now();
        }
        setTabLastSeenMs(next);
        localStorage.setItem(managerTabSeenStorageKey, JSON.stringify(next));
      } else {
        const initial = Object.fromEntries(NAV_TICKET_TABS.map((k) => [k, Date.now()]));
        localStorage.setItem(managerTabSeenStorageKey, JSON.stringify(initial));
        setTabLastSeenMs(initial);
      }
    } catch {
      const initial = Object.fromEntries(NAV_TICKET_TABS.map((k) => [k, Date.now()]));
      try {
        localStorage.setItem(managerTabSeenStorageKey, JSON.stringify(initial));
      } catch {}
      setTabLastSeenMs(initial);
    }
  }, [managerTabSeenStorageKey]);

  useEffect(() => {
    if (!managerTabSeenStorageKey || !tabLastSeenMs) return;
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
        localStorage.setItem(managerTabSeenStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [activeTab, managerTabSeenStorageKey, tabLastSeenMs]);

  useEffect(() => {
    if (!managerSeenStorageKey) return;
    try {
      const raw = localStorage.getItem(managerSeenStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      seenAgentNotificationIdsRef.current = new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      seenAgentNotificationIdsRef.current = new Set();
    }
  }, [managerSeenStorageKey]);
  
  const [performanceMetrics, setPerformanceMetrics] = useState({
    totalTickets: 0,
    resolvedTickets: 0,
    avgResolutionTime: 0,
    avgFirstResponseMinutes: null,
    slaMet: 0,
    slaBreached: 0,
    closedThisWeek: 0,
    closedLastWeek: 0,
    teamPerformance: []
  });

  const [listSortConfig, setListSortConfig] = useState({ key: 'updated_at', direction: 'desc' });
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [slaConfigsLoading, setSlaConfigsLoading] = useState(true);

  const getAvailabilityLabel = (status) => {
    const normalized = String(status || 'available').toLowerCase();
    if (normalized === 'on_leave') return 'On Leave';
    if (normalized === 'unavailable') return 'Unavailable';
    return 'Available';
  };

  useEffect(() => {
    const tab = location.state?.activeTab;
    if (tab && MANAGER_TICKET_LIST_TAB_KEYS.includes(tab)) {
      setActiveTab(tab);
      navigate('.', { replace: true, state: {} });
    }
  }, [location.state?.activeTab, navigate]);

  const goToManagerTicketList = (tab) => {
    if (MANAGER_TICKET_LIST_TAB_KEYS.includes(tab)) setActiveTab(tab);
  };

  const managerKpiCardProps = (tab, colorMod) => ({
    className: `adr-kpi ${colorMod} adr-kpi--clickable`,
    role: 'button',
    tabIndex: 0,
    onClick: () => goToManagerTicketList(tab),
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goToManagerTicketList(tab);
      }
    }
  });

  // In-progress ticket view handlers
  const handleInProgressTicketView = (ticket) => {
    navigate(`/manager/ticket/${ticket.id}`);
  };

  const closeInProgressTicketView = () => {
    setSelectedInProgressTicket(null);
    setInProgressTicketView('ticket');
  };

  // Fetch tickets and team data
  const fetchData = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      if (isRefresh) setIsRefreshing(true);
      
      const headers = getAuthHeaders();
      console.log('🔑 Using auth headers for data fetch');
      
      // Fetch tickets
      const ticketsResponse = await fetch('/api/tickets', {
        method: 'GET',
        headers: headers
      });
      
      console.log('📡 Tickets response status:', ticketsResponse.status);
      
      let ticketsData = [];
      if (ticketsResponse.ok) {
        const result = await ticketsResponse.json();
        ticketsData = result.data || [];
        setTickets(ticketsData);
        console.log(' Fetched tickets:', ticketsData.length);

        if (ticketsData.length > 0) {
          try {
            const progressRes = await fetch('/api/ticket-tasks/progress/bulk', {
              method: 'POST',
              headers: headers,
              body: JSON.stringify({ ticketIds: ticketsData.map(t => t.id) })
            });
            const progressJson = await progressRes.json();
            if (progressRes.ok && progressJson.success) {
              setTaskProgressMap(progressJson.data || {});
            } else {
              setTaskProgressMap({});
            }
          } catch (_) {
            setTaskProgressMap({});
          }
        } else {
          setTaskProgressMap({});
        }
      } else {
        console.error(' Failed to fetch tickets:', ticketsResponse.status);
      }

      // Fetch team members (support executives) from agents table
      const teamResponse = await fetch('/api/agents', {
        method: 'GET',
        headers: headers
      });
      
      console.log('📡 Team response status:', teamResponse.status);
      
      if (teamResponse.ok) {
        const teamData = await teamResponse.json();
        const teamMembersData = teamData.data || [];
        setTeamMembers(teamMembersData);
        console.log('✅ Fetched team members:', teamMembersData.length);
        
        // Debug: Log all team members and their roles immediately
        console.log('🔍 All team members with roles:', teamMembersData.map(m => ({ 
          id: m.id, 
          name: m.name, 
          role: m.role,
          email: m.email 
        })));
        
        // Check for new agents assigned to this manager (created in the last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const newAgents = teamMembersData.filter(agent => {
          const agentCreatedAt = new Date(agent.created_at);
          const isAssignedToManager = agent.manager_id === manager?.id;
          const alreadySeen = seenAgentNotificationIdsRef.current.has(String(agent.id));
          return agentCreatedAt > fiveMinutesAgo && isAssignedToManager && !alreadySeen;
        });
        
        // Show notification if there are new agents
        if (newAgents.length > 0) {
          newAgents.forEach((agent) => {
            seenAgentNotificationIdsRef.current.add(String(agent.id));
          });
          if (managerSeenStorageKey) {
            localStorage.setItem(
              managerSeenStorageKey,
              JSON.stringify(Array.from(seenAgentNotificationIdsRef.current))
            );
          }
          setNewAgentCount(newAgents.length);
          setShowNewAgentNotification(true);
          console.log(`🎉 Found ${newAgents.length} new agents assigned to manager!`);
          
          // Auto-hide notification after 5 seconds
          setTimeout(() => {
            setShowNewAgentNotification(false);
            setNewAgentCount(0);
          }, 5000);
        }
        
        // Calculate performance metrics with the fetched data
        calculatePerformanceMetrics(ticketsData, teamMembersData);
      } else {
        console.error('❌ Failed to fetch team members:', teamResponse.status);
      }
      
      // For refresh operations, keep the refreshing state for 1 second
      if (isRefresh) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error(' Error fetching data:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const getDisplayTickets = () => {
    if (selectedProduct === 'all') return tickets;
    return tickets.filter(t =>
      String(t.product_id) === String(selectedProduct) ||
      (t.product && String(t.product) === String(selectedProduct))
    );
  };

  // Overview "Recent Tickets": show latest created tickets and recently active tickets
  // (e.g. in_progress/reopened/reassigned reflected by updated_at).
  const getRecentOverviewTickets = () => {
    const toMs = (value) => {
      const parsed = new Date(value || 0).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return getDisplayTickets()
      .filter((t) => t && t.id)
      .map((t) => {
        const createdMs = toMs(t.created_at);
        const updatedMs = toMs(t.updated_at) || createdMs;
        const status = (t.status || '').toLowerCase();
        const isActiveWorkflow = ['new', 'in_progress', 'resolved', 'escalated'].includes(status);
        const recentTs = isActiveWorkflow ? Math.max(createdMs, updatedMs) : createdMs;
        return { ...t, _recentTs: recentTs };
      })
      .sort((a, b) => b._recentTs - a._recentTs)
      .slice(0, 10);
  };

  const calculatePerformanceMetrics = (ticketsData, teamMembersData) => {
    const totalTickets = ticketsData.length;
    const resolvedTickets = ticketsData.filter(t => t.status === 'closed').length;

    // Average Resolution Time = SUM(Resolved/Closed Time - Created Time) / COUNT(all resolved/closed tickets)
    const MAX_RESOLUTION_MINUTES = 90 * 24 * 60; // 90 days - exclude outliers
    const MAX_FIRST_RESPONSE_MINUTES = 30 * 24 * 60; // 30 days

    const closedTickets = ticketsData.filter(t => t.status === 'closed');
    const closedTicketsWithTime = closedTickets.filter(t => {
      const closedAt = t.resolved_at || t.updated_at;
      if (!closedAt || !t.created_at) return false;
      const created = new Date(t.created_at).getTime();
      const closed = new Date(closedAt).getTime();
      const minutes = (closed - created) / (60 * 1000);
      return minutes <= MAX_RESOLUTION_MINUTES && minutes >= 0;
    });
    const sumResolutionMinutes = closedTicketsWithTime.reduce((acc, t) => {
      const closedAt = t.resolved_at || t.updated_at;
      const created = new Date(t.created_at).getTime();
      const closed = new Date(closedAt).getTime();
      return acc + (closed - created) / (60 * 1000);
    }, 0);
    const avgResolutionTimeMinutes = closedTicketsWithTime.length > 0
      ? sumResolutionMinutes / closedTicketsWithTime.length
      : 0;
    const avgResolutionTime = avgResolutionTimeMinutes / 60; // Convert minutes to hours

    // Average First Response Time = SUM(First Agent Response - Ticket Created) / COUNT(tickets with at least one agent response)
    const ticketsWithFirstResponse = ticketsData.filter(t => t.first_response_at).map(t => {
      const created = new Date(t.created_at).getTime();
      const firstResp = new Date(t.first_response_at).getTime();
      const minutes = (firstResp - created) / (60 * 1000);
      return { ...t, _firstResponseMinutes: minutes };
    }).filter(t => t._firstResponseMinutes <= MAX_FIRST_RESPONSE_MINUTES && t._firstResponseMinutes >= 0);

    const sumFirstResponseMinutes = ticketsWithFirstResponse.reduce((acc, t) => acc + t._firstResponseMinutes, 0);
    const avgFirstResponseMinutes = ticketsWithFirstResponse.length > 0
      ? sumFirstResponseMinutes / ticketsWithFirstResponse.length
      : null;

    const ticketsWithSlaResult = ticketsData.filter(t => t.sla_first_response_met !== null && t.sla_first_response_met !== undefined);
    const slaMet = ticketsWithSlaResult.filter(t => t.sla_first_response_met === 1 || t.sla_first_response_met === true).length;
    const slaBreached = ticketsWithSlaResult.filter(t => t.sla_first_response_met === 0 || t.sla_first_response_met === false).length;

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const closedThisWeek = ticketsData.filter(t => {
      const closed = t.resolved_at || t.updated_at;
      return t.status === 'closed' && closed && new Date(closed) >= oneWeekAgo;
    }).length;
    const closedLastWeek = ticketsData.filter(t => {
      const closed = t.resolved_at || t.updated_at;
      return t.status === 'closed' && closed && new Date(closed) >= twoWeeksAgo && new Date(closed) < oneWeekAgo;
    }).length;

    const supportExecutives = teamMembersData.filter(member =>
      member.role === 'agent' || member.role === 'support_agent' || member.role === 'Support Executive'
    );

    const toMs = (value) => {
      const parsed = new Date(value || 0).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const toNumber = (value) => Number(value);
    const formatBoundedMinutes = (minutes, maxMinutes) => minutes >= 0 && minutes <= maxMinutes;
    const getSlaConfigForTicket = (ticket) => {
      if (!ticket?.product_id || !ticket?.module_id) return null;
      const baseKey = `${ticket.product_id}_${ticket.module_id}`;
      const issue = ticket.issue_type || ticket.issue_name || '';
      const exactKey = issue ? `${baseKey}_${issue}` : null;
      return (exactKey && slaConfigurations[exactKey]) || slaConfigurations[baseKey] || null;
    };

    const teamPerformanceData = supportExecutives.map(member => {
      const memberTickets = ticketsData.filter(t => toNumber(t.assigned_to) === toNumber(member.id));
      const assignedTickets = memberTickets.length;
      const resolvedTickets = memberTickets.filter(t => t.status === 'closed').length;
      const activeTickets = memberTickets.filter(t => ['new', 'in_progress', 'resolved', 'escalated'].includes((t.status || '').toLowerCase())).length;
      const escalationCount = memberTickets.filter(t => (t.status || '').toLowerCase() === 'escalated').length;

      const responseSlaMetTickets = memberTickets.filter(
        (t) => t.sla_first_response_met === 1 || t.sla_first_response_met === true
      ).length;
      const responseSlaPercent = assignedTickets > 0
        ? Math.round((responseSlaMetTickets / assignedTickets) * 100)
        : 0;

      const resolvedTicketSet = memberTickets.filter(
        (t) => ['resolved', 'closed'].includes((t.status || '').toLowerCase()) && t.created_at && (t.closed_at || t.resolved_at || t.updated_at)
      );
      const resolvedWithinSla = resolvedTicketSet.filter((t) => {
        const cfg = getSlaConfigForTicket(t);
        const slaResolutionMinutes = Number(cfg?.resolution_time_minutes || cfg?.response_time_minutes || 0);
        if (!slaResolutionMinutes) return false;
        const actualMinutes = (toMs(t.closed_at || t.resolved_at || t.updated_at) - toMs(t.created_at)) / (60 * 1000);
        return formatBoundedMinutes(actualMinutes, MAX_RESOLUTION_MINUTES) && actualMinutes <= slaResolutionMinutes;
      }).length;
      const resolutionSlaPercent = resolvedTicketSet.length > 0
        ? Math.round((resolvedWithinSla / resolvedTicketSet.length) * 100)
        : 0;

      return {
        ...member,
        assignedTickets,
        resolvedTickets,
        activeTickets,
        escalationCount,
        responseSlaPercent,
        resolutionSlaPercent
      };
    });

    setPerformanceMetrics({
      totalTickets,
      resolvedTickets,
      avgResolutionTime: Math.round(avgResolutionTime * 10) / 10, // 1 decimal place for hours
      avgFirstResponseMinutes: avgFirstResponseMinutes != null ? Math.round(avgFirstResponseMinutes) : null,
      slaMet,
      slaBreached,
      closedThisWeek,
      closedLastWeek,
      teamPerformance: teamPerformanceData
    });
  };

  // Function to recalculate metrics when tickets change
  const recalculateMetrics = () => {
    const displayTickets = getDisplayTickets();
    if (teamMembers.length > 0) {
      calculatePerformanceMetrics(displayTickets, teamMembers);
    }
  };

  useEffect(() => {
    fetchData();
    fetchProducts();
    fetchSLAConfigurations();
    fetchPendingMailCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // NOTE: Do not prefetch chat replies for all tickets on initial load.
  // Replies are fetched on-demand when a manager opens a specific ticket view.

  // Refresh data when analytics tab is selected
  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchData is stable
  }, [activeTab]);

  // Recalculate metrics whenever tickets change
  useEffect(() => {
    console.log('🔄 useEffect triggered for tickets/teamMembers change');
    console.log('  - tickets.length:', tickets.length);
    console.log('  - teamMembers.length:', teamMembers.length);
    
    if (tickets.length > 0 && teamMembers.length > 0) {
      console.log('✅ useEffect conditions met, calling recalculateMetrics');
      recalculateMetrics();
    } else {
      console.log('❌ useEffect conditions not met');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalculateMetrics is stable
  }, [tickets, teamMembers, selectedProduct, slaConfigurations]);

  const formatDate = (dateString) => {
    return formatDateTimeIST(dateString);
  };

  const formatPercent = (value) => `${Math.max(0, Number(value || 0))}%`;

  const fetchSLAConfigurations = async () => {
    setSlaConfigsLoading(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/sla/configurations', {
        method: 'GET',
        headers
      });
      if (!response.ok) return;
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        const map = {};
        result.data.forEach((cfg) => {
          const key = `${cfg.product_id}_${cfg.module_id}_${cfg.issue_name}`;
          const baseKey = `${cfg.product_id}_${cfg.module_id}`;
          map[key] = cfg;
          if (!map[baseKey]) map[baseKey] = cfg;
        });
        setSlaConfigurations(map);
      }
    } catch (error) {
      console.error('Error fetching SLA configurations for team metrics:', error);
    } finally {
      setSlaConfigsLoading(false);
    }
  };

  const fetchPendingMailCount = async () => {
    try {
      const response = await fetch('/api/mail-review', {
        method: 'GET',
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setPendingMailCount(result.data?.length || 0);
        }
      }
    } catch (error) {
      console.error('Error fetching mail count:', error);
    }
  };

  // Reply functionality
  const toggleReplyForm = (ticket = null) => {
    if (ticket) {
      setSelectedTicketForReply(ticket);
      setShowReplyForm(true);
      setReplyText('');
      setButtonToggle(false); // Reset button toggle when opening form
    } else {
      setShowReplyForm(false);
      setSelectedTicketForReply(null);
      setReplyText('');
      setButtonToggle(false); // Reset button toggle when closing form
    }
  };

  // Handle cancel button click with toggle effect
  const handleCancelClick = () => {
    setButtonToggle(!buttonToggle);
    // Close the form after a short delay to show the toggle effect
    setTimeout(() => {
      toggleReplyForm();
    }, 200);
  };

  const handleReplySubmit = async () => {
    if (!replyText.trim() || !selectedTicketForReply) {
      alert('Please enter a reply message');
      return;
    }

    setSendingReply(true);

    try {
      const payload = {
        ticket_id: selectedTicketForReply.id,
        message: replyText.trim(),
        agent_id: (() => { try { const d = localStorage.getItem('staffData') || localStorage.getItem('agentData'); return d ? JSON.parse(d).id : null; } catch { return null; } })()
      };

      const token = localStorage.getItem('staffToken') || sessionStorage.getItem('staffToken') || localStorage.getItem('userToken') || localStorage.getItem('access_token');
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch('/api/replies/dashboard', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Reply sent successfully:', result);
        
        // Clear reply form
        setReplyText('');
        setShowReplyForm(false);
        setSelectedTicketForReply(null);
        
        // Refresh data
        fetchData();
        
        // Show success message
        alert('Reply sent successfully!');
      } else {
        const errorData = await response.json();
        console.error('Failed to send reply:', errorData);
        alert(`Failed to send reply: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      alert(`Error sending reply: ${error.message}`);
    } finally {
      setSendingReply(false);
    }
  };

  // Fetch products for product names
  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('staffToken') || sessionStorage.getItem('staffToken') || localStorage.getItem('userToken') || localStorage.getItem('access_token');
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch('/api/sla/products', {
        method: 'GET',
        headers: headers
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setProducts(result.data);
          console.log('✅ Fetched products:', result.data.length);
        }
      } else {
        console.error(' Failed to fetch products:', response.status);
      }
    } catch (error) {
      console.error(' Error fetching products:', error);
    }
  };

  // Function to get product name by ID
  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'N/A';
  };

  const getTicketAssigneesLabel = (ticket) => {
    if (!ticket) return 'Unassigned';
    const total = Number(ticket.total_tasks ?? 0);
    const grouped = String(ticket.grouped_assigned_agents || '').trim();
    if (total > 0 || Number(ticket.is_grouped || 0) === 1) {
      return grouped || 'Unassigned';
    }
    return (
      ticket.assigned_to_name ||
      teamMembers.find((a) => a.id === ticket.assigned_to)?.name ||
      'Unassigned'
    );
  };

  const renderGroupedIssueMeta = (ticket) => {
    const fromMap = taskProgressMap[ticket.id];
    const total = Number(fromMap?.total ?? ticket.total_tasks ?? 0);
    const completed = Number(fromMap?.completed ?? ticket.completed_tasks ?? 0);
    const isGrouped = Number(ticket?.is_grouped || 0) === 1 || total > 0;
    if (!isGrouped) return null;
    const groupedAgents = (ticket?.grouped_assigned_agents || '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .join(', ');
    return (
      <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>
        Grouped • {completed}/{total} completed
        {groupedAgents ? ` • Agents: ${groupedAgents}` : ''}
      </div>
    );
  };

  const getTicketsByStatus = (status) => {
    return getDisplayTickets().filter(ticket => ticket.status === status);
  };

  const navUnreadCounts = useMemo(() => {
    const empty = { new: 0, in_progress: 0, escalated: 0, closed: 0 };
    if (!tabLastSeenMs) return empty;

    const countUnread = (list, tabKey) => {
      const seen = tabLastSeenMs[tabKey];
      if (typeof seen !== 'number' || !Number.isFinite(seen)) return 0;
      return list.filter((t) => ticketActivityMs(t) > seen).length;
    };

    return {
      new: countUnread(getTicketsByStatus('new'), 'new'),
      in_progress: countUnread(
        [...getTicketsByStatus('in_progress'), ...getTicketsByStatus('resolved')],
        'in_progress'
      ),
      escalated: countUnread(getTicketsByStatus('escalated'), 'escalated'),
      closed: countUnread(getTicketsByStatus('closed'), 'closed')
    };
  }, [tickets, selectedProduct, tabLastSeenMs]);

  // Function to handle escalated ticket view
  const handleEscalatedTicketView = (ticket) => {
    navigate(`/manager/ticket/${ticket.id}`);
  };

  // Function to close escalated ticket detail view
  const closeEscalatedTicketView = () => {
    setSelectedEscalatedTicket(null);
    setEscalatedTicketView('ticket');
  };

  // Function to handle closed ticket view
  const handleClosedTicketView = (ticket) => {
    setSelectedClosedTicket(ticket);
    setClosedTicketView('ticket');
    // Fetch ticket replies for chat support
    fetchTicketReplies(ticket.id);
  };

  // Function to close closed ticket detail view
  const closeClosedTicketView = () => {
    setSelectedClosedTicket(null);
    setClosedTicketView('ticket');
  };

  // Handle priority change for a ticket
  const handlePriorityChange = async (ticketId, newPriority) => {
    try {
      const headers = getAuthHeaders();
      headers['Content-Type'] = 'application/json';
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ priority: newPriority })
      });
      if (response.ok) {
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, priority: newPriority } : t));
        if (selectedInProgressTicket?.id === ticketId) {
          setSelectedInProgressTicket(prev => prev ? { ...prev, priority: newPriority } : null);
        }
        if (selectedEscalatedTicket?.id === ticketId) {
          setSelectedEscalatedTicket(prev => prev ? { ...prev, priority: newPriority } : null);
        }
      } else {
        const err = await response.json();
        alert(err.message || 'Failed to update priority');
      }
    } catch (error) {
      console.error('Error updating priority:', error);
      alert('Failed to update priority');
    }
  };

  // Reply functionality - Removed from dashboard, now only available in ticket detail view
  // Reply functionality has been moved to TicketDetailPage component


  // Chat helper functions
  const fetchTicketReplies = async (ticketId) => {
    try {
      const token = localStorage.getItem('staffToken') || sessionStorage.getItem('staffToken') || localStorage.getItem('userToken') || localStorage.getItem('access_token');
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Fetch unified messages (single source - all channels in one thread)
      const chatResponse = await fetch(`/api/chat/messages/${ticketId}`, {
        method: 'GET',
        headers: headers
      });
      const chatData = await chatResponse.json();

      const stripEmailQuoted = (text) => {
        if (!text || typeof text !== 'string') return text;
        const onWrote = text.search(/\s+On\s+[A-Za-z]{3},.+wrote:/i);
        if (onWrote > 0) return text.substring(0, onWrote).trim();
        const teamWrote = text.search(/\s+ITSM Ticketing Support Team[^>]*>?\s*wrote:/i);
        if (teamWrote > 0) return text.substring(0, teamWrote).trim();
        const fwd = text.search(/\n-{3,}\s*Forwarded message\s*-{3,}/i);
        if (fwd > 0) return text.substring(0, fwd).trim();
        return text;
      };
      let allMessages = [];
      if (chatData.success && Array.isArray(chatData.data)) {
        allMessages = chatData.data.map(m => {
          const raw = m.message || '';
          const clean = m.channel === 'email' ? stripEmailQuoted(raw) : raw;
          return {
          id: m.id,
          message: clean,
          content: clean,
          sender_type: m.sender_type,
          sender_name: m.sender_name,
          channel: m.channel,
          created_at: m.created_at,
          timestamp: m.created_at
        };
        });
      }

      // Already sorted chronologically from API
      
      setTicketReplies(prev => ({
        ...prev,
        [ticketId]: allMessages
      }));
    } catch (error) {
      console.error('❌ Error fetching ticket replies:', error);
    }
  };

  const tabList = [
    { key: 'overview', label: 'Overview', icon: 'overview', trackUnread: false },
    { key: 'analytics', label: 'Analytics', icon: 'analytics', trackUnread: false },
    { key: 'team', label: 'Team', icon: 'team', trackUnread: false },
    { key: 'feedback', label: 'Feedback Insights', icon: 'feedback', trackUnread: false },
    { key: 'escalation_requests', label: 'Escalation Requests', icon: 'escalated', trackUnread: false },
    { key: 'new', label: 'New', icon: 'new', trackUnread: true },
    { key: 'in_progress', label: 'In Progress', icon: 'in_progress', trackUnread: true },
    { key: 'escalated', label: 'Escalated', icon: 'escalated', trackUnread: true },
    { key: 'closed', label: 'Closed', icon: 'closed', trackUnread: true }
  ];

  const managerStatusKey = (ticket) => {
    const raw = ticket?.status;
    if (raw === undefined || raw === null) return '';
    return String(raw).trim().toLowerCase();
  };

  const calculateSLATimer = (ticket) => {
    if (!ticket?.product_id || !ticket?.module_id) return null;
    const baseKey = `${ticket.product_id}_${ticket.module_id}`;
    const issueType = ticket.issue_type || ticket.issue_name || '';
    const keyExact = issueType ? `${baseKey}_${issueType}` : null;
    let slaConfig =
      (keyExact && slaConfigurations[keyExact]) ||
      slaConfigurations[baseKey] ||
      Object.values(slaConfigurations).find(
        (c) => c.product_id === ticket.product_id && c.module_id === ticket.module_id
      );
    if (!slaConfig) return null;

    const now = currentTime;
    const ticketCreatedAt = new Date(ticket.created_at);
    const slaTimeMinutes = slaConfig.resolution_time_minutes || slaConfig.response_time_minutes || 480;
    const slaDeadline = new Date(ticketCreatedAt.getTime() + slaTimeMinutes * 60 * 1000);
    const remainingMs = slaDeadline.getTime() - now.getTime();
    const remainingMinutes = Math.floor(remainingMs / (1000 * 60));
    const isBreached = remainingMs < 0;
    const isWarning = remainingMinutes <= 30 && remainingMinutes > 0;

    return {
      remainingMinutes,
      isBreached,
      isWarning,
      slaTimeMinutes,
      deadline: slaDeadline,
      priority: slaConfig.priority_level
    };
  };

  const formatSLATime = (minutes) => {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m < 0) return '—';
    if (m < 60) return `${m}m`;
    if (m < 1440) {
      const hours = Math.floor(m / 60);
      const mins = m % 60;
      return `${hours}h ${mins}m`;
    }
    const days = Math.floor(m / (60 * 24));
    const hours = Math.floor((m % (60 * 24)) / 60);
    return `${days}d ${hours}h`;
  };

  const truncateText = (str, maxLen) => {
    if (!str || typeof str !== 'string') return '';
    const t = str.trim();
    if (t.length <= maxLen) return t;
    return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
  };

  const getProductDisplayName = (ticket) => {
    if (ticket.product && typeof ticket.product === 'string' && ticket.product.trim()) {
      return ticket.product;
    }
    if (ticket.product_id && products.length > 0) {
      const productObj = products.find((p) => p.id === ticket.product_id);
      if (productObj?.name) return productObj.name;
    }
    return 'No Product';
  };

  const formatManagerStatusLabel = (ticket) => {
    const k = managerStatusKey(ticket);
    const labels = {
      new: 'NEW',
      in_progress: 'IN PROGRESS',
      resolved: 'RESOLVED',
      escalated: 'ESCALATED',
      closed: 'CLOSED'
    };
    return labels[k] || (k ? String(k).replace(/_/g, ' ').toUpperCase() : '—');
  };

  const getPriorityColor = (priority) => {
    const p = (priority || '').toLowerCase();
    if (p === 'urgent') return '#ff4444';
    if (p === 'high') return '#ff8800';
    if (p === 'medium') return '#ffaa00';
    if (p === 'low') return '#44aa44';
    return '#666666';
  };

  const formatPriorityLabel = (priority) => {
    const p = (priority || '').toLowerCase();
    if (['urgent', 'high', 'medium', 'low'].includes(p)) {
      return p.charAt(0).toUpperCase() + p.slice(1);
    }
    return 'Medium';
  };

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
      <div
        className={`sla-timer-indicator ${statusClass}`}
        title={`SLA: ${formatSLATime(slaTimeMinutes)} resolution | ${isBreached ? 'Breached' : isWarning ? 'Close to breach' : 'Within SLA'}`}
      >
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

  const handleListSort = (key) => {
    setListSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getListSortIcon = (key) => {
    if (listSortConfig.key !== key) return '';
    return listSortConfig.direction === 'asc' ? '⬆️' : '⬇️';
  };

  const sortManagerListTickets = (ticketsToSort) => {
    const { key: sortKey, direction } = listSortConfig;
    if (!sortKey) return ticketsToSort;

    return [...ticketsToSort].sort((a, b) => {
      let aValue = a[sortKey];
      let bValue = b[sortKey];

      if (sortKey === 'created_at' || sortKey === 'updated_at' || sortKey === 'closed_at') {
        aValue = new Date(aValue || 0);
        bValue = new Date(bValue || 0);
      }

      if (sortKey === 'priority') {
        const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
        const getPriorityVal = (t) => {
          const p = String(t.priority || 'medium').toLowerCase();
          return priorityOrder[p] || 0;
        };
        aValue = getPriorityVal(a);
        bValue = getPriorityVal(b);
      }

      if (sortKey === 'status') {
        const statusOrder = { new: 1, in_progress: 2, resolved: 3, escalated: 4, closed: 5 };
        aValue = statusOrder[managerStatusKey(a)] || 0;
        bValue = statusOrder[managerStatusKey(b)] || 0;
      }

      if (sortKey === 'product') {
        aValue = getProductDisplayName(a);
        bValue = getProductDisplayName(b);
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const ticketsForManagerListTab = () => {
    switch (activeTab) {
      case 'all':
        return getDisplayTickets();
      case 'sla_overdue':
        return getDisplayTickets().filter((t) => calculateSLATimer(t)?.isBreached);
      case 'new':
        return getTicketsByStatus('new');
      case 'in_progress':
        return [...getTicketsByStatus('in_progress'), ...getTicketsByStatus('resolved')];
      case 'escalated':
        return getTicketsByStatus('escalated');
      case 'closed':
        return getTicketsByStatus('closed');
      default:
        return [];
    }
  };

  const managerListTabTitle = () => {
    switch (activeTab) {
      case 'all':
        return 'All tickets';
      case 'sla_overdue':
        return 'SLA overdue tickets';
      case 'new':
        return 'New Tickets';
      case 'in_progress':
        return 'In Progress Tickets';
      case 'escalated':
        return 'Escalated Tickets';
      case 'closed':
        return 'Closed Tickets';
      default:
        return 'Tickets';
    }
  };

  const openManagerTicket = (ticketId) => {
    navigate(`/manager/ticket/${ticketId}`);
  };

  const displayTotal = getDisplayTickets().length;
  const displayNew = getTicketsByStatus('new').length;
  const displayInProg =
    getTicketsByStatus('in_progress').length + getTicketsByStatus('resolved').length;
  const displayClosed = getTicketsByStatus('closed').length;
  const resolutionRatePercent =
    displayTotal > 0 ? Math.round((performanceMetrics.resolvedTickets / displayTotal) * 100) : 0;
  const overdueTicketsCount = getDisplayTickets().filter((t) => calculateSLATimer(t)?.isBreached).length;
  const welcomeManagerLabel = (manager?.name || '').trim() || 'Manager';
  
  // Intentionally avoid per-render debug logging to keep dashboard renders lightweight.

  const handleManagerLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      ['userData', 'userToken', 'access_token', 'session_expires', 'is_logged_in'].forEach((k) => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });
      navigate('/login', { replace: true });
    }
  };

  const closeManagerCreateTicket = () => {
    setShowManagerCreateTicket(false);
    setManagerAssignAgentId('');
  };

  if (loading) {
    return (
      <div className="manager-dashboard manager-dashboard-ref adr-loading-screen">
        <div className="adr-loading-spinner" aria-hidden />
        <p className="adr-loading-text">Loading manager dashboard...</p>
      </div>
    );
  }

  if (showManagerCreateTicket) {
    return (
      <div className="manager-dashboard manager-dashboard-ref manager-create-ticket-page">
        <div className="manager-create-ticket-page-inner">
          <button
            type="button"
            className="manager-create-ticket-page-close"
            onClick={closeManagerCreateTicket}
            aria-label="Close create ticket page"
          >
            ×
          </button>
          <UserForm
            user={null}
            onSubmit={(ticket) => {
              if (ticket && ticket.id) {
                setTickets((prev) => [ticket, ...prev]);
              }
              closeManagerCreateTicket();
            }}
            onClose={closeManagerCreateTicket}
            initialProduct={''}
            initialIssueType={''}
            managerMode={{
              assignAgentId: managerAssignAgentId,
              onAssignAgentChange: setManagerAssignAgentId,
              agents: teamMembers.filter((m) => ['support_agent', 'agent'].includes((m.role || '').toLowerCase()))
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="manager-dashboard manager-dashboard-ref">
      {/* New Agent Assignment Notification Popup */}
      {showNewAgentNotification && (
        <div className="new-agent-notification-popup">
          <div className="notification-content">
            <div className="notification-icon">👥</div>
            <div className="notification-text">
              <h3>New Agent Assignment</h3>
              <p>New agent assigned to your team</p>
            </div>
            <button 
              className="notification-close-btn"
              onClick={() => {
                setShowNewAgentNotification(false);
                setNewAgentCount(0);
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <header className="adr-header">
        <div className="adr-header__inner">
          <div className="adr-header__left">
            <div className="adr-header__text">
              <h1 className="adr-header__title">Manager Dashboard</h1>
              <p className="adr-header__welcome">Welcome, {welcomeManagerLabel} 👋</p>
              <p className="adr-header__email">{manager?.email || 'No email available'}</p>
            </div>
          </div>
          <div className="adr-header__actions">
            <button
              type="button"
              className="adr-btn adr-btn--ghost"
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
            >
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button type="button" className="adr-btn adr-btn--ghost" onClick={() => setShowManagerCreateTicket(true)}>
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Ticket
            </button>
            <button type="button" className="adr-btn adr-btn--ghost" onClick={() => navigate('/manager/products')}>
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
              Product Dashboard
            </button>
            <button type="button" className="adr-btn adr-btn--ghost" onClick={() => setActiveTab('mail_review')} style={{ position: 'relative' }}>
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Inbox
              {pendingMailCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-5px',
                  background: '#ef4444',
                  color: 'white',
                  borderRadius: '50%',
                  width: '18px',
                  height: '18px',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)',
                  border: '2px solid white'
                }}>
                  {pendingMailCount}
                </span>
              )}
            </button>
            <HeaderNotificationBell />
            <button type="button" className="adr-btn adr-btn--ghost adr-btn--logout" onClick={handleManagerLogout}>
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
        <nav className="adr-sidebar" aria-label="Manager sections">
          <div className="adr-sidebar__title">Workspace</div>
          {tabList.map((tab) => (
            <button
              key={tab.key}
              type="button"
              data-tab={tab.key}
              className={`adr-nav-row${activeTab === tab.key ? ' adr-nav-row--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className={`adr-nav-icon adr-nav-icon--${tab.icon}`}>
                <MdrSidebarIcon name={tab.icon} />
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
            onClick={() => navigate('/manager/knowledge-base')}
          >
            <span className="adr-nav-icon adr-nav-icon--knowledge">
              <MdrSidebarIcon name="knowledge" />
            </span>
            <span className="adr-nav-label">Knowledge Base</span>
          </button>
        </nav>

        <main className="adr-main">
          <div className="mdr-product-bar">
            <label htmlFor="manager-main-product-filter">Product</label>
            <select
              id="manager-main-product-filter"
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
            >
              <option value="all">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {activeTab === 'overview' && (
            <>
              <div className="adr-dashboard">
                <div className="adr-dashboard__head">
                  <h2 className="adr-dashboard__title">Dashboard statistics</h2>
                  <p className="adr-dashboard__sub">Team ticket overview for the selected product filter</p>
                </div>
                <div className="adr-kpi-row">
                  <article {...managerKpiCardProps('all', 'adr-kpi--purple')} title="View all tickets">
                    <div className="adr-kpi__icon-wrap">
                      <MdashKpiIcon name="overview" />
                    </div>
                    <div className="adr-kpi__body">
                      <span className="adr-kpi__num">{performanceMetrics.totalTickets}</span>
                      <span className="adr-kpi__label">Total tickets</span>
                    </div>
                  </article>
                  <article {...managerKpiCardProps('new', 'adr-kpi--blue')} title="View new tickets">
                    <div className="adr-kpi__icon-wrap">
                      <MdashKpiIcon name="new" />
                    </div>
                    <div className="adr-kpi__body">
                      <span className="adr-kpi__num">{displayNew}</span>
                      <span className="adr-kpi__label">New tickets</span>
                    </div>
                  </article>
                  <article {...managerKpiCardProps('in_progress', 'adr-kpi--amber')} title="View in progress and resolved tickets">
                    <div className="adr-kpi__icon-wrap">
                      <MdashKpiIcon name="in_progress_kpi" />
                    </div>
                    <div className="adr-kpi__body">
                      <span className="adr-kpi__num">{displayInProg}</span>
                      <span className="adr-kpi__label">In progress</span>
                    </div>
                  </article>
                  <article {...managerKpiCardProps('closed', 'adr-kpi--green')} title="View closed tickets">
                    <div className="adr-kpi__icon-wrap">
                      <MdashKpiIcon name="closed" />
                    </div>
                    <div className="adr-kpi__body">
                      <span className="adr-kpi__num">{displayClosed}</span>
                      <span className="adr-kpi__label">Closed</span>
                    </div>
                  </article>
                </div>
                <div className="adr-metric-row">
                  <article
                    className="adr-metric-card adr-metric-card--clickable"
                    role="button"
                    tabIndex={0}
                    title="View all tickets"
                    onClick={() => goToManagerTicketList('all')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        goToManagerTicketList('all');
                      }
                    }}
                  >
                    <div className="adr-metric-card__hd">
                      <div className="adr-metric-card__ico" aria-hidden>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                      </div>
                      <span className="adr-metric-card__label">Avg. first response</span>
                    </div>
                    <div className="adr-metric-card__value">
                      {performanceMetrics.avgFirstResponseMinutes != null
                        ? performanceMetrics.avgFirstResponseMinutes < 60
                          ? `${performanceMetrics.avgFirstResponseMinutes}m`
                          : `${Math.floor(performanceMetrics.avgFirstResponseMinutes / 60)}h ${performanceMetrics.avgFirstResponseMinutes % 60}m`
                        : '—'}
                    </div>
                    <p className="adr-metric-card__trend adr-metric-card__trend--pos">
                      <span aria-hidden>↓</span> vs prior period
                    </p>
                  </article>
                  <article
                    className="adr-metric-card adr-metric-card--clickable"
                    role="button"
                    tabIndex={0}
                    title="View closed tickets"
                    onClick={() => goToManagerTicketList('closed')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        goToManagerTicketList('closed');
                      }
                    }}
                  >
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
                      <span aria-hidden>↑</span> closed / total (filtered)
                    </p>
                  </article>
                  <article
                    className="adr-metric-card adr-metric-card--overdue adr-metric-card--clickable"
                    role="button"
                    tabIndex={0}
                    title="View tickets with breached SLA"
                    onClick={() => goToManagerTicketList('sla_overdue')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        goToManagerTicketList('sla_overdue');
                      }
                    }}
                  >
                    <div className="adr-metric-card__hd">
                      <div className="adr-metric-card__ico adr-metric-card__ico--warn" aria-hidden>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </div>
                      <span className="adr-metric-card__label">SLA overdue (filtered)</span>
                    </div>
                    <div className="adr-metric-card__value adr-metric-card__value--danger">{overdueTicketsCount}</div>
                    <p className="adr-metric-card__foot">Requires attention</p>
                  </article>
                </div>
              </div>

              <div className="adr-tickets mdr-recent-tickets">
                <div className="adr-tickets__head">
                  <h2 className="adr-tickets__title">Recent tickets</h2>
                  <p className="adr-tickets__sub">Latest activity in the current product filter.</p>
                </div>
                <div className="adr-table-scroll">
                  <table className="adr-ticket-table">
                    <thead>
                      <tr>
                        <th scope="col">Ticket</th>
                        <th scope="col">Issue</th>
                        <th scope="col">Status</th>
                        <th scope="col">Priority</th>
                        <th scope="col">Product</th>
                        <th scope="col">SLA</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getRecentOverviewTickets().length === 0 ? (
                        <tr>
                          <td colSpan={7} className="adr-ticket-table__empty">
                            No recent tickets found.
                          </td>
                        </tr>
                      ) : (
                        getRecentOverviewTickets().map((ticket) => {
                          const sk = managerStatusKey(ticket) || 'unknown';
                          return (
                            <tr key={ticket.id}>
                              <td className="adr-td-ticket">
                                <span className="adr-td-ticket__id">#{ticket.id}</span>
                              </td>
                              <td>{renderIssueTableCell(ticket)}</td>
                              <td>
                                <span className={`adr-status-pill adr-status-pill--${sk}`}>
                                  {formatManagerStatusLabel(ticket)}
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
                                  onClick={() => openManagerTicket(ticket.id)}
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
            </>
          )}

          {MANAGER_TICKET_LIST_TAB_KEYS.includes(activeTab) && (
            <div className="adr-tickets">
              <div className="adr-tickets__head">
                <div className="adr-tickets__head-row">
                  <h2 className="adr-tickets__title">{managerListTabTitle()}</h2>
                  {(activeTab === 'all' || activeTab === 'sla_overdue') && (
                    <button type="button" className="adr-btn adr-btn--ghost" onClick={() => setActiveTab('overview')}>
                      ← Overview
                    </button>
                  )}
                </div>
                <p className="adr-tickets__sub">Sort columns from the table header.</p>
              </div>
              <div className="adr-table-scroll">
                <table className="adr-ticket-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        <button type="button" className="adr-th-btn" onClick={() => handleListSort('id')}>
                          Ticket {getListSortIcon('id')}
                        </button>
                      </th>
                      <th scope="col">
                        <button type="button" className="adr-th-btn" onClick={() => handleListSort('issue_title')}>
                          Issue {getListSortIcon('issue_title')}
                        </button>
                      </th>
                      <th scope="col">
                        <button type="button" className="adr-th-btn" onClick={() => handleListSort('status')}>
                          Status {getListSortIcon('status')}
                        </button>
                      </th>
                      <th scope="col">
                        <button type="button" className="adr-th-btn" onClick={() => handleListSort('priority')}>
                          Priority {getListSortIcon('priority')}
                        </button>
                      </th>
                      <th scope="col">
                        <button type="button" className="adr-th-btn" onClick={() => handleListSort('product')}>
                          Product {getListSortIcon('product')}
                        </button>
                      </th>
                      <th scope="col">
                        <button type="button" className="adr-th-btn" onClick={() => handleListSort('created_at')}>
                          SLA timer {getListSortIcon('created_at')}
                        </button>
                      </th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortManagerListTickets(ticketsForManagerListTab()).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="adr-ticket-table__empty">
                          No tickets in this view.
                        </td>
                      </tr>
                    ) : (
                      sortManagerListTickets(ticketsForManagerListTab()).map((ticket) => {
                        const sk = managerStatusKey(ticket) || 'unknown';
                        return (
                          <tr key={ticket.id}>
                            <td className="adr-td-ticket">
                              <span className="adr-td-ticket__id">#{ticket.id}</span>
                            </td>
                            <td>{renderIssueTableCell(ticket)}</td>
                            <td>
                              <span className={`adr-status-pill adr-status-pill--${sk}`}>
                                {formatManagerStatusLabel(ticket)}
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
                                onClick={() => openManagerTicket(ticket.id)}
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

          {activeTab === 'mail_review' && (
            <MailInbox onActionComplete={fetchPendingMailCount} />
          )}
          {activeTab === 'analytics' && (
            <div className="analytics-section mdr-extra">
              <div className="analytics-header">
                <h3> Analytics Dashboard</h3>
                <p>Comprehensive insights into team performance and ticket metrics</p>

              </div>
              
              <div className="analytics-grid">

                {/* Key Performance Indicators */}
                <div className="analytics-card kpi-section">
                  <h4>🎯 Key Performance Indicators</h4>
                  <div className="kpi-grid">
                    <div
                      className="kpi-item kpi-item--clickable"
                      role="button"
                      tabIndex={0}
                      title="View all tickets"
                      onClick={() => goToManagerTicketList('all')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goToManagerTicketList('all');
                        }
                      }}
                    >
                      <div className="kpi-icon">📈</div>
                      <div className="kpi-content">
                        <div className="kpi-value">{performanceMetrics.totalTickets || 'N/A'}</div>
                        <div className="kpi-label">Total Tickets</div>
                      </div>
                    </div>
                    <div
                      className="kpi-item kpi-item--clickable"
                      role="button"
                      tabIndex={0}
                      title="View closed tickets"
                      onClick={() => goToManagerTicketList('closed')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goToManagerTicketList('closed');
                        }
                      }}
                    >
                      <div className="kpi-icon">✅</div>
                      <div className="kpi-content">
                        <div className="kpi-value">{performanceMetrics.resolvedTickets || 'N/A'}</div>
                        <div className="kpi-label">Resolved</div>
                      </div>
                    </div>
                    <div
                      className="kpi-item kpi-item--clickable"
                      role="button"
                      tabIndex={0}
                      title="View all tickets"
                      onClick={() => goToManagerTicketList('all')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goToManagerTicketList('all');
                        }
                      }}
                    >
                      <div className="kpi-icon">⏱️</div>
                      <div className="kpi-content">
                        <div className="kpi-value">{performanceMetrics.avgResolutionTime || 0}h</div>
                        <div className="kpi-label">Avg Resolution</div>
                      </div>
                    </div>
                    <div
                      className="kpi-item kpi-item--clickable"
                      role="button"
                      tabIndex={0}
                      title="View closed tickets"
                      onClick={() => goToManagerTicketList('closed')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goToManagerTicketList('closed');
                        }
                      }}
                    >
                      <div className="kpi-icon">🚀</div>
                      <div className="kpi-content">
                        <div className="kpi-value">
                          {performanceMetrics.totalTickets > 0 
                            ? Math.round((performanceMetrics.resolvedTickets / performanceMetrics.totalTickets) * 100)
                            : 0}%
                        </div>
                        <div className="kpi-label">Success Rate</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Distribution */}
                <div className="analytics-card status-distribution">
                  <h4>📊 Ticket Status Distribution</h4>
                  <div className="status-chart">
                    <div
                      className="status-bar status-bar--clickable"
                      role="button"
                      tabIndex={0}
                      title="View new tickets"
                      onClick={() => goToManagerTicketList('new')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goToManagerTicketList('new');
                        }
                      }}
                    >
                      <div className="status-label">New</div>
                      <div className="status-bar-container">
                        <div 
                          className="status-bar-fill new"
                          style={{ width: `${performanceMetrics.totalTickets > 0 ? (getTicketsByStatus('new').length / performanceMetrics.totalTickets) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <div className="status-count">{getTicketsByStatus('new').length}</div>
                    </div>
                    <div
                      className="status-bar status-bar--clickable"
                      role="button"
                      tabIndex={0}
                      title="View in progress and resolved tickets"
                      onClick={() => goToManagerTicketList('in_progress')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goToManagerTicketList('in_progress');
                        }
                      }}
                    >
                      <div className="status-label">In Progress</div>
                      <div className="status-bar-container">
                        <div 
                          className="status-bar-fill in-progress"
                          style={{ width: `${performanceMetrics.totalTickets > 0 ? ((getTicketsByStatus('in_progress').length + getTicketsByStatus('resolved').length) / performanceMetrics.totalTickets) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <div className="status-count">{getTicketsByStatus('in_progress').length + getTicketsByStatus('resolved').length}</div>
                    </div>
                    <div
                      className="status-bar status-bar--clickable"
                      role="button"
                      tabIndex={0}
                      title="View escalated tickets"
                      onClick={() => goToManagerTicketList('escalated')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goToManagerTicketList('escalated');
                        }
                      }}
                    >
                      <div className="status-label">Escalated</div>
                      <div className="status-bar-container">
                        <div 
                          className="status-bar-fill escalated"
                          style={{ width: `${performanceMetrics.totalTickets > 0 ? (getTicketsByStatus('escalated').length / performanceMetrics.totalTickets) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <div className="status-count">{getTicketsByStatus('escalated').length}</div>
                    </div>
                    <div
                      className="status-bar status-bar--clickable"
                      role="button"
                      tabIndex={0}
                      title="View closed tickets"
                      onClick={() => goToManagerTicketList('closed')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goToManagerTicketList('closed');
                        }
                      }}
                    >
                      <div className="status-label">Closed</div>
                      <div className="status-bar-container">
                        <div 
                          className="status-bar-fill closed"
                          style={{ width: `${performanceMetrics.totalTickets > 0 ? (getTicketsByStatus('closed').length / performanceMetrics.totalTickets) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <div className="status-count">{getTicketsByStatus('closed').length}</div>
                    </div>
                  </div>
                </div>

                {/* Team Performance Chart */}
                <div className="analytics-card team-performance-chart">
                  <h4>👥 Team Performance Overview</h4>
                  <div className="team-chart">
                    {performanceMetrics.teamPerformance && performanceMetrics.teamPerformance.length > 0 ? (
                      performanceMetrics.teamPerformance.map(member => (
                        <div key={member.id} className="team-chart-item">
                          <div className="member-chart-info">
                            <div className="member-name">{member.name}</div>
                            <div className="member-role">{member.role}</div>
                          </div>
                          <div className="performance-bars">
                            <div className="performance-bar">
                              <div className="bar-label">Assigned</div>
                              <div className="bar-container">
                                <div 
                                  className="bar-fill assigned"
                                  style={{ width: `${Math.min((member.assignedTickets / Math.max(...performanceMetrics.teamPerformance.map(m => m.assignedTickets), 1)) * 100, 100)}%` }}
                                ></div>
                              </div>
                              <div className="bar-value">{member.assignedTickets}</div>
                            </div>
                            <div className="performance-bar">
                              <div className="bar-label">Resolved</div>
                              <div className="bar-container">
                                <div 
                                  className="bar-fill resolved"
                                  style={{ width: `${Math.min((member.resolvedTickets / Math.max(...performanceMetrics.teamPerformance.map(m => m.resolvedTickets), 1)) * 100, 100)}%` }}
                                ></div>
                              </div>
                              <div className="bar-value">{member.resolvedTickets}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="no-team-data">
                        <p>No team performance data available</p>
                        <p>Team Performance Array: {JSON.stringify(performanceMetrics.teamPerformance)}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="analytics-card recent-activity">
                  <h4>🕒 Recent Activity</h4>
                  <div className="activity-list">
                    {tickets.slice(0, 8).map(ticket => (
                      <div
                        key={ticket.id}
                        className="activity-item"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/manager/ticket/${ticket.id}`)}
                        onKeyDown={(e) => e.key === 'Enter' && navigate(`/manager/ticket/${ticket.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="activity-icon">
                          {ticket.status === 'new' && '🆕'}
                          {ticket.status === 'in_progress' && '⏳'}
                          {ticket.status === 'escalated' && '🚨'}
                          {ticket.status === 'closed' && '✅'}
                        </div>
                        <div className="activity-content">
                          <div className="activity-title">Ticket #{ticket.id}</div>
                          <div className="activity-details">
                            {ticket.issue_title || 'No Title'} • {ticket.name}
                          </div>
                          {(taskProgressMap[ticket.id]?.total || 0) > 0 && (
                            <div className="activity-time">Task Progress: {taskProgressMap[ticket.id].completed}/{taskProgressMap[ticket.id].total}</div>
                          )}
                          <div className="activity-time">{formatDate(ticket.created_at)}</div>
                        </div>
                        <div className="activity-status">
                          <span className={`status-badge ${ticket.status}`}>
                            {ticket.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="team-section mdr-extra">
              <h3>Team Performance</h3>
              
              {performanceMetrics.teamPerformance && performanceMetrics.teamPerformance.length > 0 ? (
                <div className="team-grid">
                  {performanceMetrics.teamPerformance.map(member => (
                    <div key={member.id} className="team-member-card">
                      <div className="member-info">
                        <h4>{member.name}</h4>
                        <p>{member.email}</p>
                        <p>
                          <strong>Availability Status:</strong> {getAvailabilityLabel(member.availability_status)}
                        </p>
                      </div>
                      <div className="member-stats">
                        <div className="stat">
                          <span className="stat-label">Assigned</span>
                          <span className="stat-value" style={{ color: '#007bff', fontWeight: 'bold' }}>{member.assignedTickets}</span>
                        </div>
                        <div className="stat">
                          <span className="stat-label">Active Tickets</span>
                          <span className="stat-value" style={{ color: '#2563eb', fontWeight: 'bold' }}>{member.activeTickets}</span>
                        </div>
                        <div className="stat">
                          <span className="stat-label">Resolved</span>
                          <span className="stat-value" style={{ color: '#28a745', fontWeight: 'bold' }}>{member.resolvedTickets}</span>
                        </div>
                        <div className="stat">
                          <span className="stat-label">Escalation Count</span>
                          <span className="stat-value" style={{ color: '#dc2626', fontWeight: 'bold' }}>{member.escalationCount}</span>
                        </div>
                        <div className="stat">
                          <span className="stat-label">Response SLA %</span>
                          <span className="stat-value" style={{ color: '#0f766e', fontWeight: 'bold' }}>{formatPercent(member.responseSlaPercent)}</span>
                        </div>
                        <div className="stat">
                          <span className="stat-label">Resolution SLA %</span>
                          <span className="stat-value" style={{ color: '#7c3aed', fontWeight: 'bold' }}>{formatPercent(member.resolutionSlaPercent)}</span>
                        </div>
                        <div className="stat">
                          <span className="stat-label">Success Rate</span>
                          <span className="stat-value" style={{ color: '#ffc107', fontWeight: 'bold' }}>
                            {member.assignedTickets > 0 
                              ? Math.round((member.resolvedTickets / member.assignedTickets) * 100)
                              : 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '40px', 
                  background: '#f8f9fa', 
                  borderRadius: '8px',
                  border: '1px solid #dee2e6'
                }}>
                  <h4>No Team Performance Data Available</h4>
                  <p>No support executives found in the team data.</p>
                  <p>Total team members: {teamMembers.length}</p>
                  <p>Team performance array: {performanceMetrics.teamPerformance?.length || 0} members</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'feedback' && (
            <div className="mdr-extra">
              <FeedbackInsightsPage />
            </div>
          )}

          {activeTab === 'escalation_requests' && (
            <ManagerEscalationRequests />
          )}
        </main>
      </div>

      {/* Reply Form Modal */}
      {showReplyForm && selectedTicketForReply && (
        <div className="reply-modal-overlay">
          <div className="reply-modal">
            <div className="reply-modal-header">
              <h3>💬 Quick Reply to Ticket #{selectedTicketForReply.id}</h3>
              <button 
                className="close-reply-btn"
                onClick={() => toggleReplyForm()}
              >
                ✕
              </button>
            </div>
            
            <div className="reply-modal-content">
              <div className="ticket-info">
                <p><strong>Customer:</strong> {selectedTicketForReply.name}</p>
                <p><strong>Issue:</strong> {selectedTicketForReply.issue_title || 'No Title'}</p>
              </div>
              
              <div className="reply-form">
                <label htmlFor="reply-textarea">Your Reply:</label>
                <textarea
                  id="reply-textarea"
                  className="reply-textarea"
                  placeholder="Type your reply message here..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows="4"
                />
                
                <div className="reply-actions">
                  <button
                    className={`reply-send-btn ${buttonToggle ? 'reply-send-btn-toggled' : ''}`}
                    onClick={handleReplySubmit}
                    disabled={sendingReply || !replyText.trim()}
                  >
                    {sendingReply ? 'Sending...' : 'Send Reply'}
                  </button>
                  <button
                    className={`reply-cancel-btn ${buttonToggle ? 'reply-cancel-btn-toggled' : ''}`}
                    onClick={handleCancelClick}
                    disabled={sendingReply}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerDashboard; 
