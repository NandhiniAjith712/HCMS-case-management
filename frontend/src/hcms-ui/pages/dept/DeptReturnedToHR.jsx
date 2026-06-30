import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Undo2, ChevronRight, AlertCircle } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";

export default function DeptReturnedToHR() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        setLoading(true);
        const token = sessionStorage.getItem('hcmsToken') || localStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        
        // Fetch tickets the Department Head returned to HR
        const res = await fetch('/api/admin/escalated-tickets?status=returned_to_hr', { headers });
        if (!res.ok) throw new Error('Failed to fetch returned tickets');
        const data = await res.json();
        setTickets(data.data || []);
      } catch (err) {
        console.error('Error fetching returned tickets:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTickets();
  }, []);

  const th = { padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #E2E8F0' };

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading returned tickets...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading returned tickets</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: f }}>
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Undo2 size={14} color="#2563EB" /></div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{tickets.length} tickets returned to HR</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Ticket ID</th>
              <th style={th}>Action</th>
              <th style={th}>Reason</th>
              <th style={th}>Time</th>
              <th style={{ ...th, width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No tickets returned to HR</td></tr>
            ) : tickets.map((t, i) => (
              <tr key={t.id} onClick={() => navigate(`/hcms/dept-escalations/${t.ticket_id?.replace('TKT-', '') || t.ticket_id}`)}
                style={{ borderBottom: i < tickets.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{t.ticket_id || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{t.title || t.description || 'Returned to HR'}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#475569' }}>{t.description || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#94A3B8' }}>{t.time || t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                <td style={{ padding: '14px 16px' }}><ChevronRight size={16} color="#CBD5E1" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
