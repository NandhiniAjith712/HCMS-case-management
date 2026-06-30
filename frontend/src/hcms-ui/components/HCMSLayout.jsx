import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import HcmsAssistant from './assistant/HcmsAssistant';
import {
  LayoutDashboard,
  Ticket,
  Users,
  Bell,
  Settings,
  Search,
  Plus,
  LogOut,
  ChevronRight,
  Inbox,
  AlertTriangle,
  UserCheck,
  FileSearch,
  CheckSquare,
  UserCog,
  Building2,
  Shield,
  ShieldCheck,
  GitBranch,
  Activity,
  SlidersHorizontal
} from 'lucide-react';

function HCMSLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [counts, setCounts] = useState({ tickets: 0, assigned: 0, escalations: 0, notifications: 0, investigations: 0, returned: 0 });

  const fetchCounts = async () => {
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const res = await fetch('/api/dashboard/counts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCounts(data.counts);
        }
      }
    } catch (err) {
      console.error('Failed to fetch counts:', err);
    }
  };

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/hcms/login');
  };

  const roleLabel = {
    employee: 'Employee',
    hr_executive: 'HR Executive',
    department_head: 'Department Head',
    system_admin: 'System Admin',
    hr_manager: 'HR Manager',
    ceo: 'CEO'
  }[user?.role] || 'User';

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const getPageTitle = () => {
    return 'HR Ticketing';
  };

  const getPageSubtitle = () => {
    const role = user?.role;
    if (role === 'employee') return user?.name || 'Employee';
    if (role === 'hr_executive') return 'HR Executive';
    if (role === 'department_head') return 'Department Head';
    if (role === 'system_admin') return 'System Admin';
    if (role === 'hr_manager') return 'HR Manager';
    if (role === 'ceo') return 'CEO';
    return 'User';
  };

  const isHr = user?.role === 'hr_executive';
  const isDept = user?.role === 'department_head';
  const isAdmin = user?.role === 'system_admin';
  const isHrManager = user?.role === 'hr_manager';
  const isCeo = user?.role === 'ceo';

  const menuItems = isHr
    ? [
        { label: 'Dashboard', path: '/hcms/dashboard', icon: LayoutDashboard },
        { label: 'All tickets', path: '/hcms/tickets', icon: Inbox, badge: counts.tickets || null },
        { label: 'Assigned to me', path: '/hcms/assigned', icon: Ticket, badge: counts.assigned || null },
        { label: 'Escalations', path: '/hcms/escalations', icon: AlertTriangle, badge: counts.escalations || null },
        { label: 'Employees', path: '/hcms/employees', icon: Users },
      ]
    : isAdmin
    ? [
        { label: 'Dashboard', path: '/hcms/admin-dashboard', icon: LayoutDashboard },
        { label: 'Escalated', path: '/hcms/admin-tickets', icon: Inbox, badge: counts.tickets || null },
        { label: 'Assigned to me', path: '/hcms/admin-assigned-tickets', icon: Ticket, badge: counts.assigned || null },
        { label: 'Users', path: '/hcms/admin-users', icon: UserCog },
        { label: 'Departments', path: '/hcms/admin-departments', icon: Building2 },
        { label: 'Workflow Configuration', path: '/hcms/admin-escalation-levels', icon: Shield },
        { label: 'Case Access Configuration', path: '/hcms/admin-case-access', icon: Shield },
        { label: 'SLA Management', path: '/hcms/admin-sla', icon: ShieldCheck },
        { label: 'Routing Rules', path: '/hcms/admin-routing', icon: GitBranch },
        { label: 'Tenant Configuration', path: '/hcms/admin-tenant', icon: SlidersHorizontal },
      ]
    : isDept
    ? [
        { label: 'Dashboard', path: '/hcms/dept-dashboard', icon: LayoutDashboard },
        { label: 'Assigned to me', path: '/hcms/dept-assigned-tickets', icon: Ticket, badge: counts.assigned || null },
        { label: 'Escalated', path: '/hcms/dept-escalations', icon: AlertTriangle, badge: counts.escalations || null },
        { label: 'Investigations', path: '/hcms/dept-investigations', icon: FileSearch, badge: counts.investigations || null },
      ]
    : isHrManager
    ? [
        { label: 'Dashboard', path: '/hcms/hr-manager-dashboard', icon: LayoutDashboard },
        { label: 'Assigned to me', path: '/hcms/hr-manager-tickets', icon: Ticket, badge: counts.assigned || null },
        { label: 'Escalated', path: '/hcms/hr-manager-escalations', icon: AlertTriangle, badge: counts.escalations || null },
      ]
    : isCeo
    ? [
        { label: 'Dashboard', path: '/hcms/ceo-dashboard', icon: LayoutDashboard },
        { label: 'Assigned to me', path: '/hcms/ceo-tickets', icon: Ticket, badge: counts.assigned || null },
        { label: 'Escalated', path: '/hcms/ceo-escalations', icon: AlertTriangle, badge: counts.escalations || null },
      ]
    : [
        { label: 'Dashboard', path: '/hcms/dashboard', icon: LayoutDashboard },
        { label: 'My Tickets', path: '/hcms/tickets', icon: Ticket, badge: counts.tickets || null },
        { label: 'Notifications', path: '/hcms/notifications', icon: Bell, badge: counts.notifications || null },
      ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", background: '#F8FAFC' }}>
      {/* Sidebar */}
      <aside style={{
        width: 240,
        background: '#FFFFFF',
        borderRight: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 50
      }}>
        {/* Branding */}
        <div style={{ padding: '24px 20px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: '#0F172A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 700,
              fontSize: 16
            }}>
              H
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>HR Ticketing</div>
              <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.2, marginTop: 2 }}>{isAdmin ? 'System Admin' : isDept ? 'Department Head' : isHr ? 'HR Executive' : isHrManager ? 'HR Manager' : isCeo ? 'CEO' : (user?.name || 'Employee')}</div>
            </div>
          </div>
        </div>

        {/* WORKSPACE */}
        <div style={{ padding: '0 12px', marginBottom: 6 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: '#94A3B8',
            padding: '0 6px',
            marginBottom: 6
          }}>Workspace</div>
          {menuItems.map(item => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  width: '100%',
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0 10px',
                  borderRadius: 10,
                  border: 'none',
                  background: active ? '#EFF6FF' : 'transparent',
                  color: active ? '#3B82F6' : '#64748B',
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  marginBottom: 3,
                  position: 'relative'
                }}
              >
                {active && (
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 10,
                    bottom: 10,
                    width: 3,
                    borderRadius: '0 4px 4px 0',
                    background: '#3B82F6'
                  }} />
                )}
                <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                {item.badge && (
                  <span style={{
                    minWidth: 18,
                    height: 18,
                    borderRadius: 999,
                    background: active ? '#DBEAFE' : '#E2E8F0',
                    color: active ? '#3B82F6' : '#64748B',
                    fontSize: 11,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 5px'
                  }}>{item.badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ACCOUNT */}
        <div style={{ padding: '0 12px', marginBottom: 6, marginTop: 6 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: '#94A3B8',
            padding: '0 6px',
            marginBottom: 6
          }}>Account</div>
          <button
            onClick={() => navigate('/hcms/settings')}
            style={{
              width: '100%',
              height: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '0 10px',
              borderRadius: 10,
              border: 'none',
              background: isActive('/hcms/settings') ? '#F1F5F9' : 'transparent',
              color: isActive('/hcms/settings') ? '#0F172A' : '#64748B',
              fontSize: 14,
              fontWeight: isActive('/hcms/settings') ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Settings size={18} strokeWidth={1.8} />
            <span style={{ flex: 1, textAlign: 'left' }}>Settings</span>
          </button>
        </div>

        <div style={{ flex: 1 }} />

        {/* Profile */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: '#0F172A',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 600
          }}>
            {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || 'User'}
            </div>
            <div style={{ fontSize: 12, color: '#64748B' }}>{roleLabel}</div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div style={{ flex: 1, marginLeft: 240, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header style={{
          height: 88,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          position: 'sticky',
          top: 0,
          zIndex: 40
        }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0, lineHeight: 1.2 }}>{getPageTitle()}</h1>
            <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>{getPageSubtitle()}</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
              <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 12, pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder={isAdmin ? 'Search users, departments, policies...' : isDept ? 'Search escalations, tickets, employees...' : isHr ? 'Search tickets, people...' : 'Search tickets...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: 260,
                  height: 36,
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '0 12px 0 36px',
                  fontSize: 13,
                  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                  color: '#0F172A',
                  background: 'white',
                  outline: 'none',
                  boxShadow: '0 1px 2px rgba(15,23,42,0.04)'
                }}
              />
            </div>
            {(isDept || isAdmin) && (
            <button 
              onClick={() => navigate('/hcms/notifications')}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)'
              }}
            >
              <Bell size={16} color="#64748B" />
              {counts.notifications > 0 && (
                <span style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  minWidth: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#EF4444',
                  border: '2px solid white',
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px'
                }}>
                  {counts.notifications > 99 ? '99+' : counts.notifications}
                </span>
              )}
            </button>
            )}

            {user?.role === 'employee' && (
              <button
                onClick={() => navigate('/hcms/tickets/new')}
                style={{
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 8,
                  background: '#0F172A',
                  color: 'white',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#1E293B'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#0F172A'}
              >
                <Plus size={14} />
                New ticket
              </button>
            )}

            <button
              onClick={handleLogout}
              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 8,
                background: '#DC2626',
                color: 'white',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                cursor: 'pointer',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#B91C1C'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#DC2626'}
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main style={{ flex: 1, padding: '24px' }}>
          <Outlet />
        </main>
      </div>

      {/* HCMS Employee Assistant - only renders for employees */}
      <HcmsAssistant />
    </div>
  );
}

export default HCMSLayout;
