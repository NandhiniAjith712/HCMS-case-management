import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, CheckCheck, XCircle, FileSearch, Undo2, ChevronRight, AlertCircle } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";

function DecisionBadge({ icon }) {
  const m = {
    resolved: { bg: '#D1FAE5', color: '#059669', Icon: CheckCircle, label: 'Resolved' },
    approved: { bg: '#D1FAE5', color: '#059669', Icon: CheckCircle, label: 'Resolved' },
    closed: { bg: '#E2E8F0', color: '#475569', Icon: CheckCheck, label: 'Closed' },
    rejected: { bg: '#FEE2E2', color: '#DC2626', Icon: XCircle, label: 'Rejected' },
    investigation: { bg: '#EDE9FE', color: '#7C3AED', Icon: FileSearch, label: 'Investigation' },
    returned: { bg: '#DBEAFE', color: '#2563EB', Icon: Undo2, label: 'Returned' },
    escalated: { bg: '#FEF3C7', color: '#D97706', Icon: AlertCircle, label: 'Escalated' },
  };
  const s = m[icon] || m.resolved;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, background: s.bg, color: s.color, fontSize: 12, fontWeight: 600 }}>
      <s.Icon size={12} />{s.label}
    </span>
  );
}

export default function DeptDecisions() {
  const navigate = useNavigate();
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDecisions = async () => {
      try {
        setLoading(true);
        const token = sessionStorage.getItem('hcmsToken') || localStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        
        const res = await fetch('/api/admin/audit-logs?limit=20', { headers });
        if (!res.ok) throw new Error('Failed to fetch decisions');
        const data = await res.json();
        setDecisions(data.data || []);
      } catch (err) {
        console.error('Error fetching decisions:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDecisions();
  }, []);

  const th = { padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #E2E8F0' };

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading decisions...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading decisions</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: f }}>
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Ticket ID</th>
              <th style={th}>Action</th>
              <th style={th}>Decision</th>
              <th style={th}>Time</th>
              <th style={{ ...th, width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {decisions.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No recent decisions</td></tr>
            ) : decisions.map((d, i) => (
              <tr key={d.id} onClick={() => navigate(`/hcms/dept-escalations/${d.ticket_id?.replace('TKT-', '') || d.ticket_id}`)}
                style={{ borderBottom: i < decisions.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{d.ticket_id || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{d.title || d.description || '—'}</td>
                <td style={{ padding: '14px 16px' }}><DecisionBadge icon={d.icon || 'approved'} /></td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#94A3B8' }}>{d.time || d.created_at ? new Date(d.created_at).toLocaleString() : '—'}</td>
                <td style={{ padding: '14px 16px' }}><ChevronRight size={16} color="#CBD5E1" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
