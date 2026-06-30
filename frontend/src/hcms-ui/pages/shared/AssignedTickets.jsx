import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCases } from '../../services/caseApi';
import { Search } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";

function StatusBadge({ status }) {
  const configs = {
    open: { bg: '#FEE2E2', text: '#EF4444', label: 'Open' },
    new: { bg: '#FEE2E2', text: '#EF4444', label: 'Open' },
    in_progress: { bg: '#FEF3C7', text: '#F59E0B', label: 'In Progress' },
    waiting: { bg: '#DBEAFE', text: '#3B82F6', label: 'Waiting' },
    resolved: { bg: '#D1FAE5', text: '#22C55E', label: 'Resolved' },
    closed: { bg: '#E2E8F0', text: '#475569', label: 'Closed' },
    escalated: { bg: '#FEF3C7', text: '#D97706', label: 'Escalated' }
  };
  const cfg = configs[status] || configs.open;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      height: 26, padding: '0 12px', borderRadius: 999,
      background: cfg.bg, color: cfg.text, fontSize: 12, fontWeight: 500
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.text }} />
      {cfg.label}
    </span>
  );
}

function RMBadge({ mode }) {
  const styles = {
    normal: { bg: '#F1F5F9', color: '#64748B', label: 'Normal' },
    confidential: { bg: '#FEF3C7', color: '#B45309', label: 'Confidential' },
    sensitive: { bg: '#E0E7FF', color: '#4338CA', label: 'Sensitive' },
    anonymous: { bg: '#F3E8FF', color: '#7E22CE', label: 'Anonymous' }
  };
  const s = styles[mode] || styles.normal;
  return <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{s.label}</span>;
}

function PriorityBadge({ priority }) {
  const configs = {
    high: { bg: '#FEF2F2', text: '#EF4444', label: 'High' },
    medium: { bg: '#FEF3C7', text: '#F59E0B', label: 'Medium' },
    low: { bg: '#DBEAFE', text: '#3B82F6', label: 'Low' },
    critical: { bg: '#FEF2F2', text: '#991B1B', label: 'Critical' },
    urgent: { bg: '#FEF2F2', text: '#991B1B', label: 'Urgent' }
  };
  const cfg = configs[priority] || configs.medium;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      height: 26, padding: '0 12px', borderRadius: 999,
      background: cfg.bg, color: cfg.text, fontSize: 12, fontWeight: 500
    }}>{cfg.label}</span>
  );
}

function Avatar({ name }) {
  const initials = name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', background: '#F1F5F9', color: '#64748B',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0
    }}>{initials}</div>
  );
}

function formatRemaining(deadline) {
  if (!deadline) return '—';
  const diff = new Date(deadline) - Date.now();
  if (diff <= 0) return 'Overdue';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h`;
}

export default function AssignedTickets({ title = 'My Tickets', subtitle, detailPath, escalated }) {
  const navigate = useNavigate();
  const [activeStatus, setActiveStatus] = useState('all');
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    setLoading(true);
    try {
      const params = { assignedOnly: true };
      if (escalated === true) params.escalated = true;
      else if (escalated === false) params.escalated = false;
      const result = await getCases(params);
      if (result.success) {
        setCases(result.cases || []);
      }
    } catch (err) {
      console.error('Failed to load assigned cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const statusTabs = [
    { key: 'all', label: 'All', count: cases.length },
    { key: 'open', label: 'Open', count: cases.filter(c => c.status === 'open' || c.status === 'new').length },
    { key: 'in_progress', label: 'In Progress', count: cases.filter(c => c.status === 'in_progress').length },
    { key: 'waiting', label: 'Pending Info', count: cases.filter(c => c.status === 'waiting').length },
    { key: 'escalated', label: 'Escalated', count: cases.filter(c => c.status === 'escalated').length },
    { key: 'resolved', label: 'Resolved', count: cases.filter(c => c.status === 'resolved').length },
  ];

  const filteredCases = cases.filter(c => {
    if (activeStatus !== 'all' && c.status !== activeStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.ticket_id || '').toLowerCase().includes(q)
      || (c.title || '').toLowerCase().includes(q)
      || (c.reporter_name || '').toLowerCase().includes(q);
  });

  return (
    <div style={{ fontFamily: f }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: '0 0 6px' }}>{title}</h1>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>{subtitle || `Cases assigned to you — ${cases.length} total`}</p>
      </div>

      <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid #E2E8F0', marginBottom: 20 }}>
        {statusTabs.map(tab => {
          const isActive = activeStatus === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveStatus(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 0', background: 'transparent', border: 'none',
                borderBottom: isActive ? '2px solid #1E293B' : '2px solid transparent',
                color: isActive ? '#1E293B' : '#64748B',
                fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: -1, fontFamily: f
              }}>
              {tab.label}
              <span style={{
                minWidth: 20, height: 20, borderRadius: 999,
                background: isActive ? '#1E293B' : '#E2E8F0',
                color: isActive ? '#FFFFFF' : '#64748B',
                fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px'
              }}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input type="text" placeholder="Search by ticket ID, employee or subject"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', height: 42, borderRadius: 10, border: '1px solid #E2E8F0',
            padding: '0 14px 0 40px', fontSize: 13, fontFamily: f,
            color: '#0F172A', background: '#F8FAFC', outline: 'none', boxSizing: 'border-box'
          }} />
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              {['TICKET ID', 'EMPLOYEE', 'SUBJECT', 'DEPARTMENT', 'PRIORITY', 'STATUS', 'ESCALATION LEVEL', 'SLA REMAINING', 'ASSIGNED DATE'].map((h, i) => (
                <th key={i} style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#64748B', textAlign: 'left', letterSpacing: '0.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading...</td></tr>
            ) : filteredCases.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13 }}>No tickets found</td></tr>
            ) : (
              filteredCases.map((row, i) => (
                <tr key={row.id} onClick={() => navigate(`${detailPath}/${row.id}`)}
                  style={{ borderBottom: i < filteredCases.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer', transition: 'background 0.1s ease' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                  <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 500, color: '#0F172A' }}>{row.ticket_id || `#${row.id}`}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={row.reporter_name || 'User'} />
                      <span style={{ fontSize: 13, color: '#0F172A' }}>{row.reporter_name || '—'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#0F172A' }}>
                      <span>{row.title}</span>
                      <RMBadge mode={row.reporting_mode} />
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748B' }}>{row.department || row.category || '—'}</td>
                  <td style={{ padding: '14px 16px' }}><PriorityBadge priority={row.priority} /></td>
                  <td style={{ padding: '14px 16px' }}><StatusBadge status={row.status} /></td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748B' }}>{row.escalation_level || '—'}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#EF4444', fontWeight: 600 }}>{formatRemaining(row.resolution_sla_deadline)}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748B' }}>{row.assigned_at ? new Date(row.assigned_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
        <span style={{ fontSize: 13, color: '#64748B' }}>Showing {filteredCases.length} of {cases.length} tickets</span>
      </div>
    </div>
  );
}
