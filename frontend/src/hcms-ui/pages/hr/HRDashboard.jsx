import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardData } from '../../services/caseApi';
import {
  Ticket, AlertCircle, Clock, CheckCircle2, ChevronRight, RefreshCw
} from 'lucide-react';

export default function HRDashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState({ total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 });
  const [recentTickets, setRecentTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const result = await getDashboardData();
      if (result.success) {
        setMetrics(result.metrics || { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 });
        setRecentTickets(result.recentTickets || []);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = [
    { label: 'TOTAL TICKETS', value: metrics.total, subtext: 'All tickets', icon: Ticket, iconBg: '#F1F5F9', iconColor: '#64748B' },
    { label: 'OPEN', value: metrics.open, subtext: 'Awaiting action', icon: AlertCircle, iconBg: '#FEF2F2', iconColor: '#EF4444' },
    { label: 'IN PROGRESS', value: metrics.inProgress, subtext: 'Being worked on', icon: Clock, iconBg: '#FEFCE8', iconColor: '#F59E0B' },
    { label: 'RESOLVED', value: metrics.resolved, subtext: 'Ready for review', icon: CheckCircle2, iconBg: '#DBEAFE', iconColor: '#3B82F6' },
    { label: 'CLOSED', value: metrics.closed, subtext: 'Completed', icon: CheckCircle2, iconBg: '#F0FDF4', iconColor: '#22C55E' },
  ];

  const getStatusPill = (status) => {
    const configs = {
      open: { bg: '#FEF2F2', text: '#EF4444', label: 'Open' },
      in_progress: { bg: '#FEF3C7', text: '#F59E0B', label: 'In Progress' },
      resolved: { bg: '#DBEAFE', text: '#3B82F6', label: 'Resolved' },
      closed: { bg: '#F0FDF4', text: '#22C55E', label: 'Closed' },
      rejected: { bg: '#FEE2E2', text: '#DC2626', label: 'Rejected' },
    };
    const cfg = configs[status] || configs.open;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        height: 26, padding: '0 12px', borderRadius: 999,
        background: cfg.bg, color: cfg.text, fontSize: 12, fontWeight: 500
      }}>{cfg.label}</span>
    );
  };

  return (
    <div style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B', margin: '0 0 8px' }}>HR Dashboard</h2>
        <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>Overview of HR tickets and recent activity</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 18, marginBottom: 18 }}>
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} style={{
              background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, padding: 20,
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)', display: 'flex', flexDirection: 'column', gap: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748B' }}>{s.label}</span>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: s.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color={s.iconColor} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{loading ? '—' : s.value}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>{s.subtext}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
        <div style={{ padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 3px' }}>Recent tickets</h2>
            <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>Latest activity across all queues</p>
          </div>
          <button onClick={() => navigate('/hcms/tickets')} style={{
            display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, fontWeight: 600,
            color: '#0F172A', background: 'transparent', border: 'none', cursor: 'pointer'
          }}>View all <ChevronRight size={14} /></button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              {['ID', 'SUBJECT', 'STATUS', 'UPDATED'].map((h, i) => (
                <th key={i} style={{
                  padding: '12px 18px', fontSize: 11, fontWeight: 600,
                  textTransform: 'uppercase', color: '#64748B', textAlign: 'left', letterSpacing: '0.5px'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading...</td></tr>
            ) : recentTickets.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13 }}>No tickets found</td></tr>
            ) : (
              recentTickets.map(c => (
                <tr key={c.id} onClick={() => navigate(`/hcms/tickets/${c.id}`)} style={{
                  borderBottom: '1px solid #F1F5F9', cursor: 'pointer', transition: 'background 0.1s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                >
                  <td style={{ padding: '14px 18px', fontSize: 13, color: '#64748B', fontWeight: 500 }}>{c.ticket_id || `#${c.id}`}</td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{c.title}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{c.category || 'General'}</div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>{getStatusPill(c.status)}</td>
                  <td style={{ padding: '14px 18px', fontSize: 13, color: '#64748B' }}>{c.updated_at ? new Date(c.updated_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
