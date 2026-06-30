import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserCheck, Building2, FileText, Ticket, CheckCircle, GitBranch, UserPlus, Shield, RefreshCw, AlertCircle } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";
const card = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' };

const ICON_MAP = {
  'USER ADDED': { Icon: UserPlus, iconBg: '#DBEAFE', iconColor: '#3B82F6' },
  'DEPARTMENT UPDATED': { Icon: Building2, iconBg: '#D1FAE5', iconColor: '#059669' },
  'POLICY UPLOADED': { Icon: Shield, iconBg: '#EDE9FE', iconColor: '#7C3AED' },
  'ROUTING RULE CHANGED': { Icon: GitBranch, iconBg: '#FEF3C7', iconColor: '#D97706' },
  'USER ROLE CHANGED': { Icon: RefreshCw, iconBg: '#DBEAFE', iconColor: '#3B82F6' },
  'CREATE': { Icon: UserPlus, iconBg: '#DBEAFE', iconColor: '#3B82F6' },
  'UPDATE': { Icon: RefreshCw, iconBg: '#D1FAE5', iconColor: '#059669' },
  'DELETE': { Icon: AlertCircle, iconBg: '#FEE2E2', iconColor: '#DC2626' },
  'LOCK': { Icon: Shield, iconBg: '#FEF3C7', iconColor: '#D97706' },
  'UNLOCK': { Icon: UserCheck, iconBg: '#D1FAE5', iconColor: '#059669' },
  'PASSWORD_RESET': { Icon: RefreshCw, iconBg: '#EDE9FE', iconColor: '#7C3AED' },
};

function StatCard({ label, value, sub, Icon }) {
  return (
    <div style={{ ...card, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color="#94A3B8" />
        </div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: '#1E293B', lineHeight: 1, marginBottom: 6 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#94A3B8' }}>{sub}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch stats
        const statsRes = await fetch('/api/admin/dashboard/stats', { headers });
        if (!statsRes.ok) throw new Error('Failed to fetch stats');
        const statsData = await statsRes.json();

        setStats(statsData);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    return num.toLocaleString();
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getActivityIcon = (action) => {
    return ICON_MAP[action] || ICON_MAP['UPDATE'];
  };

  const getActivityMessage = (activity) => {
    const { action, entity_type, user_name, details } = activity;
    if (action === 'CREATE') return `${user_name} created ${entity_type}`;
    if (action === 'UPDATE') return `${user_name} updated ${entity_type}`;
    if (action === 'DELETE') return `${user_name} deleted ${entity_type}`;
    if (action === 'LOCK') return `${user_name} locked user account`;
    if (action === 'UNLOCK') return `${user_name} unlocked user account`;
    if (action === 'PASSWORD_RESET') return `${user_name} reset password for user`;
    return `${user_name} performed ${action} on ${entity_type}`;
  };

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading dashboard</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  const dashboardStats = [
    { label: 'Total Users', value: formatNumber(Object.values(stats?.users || {}).reduce((a, b) => a + b, 0)), sub: 'Employees, HR, Dept. Heads, Admins', Icon: Users },
    { label: 'Active Users', value: formatNumber(stats?.users?.user || 0), sub: 'Active in the last 30 days', Icon: UserCheck },
    { label: 'Departments', value: formatNumber(stats?.departments || 0), sub: 'Configured departments / categories', Icon: Building2 },
    { label: 'Open Tickets', value: formatNumber(stats?.tickets_by_status?.new || 0), sub: 'Count only — no content visible', Icon: Ticket },
    { label: 'Closed Tickets', value: formatNumber(stats?.tickets_by_status?.closed || 0), sub: 'Count only — no content visible', Icon: CheckCircle },
    { label: 'Routing Rules', value: formatNumber(stats?.routing_rules || 0), sub: 'Active rules in production', Icon: GitBranch },
  ];

  return (
    <div style={{ fontFamily: f }}>
      {/* Tenant chip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', background: '#F1F5F9', padding: '4px 12px', borderRadius: 999, border: '1px solid #E2E8F0' }}>System Overview</span>
      </div>

      {/* Row 1: 4 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        {dashboardStats.slice(0, 4).map(s => <StatCard key={s.label} {...s} />)}
      </div>
      {/* Row 2: 3 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {dashboardStats.slice(4).map(s => <StatCard key={s.label} {...s} />)}
      </div>
    </div>
  );
}
