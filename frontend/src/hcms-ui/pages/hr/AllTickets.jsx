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
      display: 'inline-flex', alignItems: 'center', gap: 6,
      height: 26, padding: '0 12px', borderRadius: 999,
      background: cfg.bg, color: cfg.text, fontSize: 12, fontWeight: 500
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
      display: 'inline-flex', alignItems: 'center', gap: 6,
      height: 26, padding: '0 12px', borderRadius: 999,
      background: cfg.bg, color: cfg.text, fontSize: 12, fontWeight: 500
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

export default function AllTickets() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    setLoading(true);
    try {
      const result = await getCases();
      if (result.success) {
        setCases(result.cases || []);
      }
    } catch (err) {
      console.error('Failed to load cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const displayData = cases;

  return (
    <div style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: '0 0 6px' }}>All tickets</h1>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>All tickets across the organization.</p>
      </div>

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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <FilterDropdown label="Status" />
          <FilterDropdown label="Priority" />
          <FilterDropdown label="Category" />
        </div>
        <button style={{
          background: 'transparent', border: 'none', color: '#64748B',
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
        }}>
          Clear filters
        </button>
      </div>

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
            ) : displayData.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13 }}>No tickets found</td></tr>
            ) : (
              displayData.map((row, i) => (
                <tr
                  key={row.id}
                  onClick={() => navigate(`/hcms/tickets/${row.id}`)}
                  style={{
                    borderBottom: i < displayData.length - 1 ? '1px solid #F1F5F9' : 'none',
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
                  <td style={{ padding: '14px 16px' }}><PriorityBadge priority={row.priority} /></td>
                  <td style={{ padding: '14px 16px' }}><StatusBadge status={row.status} /></td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748B' }}>
                    {row.response_sla_deadline ? new Date(row.response_sla_deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748B' }}>{row.updated_at ? new Date(row.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
        <span style={{ fontSize: 13, color: '#64748B' }}>Showing {displayData.length} of {displayData.length} tickets</span>
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
