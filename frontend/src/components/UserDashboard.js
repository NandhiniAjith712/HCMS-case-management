import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAuthHeaders, authenticatedFetch } from '../utils/api';
import { formatDateTimeIST } from '../utils/dateTime';
import UserForm from './tickets/UserForm';
import './dashboards/UserDashboard.css';

const UserDashboard = ({ user }) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [replies, setReplies] = useState({});
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    closed: 0,
    unreadReplies: 0
  });
  
  // SLA timers map (server-computed; snapshot-based)
  const [slaTimersByTicketId, setSlaTimersByTicketId] = useState({});

  // Sorting state
  const [sortConfig, setSortConfig] = useState({
    key: 'created_at',
    direction: 'desc'
  });
  const [statsSortConfig, setStatsSortConfig] = useState({
    key: 'value',
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

  // SPOC management states
  const [activeTab, setActiveTab] = useState('tickets'); // 'tickets' or 'spocs'
  const [spocs, setSpocs] = useState([]);
  const [products, setProducts] = useState([]);
  const [spocForm, setSpocForm] = useState({ name: '', email: '', productId: '' });
  const [spocLoading, setSpocLoading] = useState(false);
  const [spocError, setSpocError] = useState(null);
  const [spocSuccess, setSpocSuccess] = useState(null);

  const fetchSpocsAndProducts = async () => {
    if (!currentUser || currentUser.role !== 'org_spoc') return;
    setSpocLoading(true);
    setSpocError(null);
    try {
      const headers = getAuthHeaders();
      
      // Fetch products for the tenant
      const prodRes = await fetch(`/api/tenant-spoc/my-tenant/products`, {
        headers
      });
      const prodData = await prodRes.json();
      if (prodData.success) {
        setProducts(prodData.data || []);
      }

      // Fetch active Product SPOCs
      const spocRes = await fetch(`/api/users/spoc/products`, {
        headers
      });
      const spocData = await spocRes.json();
      if (spocData.success) {
        setSpocs(spocData.data || []);
      }
    } catch (err) {
      console.error('Error fetching SPOC data:', err);
      setSpocError('Failed to load SPOC management data.');
    } finally {
      setSpocLoading(false);
    }
  };

  const handleCreateProductSpoc = async (e) => {
    e.preventDefault();
    if (!spocForm.name || !spocForm.email || !spocForm.productId) {
      setSpocError('All fields are required.');
      return;
    }
    setSpocLoading(true);
    setSpocError(null);
    setSpocSuccess(null);
    try {
      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      };
      const res = await fetch('/api/users/spoc/product', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: spocForm.name,
          email: spocForm.email,
          product_id: Number(spocForm.productId)
        })
      });
      const data = await res.json();
      if (data.success) {
        setSpocSuccess('Product SPOC registered successfully! Onboarding verification email sent.');
        setSpocForm({ name: '', email: '', productId: '' });
        fetchSpocsAndProducts();
      } else {
        setSpocError(data.message || 'Failed to register Product SPOC.');
      }
    } catch (err) {
      console.error('Error creating Product SPOC:', err);
      setSpocError('Network error. Failed to create Product SPOC.');
    } finally {
      setSpocLoading(false);
    }
  };

  const handleRevokeSpoc = async (spocUserId) => {
    if (!window.confirm('Are you sure you want to revoke this user\'s Product SPOC privileges?')) return;
    setSpocLoading(true);
    setSpocError(null);
    setSpocSuccess(null);
    try {
      const res = await fetch(`/api/users/spoc/${spocUserId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setSpocSuccess('SPOC privileges successfully revoked.');
        fetchSpocsAndProducts();
      } else {
        setSpocError(data.message || 'Failed to revoke SPOC privileges.');
      }
    } catch (err) {
      console.error('Error revoking SPOC:', err);
      setSpocError('Network error. Failed to revoke SPOC privileges.');
    } finally {
      setSpocLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && currentUser.role === 'org_spoc') {
      fetchSpocsAndProducts();
    }
  }, [currentUser]);

  const navigate = useNavigate();
  const location = useLocation();

  // Check for logged-in user data only
  useEffect(() => {
    const checkAutoLoginAndUserData = () => {
      // First check if user prop is passed
      if (user) {
        setCurrentUser(user);
        return;
      }

      // Check localStorage for existing user data (multiple formats)
      const storedUser = localStorage.getItem('userData');
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          setCurrentUser(userData);
          return;
        } catch (error) {
          console.error('Error parsing stored user data:', error);
        }
      }

      // Check for stored logged-in data
      const autoLoginUserId = localStorage.getItem('user_id');
      const autoLoginUserName = localStorage.getItem('user_name');
      const autoLoginUserEmail = localStorage.getItem('user_email');
      const autoLoginUserRole = localStorage.getItem('user_role');
      
      if (autoLoginUserId && autoLoginUserName && autoLoginUserEmail) {
        console.log('🔍 Found auto-login data in localStorage');
        const autoLoginUser = {
          id: autoLoginUserId,
          name: autoLoginUserName,
          email: autoLoginUserEmail,
          role: autoLoginUserRole || 'user'
        };
        console.log('✅ Setting current user from auto-login data:', autoLoginUser);
        
        // Also store in userData format for CustomerChatPage
        localStorage.setItem('userData', JSON.stringify(autoLoginUser));
        
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
    } else {
      setLoading(false);
    }
  }, [currentUser]);

  // Real-time refresh for new replies (keep it lightweight on large accounts)
  useEffect(() => {
    if (!currentUser) return;

    // Set up interval to check for new replies periodically
    const intervalId = setInterval(() => {
      if (tickets && tickets.length > 0) {
        // Avoid N requests per refresh. Only refresh a small slice of newest tickets.
        const validTickets = tickets.filter(ticket => ticket && ticket.id).slice(0, 10);
        validTickets.forEach(ticket => {
          if (ticket && ticket.id) {
            fetchReplies(ticket.id);
          }
        });
      }
    }, 120000); // 2 minutes

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [currentUser, tickets]);

  // Using centralized getAuthHeaders from utils/api.js

  const fetchTickets = async () => {
    if (!currentUser?.id) return;
    
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();
      console.log('🔍 Fetching tickets for user:', currentUser.id, 'with headers:', headers);
      
      const res = await fetch(`/api/tickets/user/${currentUser.id}`, {
        method: 'GET',
        headers: headers
      });
      
      console.log('📡 Tickets response status:', res.status);
      
      const data = await res.json();
      console.log('📦 Tickets data received:', data);
      if (data.success && Array.isArray(data.data)) {
        // Filter out invalid tickets before setting state
        const validTickets = data.data.filter(ticket => ticket && ticket.id);
        setTickets(validTickets);

        // Fetch SLA timers in ONE bulk call (server uses stored SLA snapshot due times).
        try {
          const ids = validTickets.map((t) => Number(t?.id || 0)).filter(Boolean).slice(0, 200);
          if (ids.length) {
            const r = await authenticatedFetch('/api/sla/timers/bulk-remaining', {
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
        setReplies({});
        calculateStats(validTickets);
      } else {
        console.error('Failed to fetch tickets:', data.message);
        setError(data.message || 'Failed to fetch tickets');
        setTickets([]);
        calculateStats([]);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
      setError('Network error. Please try again.');
      setTickets([]);
      calculateStats([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchReplies = async (ticketId) => {
    if (!ticketId) return;
    
    try {
      const headers = getAuthHeaders();
      // Use the chat API instead of the old replies API
      const res = await fetch(`/api/chat/messages/${ticketId}`, {
        method: 'GET',
        headers: headers
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        const previousReplies = replies[ticketId] || [];
        const newReplies = data.data.filter(reply => reply && reply.id); // Filter valid replies
        
        // Sort replies by timestamp (newest first) - default sorting
        const sortedReplies = newReplies.sort((a, b) => {
          const dateA = new Date(a.created_at || a.timestamp || 0);
          const dateB = new Date(b.created_at || b.timestamp || 0);
          
          // Check if dates are valid
          if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
            return 0;
          }
          
          return dateB - dateA;
        });
        
        // Check if there are new agent replies
        const newAgentReplies = sortedReplies.filter(newReply => 
          newReply && newReply.sender_type === 'agent' && 
          !previousReplies.some(prevReply => 
            prevReply && prevReply.id === newReply.id
          )
        );
        
        if (newAgentReplies.length > 0) {
          // Show notification for new replies
          const ticket = tickets.find(t => t && t.id === ticketId);
          showNotification(`💬 New reply from ${newAgentReplies[0].sender_name || 'Support Agent'} on ticket: ${ticket?.issue_title || 'Your ticket'}`);
        }
        
        setReplies(prev => ({ ...prev, [ticketId]: sortedReplies }));
      }
    } catch (error) {
      console.error('Error fetching replies:', error);
    }
  };

  // SLA is snapshotted by backend at ticket creation; frontend must not fetch configs or recalculate.

  const showNotification = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 2000);
  };

  const calculateStats = (ticketData) => {
    if (!ticketData || !Array.isArray(ticketData)) {
      setStats({ total: 0, open: 0, inProgress: 0, closed: 0, unreadReplies: 0 });
      return;
    }

    // Filter out invalid tickets
    const validTickets = ticketData.filter(t => t && t.status);
    
    const total = validTickets.length;
    const open = validTickets.filter(t => t.status === 'open').length;
    const inProgress = validTickets.filter(t => t.status === 'in_progress').length;
    const closed = validTickets.filter(t => t.status === 'closed').length;
    
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

  const handleTicketSubmitted = async (newTicket) => {
    console.log('🎫 Ticket submitted callback received:', newTicket);
    
    // Close the form
      setShowForm(false);
    
    // Show success notification
    showNotification('✅ Ticket submitted successfully! Your ticket ID: #' + (newTicket?.id || 'N/A'));
    
    // Refresh the tickets list to show the new ticket
    // Wait a moment for the backend to process
    setTimeout(() => {
      fetchTickets();
    }, 500);
  };

  const refreshAllReplies = async () => {
    if (tickets && tickets.length > 0) {
      const validTickets = tickets.filter(ticket => ticket && ticket.id);
      if (validTickets.length > 0) {
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
      const res = await fetch(`/api/tickets/${ticketId}/close`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`
        }
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

  // Frontend must not compute SLA; only display server-provided timer snapshot.

  // Format time for display
  const formatSLATime = (minutes) => {
    if (!minutes || isNaN(minutes) || minutes < 0) {
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

  const handleStatsSort = (key) => {
    setStatsSortConfig(prevConfig => ({
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
        const statusOrder = { open: 1, in_progress: 2, closed: 3, escalated: 4 };
        aValue = statusOrder[aValue] || 0;
        bValue = statusOrder[bValue] || 0;
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
    const statsArray = [
      { key: 'total', label: 'Total Tickets', value: statsData.total, icon: '📊' },
      { key: 'open', label: 'Open Tickets', value: statsData.open, icon: '🆕' },
      { key: 'inProgress', label: 'In Progress', value: statsData.inProgress, icon: '⚡' },
      { key: 'closed', label: 'Closed', value: statsData.closed, icon: '✅' },
      ...(statsData.unreadReplies > 0 ? [{ key: 'unreadReplies', label: 'Unread Replies', value: statsData.unreadReplies, icon: '💬' }] : [])
    ];

    return statsArray.sort((a, b) => {
      let aValue = a[statsSortConfig.key];
      let bValue = b[statsSortConfig.key];

      if (statsSortConfig.key === 'value') {
        aValue = a.value;
        bValue = b.value;
      } else if (statsSortConfig.key === 'label') {
        aValue = a.label.toLowerCase();
        bValue = b.label.toLowerCase();
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
    if (sortConfig.key !== key) return '↕️';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const getStatsSortIcon = (key) => {
    if (statsSortConfig.key !== key) return '↕️';
    return statsSortConfig.direction === 'asc' ? '↑' : '↓';
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
    setStatsSortConfig({ key: 'value', direction: 'desc' });
    setRepliesSortConfig({ key: 'timestamp', direction: 'desc' });
  };

  // Compact SLA Timer Indicator Component
  const SLATimerIndicator = ({ ticket }) => {
    if (!ticket || !ticket.id) {
      return (
        <div className="sla-timer-inline no-config">
          <span>⏰ No SLA</span>
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
    const slaTimer = serverTimer
      ? {
          remainingMinutes: Number(serverTimer.remaining_minutes ?? 0),
          isBreached: !!serverTimer.is_breached,
          isWarning: !!serverTimer.is_warning
        }
      : null;
    
    if (!slaTimer) {
      return (
        <div className="sla-timer-inline no-config">
          <span>⏰ No SLA</span>
        </div>
      );
    }

    const { remainingMinutes, isBreached, isWarning } = slaTimer;
    
    let statusClass = 'normal';
    let statusIcon = '⏰';
    let statusColor = '#44aa44';
    
    if (isBreached) {
      statusClass = 'breached';
      statusIcon = '🚨';
      statusColor = '#ff4444';
    } else if (isWarning) {
      statusClass = 'warning';
      statusIcon = '⚠️';
      statusColor = '#ff8800';
    }

    return (
      <div className={`sla-timer-inline ${statusClass}`} style={{ color: statusColor }}>
        <span className="timer-icon">{statusIcon}</span>
        <span className="timer-time">
          {isBreached ? (
            `🚨 ${formatSLATime(Math.abs(remainingMinutes))} OVERDUE`
          ) : (
            `${isWarning ? '⚠️ ' : '⏰ '}${formatSLATime(remainingMinutes)}`
          )}
        </span>
      </div>
    );
  };

  // Show loading if no user data yet
  if (!currentUser && loading) {
    return (
      <div className="user-dashboard-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading customer dashboard...</p>
        </div>
      </div>
    );
  }

  // Show welcome message if no user data
  if (!currentUser) {
    return (
      <div className="user-dashboard-container">
        <div className="welcome-container">
          <h1>Welcome to Customer Support! 🎉</h1>
          <p>Please wait while we load your information...</p>
          <p>If you came from GRC, your auto-login should complete shortly.</p>
          <div className="loading-spinner" style={{ margin: '20px auto' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="user-dashboard-container">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="welcome-section">
          <h1 className="welcome-title">Welcome back, {currentUser?.name || currentUser?.email?.split('@')[0] || 'Customer'}! 👋</h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
            <p className="welcome-subtitle" style={{ margin: 0 }}>Here's your personalized ticket overview</p>
            {currentUser?.role === 'org_spoc' && (
              <span style={{ background: '#f59e0b', color: '#ffffff', fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '12px' }}>
                🏢 Organization SPOC
              </span>
            )}
            {currentUser?.role === 'product_spoc' && (
              <span style={{ background: '#10b981', color: '#ffffff', fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '12px' }}>
                📦 Product SPOC Scope
              </span>
            )}
          </div>
        </div>
        <div className="user-info">
          <div className="user-avatar">
            {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : currentUser?.email?.charAt(0).toUpperCase() || 'C'}
          </div>
          <div className="user-details">
            <span className="user-name">{currentUser?.name || currentUser?.email || 'Customer'}</span>
            <span className="user-email">{currentUser?.email || 'customer@example.com'}</span>
          </div>
          <button className="user-logout-btn" onClick={handleUserLogout}>
            Logout
          </button>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className="notification-toast">
          <div className="notification-content">
            <span className="notification-icon">💬</span>
            <span className="notification-text">{notification}</span>
            <button className="notification-close" onClick={() => setNotification(null)}>×</button>
          </div>
        </div>
      )}

      {/* Stats Section */}
      <div className="stats-section">
        <div className="stats-header">
          <h3>Dashboard Statistics</h3>
          <div className="stats-sort-controls">
            <span className="sort-label">Sort by:</span>
            <button 
              className={`sort-btn ${statsSortConfig.key === 'value' ? 'active' : ''}`}
              onClick={() => handleStatsSort('value')}
            >
              Count {getStatsSortIcon('value')}
            </button>
            <button 
              className={`sort-btn ${statsSortConfig.key === 'label' ? 'active' : ''}`}
              onClick={() => handleStatsSort('label')}
            >
              Name {getStatsSortIcon('label')}
            </button>
          </div>
        </div>
        <div className="stats-grid">
          {sortStats(stats).map(stat => (
            <div key={stat.key} className={`stat-card ${stat.key}`}>
              <div className="stat-icon">{stat.icon}</div>
              <div className="stat-content">
                <div className="stat-number">{stat.value}</div>
                <div className="stat-label">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Switcher for Org SPOCs */}
      {currentUser?.role === 'org_spoc' && (
        <div className="dashboard-tabs" style={{ display: 'flex', gap: '15px', marginBottom: '25px', borderBottom: '2px solid #cbd5e1', paddingBottom: '10px' }}>
          <button 
            onClick={() => setActiveTab('tickets')}
            style={{
              padding: '10px 20px',
              fontSize: '15px',
              fontWeight: 'bold',
              border: 'none',
              background: activeTab === 'tickets' ? '#3b82f6' : 'transparent',
              color: activeTab === 'tickets' ? '#ffffff' : '#64748b',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              outline: 'none'
            }}
          >
            🎫 View Tickets
          </button>
          <button 
            onClick={() => setActiveTab('spocs')}
            style={{
              padding: '10px 20px',
              fontSize: '15px',
              fontWeight: 'bold',
              border: 'none',
              background: activeTab === 'spocs' ? '#3b82f6' : 'transparent',
              color: activeTab === 'spocs' ? '#ffffff' : '#64748b',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              outline: 'none'
            }}
          >
            👥 Manage Product SPOCs
          </button>
        </div>
      )}

      {activeTab === 'tickets' ? (
        <>
          {/* Action Section */}
          <div className="action-section">
            <div className="action-buttons">
              <button 
                className="submit-ticket-btn" 
                onClick={() => setShowForm(!showForm)}
              >
                {showForm ? '❌ Cancel' : '➕ Submit New Ticket'}
              </button>
              <button 
                className="refresh-replies-btn" 
                onClick={refreshAllReplies}
                title="Check for new replies"
              >
                🔄 Refresh Replies
              </button>
              <button 
                className="reset-sorting-btn" 
                onClick={resetAllSorting}
                title="Reset all sorting to default"
              >
                🔄 Reset Sorting
              </button>
            </div>
          </div>

          {/* New Ticket Form */}
          {showForm && (
            <div className="form-section">
              <UserForm user={currentUser} onSubmit={handleTicketSubmitted} />
            </div>
          )}

          {/* Tickets Section - Table Structure */}
          <div className="tickets-section">
            <div className="section-header">
              <h2 className="section-title">Your Tickets & Conversations</h2>
              <div className="section-subtitle">
                {tickets.length === 0 ? 'No tickets yet. Submit your first ticket!' : `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} found`}
                {tickets.length > 0 && (
                  <span className="current-sort-info">
                    • Sorted by: <strong>{sortConfig.key === 'created_at' ? 'Date' : 
                      sortConfig.key === 'status' ? 'Status' : 
                      sortConfig.key === 'priority' ? 'Priority' : 
                      sortConfig.key === 'issue_title' ? 'Title' : 
                      sortConfig.key === 'issue_type' ? 'Type' : sortConfig.key}</strong> 
                    ({sortConfig.direction === 'asc' ? 'A→Z' : 'Z→A'})
                  </span>
                )}
              </div>
            </div>

            {loading ? (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading your tickets...</p>
              </div>
            ) : error ? (
              <div className="error-container">
                <div className="error-icon">❌</div>
                <h3>Error Loading Tickets</h3>
                <p>{error}</p>
                <button className="retry-btn" onClick={retryFetch}>
                  🔄 Try Again
                </button>
              </div>
            ) : tickets.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📝</div>
                <h3>No tickets yet</h3>
                <p>Submit your first ticket to get started!</p>
                <button 
                  className="submit-ticket-btn" 
                  onClick={() => setShowForm(true)}
                >
                  ➕ Submit Your First Ticket
                </button>
              </div>
            ) : (
              <>
                {/* Tickets Sorting Header */}
                <div className="tickets-sort-header">
                  <div className="sort-controls">
                    <span className="sort-label">Sort tickets by:</span>
                    <button 
                      className={`sort-btn ${sortConfig.key === 'created_at' ? 'active' : ''}`}
                      onClick={() => handleSort('created_at')}
                    >
                      Date {getSortIcon('created_at')}
                    </button>
                    <button 
                      className={`sort-btn ${sortConfig.key === 'status' ? 'active' : ''}`}
                      onClick={() => handleSort('status')}
                    >
                      Status {getSortIcon('status')}
                    </button>
                    <button 
                      className={`sort-btn ${sortConfig.key === 'priority' ? 'active' : ''}`}
                      onClick={() => handleSort('priority')}
                    >
                      Priority {getSortIcon('priority')}
                    </button>
                    <button 
                      className={`sort-btn ${sortConfig.key === 'issue_title' ? 'active' : ''}`}
                      onClick={() => handleSort('issue_title')}
                    >
                      Title {getSortIcon('issue_title')}
                    </button>
                    <button 
                      className={`sort-btn ${sortConfig.key === 'issue_type' ? 'active' : ''}`}
                      onClick={() => handleSort('issue_type')}
                    >
                      Type {getSortIcon('issue_type')}
                    </button>
                  </div>
                </div>
                
                {/* Table Structure */}
                <div className="ticket-table-container">
                  <div className="ticket-table">
                    <div className="table-header">
                      <div className="header-cell sortable" onClick={() => handleSort('id')}>
                        TICKET NO
                        <span className="sort-icon">{getSortIcon('id')}</span>
                      </div>
                      <div className="header-cell sortable" onClick={() => handleSort('issue_title')}>
                        ISSUE NAME
                        <span className="sort-icon">{getSortIcon('issue_title')}</span>
                      </div>
                      <div className="header-cell sortable" onClick={() => handleSort('status')}>
                        STATUS
                        <span className="sort-icon">{getSortIcon('status')}</span>
                      </div>
                      <div className="header-cell sortable" onClick={() => handleSort('created_at')}>
                        DATE
                        <span className="sort-icon">{getSortIcon('created_at')}</span>
                      </div>
                      <div className="header-cell">SLA TIMER</div>
                      <div className="header-cell">ACTIONS</div>
                    </div>

                    <div className="table-body">
                      {sortTickets(tickets)
                        .filter(ticket => ticket && ticket.id) // Filter out invalid tickets
                        .map(ticket => (
                        <div key={ticket.id} className="table-row">
                          <div className="table-cell">
                            <div className="ticket-number">
                              #{ticket.id}
                            </div>
                          </div>
                          <div className="table-cell">
                            <div className="ticket-title-cell">
                              <div className="ticket-title">{ticket.issue_title || 'Untitled Ticket'}</div>
                              {ticket.description && (
                                <div className="ticket-description-preview">
                                  {ticket.description.length > 60 
                                    ? `${ticket.description.substring(0, 60)}...` 
                                    : ticket.description}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="table-cell">
                            <span
                              className="status-badge"
                              style={{ backgroundColor: `${getStatusColor(ticket.status)}20`, color: getStatusColor(ticket.status) }}
                            >
                              {getStatusText(ticket.status)}
                            </span>
                          </div>
                          <div className="table-cell">
                            {formatDate(ticket.created_at)}
                          </div>
                          <div className="table-cell">
                            <SLATimerIndicator ticket={ticket} />
                          </div>
                          <div className="table-cell actions-cell">
                            <button 
                              className="expand-btn"
                              onClick={() => openTicketDetail(ticket)}
                              title="View Ticket Details"
                            >
                              View Ticket
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="spoc-management-panel" style={{ background: '#ffffff', borderRadius: '12px', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '22px', color: '#1e293b', marginBottom: '8px' }}>Product SPOC Management</h2>
          <p style={{ color: '#64748b', marginBottom: '25px', fontSize: '14px' }}>Assign product-level single point of contact (SPOC) roles within your organization.</p>

          {spocError && (
            <div style={{ background: '#fef2f2', borderLeft: '4px solid #ef4444', color: '#991b1b', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px' }}>
              ⚠️ {spocError}
            </div>
          )}
          {spocSuccess && (
            <div style={{ background: '#f0fdf4', borderLeft: '4px solid #22c55e', color: '#166534', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px' }}>
              ✅ {spocSuccess}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '30px' }}>
            {/* Left: Add form */}
            <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '16px', color: '#334155', marginBottom: '15px', fontWeight: 'bold' }}>Add Product SPOC</h3>
              <form onSubmit={handleCreateProductSpoc}>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Full Name</label>
                  <input 
                    type="text" 
                    placeholder="Enter name"
                    value={spocForm.name}
                    onChange={(e) => setSpocForm(prev => ({ ...prev, name: e.target.value }))}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    required
                  />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Email Address</label>
                  <input 
                    type="email" 
                    placeholder="name@company.com"
                    value={spocForm.email}
                    onChange={(e) => setSpocForm(prev => ({ ...prev, email: e.target.value }))}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    required
                  />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Product Scope</label>
                  <select
                    value={spocForm.productId}
                    onChange={(e) => setSpocForm(prev => ({ ...prev, productId: e.target.value }))}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: 'white' }}
                    required
                  >
                    <option value="">Select Mapped Product</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.slug})</option>
                    ))}
                  </select>
                </div>
                <button 
                  type="submit" 
                  disabled={spocLoading}
                  style={{
                    width: '100%',
                    background: '#3b82f6',
                    color: 'white',
                    padding: '12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: spocLoading ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s'
                  }}
                >
                  {spocLoading ? 'Registering...' : 'Register Product SPOC'}
                </button>
              </form>
            </div>

            {/* Right: Active list */}
            <div>
              <h3 style={{ fontSize: '16px', color: '#334155', marginBottom: '15px', fontWeight: 'bold' }}>Active Product SPOCs</h3>
              {spocLoading && spocs.length === 0 ? (
                <p style={{ color: '#64748b' }}>Loading active SPOCs...</p>
              ) : spocs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                  <span style={{ fontSize: '24px' }}>👥</span>
                  <p style={{ color: '#64748b', marginTop: '10px', fontSize: '14px' }}>No active Product SPOCs registered yet.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {spocs.map(spoc => (
                    <div key={spoc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '15px' }}>{spoc.name}</div>
                        <div style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>{spoc.email}</div>
                        <div style={{ display: 'inline-block', background: '#eff6ff', color: '#1d4ed8', fontSize: '11px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '12px', marginTop: '6px' }}>
                          📦 Product: {spoc.product_name}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleRevokeSpoc(spoc.id)}
                        style={{
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fca5a5',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = '#fee2e2';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = '#fef2f2';
                        }}
                      >
                        Revoke Access
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDashboard; 