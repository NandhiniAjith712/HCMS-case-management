import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, ChevronDown, X, AlertCircle } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";

const TABS = [
  { label: 'All', key: 'all' },
  { label: 'Pending Approval', key: 'pending_approval' },
  { label: 'Under Investigation', key: 'under_investigation' },
  { label: 'Resolved', key: 'resolved' },
  { label: 'Closed', key: 'closed' },
  { label: 'Rejected', key: 'rejected' },
  { label: 'Returned to HR', key: 'returned_to_hr' },
  { label: 'Escalated to Admin', key: 'escalated_to_admin' },
];

function PriorityBadge({ priority }) {
  const m = { high: { color: '#EF4444', dot: '#EF4444', label: 'High' }, medium: { color: '#F59E0B', dot: '#F59E0B', label: 'Medium' }, low: { color: '#94A3B8', dot: '#94A3B8', label: 'Low' } };
  const s = m[priority] || m.low;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: s.color }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />{s.label}</span>;
}

function StatusBadge({ status }) {
  const m = {
    'pending_approval': { bg: '#FEF3C7', color: '#D97706', label: 'Pending Approval' },
    'under_investigation': { bg: '#EDE9FE', color: '#7C3AED', label: 'Under Investigation' },
    'resolved': { bg: '#D1FAE5', color: '#059669', label: 'Resolved' },
    'closed': { bg: '#E2E8F0', color: '#475569', label: 'Closed' },
    'rejected': { bg: '#FEE2E2', color: '#DC2626', label: 'Rejected' },
    'returned_to_hr': { bg: '#DBEAFE', color: '#2563EB', label: 'Returned to HR' },
    'escalated_to_admin': { bg: '#FEE2E2', color: '#DC2626', label: 'Escalated to Admin' },
    'escalated': { bg: '#FEF3C7', color: '#D97706', label: 'Escalated' },
  };
  const s = m[status] || { bg: '#F1F5F9', color: '#64748B', label: status };
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
        <div style={{ position: 'absolute', top: 38, left: 0, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 50, minWidth: 150, padding: '4px 0' }}>
          <div onClick={() => { onChange(''); setOpen(false); }} style={{ padding: '8px 14px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>All</div>
          {options.map(o => (
            <div key={o} onClick={() => { onChange(o); setOpen(false); }} style={{ padding: '8px 14px', fontSize: 13, color: value === o ? '#3B82F6' : '#1E293B', background: value === o ? '#EFF6FF' : 'transparent', cursor: 'pointer', fontWeight: value === o ? 600 : 400 }}>{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminTickets() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [priFilter, setPriFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        setLoading(true);
        const token = sessionStorage.getItem('hcmsToken') || localStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (activeTab !== 'all') params.append('status', activeTab);
        if (catFilter) params.append('category', catFilter);
        if (priFilter) params.append('priority', priFilter);

        const res = await fetch(`/api/admin/system-admin-tickets?${params.toString()}`, { headers });
        if (!res.ok) throw new Error('Failed to fetch tickets');
        const data = await res.json();
        setTickets(data.data || []);

        const cats = [...new Set((data.data || []).map(t => t.category).filter(Boolean))];
        setCategories(cats);
      } catch (err) {
        console.error('Error fetching admin tickets:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTickets();
  }, [search, activeTab, catFilter, priFilter]);

  const PRIORITIES = ['high', 'medium', 'low'];
  const hasFilters = catFilter || priFilter;

  const th = { padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' };

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading escalated tickets...</div>
        </div>
      </div>
    );
  }

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
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: '0 0 6px' }}>Escalated</h1>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Tickets escalated to you</p>
      </div>
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        <Search size={16} color="#94A3B8" />
        <input type="text" placeholder="Search by ticket ID, employee or subject" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, fontFamily: f, color: '#1E293B', background: 'transparent' }} />
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E2E8F0', marginBottom: 16 }}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: 'transparent', border: 'none', borderBottom: active ? '2px solid #1E293B' : '2px solid transparent', fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#1E293B' : '#64748B', cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap' }}>
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Dropdown label="Category" options={categories} value={catFilter} onChange={setCatFilter} />
          <Dropdown label="Priority" options={PRIORITIES} value={priFilter} onChange={setPriFilter} />
        </div>
        {hasFilters && (
          <button onClick={() => { setCatFilter(''); setPriFilter(''); }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', padding: 0 }}>
            <X size={13} />Clear filters
          </button>
        )}
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Ticket ID</th>
              <th style={th}>Subject</th>
              <th style={th}>Employee</th>
              <th style={th}>Category</th>
              <th style={th}>Escalation Reason</th>
              <th style={th}>Priority</th>
              <th style={th}>Status</th>
              <th style={th}>Updated</th>
              <th style={{ ...th, width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No escalated tickets found</td></tr>
            ) : tickets.map((t, i) => (
              <tr key={t.id} onClick={() => navigate(`/hcms/admin-tickets/${t.id}`)}
                style={{ borderBottom: i < tickets.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{t.ticket_id || `TKT-${t.id}`}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{t.title || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#475569' }}>{t.reporter_name || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#475569' }}>{t.category || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#475569' }}>{t.escalation_reason || '—'}</td>
                <td style={{ padding: '14px 16px' }}><PriorityBadge priority={t.priority || 'low'} /></td>
                <td style={{ padding: '14px 16px' }}><StatusBadge status={t.status || 'escalated'} /></td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748B' }}>{t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—'}</td>
                <td style={{ padding: '14px 16px' }}><ChevronRight size={16} color="#CBD5E1" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
