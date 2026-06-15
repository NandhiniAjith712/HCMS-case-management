import React, { useState, useEffect } from 'react';
import { formatDateIST } from '../../utils/dateTime';
import HeaderNotificationBell from '../common/HeaderNotificationBell';
import './BusinessDashboard.ref.css';

/* ── SVG icon helpers ── */
const Ico = ({ name }) => {
  const s = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'building': return <svg {...s}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
    case 'check': return <svg {...s}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
    case 'users': return <svg {...s}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case 'ticket': return <svg {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
    case 'alert': return <svg {...s}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case 'trend': return <svg {...s}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
    case 'clock': return <svg {...s}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case 'shield': return <svg {...s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case 'zap': return <svg {...s}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case 'plus': return <svg {...s}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case 'org': return <svg {...s}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
    case 'chart': return <svg {...s}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
    case 'pie': return <svg {...s}><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>;
    case 'bell': return <svg {...s}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
    case 'search': return <svg {...s}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
    case 'activity': return <svg {...s}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case 'server': return <svg {...s}><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>;
    case 'file': return <svg {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
    case 'download': return <svg {...s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
    case 'settings': return <svg {...s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.67 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.67 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.67a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.67 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    default: return <svg {...s}><circle cx="12" cy="12" r="10"/></svg>;
  }
};

const BusinessDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // ── Tenant management state ──
  const [tenants, setTenants] = useState([]);
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [newTenant, setNewTenant] = useState({
    name: '',
    subdomain: '',
    plan: 'free',
    max_users: 10,
    max_tickets_per_month: 100,
    whatsapp_enabled: false,
    email_enabled: true,
    org_spoc_name: '',
    org_spoc_email: '',
    org_spoc_phone: ''
  });

  // ── Platform monitoring state ──
  const [platformStats, setPlatformStats] = useState({
    total_tenants: 0,
    active_tenants: 0,
    total_users: 0,
    total_tickets: 0
  });
  const [monitoringData, setMonitoringData] = useState({
    tenant_health: [],
    sla_alerts: []
  });

  // ── Notifications ──
  const [successMessage, setSuccessMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);

  const API_BASE = process.env.REACT_APP_API_URL || '/api';

  const showSuccessNotification = (message) => {
    setSuccessMessage(message);
    setShowSuccess(true);
    setTimeout(() => { setShowSuccess(false); setSuccessMessage(''); }, 3000);
  };

  const showErrorNotification = (message) => {
    setErrorMessage(message);
    setShowError(true);
    setTimeout(() => { setShowError(false); setErrorMessage(''); }, 4000);
  };

  const handleLogout = () => {
    ['businessDashboardToken','businessDashboardData','businessDashboardAuth','businessDashboardAuthTime',
     'userData','userToken','tickUser','token','autoLoginContext','agentData','agentToken','access_token',
     'user_id','user_name','user_email','user_role','is_logged_in','session_expires','login_timestamp',
     'remembered_login_id','remembered_password'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/businessdashboard';
  };

  const getBusinessDashboardHeaders = () => {
    const token = localStorage.getItem('businessDashboardToken');
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  };

  const fetchTenants = async () => {
    try {
      const response = await fetch(`${API_BASE}/tenants`, { method: 'GET', headers: getBusinessDashboardHeaders() });
      const data = await response.json();
      if (data.success) { setTenants(data.data); }
    } catch (err) { console.error('Error fetching tenants:', err); showErrorNotification('Failed to fetch tenants'); }
    setLoading(false);
  };

  const fetchPlatformStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/tenants/platform-stats`, { method: 'GET', headers: getBusinessDashboardHeaders() });
      const data = await response.json();
      if (data.success) setPlatformStats(data.data);
    } catch (err) { console.error('Error fetching platform stats:', err); }
  };

  const fetchMonitoringData = async () => {
    try {
      const response = await fetch(`${API_BASE}/tenants/monitoring`, { method: 'GET', headers: getBusinessDashboardHeaders() });
      const data = await response.json();
      console.log('Monitoring data response:', data);
      if (data.success) {
        console.log('Setting monitoring data:', data.data);
        setMonitoringData(data.data);
      } else {
        console.error('Monitoring API returned error:', data.message);
      }
    } catch (err) { console.error('Error fetching monitoring data:', err); }
  };

  const handleAddTenant = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/tenants`, { method: 'POST', headers: getBusinessDashboardHeaders(), body: JSON.stringify(newTenant) });
      const data = await response.json();
      if (data.success) {
        setNewTenant({ name:'', subdomain:'', plan:'free', max_users:10, max_tickets_per_month:100, whatsapp_enabled:false, email_enabled:true, org_spoc_name:'', org_spoc_email:'', org_spoc_phone:'' });
        setShowAddTenant(false);
        fetchTenants();
        showSuccessNotification('Tenant created successfully!');
      } else { showErrorNotification(data.message || 'Failed to create tenant'); }
    } catch (err) { console.error('Error creating tenant:', err); showErrorNotification('Failed to create tenant'); }
  };

  useEffect(() => { fetchTenants(); fetchPlatformStats(); fetchMonitoringData(); }, []);

  // ── Tab configuration ──
  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'activity' },
    { key: 'tenants', label: 'Tenants', icon: 'building', badge: tenants.length },
    { key: 'monitoring', label: 'Monitoring', icon: 'shield' },
  ];

  // ── Quick Actions (navigation only, no data) ──
  const handleExportReports = () => {
    // Export tenant data as CSV
    if (tenants.length === 0) {
      showErrorNotification('No tenant data to export');
      return;
    }

    const headers = ['ID', 'Name', 'Subdomain', 'Plan', 'Status', 'Max Users', 'Max Tickets/Month', 'Created At'];
    const csvContent = [
      headers.join(','),
      ...tenants.map(t => [
        t.id,
        t.name,
        t.subdomain,
        t.plan,
        t.status,
        t.max_users,
        t.max_tickets_per_month,
        t.created_at
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `tenant_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccessNotification('Tenant report exported successfully');
  };

  const quickActions = [
    { label: 'Add Tenant', icon: 'plus', action: () => { setActiveTab('tenants'); setShowAddTenant(true); } },
    { label: 'Export Reports', icon: 'download', action: handleExportReports },
    { label: 'Platform Analytics', icon: 'chart', action: () => setActiveTab('analytics') },
  ];

  const planBadgeClass = (plan) => {
    switch (plan) {
      case 'enterprise': return 'bd-status-pill bd-status-pill--enterprise';
      case 'premium': return 'bd-status-pill bd-status-pill--premium';
      case 'basic': return 'bd-status-pill bd-status-pill--basic';
      default: return 'bd-status-pill bd-status-pill--free';
    }
  };

  if (loading) {
    return (
      <div className="business-dashboard-ref">
        <div className="bd-loading-screen">
          <div className="bd-loading-spinner" aria-hidden />
          <p className="bd-loading-text">Loading platform dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="business-dashboard-ref">
      {/* ── Header ── */}
      <header className="adr-header">
        <div className="adr-header__inner">
          <div className="adr-header__left">
            <div className="adr-header__text">
              <h1 className="adr-header__title">Platform Dashboard</h1>
              <p className="adr-header__welcome">Manage tenants and monitor platform performance</p>
            </div>
          </div>
          <div className="adr-header__actions">
            <HeaderNotificationBell />
            <button type="button" className="adr-btn adr-btn--ghost adr-btn--logout" onClick={handleLogout}>
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ── Tabs ── */}
      <nav className="bd-tabs" aria-label="Platform dashboard sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`bd-tab ${activeTab === tab.key ? 'bd-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <Ico name={tab.icon} />
            {tab.label}
            {typeof tab.badge === 'number' && <span className="bd-tab__badge">{tab.badge}</span>}
          </button>
        ))}
      </nav>

      <main className="bd-main">
        {error ? <div className="error-message">{error}</div> : null}

        {showSuccess && (
          <div className="adr-notification adr-notification--success">{successMessage}</div>
        )}
        {showError && (
          <div className="adr-notification adr-notification--error">{errorMessage}</div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            OVERVIEW TAB
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <>
            {/* KPI Row 1 */}
            <div className="adr-kpi-row">
              <div className="adr-kpi adr-kpi--purple">
                <div className="adr-kpi__icon-wrap"><Ico name="building" /></div>
                <div className="adr-kpi__body">
                  <div className="adr-kpi__num">{platformStats.total_tenants}</div>
                  <div className="adr-kpi__label">Total Tenants</div>
                </div>
              </div>
              <div className="adr-kpi adr-kpi--green">
                <div className="adr-kpi__icon-wrap"><Ico name="check" /></div>
                <div className="adr-kpi__body">
                  <div className="adr-kpi__num">{platformStats.active_tenants}</div>
                  <div className="adr-kpi__label">Active Tenants</div>
                </div>
              </div>
              <div className="adr-kpi adr-kpi--blue">
                <div className="adr-kpi__icon-wrap"><Ico name="users" /></div>
                <div className="adr-kpi__body">
                  <div className="adr-kpi__num">{platformStats.total_users}</div>
                  <div className="adr-kpi__label">Total Users</div>
                </div>
              </div>
              <div className="adr-kpi adr-kpi--amber">
                <div className="adr-kpi__icon-wrap"><Ico name="ticket" /></div>
                <div className="adr-kpi__body">
                  <div className="adr-kpi__num">{platformStats.total_tickets}</div>
                  <div className="adr-kpi__label">Total Tickets</div>
                </div>
              </div>
            </div>


            {/* Two column layout: Quick Actions + Alerts */}
            <div className="bd-two-col">
              {/* Quick Actions */}
              <div className="bd-card">
                <div className="bd-card__header">
                  <h3>Quick Actions</h3>
                </div>
                <div className="bd-quick-actions">
                  {quickActions.map((qa) => (
                    <button key={qa.label} type="button" className="bd-quick-action" onClick={qa.action}>
                      <span className="bd-quick-action__icon"><Ico name={qa.icon} /></span>
                      <span className="bd-quick-action__label">{qa.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Platform Alerts */}
              <div className="bd-card">
                <div className="bd-card__header">
                  <h3><Ico name="bell" /> Platform Alerts</h3>
                </div>
                <div className="bd-empty">No platform alerts at this time.</div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bd-card" style={{ marginTop: 16 }}>
              <div className="bd-card__header">
                <h3><Ico name="clock" /> Recent Platform Activity</h3>
              </div>
              <div className="bd-empty">No recent activity recorded.</div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════
            TENANTS TAB
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'tenants' && (
          <>
            <div className="product-management-header">
              <h2 className="product-management-title">Tenant Management</h2>
              <button type="button" className="adr-btn adr-btn--primary" onClick={() => setShowAddTenant(true)}>
                <Ico name="plus" /> Add Tenant
              </button>
            </div>

            {showAddTenant && (
              <div className="bd-form-panel">
                <h3>Add New Tenant</h3>
                <form onSubmit={handleAddTenant}>
                  <div className="bd-form-row">
                    <div className="bd-form-group">
                      <label>Tenant Name</label>
                      <input type="text" value={newTenant.name} onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })} required />
                    </div>
                    <div className="bd-form-group">
                      <label>Subdomain</label>
                      <input type="text" value={newTenant.subdomain} onChange={(e) => setNewTenant({ ...newTenant, subdomain: e.target.value.toLowerCase() })} placeholder="e.g., company-name" required />
                    </div>
                  </div>
                  <div className="bd-form-row">
                    <div className="bd-form-group">
                      <label>Plan</label>
                      <select value={newTenant.plan} onChange={(e) => setNewTenant({ ...newTenant, plan: e.target.value })}>
                        <option value="free">Free</option>
                        <option value="basic">Basic</option>
                        <option value="premium">Premium</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                    </div>
                    <div className="bd-form-group">
                      <label>Max Users</label>
                      <input type="number" value={newTenant.max_users} onChange={(e) => setNewTenant({ ...newTenant, max_users: parseInt(e.target.value) })} min="1" />
                    </div>
                  </div>
                  <div className="bd-form-row">
                    <div className="bd-form-group">
                      <label>Max Tickets / Month</label>
                      <input type="number" value={newTenant.max_tickets_per_month} onChange={(e) => setNewTenant({ ...newTenant, max_tickets_per_month: parseInt(e.target.value) })} min="1" />
                    </div>
                    <div className="bd-form-group">
                      <label>org_spoc Name</label>
                      <input type="text" value={newTenant.org_spoc_name} onChange={(e) => setNewTenant({ ...newTenant, org_spoc_name: e.target.value })} required />
                    </div>
                  </div>
                  <div className="bd-form-row">
                    <div className="bd-form-group">
                      <label>org_spoc Email</label>
                      <input type="email" value={newTenant.org_spoc_email} onChange={(e) => setNewTenant({ ...newTenant, org_spoc_email: e.target.value })} required />
                    </div>
                    <div className="bd-form-group">
                      <label>org_spoc Phone</label>
                      <input type="tel" value={newTenant.org_spoc_phone} onChange={(e) => setNewTenant({ ...newTenant, org_spoc_phone: e.target.value })} />
                    </div>
                  </div>
                  <div className="bd-form-actions">
                    <button type="submit" className="adr-btn adr-btn--primary">Create Tenant</button>
                    <button type="button" className="adr-btn adr-btn--ghost" onClick={() => setShowAddTenant(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            <div className="bd-data-table-wrap">
              <table className="bd-data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Subdomain</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Max Users</th>
                    <th>Max Tickets/Month</th>
                    <th>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id}>
                      <td>{t.id}</td>
                      <td><strong>{t.name}</strong></td>
                      <td>{t.subdomain}</td>
                      <td><span className={planBadgeClass(t.plan)}>{t.plan}</span></td>
                      <td><span className={`bd-status-pill ${t.status === 'active' ? 'bd-status-pill--ok' : 'bd-status-pill--inactive'}`}>{t.status}</span></td>
                      <td>{t.max_users}</td>
                      <td>{t.max_tickets_per_month}</td>
                      <td className="bd-muted">{formatDateIST(t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tenants.length === 0 && <div className="bd-empty">No tenants configured. <button className="bd-link" onClick={() => setShowAddTenant(true)}>Add your first tenant</button>.</div>}
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════
            MONITORING TAB
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'monitoring' && (
          <>
            <div className="product-management-header">
              <h2 className="product-management-title">Platform Monitoring</h2>
            </div>

            {/* KPIs */}
            <div className="adr-kpi-row">
              <div className="adr-kpi adr-kpi--purple">
                <div className="adr-kpi__icon-wrap"><Ico name="building" /></div>
                <div className="adr-kpi__body">
                  <div className="adr-kpi__num">{platformStats.total_tenants}</div>
                  <div className="adr-kpi__label">Total Tenants</div>
                </div>
              </div>
              <div className="adr-kpi adr-kpi--green">
                <div className="adr-kpi__icon-wrap"><Ico name="check" /></div>
                <div className="adr-kpi__body">
                  <div className="adr-kpi__num">{platformStats.active_tenants}</div>
                  <div className="adr-kpi__label">Active Tenants</div>
                </div>
              </div>
              <div className="adr-kpi adr-kpi--blue">
                <div className="adr-kpi__icon-wrap"><Ico name="users" /></div>
                <div className="adr-kpi__body">
                  <div className="adr-kpi__num">{platformStats.total_users}</div>
                  <div className="adr-kpi__label">Total Users</div>
                </div>
              </div>
              <div className="adr-kpi adr-kpi--amber">
                <div className="adr-kpi__icon-wrap"><Ico name="ticket" /></div>
                <div className="adr-kpi__body">
                  <div className="adr-kpi__num">{platformStats.total_tickets}</div>
                  <div className="adr-kpi__label">Total Tickets</div>
                </div>
              </div>
            </div>

            {/* Two column: Tenant Health + SLA */}
            <div className="bd-two-col">
              <div className="bd-card">
                <div className="bd-card__header"><h3><Ico name="shield" /> Tenant Health</h3></div>
                <div className="bd-data-table-wrap" style={{ border: 'none', boxShadow: 'none', marginBottom: 0 }}>
                  <table className="bd-data-table">
                    <thead>
                      <tr><th>Tenant</th><th>SLA %</th><th>User Load</th><th>Ticket Load</th></tr>
                    </thead>
                    <tbody>
                      {monitoringData.tenant_health.slice(0, 5).map((t) => (
                        <tr key={t.id}>
                          <td><strong>{t.name}</strong></td>
                          <td>
                            <span className={`bd-sla-pill ${t.sla_compliance < 90 ? 'bd-sla-pill--warn' : 'bd-sla-pill--ok'}`}>
                              {t.sla_compliance}%
                            </span>
                          </td>
                          <td>
                            <div className="bd-usage-bar">
                              <div className="bd-usage-bar__track"><div className={`bd-usage-bar__fill ${t.user_usage_pct > 85 ? 'bd-usage-bar__fill--warn' : ''}`} style={{ width: `${Math.min(t.user_usage_pct, 100)}%` }} /></div>
                              <span className="bd-usage-bar__text">{t.user_usage_pct}%</span>
                            </div>
                          </td>
                          <td>
                            <div className="bd-usage-bar">
                              <div className="bd-usage-bar__track"><div className={`bd-usage-bar__fill ${t.ticket_usage_pct > 85 ? 'bd-usage-bar__fill--warn' : ''}`} style={{ width: `${Math.min(t.ticket_usage_pct, 100)}%` }} /></div>
                              <span className="bd-usage-bar__text">{t.ticket_usage_pct}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {monitoringData.tenant_health.length === 0 && <div className="bd-empty">No tenant health data available.</div>}
                </div>
              </div>

              <div className="bd-card">
                <div className="bd-card__header"><h3><Ico name="alert" /> SLA & Escalation Alerts</h3></div>
                <div className="bd-alert-list">
                  {monitoringData.sla_alerts.length > 0 ? (
                    monitoringData.sla_alerts.map((alert) => (
                      <div key={alert.id} className={`bd-alert-item bd-alert-item--${alert.severity}`}>
                        <div className="bd-alert-item__dot" />
                        <div className="bd-alert-item__body">
                          <p className="bd-alert-item__msg">{alert.message}</p>
                          <span className="bd-alert-item__time">{alert.time}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="bd-empty">No SLA or escalation alerts at this time.</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
};

export default BusinessDashboard;
