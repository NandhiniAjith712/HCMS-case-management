import React, { useState, useEffect } from 'react';
import { buildApiUrl, getAuthHeaders } from '../../utils/api';
import { formatDateTimeIST } from '../../utils/dateTime';
import HeaderNotificationBell from '../common/HeaderNotificationBell';
import './ManagerDashboard.ref.css';
import './OrgSpocDashboard.css';

const API = (path) => buildApiUrl(`/api/product-spoc${path}`);

/** Sidebar SVG icons — same stroke style as OrgSpocDashboard */
function PsNavIcon({ name }) {
  const c = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  switch (name) {
    case 'overview':  return <svg {...c}><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>;
    case 'tickets':   return <svg {...c}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>;
    case 'analytics': return <svg {...c}><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>;
    case 'users':     return <svg {...c}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case 'sla':       return <svg {...c}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case 'escalations': return <svg {...c}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case 'notifications': return <svg {...c}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
    default: return <svg {...c}><circle cx="12" cy="12" r="10"/></svg>;
  }
}

/** KPI SVG icons — same style as OrgSpocDashboard SpocKpiIcon */
function PsKpiIcon({ name }) {
  const c = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  switch (name) {
    case 'total':    return <svg {...c}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>;
    case 'open':     return <svg {...c} fill="currentColor" stroke="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
    case 'escalated':
    case 'sla':      return <svg {...c}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case 'closed':   return <svg {...c}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
    case 'critical': return <svg {...c}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    case 'new':      return <svg {...c}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M9 12h6M12 9v6"/></svg>;
    default: return <svg {...c}><circle cx="12" cy="12" r="10"/></svg>;
  }
}

const ProductSpocDashboard = ({ currentUser, onLogout }) => {
  const [activeTab, setActiveTab]     = useState('dashboard');
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [toast, setToast]             = useState(null);
  const [profile, setProfile]         = useState(null);
  const [dashData, setDashData]       = useState(null);
  const [analytics, setAnalytics]     = useState(null);
  const [tickets, setTickets]         = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [ticketSearch, setTicketSearch]   = useState('');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ticketsPerPage = 10;

  const showToast = (msg, type = 'success') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchProfile(),
        fetchDashboard(),
        fetchAnalytics(),
        fetchTickets(),
        fetchNotifications()
      ]);
    } catch (e) {
      setError('Failed to load dashboard data. Please verify your connection or contact support.');
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    const res = await fetch(API('/me'), { headers: getAuthHeaders() });
    if (res.ok) { const d = await res.json(); if (d.success) setProfile(d.data); }
  };
  const fetchDashboard = async () => {
    const res = await fetch(API('/dashboard'), { headers: getAuthHeaders() });
    if (res.ok) { const d = await res.json(); if (d.success) setDashData(d.data); }
  };
  const fetchAnalytics = async () => {
    const res = await fetch(API('/analytics?days=30'), { headers: getAuthHeaders() });
    if (res.ok) { const d = await res.json(); if (d.success) setAnalytics(d.data); }
  };
  const fetchTickets = async () => {
    const res = await fetch(API('/tickets?limit=1000'), { headers: getAuthHeaders() });
    if (res.ok) { const d = await res.json(); if (d.success) setTickets(d.data || []); }
  };
  const fetchNotifications = async () => {
    const res = await fetch(API('/notifications'), { headers: getAuthHeaders() });
    if (res.ok) { const d = await res.json(); if (d.success) setNotifications(d.data || []); }
  };

  useEffect(() => { if (currentUser) fetchAll(); }, [currentUser]);

  const kpi = dashData?.kpi || {};
  const maxBarVal = (arr) => Math.max(...(arr || []).map(r => Number(r.count || 0)), 1);

  const filterToken = (t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (ticketSearch.trim()) {
      const s = ticketSearch.toLowerCase();
      if (!(`${t.id} ${t.issue_title} ${t.email} ${t.name}`.toLowerCase().includes(s))) return false;
    }
    return true;
  };
  const filteredTickets  = tickets.filter(filterToken);
  const totalPages       = Math.ceil(filteredTickets.length / ticketsPerPage);
  const paginatedTickets = filteredTickets.slice((currentPage - 1) * ticketsPerPage, currentPage * ticketsPerPage);

  const handleExportCSV = () => {
    const rows = [['ID','Title','Status','Priority','Submitter','Email','Created']];
    tickets.forEach(t => rows.push([t.id, t.issue_title, t.status, t.priority, t.name || '', t.email || '', t.created_at || '']));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `product_tickets_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="manager-dashboard manager-dashboard-ref">

      {/* ── Toast Notification ── */}
      {toast && (
        <div className={`spoc-toast-popup ${toast.type}`}>
          <div className="spoc-toast-content">
            <div className="spoc-toast-icon">{toast.type === 'error' ? '❌' : '✅'}</div>
            <div className="spoc-toast-text">
              <h3>{toast.type === 'error' ? 'Action Failed' : 'Success'}</h3>
              <p>{toast.message}</p>
            </div>
            <button className="spoc-toast-close" onClick={() => setToast(null)}>×</button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="adr-header">
        <div className="adr-header__inner">
          <div className="adr-header__left">
            <div className="adr-header__text">
              <h1 className="adr-header__title">
                {profile?.organization?.name || currentUser?.name || 'Organization'}
              </h1>
              <p className="adr-header__welcome">Welcome, {currentUser?.name || 'Product SPOC'} 👋</p>
              <p className="adr-header__email">{currentUser?.email}</p>
            </div>
          </div>
          <div className="adr-header__actions">
            <HeaderNotificationBell />
            <button className="adr-btn adr-btn--ghost" onClick={fetchAll} title="Refresh">
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              Refresh
            </button>
            <button className="adr-btn adr-btn--ghost" onClick={handleExportCSV} title="Export CSV">
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export Report
            </button>
            <button className="adr-btn adr-btn--ghost adr-btn--logout" onClick={onLogout} title="Sign Out">
              <svg className="adr-btn__icon adr-btn__icon--danger" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* ── Shell: sidebar + main ── */}
      <div className="adr-shell">

        {/* Sidebar */}
        <aside className="adr-sidebar">
          <h3 className="adr-sidebar__title">Product Workspace</h3>

          {[
            { id: 'dashboard',     icon: 'overview',      label: 'Overview' },
            { id: 'tickets',       icon: 'tickets',       label: 'Product Tickets',  badge: tickets.length },
            { id: 'analytics',     icon: 'analytics',     label: 'Reports & Analytics' },
            { id: 'users',         icon: 'users',         label: 'Users' },
            { id: 'sla',           icon: 'sla',           label: 'SLA Breaches',    badge: kpi.sla_breaches || 0 },
            { id: 'escalations',   icon: 'escalations',   label: 'Escalations',     badge: kpi.escalated_count || 0 },
            { id: 'notifications', icon: 'notifications', label: 'Notifications',   badge: notifications.filter(n => !n.is_read).length },
          ].map(item => (
            <button
              key={item.id}
              className={`adr-nav-row${activeTab === item.id ? ' adr-nav-row--active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className={`adr-nav-icon adr-nav-icon--${item.id === 'dashboard' ? 'overview' : item.id}`}>
                <PsNavIcon name={item.icon} />
              </span>
              <span className="adr-nav-label">{item.label}</span>
              {item.badge > 0 && <span className="adr-nav-badge">{item.badge}</span>}
            </button>
          ))}
        </aside>

        {/* Main pane */}
        <main className="adr-main">
          {loading ? (
            <div className="adr-loading-screen">
              <div className="adr-loading-spinner" />
              <span className="adr-loading-text">Loading product workspace…</span>
            </div>
          ) : error ? (
            <div className="adr-tickets__empty" style={{ background: '#fff', border: '1px solid #fee2e2' }}>
              <h3 style={{ color: '#dc2626' }}>⚠️ Data Loading Exception</h3>
              <p>{error}</p>
              <button className="adr-btn" onClick={fetchAll}>Retry Connection</button>
            </div>
          ) : (
            <div className="spoc-pane-content">

              {/* ── TAB: OVERVIEW ── */}
              {activeTab === 'dashboard' && (
                <div className="spoc-tab-pane">
                  <div className="adr-dashboard__head">
                    <h2 className="adr-dashboard__title">
                      {profile?.product?.name || 'Product'} Dashboard
                    </h2>
                    <p className="adr-dashboard__sub">
                      Monitor all support tickets, SLA compliance, and escalations for your assigned product scope.
                    </p>
                  </div>

                  {/* KPI row 1 */}
                  <div className="adr-kpi-row">
                    <div className="adr-kpi adr-kpi--purple">
                      <div className="adr-kpi__icon-wrap"><PsKpiIcon name="total" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{kpi.total ?? 0}</span>
                        <span className="adr-kpi__label">Total Tickets</span>
                      </div>
                    </div>
                    <div className="adr-kpi adr-kpi--blue">
                      <div className="adr-kpi__icon-wrap"><PsKpiIcon name="open" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{kpi.open_count ?? 0}</span>
                        <span className="adr-kpi__label">Open Tickets</span>
                      </div>
                    </div>
                    <div className="adr-kpi adr-kpi--blue">
                      <div className="adr-kpi__icon-wrap"><PsKpiIcon name="new" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{kpi.in_progress_count ?? 0}</span>
                        <span className="adr-kpi__label">In Progress</span>
                      </div>
                    </div>
                    <div className="adr-kpi adr-kpi--amber">
                      <div className="adr-kpi__icon-wrap"><PsKpiIcon name="escalated" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{kpi.escalated_count ?? 0}</span>
                        <span className="adr-kpi__label">Escalated</span>
                      </div>
                    </div>
                  </div>

                  {/* KPI row 2 */}
                  <div className="adr-kpi-row" style={{ marginTop: '12px' }}>
                    <div className="adr-kpi adr-kpi--green">
                      <div className="adr-kpi__icon-wrap"><PsKpiIcon name="closed" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{kpi.closed_count ?? 0}</span>
                        <span className="adr-kpi__label">Closed</span>
                      </div>
                    </div>
                    <div className="adr-kpi adr-kpi--amber">
                      <div className="adr-kpi__icon-wrap"><PsKpiIcon name="sla" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num text-red">{kpi.sla_breaches ?? 0}</span>
                        <span className="adr-kpi__label">SLA Breached</span>
                      </div>
                    </div>
                    <div className="adr-kpi adr-kpi--purple">
                      <div className="adr-kpi__icon-wrap"><PsKpiIcon name="critical" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num text-red">{kpi.critical_open ?? 0}</span>
                        <span className="adr-kpi__label">Critical Open</span>
                      </div>
                    </div>
                    <div className="adr-kpi adr-kpi--green">
                      <div className="adr-kpi__icon-wrap"><PsKpiIcon name="closed" /></div>
                      <div className="adr-kpi__body">
                        <span className="adr-kpi__num">{kpi.resolved_count ?? 0}</span>
                        <span className="adr-kpi__label">Resolved</span>
                      </div>
                    </div>
                  </div>

                  {/* Recent tickets */}
                  <div style={{ marginTop: '32px' }}>
                    <h3 className="adr-tickets__title">Recent Product Tickets</h3>
                    <div className="adr-table-scroll">
                      <table className="adr-ticket-table">
                        <thead>
                          <tr>
                            <th>Ticket ID</th>
                            <th>Issue Title</th>
                            <th>Priority</th>
                            <th>Status</th>
                            <th>SLA</th>
                            <th>Raised By</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(dashData?.recentTickets || []).length === 0 ? (
                            <tr><td colSpan="7" className="adr-ticket-table__empty">No tickets recorded for this product yet.</td></tr>
                          ) : (dashData?.recentTickets || []).map(t => (
                            <tr key={t.id}>
                              <td><span className="adr-td-ticket__id">#{t.id}</span></td>
                              <td>
                                <div className="adr-table-issue__title">{t.issue_title}</div>
                              </td>
                              <td>
                                <span className={`priority-indicator ${t.priority || 'medium'}`}>
                                  {(t.priority || 'medium').toUpperCase()}
                                </span>
                              </td>
                              <td><span className={`adr-status-pill adr-status-pill--${t.status}`}>{t.status}</span></td>
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
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Metric cards */}
                  <div className="adr-metric-row" style={{ marginTop: '32px' }}>
                    <div className="adr-metric-card">
                      <div className="adr-metric-card__hd">
                        <div className="adr-metric-card__ico adr-metric-card__ico--fill">📈</div>
                        <span className="adr-metric-card__label">SLA Compliance</span>
                      </div>
                      <div className="adr-metric-card__value">
                        {kpi.total ? Math.round(((kpi.total - (kpi.sla_breaches || 0)) / kpi.total) * 100) : 100}%
                      </div>
                      <p className="adr-metric-card__trend adr-metric-card__trend--pos">Response metrics for {profile?.product?.name || 'product'}</p>
                    </div>
                    <div className="adr-metric-card">
                      <div className="adr-metric-card__hd">
                        <div className="adr-metric-card__ico adr-metric-card__ico--warn">🔥</div>
                        <span className="adr-metric-card__label">Escalation Backlog</span>
                      </div>
                      <div className="adr-metric-card__value adr-metric-card__value--danger">{kpi.escalated_count ?? 0}</div>
                      <p className="adr-metric-card__foot">Requiring active review</p>
                    </div>
                    <div className="adr-metric-card">
                      <div className="adr-metric-card__hd">
                        <div className="adr-metric-card__ico">📦</div>
                        <span className="adr-metric-card__label">Product Scope</span>
                      </div>
                      <div className="adr-metric-card__value">{profile?.product?.name || '—'}</div>
                      <p className="adr-metric-card__trend">{profile?.organization?.name || ''}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB: TICKETS ── */}
              {activeTab === 'tickets' && (
                <div className="spoc-tab-pane">
                  <div className="adr-tickets__head">
                    <div className="adr-tickets__head-row">
                      <h2 className="adr-tickets__title">Product Tickets Registry</h2>
                      <button className="adr-btn" onClick={handleExportCSV}>Export CSV Report</button>
                    </div>
                    <p className="adr-tickets__sub">All support tickets scoped to {profile?.product?.name || 'your product'} from {profile?.organization?.name || 'your organization'}.</p>
                  </div>

                  <div className="adr-tickets__toolbar">
                    <input
                      type="text"
                      placeholder="Search ID, Title, Submitter…"
                      style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem', flex: 1 }}
                      value={ticketSearch}
                      onChange={e => { setTicketSearch(e.target.value); setCurrentPage(1); }}
                    />
                    <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                      style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem', color: '#374151' }}>
                      <option value="all">All Statuses</option>
                      <option value="new">New</option>
                      <option value="in_progress">In Progress</option>
                      <option value="escalated">Escalated</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <select value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setCurrentPage(1); }}
                      style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem', color: '#374151' }}>
                      <option value="all">All Priorities</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  <div className="adr-table-scroll">
                    <table className="adr-ticket-table">
                      <thead>
                        <tr>
                          <th>Ticket ID</th>
                          <th>Issue Title</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th>SLA</th>
                          <th>Escalated</th>
                          <th>Raised By</th>
                          <th>Date Raised</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedTickets.length === 0 ? (
                          <tr><td colSpan="8" className="adr-ticket-table__empty">No tickets match your filters.</td></tr>
                        ) : paginatedTickets.map(t => (
                          <tr key={t.id}>
                            <td><span className="adr-td-ticket__id">#{t.id}</span></td>
                            <td>
                              <div className="adr-table-issue__title">{t.issue_title}</div>
                              <div className="adr-table-issue__sub">{t.description ? t.description.substring(0, 80) + '…' : ''}</div>
                            </td>
                            <td><span className={`priority-indicator ${t.priority || 'medium'}`}>{(t.priority || 'medium').toUpperCase()}</span></td>
                            <td><span className={`adr-status-pill adr-status-pill--${t.status}`}>{t.status}</span></td>
                            <td><span className={`sla-badge ${t.sla_first_response_met === 0 ? 'breached' : 'met'}`}>{t.sla_first_response_met === 0 ? '⚠️ Breach' : '✅ Met'}</span></td>
                            <td>
                              {t.is_escalated
                                ? <span className="sla-badge breached">🚨 L{t.escalation_level}</span>
                                : <span style={{ color: '#9ca3af' }}>—</span>}
                            </td>
                            <td>
                              <div className="submitter-cell">
                                <span>{t.name || 'Anonymous'}</span>
                                <small>{t.email}</small>
                              </div>
                            </td>
                            <td><small>{formatDateTimeIST(t.created_at)}</small></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="spoc-pagination">
                      <button className="adr-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Prev</button>
                      <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>Page {currentPage} of {totalPages}</span>
                      <button className="adr-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Next</button>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: ANALYTICS ── */}
              {activeTab === 'analytics' && (
                <div className="spoc-tab-pane">
                  <div className="adr-tickets__head">
                    <h2 className="adr-tickets__title">Reports & SLA Auditing</h2>
                    <p className="adr-tickets__sub">Product-scoped compliance metrics, ticket volume trends, and priority distribution.</p>
                  </div>

                  {analytics?.avgResolutionHours != null && (
                    <div className="spoc-banner-gradient" style={{ marginTop: '16px', display: 'flex', gap: '32px', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Resolution Time</div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: '#6366f1' }}>{analytics.avgResolutionHours}h</div>
                      </div>
                    </div>
                  )}

                  <div className="spoc-grid-charts" style={{ marginTop: '24px' }}>
                    <div className="spoc-chart-box">
                      <h4>Status Breakdown</h4>
                      {(analytics?.statusBreakdown || []).length === 0
                        ? <p className="chart-empty">No data available</p>
                        : (
                          <div className="spoc-bar-chart">
                            {analytics.statusBreakdown.map(r => (
                              <div className="bar-row" key={r.status}>
                                <span className="bar-label">{(r.status || '').replace('_', ' ')}</span>
                                <div className="bar-wrapper">
                                  <div className="bar-progress" style={{
                                    width: `${Math.round((Number(r.count) / maxBarVal(analytics.statusBreakdown)) * 100)}%`,
                                    background: r.status === 'escalated' ? '#dc2626' : r.status === 'closed' ? '#059669' : r.status === 'resolved' ? '#10b981' : '#6366f1'
                                  }} />
                                </div>
                                <span className="bar-value">{r.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>

                    <div className="spoc-chart-box">
                      <h4>Priority Breakdown</h4>
                      {(analytics?.priorityBreakdown || []).length === 0
                        ? <p className="chart-empty">No data available</p>
                        : (
                          <div className="spoc-bar-chart">
                            {analytics.priorityBreakdown.map(r => (
                              <div className="bar-row" key={r.priority}>
                                <span className="bar-label">{r.priority}</span>
                                <div className="bar-wrapper">
                                  <div className="bar-progress" style={{
                                    width: `${Math.round((Number(r.count) / maxBarVal(analytics.priorityBreakdown)) * 100)}%`,
                                    background: r.priority === 'critical' ? '#dc2626' : r.priority === 'high' ? '#ea580c' : r.priority === 'medium' ? '#d97706' : '#059669'
                                  }} />
                                </div>
                                <span className="bar-value">{r.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>

                  {(analytics?.dailyVolume || []).length > 0 && (
                    <div className="spoc-chart-box" style={{ marginTop: '24px' }}>
                      <h4>Daily Ticket Volume — Last 30 Days</h4>
                      <div className="adr-table-scroll">
                        <table className="adr-ticket-table">
                          <thead><tr><th>Date</th><th>Tickets</th><th style={{ width: '50%' }}>Volume</th></tr></thead>
                          <tbody>
                            {analytics.dailyVolume.map(r => (
                              <tr key={r.day}>
                                <td><small>{r.day}</small></td>
                                <td style={{ fontWeight: 700, color: '#6366f1' }}>{r.count}</td>
                                <td>
                                  <div className="bar-wrapper">
                                    <div className="bar-progress" style={{ width: `${Math.round((Number(r.count) / maxBarVal(analytics.dailyVolume)) * 100)}%`, background: '#6366f1' }} />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: USERS ── */}
              {activeTab === 'users' && (
                <div className="spoc-tab-pane">
                  <div className="adr-tickets__head">
                    <h2 className="adr-tickets__title">Users Raising Tickets</h2>
                    <p className="adr-tickets__sub">All users who have submitted support tickets under {profile?.product?.name || 'this product'}.</p>
                  </div>
                  <div className="adr-table-scroll" style={{ marginTop: '16px' }}>
                    <table className="adr-ticket-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email Address</th>
                          <th>Tickets Raised</th>
                          <th>Last Ticket</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dashData?.users || []).length === 0 ? (
                          <tr><td colSpan="4" className="adr-ticket-table__empty">No users have raised tickets for this product yet.</td></tr>
                        ) : (dashData?.users || []).map((u, idx) => (
                          <tr key={idx}>
                            <td><strong>{u.name || '—'}</strong></td>
                            <td>{u.email}</td>
                            <td><span className="adr-nav-badge" style={{ background: '#ede9fe', color: '#7c3aed' }}>{u.ticket_count}</span></td>
                            <td><small>{u.last_ticket_at ? formatDateTimeIST(u.last_ticket_at) : 'Never'}</small></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── TAB: SLA ── */}
              {activeTab === 'sla' && (
                <div className="spoc-tab-pane">
                  <div className="adr-tickets__head">
                    <h2 className="adr-tickets__title">SLA Breach Tracking</h2>
                    <p className="adr-tickets__sub">Open tickets that have breached their first-response SLA target for {profile?.product?.name || 'this product'}.</p>
                  </div>
                  <div className="adr-table-scroll" style={{ marginTop: '16px' }}>
                    <table className="adr-ticket-table">
                      <thead>
                        <tr>
                          <th>Ticket ID</th>
                          <th>Issue Title</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th>Raised By</th>
                          <th>Date Raised</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dashData?.slaBreaches || []).length === 0 ? (
                          <tr><td colSpan="6" className="adr-ticket-table__empty">✅ No active SLA breaches — all tickets are within SLA target.</td></tr>
                        ) : (dashData?.slaBreaches || []).map(t => (
                          <tr key={t.id}>
                            <td><span className="adr-td-ticket__id">#{t.id}</span></td>
                            <td><div className="adr-table-issue__title">{t.issue_title}</div></td>
                            <td><span className={`priority-indicator ${t.priority || 'medium'}`}>{(t.priority || 'medium').toUpperCase()}</span></td>
                            <td><span className={`adr-status-pill adr-status-pill--${t.status}`}>{t.status}</span></td>
                            <td>
                              <div className="submitter-cell">
                                <span>{t.name || 'Anonymous'}</span>
                                <small>{t.email}</small>
                              </div>
                            </td>
                            <td><small>{formatDateTimeIST(t.created_at)}</small></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── TAB: ESCALATIONS ── */}
              {activeTab === 'escalations' && (
                <div className="spoc-tab-pane">
                  <div className="adr-tickets__head">
                    <h2 className="adr-tickets__title">Escalated Tickets</h2>
                    <p className="adr-tickets__sub">Active escalations under {profile?.product?.name || 'this product'} requiring immediate review.</p>
                  </div>
                  <div className="adr-table-scroll" style={{ marginTop: '16px' }}>
                    <table className="adr-ticket-table">
                      <thead>
                        <tr>
                          <th>Ticket ID</th>
                          <th>Issue Title</th>
                          <th>Priority</th>
                          <th>Escalation Level</th>
                          <th>Raised By</th>
                          <th>Date Raised</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dashData?.escalatedTickets || []).length === 0 ? (
                          <tr><td colSpan="6" className="adr-ticket-table__empty">✅ No escalated tickets for this product.</td></tr>
                        ) : (dashData?.escalatedTickets || []).map(t => (
                          <tr key={t.id}>
                            <td><span className="adr-td-ticket__id">#{t.id}</span></td>
                            <td><div className="adr-table-issue__title">{t.issue_title}</div></td>
                            <td><span className={`priority-indicator ${t.priority || 'medium'}`}>{(t.priority || 'medium').toUpperCase()}</span></td>
                            <td><span className="sla-badge breached">Level {t.escalation_level}</span></td>
                            <td>
                              <div className="submitter-cell">
                                <span>{t.name || 'Anonymous'}</span>
                                <small>{t.email}</small>
                              </div>
                            </td>
                            <td><small>{formatDateTimeIST(t.created_at)}</small></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── TAB: NOTIFICATIONS ── */}
              {activeTab === 'notifications' && (
                <div className="spoc-tab-pane">
                  <div className="adr-tickets__head">
                    <h2 className="adr-tickets__title">Notifications Inbox</h2>
                    <p className="adr-tickets__sub">Real-time updates, SLA alerts, and escalation notifications for {profile?.product?.name || 'your product'}.</p>
                  </div>
                  <div className="notifications-inbox-list" style={{ marginTop: '16px' }}>
                    {notifications.length === 0 ? (
                      <div className="adr-ticket-table__empty">No notifications in your inbox.</div>
                    ) : notifications.map(n => (
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
                          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6b7280' }}>{n.description}</p>
                          <span style={{ fontSize: '0.7rem', color: '#9ca3af', display: 'block', marginTop: '6px' }}>
                            {formatDateTimeIST(n.created_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ProductSpocDashboard;
