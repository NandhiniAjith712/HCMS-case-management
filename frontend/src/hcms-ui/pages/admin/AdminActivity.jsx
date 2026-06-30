import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Building2, ShieldCheck, GitBranch, RefreshCw, Trash2, LogIn, AlertCircle, Activity } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";
const card = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' };

const ICON_MAP = {
  'user_added': { Icon: UserPlus, iconBg: '#DBEAFE', iconColor: '#3B82F6', type: 'USER ADDED' },
  'user_updated': { Icon: RefreshCw, iconBg: '#DBEAFE', iconColor: '#3B82F6', type: 'USER UPDATED' },
  'user_deactivated': { Icon: Trash2, iconBg: '#FEE2E2', iconColor: '#EF4444', type: 'USER DEACTIVATED' },
  'user_role_changed': { Icon: RefreshCw, iconBg: '#DBEAFE', iconColor: '#3B82F6', type: 'USER ROLE CHANGED' },
  'department_created': { Icon: Building2, iconBg: '#D1FAE5', iconColor: '#059669', type: 'DEPARTMENT CREATED' },
  'department_updated': { Icon: Building2, iconBg: '#D1FAE5', iconColor: '#059669', type: 'DEPARTMENT UPDATED' },
  'routing_rule_changed': { Icon: GitBranch, iconBg: '#FEF3C7', iconColor: '#D97706', type: 'ROUTING RULE CHANGED' },
  'admin_login': { Icon: LogIn, iconBg: '#F1F5F9', iconColor: '#64748B', type: 'ADMIN LOGIN' },
  'permission_changed': { Icon: ShieldCheck, iconBg: '#EDE9FE', iconColor: '#7C3AED', type: 'PERMISSION CHANGED' },
};

export default function AdminActivity() {
  const [activities, setActivities] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        
        const params = new URLSearchParams();
        if (search) params.append('search', search);

        const res = await fetch(`/api/admin/audit-logs?${params.toString()}`, { headers });
        if (!res.ok) throw new Error('Failed to fetch audit logs');
        const data = await res.json();
        setActivities(data.data || []);
      } catch (err) {
        console.error('Error fetching audit logs:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchActivities();
  }, [search]);

  const formatTime = (timestamp) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading audit logs...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading audit logs</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: f }}>
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        <Search size={15} color="#94A3B8" />
        <input type="text" placeholder="Search activity..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: f, color: '#1E293B', background: 'transparent' }} />
      </div>
      <div style={card}>
        <div style={{ padding: '0' }}>
          {activities.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              No activity found
            </div>
          ) : (
            activities.map((e, i) => {
              const iconConfig = ICON_MAP[e.action_type] || { Icon: Activity, iconBg: '#F1F5F9', iconColor: '#64748B', type: e.action_type?.replace(/_/g, ' ').toUpperCase() || 'ACTIVITY' };
              const Icon = iconConfig.Icon;
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 20px', borderBottom: i < activities.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                  onMouseEnter={ev => ev.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: iconConfig.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={15} color={iconConfig.iconColor} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>{iconConfig.type}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 2 }}>{e.description || e.action_type?.replace(/_/g, ' ') || 'Activity'}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>by {e.actor_name || 'System'}</div>
                  </div>
                  <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap', marginTop: 2 }}>{formatTime(e.created_at)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
