import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import UserForm from '../tickets/UserForm';
// FAQ module archived - HelpFAQPage moved to archive
// import HelpFAQPage from '../help/HelpFAQPage';
import { buildApiUrl, getAuthHeaders } from '../../utils/api';
import { formatDateTimeIST } from '../../utils/dateTime';
import HeaderNotificationBell from '../common/HeaderNotificationBell';
import OrgSpocDashboard from './OrgSpocDashboard';
// Product SPOC Dashboard module archived - moved to archive/frontend/src/components/dashboards/ProductSpocDashboard.js
// import ProductSpocDashboard from './ProductSpocDashboard';
import './UserDashboard.css';

/** Maps customer-visible status to agent/manager `adr-status-pill--*` modifier */
const userStatusToPillModifier = (visibleStatus) => {
  const s = String(visibleStatus || '').toLowerCase().replace(/\s+/g, '_');
  const map = {
    new: 'new',
    open: 'new',
    in_progress: 'in_progress',
    resolved: 'resolved',
    closed: 'closed',
    escalated: 'escalated'
  };
  return map[s] || 'unknown';
};

const DashboardStatIcon = ({ variant }) => {
  if (variant === 'total') {
    return (
      <svg className="ud-stat-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="currentColor" d="M4 19h4v-8H4v8zm6 0h4V5h-4v14zm6 0h4v-6h-4v6z" />
      </svg>
    );
  }
  if (variant === 'open') {
    return (
      <svg className="ud-stat-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="currentColor" d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4V6h16v12zM6 10h2v4H6v-4zm8 0h2v4h-2v-4zm-4 4h2v-4h-2v4z" />
      </svg>
    );
  }
  if (variant === 'progress') {
    return (
      <svg className="ud-stat-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="currentColor" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    );
  }
  return (
    <svg className="ud-stat-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
    </svg>
  );
};

const UserDashboard = ({ user, isFirstTimeSupportUser = false, initialShowForm = false }) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(initialShowForm);
  const [showHelpScreen, setShowHelpScreen] = useState(true);
  const [formPrefill, setFormPrefill] = useState({});
  const [replies, setReplies] = useState({});
  const [error, setError] = useState(null);
  const failedReplyTicketIdsRef = React.useRef(new Set());
  const [notification, setNotification] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    closed: 0,
    unreadReplies: 0
  });
  
  // SLA Configurations state
  const [slaConfigurations, setSlaConfigurations] = useState({});
  const [slaTimersByTicketId, setSlaTimersByTicketId] = useState({});

  // Sorting state
  const [sortConfig, setSortConfig] = useState({
    key: 'created_at',
    direction: 'desc'
  });
  const [repliesSortConfig, setRepliesSortConfig] = useState({
    key: 'timestamp',
    direction: 'desc'
  });

  // Enhanced search and filtering state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [issueTypeFilter, setIssueTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  const navigate = useNavigate();
  const location = useLocation();

  // Listen for form messages
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.action === 'toggleForm') {
        setShowForm(!showForm);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [showForm]);

  // Check for logged-in customer data only
  useEffect(() => {
    const checkAutoLoginAndUserData = () => {
      // First check if user prop is passed
      if (user) {
        setCurrentUser(user);
        return;
      }

      // Check localStorage for existing customer data (customerData first, then legacy userData)
      const storedUser = localStorage.getItem('customerData') || localStorage.getItem('userData');
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          // Ignore staff data (userData could be from agent before our fix)
          if (userData.role && ['support_agent', 'support_manager', 'ceo', 'admin'].includes(userData.role)) {
            console.log('⚠️ Ignoring staff data in customer context');
          } else {
            setCurrentUser(userData);
            return;
          }
        } catch (error) {
          console.error('Error parsing stored user data:', error);
        }
      }

      // Check for customer_* keys
      const custId = localStorage.getItem('customer_id') || localStorage.getItem('user_id');
      const custName = localStorage.getItem('customer_name') || localStorage.getItem('user_name');
      const custEmail = localStorage.getItem('customer_email') || localStorage.getItem('user_email');
      const custRole = localStorage.getItem('customer_role') || localStorage.getItem('user_role');
      
      if (custId && custName && custEmail) {
        console.log('🔍 Found customer data in localStorage');
        const autoLoginUser = {
          id: custId,
          name: custName,
          email: custEmail,
          role: custRole || 'user'
        };
        setCurrentUser(autoLoginUser);
        return;
      }

      // Check for legacy user format
      const legacyUser = localStorage.getItem('tickUser');
      if (legacyUser) {
        try {
          const legacyUserData = JSON.parse(legacyUser);
          setCurrentUser(legacyUserData);
          return;
        } catch (error) {
          console.error('Error parsing legacy user data:', error);
        }
      }

      // No user data found
      console.log('❌ No user data found in any storage location');
      setCurrentUser(null);
      setLoading(false);
      
      // Show error message for debugging
      setError('No user data found. Please try logging in again or contact support.');
    };

    checkAutoLoginAndUserData();
  }, [user]);

  useEffect(() => {
    if (currentUser) {
      fetchTickets();
      fetchSLAConfigurations(); // Fetch SLA configurations on mount
    } else {
      setLoading(false);
    }
  }, [currentUser]);

  // Optional: refresh replies periodically, but keep it lightweight.
  useEffect(() => {
    if (!currentUser || !tickets?.length) return;

    const intervalId = setInterval(() => {
      // Avoid N requests per refresh. Only refresh a small slice of newest tickets.
      const validTickets = tickets.filter((t) => t && t.id).slice(0, 10);
      validTickets.forEach((ticket) => {
        if (ticket?.id && !failedReplyTicketIdsRef.current.has(ticket.id)) {
          fetchReplies(ticket.id);
        }
      });
    }, 120000); // 2 minutes

    return () => clearInterval(intervalId);
  }, [currentUser, tickets]);

  const fetchTickets = async () => {
    if (!currentUser?.id && !currentUser?.email) return;
    
    setLoading(true);
    setError(null);
    try {
      const parsedId = typeof currentUser.id === 'string' ? parseInt(currentUser.id, 10) : currentUser.id;
      const userLookup = Number.isFinite(parsedId)
        ? parsedId
        : encodeURIComponent(String(currentUser.email || '').trim());
      
      const res = await fetch(buildApiUrl(`/api/tickets/user/${userLookup}`), {
        headers: getAuthHeaders()
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        console.error(`❌ API Error [${res.status}]:`, data.message || res.statusText);
        if (res.status === 401 || res.status === 403) {
          setError('Your session has expired or you are not authorized. Please log in again.');
          setTickets([]);
          calculateStats([]);
          try {
            // Clear customer session keys (avoid wiping staff sessions)
            ['customerData', 'customerToken', 'access_token', 'customer_id', 'customer_name', 'customer_email', 'customer_role']
              .forEach((k) => localStorage.removeItem(k));
          } catch (_) {}
          return;
        }
        
        setError(data.message || `Server error (${res.status}). Please try again later.`);
        setTickets([]);
        calculateStats([]);
        return;
      }

      if (data.success && Array.isArray(data.data)) {
        // Filter out invalid tickets before setting state
        const validTickets = data.data.filter(ticket => ticket && ticket.id);
        setTickets(validTickets);
        failedReplyTicketIdsRef.current.clear(); // Reset failed set when tickets reload
        
        // Fetch SLA timers in ONE bulk call (keeps UI fast, avoids N+1).
        try {
          const ids = validTickets.map((t) => Number(t?.id || 0)).filter(Boolean).slice(0, 200);
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
        } catch (slaErr) {
          console.warn('⚠️ SLA timer fetch failed:', slaErr.message);
          setSlaTimersByTicketId({});
        }
        
        // Replies are fetched lazily (on manual refresh / interval slice), not for every ticket.
        setReplies({});
        calculateStats(validTickets);
      } else {
        console.error('❌ Failed to fetch tickets:', data.message);
        setError(data.message || 'Failed to fetch tickets from server.');
        setTickets([]);
        calculateStats([]);
      }
    } catch (error) {
      console.error('❌ Network error fetching tickets:', error);
      setError(`Network error: ${error.message || 'Connection failed'}. Please check your internet or server status.`);
      setTickets([]);
      calculateStats([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchReplies = async (ticketId) => {
    if (!ticketId) return;
    if (failedReplyTicketIdsRef.current.has(ticketId)) return; // Skip tickets that repeatedly fail
    
    try {
      const res = await fetch(buildApiUrl(`/api/chat/messages/${ticketId}`), {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        failedReplyTicketIdsRef.current.delete(ticketId);
        const newReplies = data.data.filter(reply => reply && reply.id);
        const sortedReplies = newReplies.sort((a, b) => {
          const dateA = new Date(a.created_at || a.timestamp || 0);
          const dateB = new Date(b.created_at || b.timestamp || 0);
          if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
          return dateB - dateA;
        });
        setReplies(prev => ({ ...prev, [ticketId]: sortedReplies }));
      } else if (res.status === 404) {
        failedReplyTicketIdsRef.current.add(ticketId);
        setReplies(prev => ({ ...prev, [ticketId]: [] }));
      }
    } catch (error) {
      failedReplyTicketIdsRef.current.add(ticketId);
      setReplies(prev => ({ ...prev, [ticketId]: [] }));
    }
  };

  // Fetch SLA configurations for timer calculations
  const fetchSLAConfigurations = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/sla/configurations'), {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
          // Create a lookup map for quick access
          const configMap = {};
          result.data.forEach(config => {
            if (config && config.product_id && config.module_id && config.issue_name) {
              const key = `${config.product_id}_${config.module_id}_${config.issue_name}`;
              configMap[key] = config;
            }
          });
          setSlaConfigurations(configMap);
        }
      } else {
        console.error('Failed to fetch SLA configurations');
      }
    } catch (error) {
      console.error('Error fetching SLA configurations:', error);
    }
  };

  const showNotification = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 5000);
  };

  // User-only visibility mapping:
  // if a ticket was previously handled and later reset/reassigned to "new",
  // keep showing it as in-progress for customer clarity.
  const getUserVisibleStatus = (ticket) => {
    const rawStatus = (ticket?.status || '').toLowerCase();
    if (rawStatus !== 'new') return rawStatus;
    if (ticket?.is_reopened) return 'in_progress';
    const hadPriorProgress = !!(ticket?.first_response_at || ticket?.resolved_at || ticket?.closed_at);
    return hadPriorProgress ? 'in_progress' : 'new';
  };

  const calculateStats = (ticketData) => {
    if (!ticketData || !Array.isArray(ticketData)) {
      setStats({ total: 0, open: 0, inProgress: 0, closed: 0, unreadReplies: 0 });
      return;
    }

    // Filter out invalid tickets
    const validTickets = ticketData.filter(t => t && t.status);
    
    const total = validTickets.length;
    const open = validTickets.filter(t => getUserVisibleStatus(t) === 'open' || getUserVisibleStatus(t) === 'new').length;
    const inProgress = validTickets.filter(t => {
      const s = getUserVisibleStatus(t);
      return s === 'in_progress' || s === 'resolved';
    }).length;
    const closed = validTickets.filter(t => getUserVisibleStatus(t) === 'closed').length;
    
    // Calculate unread replies
    let unreadCount = 0;
    Object.values(replies).forEach(ticketReplies => {
      if (Array.isArray(ticketReplies)) {
        unreadCount += ticketReplies.filter(reply => 
          reply && reply.sender_type === 'agent' && !reply.is_read
        ).length;
      }
    });

    setStats({ total, open, inProgress, closed, unreadReplies: unreadCount });
  };

  /** Map POST /api/tickets payload to the same shape as GET /api/tickets/user rows (sort + table columns). */
  const normalizeTicketFromCreateResponse = (raw) => {
    if (!raw) return null;
    const id = raw.id ?? raw.ticket_id;
    if (id === undefined || id === null || id === '') return null;
    const nowIso = new Date().toISOString();
    const nid = typeof id === 'string' ? parseInt(id, 10) : Number(id);
    if (!Number.isFinite(nid)) return null;
    return {
      ...raw,
      id: nid,
      issue_title: raw.issue_title || raw.issueTitle || '',
      created_at: raw.created_at || raw.createdAt || nowIso,
      updated_at: raw.updated_at || raw.updatedAt || nowIso,
      status: String(raw.status || 'new').toLowerCase(),
      description: raw.description ?? '',
      product: raw.product ?? ''
    };
  };

  const handleTicketSubmitted = async (newTicket) => {
    const normalized = normalizeTicketFromCreateResponse(newTicket);
    if (!normalized) {
      showNotification('✅ Ticket submitted successfully!');
      setShowForm(false);
      setFormPrefill({});
      fetchTickets();
      return;
    }

    setTickets((prev) => {
      const rest = (prev || []).filter((t) => t && Number(t.id) !== Number(normalized.id));
      const next = [normalized, ...rest];
      calculateStats(next);
      return next;
    });

    setShowForm(false);
    setFormPrefill({});
    showNotification(`✅ New ticket submitted successfully! Ticket #${normalized.id}`);

    // Fill SLA timer chip for the new row without reloading the whole list.
    (async () => {
      try {
        const r = await fetch(buildApiUrl('/api/sla/timers/bulk-remaining'), {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketIds: [normalized.id] })
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.success && j?.data && typeof j.data === 'object') {
          setSlaTimersByTicketId((prev) => ({ ...prev, ...j.data }));
        }
      } catch (_) {}
    })();
  };

  const handleProceedToTicket = (prefill) => {
    setFormPrefill(prefill || {});
    setShowHelpScreen(false);
    setShowForm(true);
  };

  const getInitialProduct = () => {
    try {
      const ctx = localStorage.getItem('autoLoginContext');
      if (ctx) {
        const parsed = JSON.parse(ctx);
        return parsed.product || parsed.utmDescription || '';
      }
    } catch {}
    return '';
  };

  const refreshAllReplies = async () => {
    if (tickets && tickets.length > 0) {
      const validTickets = tickets.filter(ticket => ticket && ticket.id);
      if (validTickets.length > 0) {
        // Keep this bounded to avoid hanging the UI on large accounts.
        const slice = validTickets.slice(0, 15);
        await Promise.allSettled(slice.map((ticket) => fetchReplies(ticket.id)));
        showNotification('🔄 Replies refreshed!');
      }
    }
  };

  const retryFetch = () => {
    fetchTickets();
  };

  const handleUserLogout = () => {
    const email = (currentUser?.email || '').trim();
    let returnTo = '';
    try {
      const ctxRaw = localStorage.getItem('autoLoginContext');
      const ctx = ctxRaw ? JSON.parse(ctxRaw) : {};
      const product = (ctx.product || ctx.sourcePlatform || 'grc').trim();
      const name = (currentUser?.name || ctx.name || '').trim();
      const moduleName = (ctx.utmModule || ctx.utmSource || '').trim();
      if (email) {
        const params = new URLSearchParams({ e: email });
        if (name) params.set('u', name);
        if (moduleName) params.set('m', moduleName);
        returnTo = `/${encodeURIComponent(product)}?${params.toString()}`;
      }
    } catch {}

    [
      'customerData', 'customerToken', 'customer_id', 'customer_name', 'customer_email', 'customer_role',
      'autoLoginContext', 'customerTicketReturnTo',
      'userData', 'userToken', 'access_token', 'user_id', 'user_name', 'user_email', 'user_role', 'is_logged_in',
      'session_expires', 'login_timestamp'
    ].forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    const qs = new URLSearchParams();
    if (email) qs.set('e', email);
    if (returnTo) qs.set('returnTo', returnTo);
    window.location.replace(`/customer-access${qs.toString() ? `?${qs.toString()}` : ''}`);
  };

  const handleCloseTicket = async (ticketId) => {
    if (!currentUser || !currentUser.id) return;

    try {
      const res = await fetch(buildApiUrl(`/api/tickets/${ticketId}/close`), {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (data.success) {
        setTickets(prev => {
          const updatedTickets = prev.map(ticket => 
            ticket && ticket.id === ticketId ? { ...ticket, status: 'closed' } : ticket
          );
          // Recalculate stats with the updated tickets
          calculateStats(updatedTickets);
          return updatedTickets;
        });
        showNotification('✅ Ticket closed successfully!');
        refreshAllReplies(); // Refresh replies for the closed ticket
      } else {
        console.error('Failed to close ticket:', data.message);
        showNotification('❌ Failed to close ticket: ' + (data.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error closing ticket:', error);
      showNotification('❌ Network error. Failed to close ticket.');
    }
  };

  const getStatusColor = (status) => {
    if (!status) return '#6b7280';
    
    switch (status) {
      case 'new': return '#3b82f6';
      case 'open': return '#3b82f6';
      case 'in_progress': return '#f59e0b';
      case 'resolved': return '#7c3aed';
      case 'closed': return '#10b981';
      case 'escalated': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusText = (status) => {
    if (!status) return 'UNKNOWN';
    
    switch (status) {
      case 'new': return 'NEW';
      case 'open': return 'OPEN';
      case 'in_progress': return 'IN PROGRESS';
      case 'resolved': return 'PENDING CONFIRMATION';
      case 'closed': return 'CLOSED';
      case 'escalated': return 'ESCALATED';
      default: return status.toUpperCase();
    }
  };

  const formatDate = (dateString) => {
    return formatDateTimeIST(dateString, { year: undefined });
  };

  const openTicketDetail = (ticket) => {
    console.log('🔗 Opening detail page for ticket:', ticket.id);
    console.log('👤 Current user:', currentUser);
    console.log('📋 User data in localStorage:', localStorage.getItem('userData'));
    console.log('🔗 Auto-login context:', localStorage.getItem('autoLoginContext'));
    console.log('🔍 All localStorage keys:', Object.keys(localStorage));
    
    // Ensure userData is stored before navigating
    if (currentUser && !localStorage.getItem('userData')) {
      console.log('🔧 Storing userData before navigation:', currentUser);
      localStorage.setItem('userData', JSON.stringify(currentUser));
    }
    
    navigate(`/customer/ticket/${ticket.id}`, {
      state: { returnTo: `${location.pathname}${location.search}` }
    });
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    if (!priority) return '#666666';
    
    switch (priority) {
      case 'high': return '#ff4444';
      case 'medium': return '#ff8800';
      case 'low': return '#44aa44';
      default: return '#666666';
    }
  };

  // Calculate SLA timer for a ticket
  const calculateSLATimer = (ticket) => {
    if (!ticket || !ticket.product_id || !ticket.module_id || !ticket.issue_type || !ticket.created_at) {
      return null;
    }

    const key = `${ticket.product_id}_${ticket.module_id}_${ticket.issue_type}`;
    const slaConfig = slaConfigurations[key];
    
    if (!slaConfig) {
      return null;
    }

    const now = new Date();
    const ticketCreatedAt = new Date(ticket.created_at);
    
    // Check if the date is valid
    if (isNaN(ticketCreatedAt.getTime())) {
      return null;
    }
    
    const slaTimeMinutes = slaConfig.resolution_time_minutes || slaConfig.response_time_minutes || 480; // Default 8 hours
    const slaDeadline = new Date(ticketCreatedAt.getTime() + (slaTimeMinutes * 60 * 1000));
    
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

  // Format time for display
  const formatSLATime = (minutes) => {
    if (minutes === null || minutes === undefined || isNaN(minutes)) {
      return '0m';
    }
    
    if (minutes < 60) {
      return `${minutes}m`;
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    } else {
      const days = Math.floor(minutes / (60 * 24));
      const hours = Math.floor((minutes % (60 * 24)) / 60);
      return `${days}d ${hours}h`;
    }
  };

  // Sorting functions
  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };


  const sortTickets = (ticketsToSort) => {
    if (!ticketsToSort || !Array.isArray(ticketsToSort) || !sortConfig.key) {
      return ticketsToSort || [];
    }

    // Filter out invalid tickets first
    const validTickets = ticketsToSort.filter(ticket => ticket && ticket.id);

    return validTickets.sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle date sorting
      if (sortConfig.key === 'created_at' || sortConfig.key === 'updated_at' || sortConfig.key === 'closed_at') {
        aValue = new Date(aValue || 0);
        bValue = new Date(bValue || 0);
      }

      // Handle priority sorting
      if (sortConfig.key === 'priority') {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        aValue = priorityOrder[aValue] || 0;
        bValue = priorityOrder[bValue] || 0;
      }

      // Handle status sorting
      if (sortConfig.key === 'status') {
        const statusOrder = { open: 1, in_progress: 2, resolved: 3, escalated: 4, closed: 5 };
        aValue = statusOrder[getUserVisibleStatus(a)] || 0;
        bValue = statusOrder[getUserVisibleStatus(b)] || 0;
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

  const getStatsArray = (statsData) => [
    { key: 'total', label: 'Total Tickets', value: statsData.total, variant: 'total' },
    { key: 'open', label: 'Open Tickets', value: statsData.open, variant: 'open' },
    { key: 'inProgress', label: 'In Progress', value: statsData.inProgress, variant: 'progress' },
    { key: 'closed', label: 'Closed', value: statsData.closed, variant: 'closed' }
  ];

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '⇅';
    return sortConfig.direction === 'asc' ? '▲' : '▼';
  };


  const handleRepliesSort = (key) => {
    setRepliesSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortReplies = (repliesToSort) => {
    if (!repliesToSort || !repliesSortConfig.key) return repliesToSort;

    return [...repliesToSort].sort((a, b) => {
      let aValue, bValue;

      switch (repliesSortConfig.key) {
        case 'timestamp':
          aValue = new Date(a.created_at || a.timestamp || 0);
          bValue = new Date(b.created_at || b.timestamp || 0);
          break;
        case 'sender':
          aValue = (a.sender_name || a.sender_type || '').toLowerCase();
          bValue = (b.sender_name || b.sender_type || '').toLowerCase();
          break;
        case 'message':
          aValue = (a.message || a.content || '').toLowerCase();
          bValue = (b.message || b.content || '').toLowerCase();
          break;
        default:
          aValue = a[repliesSortConfig.key];
          bValue = b[repliesSortConfig.key];
      }

      if (aValue < bValue) {
        return repliesSortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return repliesSortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  const getRepliesSortIcon = (key) => {
    if (repliesSortConfig.key !== key) return '↕️';
    return repliesSortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const resetAllSorting = () => {
    setSortConfig({ key: 'created_at', direction: 'desc' });
    setRepliesSortConfig({ key: 'timestamp', direction: 'desc' });
  };

  // Compact SLA Timer Indicator Component
  const SLATimerIndicator = ({ ticket }) => {
    if (!ticket || !ticket.id) {
      return (
        <div className="sla-timer-inline no-config">
          <span>No SLA</span>
        </div>
      );
    }

    const statusLower = String(ticket?.status || '').toLowerCase();
    const isClosed = statusLower === 'closed' || !!ticket?.closed_at;
    if (isClosed) {
      return (
        <div className="sla-timer-inline no-config">
          <span>CLOSED</span>
        </div>
      );
    }

    const serverTimer = slaTimersByTicketId?.[Number(ticket.id)] || null;
    const calcFromSnapshot = () => {
      const createdAt = ticket?.created_at ? new Date(ticket.created_at) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) return null;
      const minutes = Number(ticket?.sla_resolution_time_minutes || ticket?.sla_response_time_minutes || 0);
      if (!Number.isFinite(minutes) || minutes <= 0) return null;

      const deadlineMs = createdAt.getTime() + minutes * 60 * 1000;
      const remainingMinutes = Math.floor((deadlineMs - Date.now()) / (1000 * 60));
      const isBreached = remainingMinutes < 0;
      const isWarning = remainingMinutes <= 30 && remainingMinutes > 0;
      return { remainingMinutes, isBreached, isWarning };
    };

    const slaTimer = serverTimer
      ? {
          remainingMinutes: Number(serverTimer.remaining_minutes ?? 0),
          isBreached: !!serverTimer.is_breached,
          isWarning: !!serverTimer.is_warning
        }
      : (calcFromSnapshot() || calculateSLATimer(ticket));
    
    if (!slaTimer) {
      return (
        <div className="sla-timer-inline no-config">
          <span>No SLA</span>
        </div>
      );
    }

    const { remainingMinutes, isBreached, isWarning } = slaTimer;
    
    let statusClass = 'normal';

    if (isBreached) {
      statusClass = 'breached';
    } else if (isWarning) {
      statusClass = 'warning';
    }

    return (
      <div className={`sla-timer-inline ${statusClass}`}>
        {isBreached && (
          <svg className="ud-sla-icon ud-sla-icon--outline" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" d="M12 3.5 2.5 20.5h19L12 3.5z" />
            <path fill="currentColor" d="M11 9h2v5h-2V9zm0 7h2v2h-2v-2z" />
          </svg>
        )}
        {!isBreached && isWarning && (
          <svg className="ud-sla-icon ud-sla-icon--outline" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" d="M12 3.5 2.5 20.5h19L12 3.5z" />
            <path fill="currentColor" d="M11 9h2v5h-2V9zm0 7h2v2h-2v-2z" />
          </svg>
        )}
        <span className="timer-time">
          {isBreached
            ? `${formatSLATime(Math.abs(remainingMinutes))} OVERDUE`
            : formatSLATime(Math.max(0, remainingMinutes))}
        </span>
      </div>
    );
  };

  // Show loading if no user data yet
  if (!currentUser && loading) {
    return (
      <div className="user-dashboard-container user-dashboard-ref ud-loading-root">
        <div className="ud-loading-screen">
          <div className="ud-loading-spinner" aria-hidden />
          <p className="ud-loading-text">Loading customer dashboard…</p>
        </div>
      </div>
    );
  }

  // Show welcome message if no user data
  if (!currentUser) {
    return (
      <div className="user-dashboard-container user-dashboard-ref ud-loading-root">
        <div className="welcome-container">
          <h1>Welcome to Customer Support! 🎉</h1>
          <p>Please wait while we load your information...</p>
          <p>If you came from GRC, your auto-login should complete shortly.</p>
          <div className="ud-loading-spinner" style={{ margin: '20px auto' }} aria-hidden />
        </div>
      </div>
    );
  }

  const displayName = currentUser?.name || currentUser?.email?.split('@')[0] || 'Customer';
  const hasNoTickets = !loading && tickets.length === 0;
  const isSpoc = ['org_spoc', 'product_spoc'].includes(currentUser?.role);

  // FAQ module archived - HelpFAQPage removed, showHelpScreen disabled
  // if (showHelpScreen && !isSpoc) {
  //   return (
  //     <div className="user-dashboard-container user-dashboard-ref">
  //       <div className="help-faq-wrapper">
  //         <HelpFAQPage
  //           initialProduct={getInitialProduct()}
  //           onProceedToTicket={handleProceedToTicket}
  //           onSkipToDashboard={() => setShowHelpScreen(false)}
  //         />
  //       </div>
  //   </div>
  // );
  // }

  // Product SPOC Dashboard module archived - product_spoc role check commented out
  // if (currentUser?.role === 'product_spoc') {
  //   return <ProductSpocDashboard currentUser={currentUser} onLogout={handleUserLogout} />;
  // }

  if (currentUser?.role === 'org_spoc') {
    return <OrgSpocDashboard currentUser={currentUser} onLogout={handleUserLogout} />;
  }

  return (
    <div className="user-dashboard-container user-dashboard-v2 user-dashboard-ref">
      <header className="adr-header">
        <div className="adr-header__inner ud-content-wrap">
          <div className="adr-header__left">
            <div className="adr-header__text">
              <h1 className="adr-header__title ud-welcome-title">
                Welcome{hasNoTickets && isFirstTimeSupportUser ? '' : ' back'}, {displayName}!{' '}
                <span className="ud-wave" aria-hidden="true">
                  👋
                </span>
              </h1>
              <p className="adr-header__welcome ud-welcome-sub">
                {currentUser?.role === 'org_spoc'
                  ? '🏢 Organization SPOC Dashboard — View & manage all support tickets for your organization'
                  : currentUser?.role === 'product_spoc'
                  ? '📦 Product SPOC Dashboard — View & manage support tickets scoped to your product'
                  : hasNoTickets && isFirstTimeSupportUser
                  ? 'You have no tickets yet. Create a ticket below to raise an issue or get support.'
                  : "Here's your personalized ticket overview"}
              </p>
            </div>
          </div>
          <div className="adr-header__actions ud-header-user">
            <HeaderNotificationBell />
            <div className="ud-avatar" aria-hidden="true">
              {currentUser?.name
                ? currentUser.name.charAt(0).toUpperCase()
                : currentUser?.email?.charAt(0).toUpperCase() || 'C'}
            </div>
            <div className="ud-user-meta">
              <span className="ud-user-name">
                {currentUser?.name || currentUser?.email || 'Customer'}
                {currentUser?.role === 'org_spoc' && (
                  <span className="spoc-badge badge-org" style={{ marginLeft: '8px', padding: '2px 6px', fontSize: '10px', background: '#4f46e5', color: '#fff', borderRadius: '4px', fontWeight: 600 }}>ORG SPOC</span>
                )}
                {currentUser?.role === 'product_spoc' && (
                  <span className="spoc-badge badge-prod" style={{ marginLeft: '8px', padding: '2px 6px', fontSize: '10px', background: '#d946ef', color: '#fff', borderRadius: '4px', fontWeight: 600 }}>PRODUCT SPOC</span>
                )}
              </span>
              <span className="ud-user-email">{currentUser?.email || ''}</span>
            </div>
            <button type="button" className="adr-btn adr-btn--ghost adr-btn--logout ud-logout" onClick={handleUserLogout}>
              <svg
                className="adr-btn__icon adr-btn__icon--danger ud-logout-icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      {notification && (() => {
        const raw = String(notification || '');
        const maybeIcon = raw.trim().slice(0, 2);
        const hasLeadingEmoji = /[^\w\s]/.test(maybeIcon);
        const icon = hasLeadingEmoji ? maybeIcon.trim() : '';
        const text = hasLeadingEmoji ? raw.trim().slice(maybeIcon.length).trim() : raw.trim();
        return (
          <div className="status-notification-popup" role="status" aria-live="polite">
            <div className="notification-content">
              {icon ? <div className="notification-icon" aria-hidden="true">{icon}</div> : null}
              <div className="notification-text">
                <h3>{text || 'Update'}</h3>
              </div>
              <button
                type="button"
                className="notification-close-btn"
                onClick={() => setNotification(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
        );
      })()}

      <main className="ud-main ud-content-wrap">
        <section className="ud-stats-block">
          <h2 className="ud-stats-heading">Dashboard Statistics</h2>
          <div className="ud-stats-grid">
            {getStatsArray(stats).map((stat) => (
              <div key={stat.key} className={`ud-stat-card ud-stat-card--${stat.variant}`}>
                <div className={`ud-stat-icon-box ud-stat-icon-box--${stat.variant}`}>
                  <DashboardStatIcon variant={stat.variant} />
                </div>
                <div className="ud-stat-text">
                  <span className="ud-stat-value">{stat.value}</span>
                  <span className="ud-stat-label">{stat.label}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="ud-section-row">
          <h2 className="ud-table-heading">Your Tickets &amp; Conversations</h2>
          <div className="ud-toolbar-btns">
            <button
              type="button"
              className="adr-btn adr-btn--ghost ud-btn-refresh"
              onClick={() => {
                fetchTickets();
                showNotification('Tickets refreshed!');
              }}
              title="Refresh tickets"
            >
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh
            </button>
            <button type="button" className="adr-btn adr-btn--ud-primary ud-btn-primary" onClick={() => setShowForm(true)}>
              <span className="ud-btn-plus" aria-hidden="true">+</span>
              {hasNoTickets && isFirstTimeSupportUser ? 'Create your first ticket' : 'New Ticket'}
            </button>
          </div>
        </div>

        {showForm && (
          <div
            className="form-popup-overlay"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowForm(false);
            }}
          >
            <UserForm
              user={currentUser}
              onSubmit={handleTicketSubmitted}
              onClose={() => setShowForm(false)}
              initialProduct={formPrefill.product}
              initialIssueType={formPrefill.issueType}
            />
          </div>
        )}

      <div className="tickets-section ud-tickets-section">
        {loading ? (
          <div className="ud-table-shell">
            <div className="loading-container">
              <div className="loading-spinner" />
              <p>Loading your tickets...</p>
            </div>
          </div>
        ) : error ? (
          <div className="ud-table-shell">
            <div className="error-container">
              <div className="error-icon">❌</div>
              <h3>Error Loading Tickets</h3>
              <p>{error}</p>
              <button type="button" className="retry-btn" onClick={retryFetch}>
                🔄 Try Again
              </button>
            </div>
          </div>
        ) : tickets.length === 0 ? (
          <div className="ud-table-shell">
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <h3>No tickets yet</h3>
              <p>{isFirstTimeSupportUser ? 'Create a ticket above to raise an issue or get support.' : 'Submit your first ticket to get started!'}</p>
              {!showForm && (
                <button type="button" className="submit-ticket-btn ud-empty-cta" onClick={() => setShowForm(true)}>
                  {isFirstTimeSupportUser ? 'Create Ticket' : 'New Ticket'}
                </button>
              )}
            </div>
          </div>
        ) : (
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
                    <button type="button" className="adr-th-btn" onClick={() => handleSort('created_at')}>
                      Date {getSortIcon('created_at')}
                    </button>
                  </th>
                  {['org_spoc', 'product_spoc'].includes(currentUser?.role) && (
                    <th scope="col">Submitter</th>
                  )}
                  <th scope="col">SLA timer</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortTickets(tickets)
                  .filter((ticket) => ticket && ticket.id)
                  .map((ticket) => {
                    const visibleStatus = getUserVisibleStatus(ticket);
                    const pillMod = userStatusToPillModifier(visibleStatus);
                    const desc = ticket.description
                      ? ticket.description.length > 60
                        ? `${ticket.description.substring(0, 60)}...`
                        : ticket.description
                      : null;
                    return (
                      <tr key={ticket.id}>
                        <td className="adr-td-ticket">
                          <span className="adr-td-ticket__id">#{ticket.id}</span>
                        </td>
                        <td>
                          <div className="adr-table-issue">
                            <div className="adr-table-issue__title">{ticket.issue_title || 'Untitled Ticket'}</div>
                            {desc ? <div className="adr-table-issue__sub">{desc}</div> : null}
                          </div>
                        </td>
                        <td>
                          <span className={`adr-status-pill adr-status-pill--${pillMod}`}>{getStatusText(visibleStatus)}</span>
                        </td>
                        <td className="adr-td-muted">{formatDate(ticket.created_at)}</td>
                        {['org_spoc', 'product_spoc'].includes(currentUser?.role) && (
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>{ticket.name || 'Anonymous'}</span>
                              <span style={{ fontSize: '11px', color: '#6b7280' }}>{ticket.email}</span>
                            </div>
                          </td>
                        )}
                        <td className="adr-td-sla">
                          <SLATimerIndicator ticket={ticket} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="adr-table-view-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTicketDetail(ticket);
                            }}
                            title="View ticket details"
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
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </main>
    </div>
  );
};

export default UserDashboard; 