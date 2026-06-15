import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildApiUrl, getAuthHeaders } from '../../utils/api';
import { formatDateTimeIST } from '../../utils/dateTime';
import HeaderNotificationBell from '../common/HeaderNotificationBell';
import './OrgSpocDashboard.css';

/** Sidebar navigation formal SVGs matching Manager Dashboard design */
function SpocSidebarIcon({ name }) {
  const c = {
    width: 18,
    height: 18,
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
    case 'tickets':
      return (
        <svg {...c}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 7l-10 6L2 7" />
        </svg>
      );
    case 'products':
      return (
        <svg {...c}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'spocs':
      return (
        <svg {...c}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'users':
      return (
        <svg {...c}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'notifications':
      return (
        <svg {...c}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case 'reports':
      return (
        <svg {...c}>
          <path d="M18 20V10" />
          <path d="M12 20V4" />
          <path d="M6 20v-6" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...c}>
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
          <line x1="9" y1="22" x2="9" y2="16" />
          <line x1="15" y1="22" x2="15" y2="16" />
          <line x1="9" y1="16" x2="15" y2="16" />
          <path d="M8 6h3M8 10h3M13 6h3M13 10h3" />
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

/** Formal KPI SVG icon component */
function SpocKpiIcon({ name }) {
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
    case 'total':
      return (
        <svg {...c}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 7l-10 6L2 7" />
        </svg>
      );
    case 'open':
      return (
        <svg {...c} fill="currentColor" stroke="none">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case 'closed':
      return (
        <svg {...c}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'escalated':
    case 'sla':
      return (
        <svg {...c}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'products':
      return (
        <svg {...c}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'spocs':
      return (
        <svg {...c}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

const OrgSpocDashboard = ({ currentUser, onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Core SPOC States
  const [orgData, setOrgData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [products, setProducts] = useState([]);
  const [spocs, setSpocs] = useState([]);
  const [users, setUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // Ticket Filter/Search States
  const [ticketSearch, setTicketSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ticketsPerPage = 10;

  // Selected Ticket Drawer States
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Product SPOC CRUD States
  const [showSpocModal, setShowSpocModal] = useState(false);
  const [editingSpoc, setEditingSpoc] = useState(null);
  const [spocForm, setSpocForm] = useState({ name: '', email: '', phone: '', productId: '' });

  // Reporting Date Filter
  const [reportDateRange, setReportDateRange] = useState({ start: '', end: '' });

  const navigate = useNavigate();

  // Show Toast Helper
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch initial profile & analytics
  useEffect(() => {
    if (currentUser) {
      fetchAllData();
    }
  }, [currentUser]);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchOrgProfile(),
        fetchAnalytics(),
        fetchTickets(),
        fetchProducts(),
        fetchSpocs(),
        fetchUsers(),
        fetchNotifications()
      ]);
    } catch (err) {
      console.error('Error fetching SPOC dashboard data:', err);
      setError('Failed to load dashboard data. Please verify your connection or contact support.');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrgProfile = async () => {
    const res = await fetch(buildApiUrl('/api/organizations/my-org'), { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setOrgData(data.data);
    }
  };

  const fetchAnalytics = async () => {
    const res = await fetch(buildApiUrl('/api/organizations/my-org/analytics'), { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setAnalytics(data.data);
    }
  };

  const fetchTickets = async () => {
    const parsedId = typeof currentUser.id === 'string' ? parseInt(currentUser.id, 10) : currentUser.id;
    const res = await fetch(buildApiUrl(`/api/tickets/user/${parsedId}`), { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setTickets(data.data || []);
    }
  };

  const fetchProducts = async () => {
    console.log('🔍 [FRONTEND STEP 1] fetchProducts called');
    const res = await fetch(buildApiUrl('/api/organizations/my-org/products'), { headers: getAuthHeaders() });
    console.log('🔍 [FRONTEND STEP 2] API response status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('🔍 [FRONTEND STEP 3] Complete API response:', data);
      console.log('🔍 [FRONTEND STEP 4] data.success:', data.success);
      console.log('🔍 [FRONTEND STEP 5] data.data:', data.data);
      console.log('🔍 [FRONTEND STEP 6] typeof data.data:', typeof data.data);
      console.log('🔍 [FRONTEND STEP 7] Array.isArray(data.data):', Array.isArray(data.data));
      console.log('🔍 [FRONTEND STEP 8] data.data length:', data.data ? data.data.length : 'undefined');
      setProducts(data.data || []);
      console.log('🔍 [FRONTEND STEP 9] setProducts called with:', data.data || []);
    } else {
      console.error('❌ [FRONTEND STEP 10] API response not OK:', res.status);
      const errorData = await res.json().catch(() => ({}));
      console.error('❌ [FRONTEND STEP 11] Error response:', errorData);
    }
  };

  const fetchSpocs = async () => {
    const res = await fetch(buildApiUrl('/api/organizations/my-org/product-spocs'), { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setSpocs(data.data || []);
    }
  };

  const fetchUsers = async () => {
    const res = await fetch(buildApiUrl('/api/organizations/my-org/users'), { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.data || []);
    }
  };

  const fetchNotifications = async () => {
    const res = await fetch(buildApiUrl('/api/notifications?limit=50'), { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.data || []);
    }
  };

  // Mark notification as read
  const handleMarkNotificationRead = async (notifId) => {
    const res = await fetch(buildApiUrl(`/api/notifications/${notifId}/read`), {
      method: 'PATCH',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
      showToast('Notification marked as read');
    }
  };

  // Open ticket drawer & load timeline
  const handleOpenTicket = async (ticket) => {
    setSelectedTicket(ticket);
    setChatMessages([]);
    try {
      const res = await fetch(buildApiUrl(`/api/chat/messages/${ticket.id}`), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching ticket messages:', err);
    }
  };

  // Reply to ticket
  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;

    setSendingReply(true);
    try {
      const res = await fetch(buildApiUrl('/api/chat/messages'), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          message: replyText.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setChatMessages(prev => [...prev, data.data]);
        setReplyText('');
        showToast('Reply submitted successfully');
        // Refresh ticket lists
        fetchTickets();
      } else {
        showToast('Failed to send reply: ' + data.message, 'error');
      }
    } catch (err) {
      showToast('Network error submitting reply', 'error');
    } finally {
      setSendingReply(false);
    }
  };

  // CRUD Product SPOC
  const handleOpenSpocForm = (spocObj = null) => {
    if (spocObj) {
      setEditingSpoc(spocObj);
      setSpocForm({
        name: spocObj.name || '',
        email: spocObj.email || '',
        phone: spocObj.phone || '',
        productId: spocObj.product_id || ''
      });
    } else {
      setEditingSpoc(null);
      setSpocForm({ name: '', email: '', phone: '', productId: '' });
    }
    setShowSpocModal(true);
  };

  const handleSaveSpoc = async (e) => {
    e.preventDefault();
    const url = editingSpoc
      ? buildApiUrl(`/api/organizations/my-org/product-spocs/${editingSpoc.id}`)
      : buildApiUrl('/api/organizations/my-org/product-spocs');

    const method = editingSpoc ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(spocForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast(editingSpoc ? 'Product SPOC updated successfully' : 'Product SPOC registered & setup email sent!');
        setShowSpocModal(false);
        fetchSpocs();
        fetchProducts();
      } else {
        showToast(data.message || 'Action failed', 'error');
      }
    } catch (err) {
      showToast('Server/network error executing SPOC action', 'error');
    }
  };

  const handleDeleteSpoc = async (spocId) => {
    if (!window.confirm('Are you sure you want to deactivate and remove this Product SPOC? They will be demoted back to a regular customer user.')) return;

    try {
      const res = await fetch(buildApiUrl(`/api/organizations/my-org/product-spocs/${spocId}`), {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        showToast('Product SPOC deactivated successfully');
        fetchSpocs();
        fetchProducts();
      } else {
        showToast(data.message || 'Deactivation failed', 'error');
      }
    } catch (err) {
      showToast('Network error during SPOC deactivation', 'error');
    }
  };

  // CSV Export Helper
  const handleExportCSV = () => {
    const headers = ['Ticket ID', 'Title', 'Product', 'Status', 'Priority', 'Submitter', 'Created At'];
    const rows = tickets.map(t => [
      t.id,
      `"${(t.issue_title || '').replace(/"/g, '""')}"`,
      t.product || 'Unknown',
      (t.status || '').toUpperCase(),
      (t.priority || 'medium').toUpperCase(),
      t.email,
      formatDateTimeIST(t.created_at)
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `org_tickets_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Ticket filtering
  const filteredTickets = tickets.filter(t => {
    if (!t) return false;
    const matchesSearch = (t.issue_title || '').toLowerCase().includes(ticketSearch.toLowerCase()) ||
      String(t.id).includes(ticketSearch) ||
      (t.description || '').toLowerCase().includes(ticketSearch.toLowerCase()) ||
      (t.email || '').toLowerCase().includes(ticketSearch.toLowerCase());

    const matchesStatus = statusFilter === 'all' ? true : t.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' ? true : t.priority === priorityFilter;
    const matchesProduct = productFilter === 'all' ? true : String(t.product_id) === productFilter;

    return matchesSearch && matchesStatus && matchesPriority && matchesProduct;
  });

  const paginatedTickets = filteredTickets.slice((currentPage - 1) * ticketsPerPage, currentPage * ticketsPerPage);
  const totalPages = Math.ceil(filteredTickets.length / ticketsPerPage);

  return (
    <div className="manager-dashboard manager-dashboard-ref">
      {/* Toast Notification */}
      {toast && (
        <div className={`spoc-toast-popup ${toast.type}`}>
          <div className="spoc-toast-content">
            <div className="spoc-toast-icon">
              {toast.type === 'error' ? '❌' : '✅'}
            </div>
            <div className="spoc-toast-text">
              <h3>{toast.type === 'error' ? 'Action Failed' : 'Success'}</h3>
              <p>{toast.message}</p>
            </div>
            <button className="spoc-toast-close" onClick={() => setToast(null)}>×</button>
          </div>
        </div>
      )}

      {/* Header bar - Styled exactly as ManagerDashboard */}
      <header className="adr-header">
        <div className="adr-header__inner">
          <div className="adr-header__left">
            <div className="adr-header__text">
              <h1 className="adr-header__title">{orgData?.name || 'Organization SPOC Dashboard'}</h1>
              <p className="adr-header__welcome">Welcome, {currentUser?.name || 'SPOC'} 👋</p>
              <p className="adr-header__email">{currentUser?.email || 'No email available'}</p>
            </div>
          </div>

          <div className="adr-header__actions">
            <HeaderNotificationBell />

            <button className="adr-btn adr-btn--ghost" onClick={fetchAllData} title="Refresh Information">
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh
            </button>

            <button className="adr-btn adr-btn--ghost" onClick={handleExportCSV} title="Export CSV Report">
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Report
            </button>

            <button className="adr-btn adr-btn--ghost adr-btn--logout" onClick={onLogout} title="Sign Out">
              <svg className="adr-btn__icon adr-btn__icon--danger" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Shell with left Sidebar and Right main container */}
      <div className="adr-shell">
        {/* Sidebar Redesign matching Manager Dashboard style */}
        <aside className="adr-sidebar">
          <h3 className="adr-sidebar__title">Governance Workspace</h3>

          <button
            className={`adr-nav-row ${activeTab === 'dashboard' ? 'adr-nav-row--active' : ''}`}
            data-tab="overview"
            onClick={() => setActiveTab('dashboard')}
          >
            <span className="adr-nav-icon adr-nav-icon--overview">
              <SpocSidebarIcon name="overview" />
            </span>
            <span className="adr-nav-label">Overview</span>
          </button>

          <button
            className={`adr-nav-row ${activeTab === 'tickets' ? 'adr-nav-row--active' : ''}`}
            onClick={() => setActiveTab('tickets')}
          >
            <span className="adr-nav-icon adr-nav-icon--new">
              <SpocSidebarIcon name="tickets" />
            </span>
            <span className="adr-nav-label">Organization Tickets</span>
            {tickets.length > 0 && <span className="adr-nav-badge">{tickets.length}</span>}
          </button>

          <button
            className={`adr-nav-row ${activeTab === 'products' ? 'adr-nav-row--active' : ''}`}
            onClick={() => setActiveTab('products')}
          >
            <span className="adr-nav-icon adr-nav-icon--in_progress">
              <SpocSidebarIcon name="products" />
            </span>
            <span className="adr-nav-label">Products Scope</span>
            {products.length > 0 && <span className="adr-nav-badge">{products.length}</span>}
          </button>

          <button
            className={`adr-nav-row ${activeTab === 'spocs' ? 'adr-nav-row--active' : ''}`}
            onClick={() => setActiveTab('spocs')}
          >
            <span className="adr-nav-icon adr-nav-icon--team">
              <SpocSidebarIcon name="spocs" />
            </span>
            <span className="adr-nav-label">Product SPOCs</span>
            {spocs.length > 0 && <span className="adr-nav-badge">{spocs.length}</span>}
          </button>

          <button
            className={`adr-nav-row ${activeTab === 'users' ? 'adr-nav-row--active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <span className="adr-nav-icon adr-nav-icon--team">
              <SpocSidebarIcon name="users" />
            </span>
            <span className="adr-nav-label">Organization Users</span>
          </button>

          <button
            className={`adr-nav-row ${activeTab === 'notifications' ? 'adr-nav-row--active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            <span className="adr-nav-icon adr-nav-icon--new">
              <SpocSidebarIcon name="notifications" />
            </span>
            <span className="adr-nav-label">Notifications</span>
            {notifications.filter(n => !n.is_read).length > 0 && (
              <span className="adr-nav-badge">{notifications.filter(n => !n.is_read).length}</span>
            )}
          </button>

          <button
            className={`adr-nav-row ${activeTab === 'reports' ? 'adr-nav-row--active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            <span className="adr-nav-icon adr-nav-icon--analytics">
              <SpocSidebarIcon name="reports" />
            </span>
            <span className="adr-nav-label">Reports & Analytics</span>
          </button>

          <button
            className={`adr-nav-row ${activeTab === 'profile' ? 'adr-nav-row--active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <span className="adr-nav-icon adr-nav-icon--overview">
              <SpocSidebarIcon name="profile" />
            </span>
            <span className="adr-nav-label">Org Profile</span>
          </button>
        </aside>

        {/* Main Display Pane aligned with Manager Dashboard right body */}
        <main className="adr-main">
          {loading ? (
            <div className="adr-loading-screen">
              <div className="adr-loading-spinner"></div>
              <span className="adr-loading-text">Fetching corporate parameters...</span>
            </div>
          ) : error ? (
            <div className="adr-tickets__empty" style={{ background: '#fff', border: '1px solid #fee2e2' }}>
              <h3 style={{ color: '#dc2626' }}>⚠️ Data Loading Exception</h3>
              <p>{error}</p>
              <button className="adr-btn" onClick={fetchAllData}>Retry Connection</button>
            </div>
          ) : (
            <div className="spoc-pane-content">

              {/* TAB 1: OVERVIEW DASHBOARD HOME */}
              {activeTab === 'dashboard' && (
                <div className="spoc-tab-pane">
                  <div className="adr-dashboard__head">
                    <h2 className="adr-dashboard__title">Governance Dashboard</h2>
                    <p className="adr-dashboard__sub">Audit corporate service levels, active product scopes, and mapped Product SPOC accounts.</p>
                  </div>

                  {/* Summary Metric Cards in Manager Style */}
                  <div className="adr-kpi-row">
                    <div className="adr-kpi adr-kpi--purple">
                      <div className="adr-kpi__icon-wrap"><SpocKpiIcon name="total" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{analytics?.summary?.total ?? 0}</span>
                        <span className="adr-kpi__label">Total Tickets</span>
                      </div>
                    </div>

                    <div className="adr-kpi adr-kpi--blue">
                      <div className="adr-kpi__icon-wrap"><SpocKpiIcon name="open" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{analytics?.summary?.open ?? 0}</span>
                        <span className="adr-kpi__label">Open Tickets</span>
                      </div>
                    </div>

                    <div className="adr-kpi adr-kpi--blue">
                      <div className="adr-kpi__icon-wrap"><SpocKpiIcon name="open" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{analytics?.summary?.inProgress ?? 0}</span>
                        <span className="adr-kpi__label">In Progress</span>
                      </div>
                    </div>

                    <div className="adr-kpi adr-kpi--amber">
                      <div className="adr-kpi__icon-wrap"><SpocKpiIcon name="escalated" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{analytics?.summary?.escalated ?? 0}</span>
                        <span className="adr-kpi__label">Escalated Cases</span>
                      </div>
                    </div>
                  </div>

                  <div className="adr-kpi-row" style={{ marginTop: '12px' }}>
                    <div className="adr-kpi adr-kpi--green">
                      <div className="adr-kpi__icon-wrap"><SpocKpiIcon name="closed" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{analytics?.summary?.closed ?? 0}</span>
                        <span className="adr-kpi__label">Closed Tickets</span>
                      </div>
                    </div>

                    <div className="adr-kpi adr-kpi--amber">
                      <div className="adr-kpi__icon-wrap"><SpocKpiIcon name="sla" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num text-red">{analytics?.summary?.slaBreached ?? 0}</span>
                        <span className="adr-kpi__label">SLA Breached</span>
                      </div>
                    </div>

                    <div className="adr-kpi adr-kpi--purple">
                      <div className="adr-kpi__icon-wrap"><SpocKpiIcon name="products" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{analytics?.summary?.productCount ?? 0}</span>
                        <span className="adr-kpi__label">Active Products</span>
                      </div>
                    </div>
                  </div>

                  <div className="adr-kpi-row" style={{ marginTop: '12px' }}>
                    <div className="adr-kpi adr-kpi--purple">
                      <div className="adr-kpi__icon-wrap"><SpocKpiIcon name="spocs" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{analytics?.summary?.totalUsers ?? 0}</span>
                        <span className="adr-kpi__label">Total Org Users</span>
                      </div>
                    </div>

                    <div className="adr-kpi adr-kpi--blue">
                      <div className="adr-kpi__icon-wrap"><SpocKpiIcon name="spocs" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{analytics?.summary?.activeProductSpocs ?? 0}</span>
                        <span className="adr-kpi__label">Product SPOCs</span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Tickets Table (Top 5) */}
                  <div style={{ marginTop: '32px' }}>
                    <h3 className="adr-tickets__title">Recent Mapped Cases</h3>
                    <div className="adr-table-scroll">
                      <table className="adr-ticket-table">
                        <thead>
                          <tr>
                            <th>Ticket ID</th>
                            <th>Issue Title</th>
                            <th>Product</th>
                            <th>Priority</th>
                            <th>Status</th>
                            <th>SLA Target</th>
                            <th>Raised By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tickets.length === 0 ? (
                            <tr>
                              <td colSpan="7" className="adr-ticket-table__empty">No cases recorded under your organization domain.</td>
                            </tr>
                          ) : (
                            tickets.slice(0, 5).map(t => (
                              <tr key={t.id} onClick={() => handleOpenTicket(t)} className="clickable-row">
                                <td><span className="adr-td-ticket__id">#{t.id}</span></td>
                                <td>
                                  <div className="adr-table-issue__title">{t.issue_title}</div>
                                  <div className="adr-table-issue__sub">{t.description ? t.description.substring(0, 75) + '...' : ''}</div>
                                </td>
                                <td><span className="product-pill">{t.product || 'General Scope'}</span></td>
                                <td>
                                  <span className={`priority-indicator ${t.priority || 'medium'}`}>
                                    {(t.priority || 'medium').toUpperCase()}
                                  </span>
                                </td>
                                <td>
                                  <span className={`adr-status-pill adr-status-pill--${t.status}`}>
                                    {t.status}
                                  </span>
                                </td>
                                <td>
                                  <span className={`sla-badge ${t.sla_first_response_met === 0 ? 'breached' : 'met'}`}>
                                    {t.sla_first_response_met === 0 ? '⚠️ Breach' : '✅ Met'}
                                  </span>
                                </td>
                                <td>
                                  <div className="submitter-cell">
                                    <span>{t.name || 'Anonymous'}</span>
                                    <small>{t.email}</small>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Graphs and Charts */}
                  <div className="adr-metric-row" style={{ marginTop: '32px' }}>
                    <div className="adr-metric-card">
                      <div className="adr-metric-card__hd">
                        <div className="adr-metric-card__ico adr-metric-card__ico--fill">📈</div>
                        <span className="adr-metric-card__label">SLA Compliance met</span>
                      </div>
                      <div className="adr-metric-card__value">
                        {analytics?.summary ? Math.round(((analytics.summary.total - analytics.summary.slaBreached) / (analytics.summary.total || 1)) * 100) : 100}%
                      </div>
                      <p className="adr-metric-card__trend adr-metric-card__trend--pos">
                        Corporate response metrics healthy
                      </p>
                    </div>

                    <div className="adr-metric-card">
                      <div className="adr-metric-card__hd">
                        <div className="adr-metric-card__ico adr-metric-card__ico--warn">🔥</div>
                        <span className="adr-metric-card__label">Escalation Backlog</span>
                      </div>
                      <div className="adr-metric-card__value adr-metric-card__value--danger">
                        {analytics?.summary?.escalated ?? 0}
                      </div>
                      <p className="adr-metric-card__foot">Requiring active Product SPOC mapping</p>
                    </div>

                    <div className="adr-metric-card">
                      <div className="adr-metric-card__hd">
                        <div className="adr-metric-card__ico">📦</div>
                        <span className="adr-metric-card__label">Active Products</span>
                      </div>
                      <div className="adr-metric-card__value">
                        {analytics?.summary?.productCount ?? 0}
                      </div>
                      <p className="adr-metric-card__trend">Mapping support contracts</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ORGANIZATION TICKETS */}
              {activeTab === 'tickets' && (
                <div className="spoc-tab-pane">
                  <div className="adr-tickets__head">
                    <div className="adr-tickets__head-row">
                      <h2 className="adr-tickets__title">Organization Tickets Registry</h2>
                      <button className="adr-btn" onClick={handleExportCSV}>Export CSV Report</button>
                    </div>
                    <p className="adr-tickets__sub">Track contract compliance and response rates across all cases raised under your domain.</p>
                  </div>

                  {/* Filter Toolbar matching Manager layout heights and styles */}
                  <div className="adr-tickets__toolbar">
                    <input
                      type="text"
                      placeholder="Search ID, Subject, Submitter..."
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '0.875rem',
                        flex: 1
                      }}
                      value={ticketSearch}
                      onChange={(e) => { setTicketSearch(e.target.value); setCurrentPage(1); }}
                    />

                    <select
                      value={statusFilter}
                      onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                      style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem', color: '#374151' }}
                    >
                      <option value="all">All Statuses</option>
                      <option value="new">New</option>
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                      <option value="escalated">Escalated</option>
                    </select>

                    <select
                      value={priorityFilter}
                      onChange={(e) => { setPriorityFilter(e.target.value); setCurrentPage(1); }}
                      style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem', color: '#374151' }}
                    >
                      <option value="all">All Priorities</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>

                    <select
                      value={productFilter}
                      onChange={(e) => { setProductFilter(e.target.value); setCurrentPage(1); }}
                      style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem', color: '#374151' }}
                    >
                      <option value="all">All Products</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Ticket Grid Table using adr-ticket-table classes */}
                  <div className="adr-table-scroll">
                    <table className="adr-ticket-table">
                      <thead>
                        <tr>
                          <th>Ticket ID</th>
                          <th>Issue Title & Description</th>
                          <th>Product Mapped</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th>SLA Breach</th>
                          <th>Created By</th>
                          <th>Date Raised</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedTickets.length === 0 ? (
                          <tr>
                            <td colSpan="9" className="adr-ticket-table__empty">No tickets match your filters.</td>
                          </tr>
                        ) : (
                          paginatedTickets.map(t => (
                            <tr key={t.id}>
                              <td><span className="adr-td-ticket__id">#{t.id}</span></td>
                              <td>
                                <div className="adr-table-issue__title">{t.issue_title}</div>
                                <div className="adr-table-issue__sub">{t.description ? t.description.substring(0, 80) + '...' : ''}</div>
                              </td>
                              <td><span className="product-pill">{t.product || 'General Scope'}</span></td>
                              <td>
                                <span className={`priority-indicator ${t.priority || 'medium'}`}>
                                  {(t.priority || 'medium').toUpperCase()}
                                </span>
                              </td>
                              <td>
                                <span className={`adr-status-pill adr-status-pill--${t.status}`}>
                                  {t.status}
                                </span>
                              </td>
                              <td>
                                <span className={`sla-badge ${t.sla_first_response_met === 0 ? 'breached' : 'met'}`}>
                                  {t.sla_first_response_met === 0 ? '⚠️ Breach' : '✅ Met'}
                                </span>
                              </td>
                              <td>
                                <div className="submitter-cell">
                                  <span>{t.name || 'Anonymous'}</span>
                                  <small>{t.email}</small>
                                </div>
                              </td>
                              <td><small>{formatDateTimeIST(t.created_at)}</small></td>
                              <td style={{ textAlign: 'right' }}>
                                <button className="adr-table-view-btn" onClick={() => handleOpenTicket(t)}>
                                  View Ticket
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="spoc-pagination">
                      <button className="adr-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}>Prev</button>
                      <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>Page {currentPage} of {totalPages}</span>
                      <button className="adr-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}>Next</button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: PRODUCTS PAGE */}
              {activeTab === 'products' && (
                <div className="spoc-tab-pane">
                  <div className="adr-tickets__head">
                    <h2 className="adr-tickets__title">Contract Mapped Products</h2>
                    <p className="adr-tickets__sub">Configure, browse, and audit support agreements associated with your corporate catalog assets.</p>
                  </div>

                  <div className="adr-tickets__grid" style={{ marginTop: '16px' }}>
                    {products.length === 0 ? (
                      <div className="adr-ticket-table__empty">No contract products mapped.</div>
                    ) : (
                      products.map(p => (
                        <div key={p.id} className="adr-ticket-card">
                          <div className="adr-ticket-card__top">
                            <span className="adr-ticket-card__id">{p.name}</span>
                            <span className="product-pill" style={{ background: '#ede9fe', color: '#7c3aed' }}>{(p.slug || p.name || 'N/A').toUpperCase()}</span>
                          </div>
                          <p className="adr-ticket-card__issue" style={{ fontSize: '0.85rem', color: '#6b7280', margin: '4px 0 12px' }}>
                            {p.description || 'No description updated'}
                          </p>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', padding: '12px 0', margin: '12px 0' }}>
                            <div style={{ textAlign: 'center' }}>
                              <strong style={{ display: 'block', fontSize: '1.1rem', color: '#111827' }}>{p.activeTickets}</strong>
                              <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>Active Cases</span>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <strong style={{ display: 'block', fontSize: '1.1rem', color: '#111827' }}>{p.closedTickets}</strong>
                              <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>Closed</span>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <strong style={{ display: 'block', fontSize: '1.1rem', color: '#dc2626' }}>{p.slaBreaches}</strong>
                              <span style={{ fontSize: '0.7rem', color: '#dc2626' }}>Breached</span>
                            </div>
                          </div>

                          <div style={{ fontSize: '0.8rem', margin: '8px 0 12px' }}>
                            <strong>Assigned Leader SPOC:</strong>
                            {p.assignedSpoc ? (
                              <div style={{ color: '#374151', marginTop: '4px' }}>
                                <strong>{p.assignedSpoc.name}</strong> <span style={{ color: '#9ca3af' }}>({p.assignedSpoc.email})</span>
                              </div>
                            ) : (
                              <div style={{ color: '#d97706', marginTop: '4px' }}>❌ Unassigned SPOC</div>
                            )}
                          </div>

                          <button className="adr-btn" style={{ width: '100%', marginTop: 'auto' }} onClick={() => setActiveTab('spocs')}>
                            Manage Product SPOC
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: PRODUCT SPOCS */}
              {activeTab === 'spocs' && (
                <div className="spoc-tab-pane">
                  <div className="adr-tickets__head">
                    <div className="adr-tickets__head-row">
                      <h2 className="adr-tickets__title">Product SPOC Leaders</h2>
                      <button className="adr-btn" onClick={() => handleOpenSpocForm()}>+ Add Product SPOC</button>
                    </div>
                    <p className="adr-tickets__sub">Provision and delegate specific product lines to individual corporate contact leads.</p>
                  </div>

                  <div className="adr-table-scroll" style={{ marginTop: '16px' }}>
                    <table className="adr-ticket-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Product Scope</th>
                          <th>Email Address</th>
                          <th>Phone</th>
                          <th>Status</th>
                          <th>Date Assigned</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spocs.length === 0 ? (
                          <tr>
                            <td colSpan="7" className="adr-ticket-table__empty">No Product SPOCs mapped yet. Click 'Add Product SPOC' to start.</td>
                          </tr>
                        ) : (
                          spocs.map(s => (
                            <tr key={s.id}>
                              <td><strong>{s.name}</strong></td>
                              <td><span className="product-pill">{s.product_name}</span></td>
                              <td>{s.email}</td>
                              <td>{s.phone || 'N/A'}</td>
                              <td>
                                <span className={`adr-status-pill adr-status-pill--${s.is_active ? 'resolved' : 'closed'}`}>
                                  {s.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td><small>{formatDateTimeIST(s.assigned_date)}</small></td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: '8px' }}>
                                  <button className="adr-btn" onClick={() => handleOpenSpocForm(s)}>Edit</button>
                                  <button className="adr-btn adr-btn--logout" onClick={() => handleDeleteSpoc(s.id)}>Demote</button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 5: USERS */}
              {activeTab === 'users' && (
                <div className="spoc-tab-pane">
                  <div className="adr-tickets__head">
                    <h2 className="adr-tickets__title">Organization Users</h2>
                    <p className="adr-tickets__sub">Browse employees associated with your corporate domain who submit support tickets.</p>
                  </div>

                  <div className="adr-table-scroll" style={{ marginTop: '16px' }}>
                    <table className="adr-ticket-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email Address</th>
                          <th>Phone</th>
                          <th>Tickets Raised</th>
                          <th>Last Activity</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="adr-ticket-table__empty">No users registered under your domain.</td>
                          </tr>
                        ) : (
                          users.map(u => (
                            <tr key={u.id}>
                              <td><strong>{u.name}</strong></td>
                              <td>{u.email}</td>
                              <td>{u.phone || 'N/A'}</td>
                              <td><span className="adr-nav-badge" style={{ background: '#ede9fe', color: '#7c3aed' }}>{u.ticket_count}</span></td>
                              <td><small>{u.last_activity ? formatDateTimeIST(u.last_activity) : 'Never'}</small></td>
                              <td>
                                <span className={`adr-status-pill adr-status-pill--${u.is_active ? 'resolved' : 'closed'}`}>
                                  {u.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 6: NOTIFICATIONS */}
              {activeTab === 'notifications' && (
                <div className="spoc-tab-pane">
                  <div className="adr-tickets__head">
                    <h2 className="adr-tickets__title">Notifications Inbox</h2>
                    <p className="adr-tickets__sub">Review instant ticket updates, critical escalations, and SLA alerts.</p>
                  </div>

                  <div className="notifications-inbox-list" style={{ marginTop: '16px' }}>
                    {notifications.length === 0 ? (
                      <div className="adr-ticket-table__empty">No notifications in your inbox.</div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className={`notification-inbox-item ${n.is_read ? 'read' : 'unread'}`}
                          style={{
                            background: n.is_read ? '#fafafa' : '#eef2ff',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            padding: '16px',
                            marginBottom: '12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: '600', color: n.is_read ? '#4b5563' : '#6366f1', display: 'block', fontSize: '0.9rem' }}>
                              {n.title}
                            </span>
                            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6b7280' }}>{n.body}</p>
                            <span style={{ fontSize: '0.7rem', color: '#9ca3af', display: 'block', marginTop: '6px' }}>
                              {formatDateTimeIST(n.created_at)}
                            </span>
                          </div>
                          {!n.is_read && (
                            <button className="adr-btn" onClick={() => handleMarkNotificationRead(n.id)}>
                              Mark as Read
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 7: REPORTS */}
              {activeTab === 'reports' && (
                <div className="spoc-tab-pane">
                  <div className="adr-tickets__head">
                    <h2 className="adr-tickets__title">Reports & SLA Auditing</h2>
                    <p className="adr-tickets__sub">Configure compliance metrics date range filters and download CSV reports.</p>
                  </div>

                  <div className="reports-controls-box" style={{ marginTop: '16px', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px' }}>
                    <h4 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#111827' }}>Customize Date Parameters</h4>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#4b5563' }}>Start Date</label>
                        <input
                          type="date"
                          value={reportDateRange.start}
                          onChange={(e) => setReportDateRange(prev => ({ ...prev, start: e.target.value }))}
                          style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#4b5563' }}>End Date</label>
                        <input
                          type="date"
                          value={reportDateRange.end}
                          onChange={(e) => setReportDateRange(prev => ({ ...prev, end: e.target.value }))}
                          style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem' }}
                        />
                      </div>
                      <button className="adr-btn" onClick={handleExportCSV}>
                        📥 Download Complete SLA CSV
                      </button>
                    </div>
                  </div>

                  <div className="adr-metric-row" style={{ marginTop: '24px' }}>
                    <div className="adr-metric-card">
                      <div className="adr-metric-card__hd">
                        <div className="adr-metric-card__ico adr-metric-card__ico--fill">📈</div>
                        <span className="adr-metric-card__label">First-Response Rate</span>
                      </div>
                      <div className="adr-metric-card__value">
                        {analytics?.summary ? Math.round(((analytics.summary.total - analytics.summary.slaBreached) / (analytics.summary.total || 1)) * 100) : 100}%
                      </div>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#22c55e' }}>Fully compliant with agreement terms</p>
                    </div>

                    <div className="adr-metric-card">
                      <div className="adr-metric-card__hd">
                        <div className="adr-metric-card__ico adr-metric-card__ico--warn">⏰</div>
                        <span className="adr-metric-card__label">Resolution Backlog</span>
                      </div>
                      <div className="adr-metric-card__value adr-metric-card__value--danger">
                        {analytics?.summary?.pending ?? 0}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#ef4444' }}>Open cases currently in timeline queue</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 8: PROFILE */}
              {activeTab === 'profile' && orgData && (
                <div className="spoc-tab-pane">
                  <div className="adr-tickets__head">
                    <h2 className="adr-tickets__title">Organization Corporate Profile</h2>
                    <p className="adr-tickets__sub">Contract, verification domains, and registered administrative contact coordinates.</p>
                  </div>

                  <div className="profile-details-card" style={{ marginTop: '16px', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' }}>
                        <span style={{ width: '200px', fontWeight: '600', color: '#4b5563' }}>Organization Name</span>
                        <span style={{ color: '#111827' }}><strong>{orgData.name}</strong></span>
                      </div>

                      <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' }}>
                        <span style={{ width: '200px', fontWeight: '600', color: '#4b5563' }}>Domain Mappings</span>
                        <div>
                          {orgData.domain ? (Array.isArray(orgData.domain) ? orgData.domain : (typeof orgData.domain === 'string' ? JSON.parse(orgData.domain) : [])).map((d, idx) => (
                            <span key={idx} className="domain-pill" style={{ background: '#f3e8ff', color: '#a855f7', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', marginRight: '6px' }}>
                              @{d.domain}
                            </span>
                          )) : 'No registered domains'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' }}>
                        <span style={{ width: '200px', fontWeight: '600', color: '#4b5563' }}>Contract Scope</span>
                        <span style={{ color: '#4b5563' }}>{orgData.description || 'Enterprise contract coverage active'}</span>
                      </div>

                      <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' }}>
                        <span style={{ width: '200px', fontWeight: '600', color: '#4b5563' }}>Primary Administrator</span>
                        <div>
                          <strong>{orgData.spoc_name}</strong>
                          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px' }}>
                            {orgData.spoc_email} | {orgData.spoc_phone || 'No phone'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </main>
      </div>

      {/* Ticket Overlay Drawer */}
      {selectedTicket && (
        <div className="spoc-drawer-overlay" onClick={() => setSelectedTicket(null)}>
          <div className="spoc-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <span className="drawer-ticket-id">#{selectedTicket.id}</span>
                <h3>{selectedTicket.issue_title}</h3>
              </div>
              <button className="drawer-close-btn" onClick={() => setSelectedTicket(null)}>×</button>
            </div>

            <div className="drawer-body">
              <div className="drawer-meta-section">
                <div className="meta-item">
                  <span className="meta-label">Status</span>
                  <span className={`adr-status-pill adr-status-pill--${selectedTicket.status}`}>
                    {selectedTicket.status}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Priority</span>
                  <span className={`priority-indicator ${selectedTicket.priority || 'medium'}`}>
                    {(selectedTicket.priority || 'medium').toUpperCase()}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Raised By</span>
                  <span className="meta-val">{selectedTicket.name} ({selectedTicket.email})</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Product Scope</span>
                  <span className="meta-val">{selectedTicket.product || 'Unassigned'}</span>
                </div>
              </div>

              <div className="drawer-description">
                <h4>Original Issue Description</h4>
                <div className="desc-box">
                  {selectedTicket.description || 'No description provided'}
                </div>
              </div>

              {/* Chat timeline */}
              <div className="drawer-timeline">
                <h4>Timeline & Communication Thread</h4>
                <div className="timeline-thread">
                  {chatMessages.length === 0 ? (
                    <div className="timeline-empty">No conversation messages recorded on this ticket thread.</div>
                  ) : (
                    chatMessages.map(msg => (
                      <div key={msg.id} className={`timeline-msg ${msg.sender_type === 'agent' ? 'agent' : 'customer'}`}>
                        <div className="msg-header">
                          <strong>{msg.sender_name || msg.sender_type.toUpperCase()}</strong>
                          <small>{formatDateTimeIST(msg.created_at || msg.timestamp)}</small>
                        </div>
                        <p className="msg-content">{msg.message || msg.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Reply Form */}
              <form className="drawer-reply-form" onSubmit={handleSendReply}>
                <textarea
                  placeholder="Type your response to the support team..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  required
                />
                <button type="submit" className="adr-btn" style={{ background: '#6366f1', color: '#fff', border: 'none' }} disabled={sendingReply}>
                  {sendingReply ? 'Submitting reply...' : 'Submit Response'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Product SPOC CRUD Modal */}
      {showSpocModal && (
        <div className="spoc-modal-overlay">
          <div className="spoc-modal">
            <div className="modal-header">
              <h3>{editingSpoc ? 'Edit Product SPOC Mapping' : 'Map New Product SPOC'}</h3>
              <button className="modal-close" onClick={() => setShowSpocModal(false)}>×</button>
            </div>

            <form onSubmit={handleSaveSpoc}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    placeholder="Enter SPOC's full name"
                    value={spocForm.name}
                    onChange={(e) => setSpocForm(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    placeholder="Enter corporate email address"
                    value={spocForm.email}
                    onChange={(e) => setSpocForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                    disabled={!!editingSpoc}
                  />
                </div>

                <div className="form-group">
                  <label>Phone Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="Enter phone number"
                    value={spocForm.phone}
                    onChange={(e) => setSpocForm(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label>Assigned Software Product Scope</label>
                  <select
                    value={spocForm.productId}
                    onChange={(e) => setSpocForm(prev => ({ ...prev, productId: e.target.value }))}
                    required
                  >
                    <option value="">-- Choose Product Scope --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="adr-btn" onClick={() => setShowSpocModal(false)}>Cancel</button>
                <button type="submit" className="adr-btn" style={{ background: '#6366f1', color: '#fff', marginLeft: '8px', border: 'none' }}>Save Product SPOC</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default OrgSpocDashboard;
