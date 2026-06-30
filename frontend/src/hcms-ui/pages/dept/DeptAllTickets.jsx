import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, ChevronDown, AlertCircle } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";

function PriorityBadge({ priority }) {
  const m = { high: { color: '#EF4444', dot: '#EF4444', label: 'High' }, medium: { color: '#F59E0B', dot: '#F59E0B', label: 'Medium' }, low: { color: '#94A3B8', dot: '#94A3B8', label: 'Low' } };
  const s = m[priority] || m.low;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: s.color }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />{s.label}</span>;
}

function StatusBadge({ status }) {
  const m = {
    'new': { bg: '#DBEAFE', color: '#2563EB', label: 'New' },
    'in_progress': { bg: '#EDE9FE', color: '#7C3AED', label: 'In Progress' },
    'escalated': { bg: '#FEF3C7', color: '#D97706', label: 'Escalated' },
    'resolved': { bg: '#D1FAE5', color: '#059669', label: 'Resolved' },
    'closed': { bg: '#E2E8F0', color: '#475569', label: 'Closed' },
    'waiting': { bg: '#FEF3C7', color: '#D97706', label: 'Waiting' },
  };
  const s = m[status] || { bg: '#F1F5F9', color: '#64748B', label: status || '—' };
  return <span style={{ padding: '3px 10px', borderRadius: 999, background: s.bg, color: s.color, fontSize: 12, fontWeight: 600 }}>{s.label}</span>;
}

function Dropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: value ? '#EFF6FF' : '#FFFFFF', color: value ? '#3B82F6' : '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: f }}>
        {value || label} <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 38, left: 0, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 50, minWidth: 170, padding: '4px 0', maxHeight: 280, overflowY: 'auto' }}>
          <div onClick={() => { onChange(''); setOpen(false); }} style={{ padding: '8px 14px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>All</div>
          {options.map(o => (
            <div key={o} onClick={() => { onChange(o); setOpen(false); }} style={{ padding: '8px 14px', fontSize: 13, color: value === o ? '#3B82F6' : '#1E293B', background: value === o ? '#EFF6FF' : 'transparent', cursor: 'pointer', fontWeight: value === o ? 600 : 400 }}>{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_OPTIONS = ['new', 'in_progress', 'escalated', 'resolved', 'closed'];
const PRIORITIES = ['high', 'medium', 'low'];

export default function DeptAllTickets() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priFilter, setPriFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const token = sessionStorage.getItem('hcmsToken') || localStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        const res = await fetch('/api/admin/ticket-departments', { headers });
        if (res.ok) {
          const data = await res.json();
          setDepartments(data.data || []);
        }
      } catch (err) {
        console.error('Error fetching departments:', err);
      }
    };
    fetchDepartments();
  }, []);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        setLoading(true);
        const token = sessionStorage.getItem('hcmsToken') || localStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (deptFilter) params.append('department', deptFilter);
        if (statusFilter) params.append('status', statusFilter);
        if (priFilter) params.append('priority', priFilter);

        const res = await fetch(`/api/admin/all-tickets?${params.toString()}`, { headers });
        if (!res.ok) throw new Error('Failed to fetch tickets');
        const data = await res.json();
        setTickets(data.data || []);
      } catch (err) {
        console.error('Error fetching tickets:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTickets();
  }, [search, deptFilter, statusFilter, priFilter]);

  const th = { padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' };

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading tickets</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: f }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>All Tickets</h1>
        <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>Every ticket across all departments. Filter by department to drill down.</p>
      </div>

      {/* Search + Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
          <Search size={16} color="#94A3B8" />
          <input type="text" placeholder="Search by ticket ID, employee or subject" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, fontFamily: f, color: '#1E293B', background: 'transparent' }} />
        </div>
        <Dropdown label="Department" options={departments} value={deptFilter} onChange={setDeptFilter} />
        <Dropdown label="Status" options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
        <Dropdown label="Priority" options={PRIORITIES} value={priFilter} onChange={setPriFilter} />
      </div>

      {/* Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #E2E8F0', fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
          {loading ? 'Loading…' : `${tickets.length} tickets`}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Ticket ID</th>
              <th style={th}>Subject</th>
              <th style={th}>Employee</th>
              <th style={th}>Department</th>
              <th style={th}>Priority</th>
              <th style={th}>Status</th>
              <th style={th}>Created</th>
              <th style={{ ...th, width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Loading tickets…</td></tr>
            ) : tickets.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No tickets found</td></tr>
            ) : tickets.map((t, i) => (
              <tr key={t.id} onClick={() => navigate(`/hcms/dept-escalations/${t.id}`)}
                style={{ borderBottom: i < tickets.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{t.ticket_id || `TKT-${t.id}`}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#1E293B', fontWeight: 600 }}>{t.title || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#475569' }}>{t.reporter_name || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#475569' }}>{t.category || '—'}</td>
                <td style={{ padding: '14px 16px' }}><PriorityBadge priority={t.priority || 'low'} /></td>
                <td style={{ padding: '14px 16px' }}><StatusBadge status={t.status} /></td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748B' }}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</td>
                <td style={{ padding: '14px 16px' }}><ChevronRight size={16} color="#CBD5E1" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
