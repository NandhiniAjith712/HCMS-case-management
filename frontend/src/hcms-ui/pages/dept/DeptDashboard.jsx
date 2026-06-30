import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, FileSearch, CheckCircle, XCircle, Undo2, ChevronRight, CheckCheck, RotateCcw, FileText, AlertCircle } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";
const card = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' };

function StatusBadge({ status }) {
  const m = {
    'pending_approval': { bg: '#FEF3C7', color: '#D97706', label: 'Pending Approval' },
    'under_investigation': { bg: '#EDE9FE', color: '#7C3AED', label: 'Under Investigation' },
    'resolved': { bg: '#D1FAE5', color: '#059669', label: 'Resolved' },
    'closed': { bg: '#E2E8F0', color: '#475569', label: 'Closed' },
    'rejected': { bg: '#FEE2E2', color: '#DC2626', label: 'Rejected' },
    'returned_to_hr': { bg: '#DBEAFE', color: '#2563EB', label: 'Returned to HR' },
    'escalated': { bg: '#FEF3C7', color: '#D97706', label: 'Escalated' },
  };
  const s = m[status] || { bg: '#F1F5F9', color: '#64748B', label: status };
  return <span style={{ padding: '3px 10px', borderRadius: 999, background: s.bg, color: s.color, fontSize: 12, fontWeight: 600 }}>{s.label}</span>;
}

function DecisionIcon({ type }) {
  const cfg = {
    approved: { Icon: CheckCircle, bg: '#D1FAE5', color: '#059669' },
    rejected: { Icon: XCircle, bg: '#FEE2E2', color: '#DC2626' },
    investigation: { Icon: FileSearch, bg: '#EDE9FE', color: '#7C3AED' },
    returned: { Icon: Undo2, bg: '#DBEAFE', color: '#2563EB' },
  };
  const c = cfg[type] || cfg.approved;
  return (
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <c.Icon size={14} color={c.color} />
    </div>
  );
}

export default function DeptDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ escalated: 0, pending: 0, investigation: 0, resolved: 0, closed: 0, rejected: 0, returned: 0 });
  const [recentTickets, setRecentTickets] = useState([]);
  const [recentDecisions, setRecentDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const token = sessionStorage.getItem('hcmsToken') || localStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const [statsRes, ticketsRes, decisionsRes] = await Promise.all([
          fetch('/api/admin/dept-dashboard', { headers }),
          fetch('/api/admin/all-tickets?limit=4', { headers }),
          fetch('/api/admin/audit-logs?limit=4', { headers }),
        ]);

        if (!statsRes.ok) throw new Error('Failed to fetch dashboard stats');
        if (!ticketsRes.ok) throw new Error('Failed to fetch tickets');
        if (!decisionsRes.ok) throw new Error('Failed to fetch recent decisions');

        const statsData = await statsRes.json();
        const ticketsData = await ticketsRes.json();
        const decisionsData = await decisionsRes.json();

        setStats(statsData.data?.dept_stats || { escalated: 0, pending: 0, investigation: 0, resolved: 0, closed: 0, rejected: 0, returned: 0 });
        setRecentTickets(ticketsData.data || []);
        setRecentDecisions(decisionsData.data || []);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  const STATS = [
    { label: 'ESCALATED', value: stats.escalated, Icon: AlertTriangle, bg: '#FEF3C7', color: '#D97706' },
    { label: 'INVESTIGATION', value: stats.investigation, Icon: FileSearch, bg: '#EDE9FE', color: '#7C3AED' },
    { label: 'RESOLVED', value: stats.resolved, Icon: CheckCircle, bg: '#D1FAE5', color: '#059669' },
    { label: 'CLOSED', value: stats.closed, Icon: CheckCheck, bg: '#E2E8F0', color: '#475569' },
    { label: 'REJECTED', value: stats.rejected, Icon: XCircle, bg: '#FEE2E2', color: '#DC2626' },
  ];

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading department dashboard...</div>
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

  return (
    <div style={{ fontFamily: f }}>
      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        {STATS.map(s => (
          <div key={s.label} style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.label}</span>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <s.Icon size={13} color={s.color} />
              </div>
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: '#1E293B', lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Bottom two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>

        {/* Recent Tickets */}
        <div style={card}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Recent Tickets</span>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>4 shown</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                {['TICKET ID', 'EMPLOYEE', 'CATEGORY', 'STATUS'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentTickets.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No tickets found</td>
                </tr>
              ) : (
                recentTickets.map((t, i) => (
                  <tr key={t.id} onClick={() => navigate(`/hcms/dept-escalations/${t.id}`)}
                    style={{ borderBottom: i < recentTickets.length - 1 ? '1px solid #F8FAFC' : 'none', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '14px 20px', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{t.ticket_id || `TKT-${t.id}`}</td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#475569' }}>{t.reporter_name || '—'}</td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#475569' }}>{t.category || '—'}</td>
                    <td style={{ padding: '14px 20px' }}><StatusBadge status={t.status || 'escalated'} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div style={{ padding: '12px 20px', borderTop: '1px solid #F1F5F9', textAlign: 'center' }}>
            <button onClick={() => navigate('/hcms/dept-tickets')} style={{ background: 'transparent', border: 'none', color: '#3B82F6', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>View All</button>
          </div>
        </div>

        {/* Recent Decisions */}
        <div style={card}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Recent Decisions</span>
          </div>
          <div style={{ padding: '8px 0' }}>
            {recentDecisions.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>No recent decisions</div>
            ) : (
              recentDecisions.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 20px', borderBottom: i < recentDecisions.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                  <DecisionIcon type={d.icon || 'approved'} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 2 }}>{d.title || d.description || 'Decision'}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>{d.ticket_id || `TKT-${d.ticket_id}` || '—'}</div>
                  </div>
                  <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap' }}>{d.time || d.created_at ? new Date(d.created_at).toLocaleString() : '—'}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
