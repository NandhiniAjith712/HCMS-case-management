import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, Clock } from 'lucide-react';
import { getCases } from '../../services/caseApi';

function StatusBadge({ status }) {
  const configs = {
    open: { bg: '#FEE2E2', text: '#EF4444', dot: '#EF4444', label: 'Open' },
    in_progress: { bg: '#FEF3C7', text: '#F59E0B', dot: '#F59E0B', label: 'In Progress' },
    waiting: { bg: '#DBEAFE', text: '#3B82F6', dot: '#3B82F6', label: 'Waiting' },
    resolved: { bg: '#D1FAE5', text: '#22C55E', dot: '#22C55E', label: 'Resolved' },
    closed: { bg: '#D1FAE5', text: '#22C55E', dot: '#22C55E', label: 'Closed' },
  };
  const cfg = configs[status] || configs.open;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 26,
      padding: '0 12px',
      borderRadius: 999,
      background: cfg.bg,
      color: cfg.text,
      fontSize: 12,
      fontWeight: 500
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const configs = {
    high: { bg: '#FEF2F2', text: '#EF4444', label: 'High' },
    medium: { bg: '#FEF3C7', text: '#F59E0B', label: 'Medium' },
    low: { bg: '#DBEAFE', text: '#3B82F6', label: 'Low' },
  };
  const cfg = configs[priority] || configs.medium;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 26,
      padding: '0 12px',
      borderRadius: 999,
      background: cfg.bg,
      color: cfg.text,
      fontSize: 12,
      fontWeight: 500
    }}>
      {cfg.label}
    </span>
  );
}

function Avatar({ name }) {
  const initials = name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', background: '#F1F5F9', color: '#64748B',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0
    }}>
      {initials}
    </div>
  );
}

function FilterDropdown({ label }) {
  return (
    <button style={{
      height: 34, padding: '0 14px', borderRadius: 8, background: '#FFFFFF', color: '#0F172A',
      border: '1px solid #E2E8F0', fontSize: 13, fontWeight: 500, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    }}>
      {label}
      <ChevronDown size={14} color="#64748B" />
    </button>
  );
}

export default function AssignedToMe() {
  const navigate = useNavigate();
  const [activeStatus, setActiveStatus] = useState('in_progress');
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCases();
  }, [activeStatus]);

  const loadCases = async () => {
    setLoading(true);
    try {
      const result = await getCases({ assignedOnly: true });
      if (result.success) {
        setCases(result.cases || []);
      }
    } catch (err) {
      console.error('Failed to load cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const statusTabs = [
    { key: 'open', label: 'Open', count: cases.filter(c => c.status === 'open').length },
    { key: 'in_progress', label: 'In Progress', count: cases.filter(c => c.status === 'in_progress').length },
    { key: 'waiting', label: 'Waiting', count: cases.filter(c => c.status === 'waiting').length },
    { key: 'resolved', label: 'Resolved', count: cases.filter(c => c.status === 'resolved').length },
  ];

  const filteredCases = cases.filter(c => c.status === activeStatus);

  return (
    <div style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: '0 0 6px' }}>Assigned to me</h1>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Your personal work queue — {cases.length} active tickets owned by you.</p>
      </div>

      {/* SLA Warning */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: '#FEF2F2',
        border: '1px solid #FECACA',
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 20
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: '#FEE2E2',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          <Clock size={14} color="#EF4444" />
        </div>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#EF4444' }}>SLA at risk</span>
          <span style={{ fontSize: 13, color: '#64748B' }}> — </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#EF4444' }}>{cases.filter(c => c.status === 'open' || c.status === 'in_progress').length} tickets</span>
        </div>
      </div>

      {/* Status Tabs */}
      <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid #E2E8F0', marginBottom: 20 }}>
        {statusTabs.map(tab => {
          const isActive = activeStatus === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveStatus(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 0',
                background: 'transparent', border: 'none',
                borderBottom: isActive ? '2px solid #1E293B' : '2px solid transparent',
                color: isActive ? '#1E293B' : '#64748B',
                fontSize: 14, fontWeight: 600,
                cursor: 'pointer', marginBottom: -1,
                fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
              }}
            >
              {tab.label}
              <span style={{
                minWidth: 20, height: 20, borderRadius: 999,
                background: isActive ? '#1E293B' : '#E2E8F0',
                color: isActive ? '#FFFFFF' : '#64748B',
                fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px'
              }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Search by ticket ID, employee or subject"
          style={{
            width: '100%', height: 42, borderRadius: 10, border: '1px solid #E2E8F0',
            padding: '0 14px 0 40px', fontSize: 13,
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
            color: '#0F172A', background: '#F8FAFC', outline: 'none', boxSizing: 'border-box'
          }}
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <FilterDropdown label="Category" />
          <FilterDropdown label="Priority" />
          <FilterDropdown label="Date" />
        </div>
        <button style={{
          background: 'transparent', border: 'none', color: '#64748B',
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
        }}>
          Clear filters
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              {['TICKET ID', 'SUBJECT', 'EMPLOYEE', 'CATEGORY', 'PRIORITY', 'STATUS', 'SLA DUE', 'UPDATED'].map((h, i) => (
                <th key={i} style={{
                  padding: '12px 16px', fontSize: 11, fontWeight: 600,
                  textTransform: 'uppercase', color: '#64748B', textAlign: 'left', letterSpacing: '0.5px'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading...</td></tr>
            ) : filteredCases.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13 }}>No tickets in this status</td></tr>
            ) : (
              filteredCases.map((row, i) => (
                <tr
                  key={row.id}
                  onClick={() => navigate(`/hcms/tickets/${row.id}`)}
                  style={{
                    borderBottom: i < filteredCases.length - 1 ? '1px solid #F1F5F9' : 'none',
                    cursor: 'pointer', transition: 'background 0.1s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                >
                  <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 500, color: '#0F172A' }}>{row.ticket_id || `#${row.id}`}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#0F172A' }}>{row.title}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={row.created_by_name || row.employee_name || 'User'} />
                      <span style={{ fontSize: 13, color: '#0F172A' }}>{row.created_by_name || row.employee_name || '—'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#0F172A' }}>{row.category || 'General'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <PriorityBadge priority={row.priority} />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748B' }}>—</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748B' }}>{row.updated_at ? new Date(row.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
        <span style={{ fontSize: 13, color: '#64748B' }}>Showing {filteredCases.length} of {cases.length} tickets</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{
            padding: '6px 14px', borderRadius: 8, background: '#FFFFFF',
            color: '#94A3B8', border: '1px solid #E2E8F0', fontSize: 13, cursor: 'not-allowed'
          }}>Previous</button>
          <button style={{
            padding: '6px 14px', borderRadius: 8, background: '#FFFFFF',
            color: '#94A3B8', border: '1px solid #E2E8F0', fontSize: 13, cursor: 'not-allowed'
          }}>Next</button>
        </div>
      </div>
    </div>
  );
}
