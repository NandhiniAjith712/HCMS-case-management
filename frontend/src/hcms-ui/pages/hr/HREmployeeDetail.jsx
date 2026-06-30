import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, BadgeCheck, Building2, Mail, Phone, Calendar, MessageSquare, RefreshCw, FileText, AlertCircle } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";
const card = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' };

function StatusBadge({ status }) {
  const styles = { 'active': { bg: '#FEF3C7', color: '#D97706', dot: '#D97706', label: 'Active' }, 'inactive': { bg: '#F1F5F9', color: '#64748B', dot: '#94A3B8', label: 'Inactive' } };
  const s = styles[status] || styles['active'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 999, background: s.bg, color: s.color, fontSize: 13, fontWeight: 500 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />{s.label}
    </span>
  );
}

function TicketStatus({ status }) {
  const map = { 'In Progress': '#F59E0B', 'Open': '#EF4444', 'Closed': '#22C55E', 'Resolved': '#3B82F6' };
  return <span style={{ fontSize: 13, fontWeight: 600, color: map[status] || '#64748B' }}>{status}</span>;
}

function ActivityIcon({ type }) {
  const icons = { comment: MessageSquare, status: RefreshCw, ticket: FileText };
  const Icon = icons[type] || FileText;
  const bg = { comment: '#DBEAFE', status: '#FEF3C7', ticket: '#F1F5F9' };
  const color = { comment: '#3B82F6', status: '#F59E0B', ticket: '#64748B' };
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: bg[type] || '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={14} color={color[type] || '#64748B'} />
    </div>
  );
}

export default function HREmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [emp, setEmp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  useEffect(() => {
    const fetchEmployee = async () => {
      try {
        setLoading(true);
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        const res = await fetch(`/api/admin/users/${id}`, { headers });
        if (!res.ok) throw new Error('Failed to fetch employee');
        const data = await res.json();
        setEmp(data.data || null);
      } catch (err) {
        console.error('Error fetching employee:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchEmployee();
  }, [id]);

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading employee details...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading employee</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!emp) return (
    <div style={{ fontFamily: f, padding: 40, textAlign: 'center', color: '#64748B' }}>
      <button onClick={() => navigate('/hcms/employees')} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', padding: 0 }}><ChevronLeft size={16} />Back to employees</button>
      Employee not found.
    </div>
  );

  return (
    <div style={{ fontFamily: f }}>
      {/* Back */}
      <button onClick={() => navigate('/hcms/employees')} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: 0 }}>
        <ChevronLeft size={16} />Back to employees
      </button>

      {/* Hero card */}
      <div style={{ ...card, padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#1E293B', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>{getInitials(emp.name)}</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>{emp.name}</h1>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
              {emp.employee_id || `EMP-${emp.id}`} · <span style={{ color: '#F59E0B', fontWeight: 500 }}>{emp.department_name || '—'}</span>
            </p>
          </div>
        </div>
        <StatusBadge status={emp.status || 'active'} />
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>

        {/* Left — Employee Info */}
        <div style={card}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Employee Information</span>
          </div>
          <div style={{ padding: '6px 0' }}>
            {[
              { Icon: BadgeCheck, label: 'EMPLOYEE ID', value: emp.employee_id || `EMP-${emp.id}`, colored: true },
              { Icon: Building2, label: 'DEPARTMENT', value: emp.department_name || '—', colored: true },
              { Icon: Mail, label: 'EMAIL', value: emp.email || '—', colored: false },
              { Icon: Phone, label: 'PHONE', value: emp.phone || '—', colored: false },
              { Icon: Calendar, label: 'JOINING DATE', value: emp.created_at ? new Date(emp.created_at).toLocaleDateString() : '—', colored: false },
            ].map(({ Icon, label, value, colored }, i, arr) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 20px', borderBottom: i < arr.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <Icon size={14} color="#94A3B8" />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colored ? '#F59E0B' : '#1E293B' }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Ticket Statistics */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Ticket Statistics</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'TOTAL', value: emp.total_tickets || 0, color: '#1E293B' },
                { label: 'OPEN', value: emp.open_tickets || 0, color: '#EF4444' },
                { label: 'IN PROGRESS', value: emp.in_progress_tickets || 0, color: '#F59E0B' },
                { label: 'CLOSED', value: emp.closed_tickets || 0, color: '#22C55E' },
              ].map(stat => (
                <div key={stat.label} style={{ ...card, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>{stat.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Tickets */}
          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Recent Tickets</span>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>{(emp.recent_tickets || []).length} shown</span>
            </div>
            {!(emp.recent_tickets || []).length ? (
              <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>No tickets found</div>
            ) : (
              (emp.recent_tickets || []).map((t, i) => (
                <div key={t.id} style={{ padding: '14px 20px', borderBottom: i < (emp.recent_tickets || []).length - 1 ? '1px solid #F1F5F9' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => navigate(`/hcms/tickets/${t.id}`)}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 2 }}>{t.ticket_id || `TKT-${t.id}`}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>{t.title || '—'}</div>
                  </div>
                  <TicketStatus status={t.status || 'Open'} />
                </div>
              ))
            )}
          </div>

          {/* Recent Activity */}
          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Recent Activity</span>
            </div>
            {!(emp.recent_activity || []).length ? (
              <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>No recent activity</div>
            ) : (
              <div style={{ padding: '10px 0' }}>
                {(emp.recent_activity || []).map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '10px 20px' }}>
                    <ActivityIcon type={a.icon || 'ticket'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 2 }}>{a.title || 'Activity'}</div>
                      <div style={{ fontSize: 12, color: '#F59E0B' }}>{a.subtitle || a.description || '—'}</div>
                    </div>
                    <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.time || a.created_at ? new Date(a.created_at).toLocaleString() : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
