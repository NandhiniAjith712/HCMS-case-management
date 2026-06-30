import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCases } from '../../services/caseApi';
import {
  Ticket, AlertCircle, Clock, CheckCircle2, ChevronRight, MessageSquareWarning
} from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";
const card = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' };

function getStatusPill(status) {
  const configs = {
    open: { bg: '#FEF2F2', text: '#EF4444', label: 'Open' },
    new: { bg: '#FEF2F2', text: '#EF4444', label: 'Open' },
    in_progress: { bg: '#FEF3C7', text: '#F59E0B', label: 'In Progress' },
    waiting: { bg: '#DBEAFE', text: '#3B82F6', label: 'Waiting' },
    resolved: { bg: '#D1FAE5', text: '#22C55E', label: 'Resolved' },
    closed: { bg: '#E2E8F0', text: '#475569', label: 'Closed' },
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

function getPriorityPill(priority) {
  const configs = {
    high: { bg: '#FEF2F2', text: '#EF4444', label: 'High' },
    medium: { bg: '#FEF3C7', text: '#F59E0B', label: 'Medium' },
    low: { bg: '#DBEAFE', text: '#3B82F6', label: 'Low' },
    critical: { bg: '#FEF2F2', text: '#991B1B', label: 'Critical' },
  };
  const cfg = configs[priority] || configs.medium;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      height: 26, padding: '0 12px', borderRadius: 999,
      background: cfg.bg, color: cfg.text, fontSize: 12, fontWeight: 500
    }}>{cfg.label}</span>
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

export default function HRManagerDashboard() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    setLoading(true);
    try {
      const result = await getCases({ assignedOnly: true });
      if (result.success) {
        setCases(result.cases || []);
      }
    } catch (err) {
      console.error('Failed to load assigned cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = [
    { label: 'Total Assigned', value: cases.length, icon: Ticket, iconBg: '#F1F5F9', iconColor: '#64748B' },
    { label: 'Open', value: cases.filter(c => c.status === 'open' || c.status === 'new').length, icon: AlertCircle, iconBg: '#FEF2F2', iconColor: '#EF4444' },
    { label: 'In Progress', value: cases.filter(c => c.status === 'in_progress').length, icon: Clock, iconBg: '#FEF3C7', iconColor: '#F59E0B' },
    { label: 'Pending Info', value: cases.filter(c => c.status === 'waiting').length, icon: MessageSquareWarning, iconBg: '#DBEAFE', iconColor: '#3B82F6' },
    { label: 'Resolved', value: cases.filter(c => c.status === 'resolved').length, icon: CheckCircle2, iconBg: '#D1FAE5', iconColor: '#22C55E' },
    { label: 'SLA Warning', value: cases.filter(c => c.sla_status === 'warning' || c.sla_status === 'breached').length, icon: AlertCircle, iconBg: '#FEF2F2', iconColor: '#EF4444' },
  ];

  const recentCases = cases.slice(0, 5);

  return (
    <div style={{ fontFamily: f }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B', margin: '0 0 8px' }}>HR Manager Dashboard</h2>
        <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>Cases currently assigned to you</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, marginBottom: 24 }}>
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.label}</span>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: s.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={13} color={s.iconColor} />
                </div>
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: '#1E293B', lineHeight: 1 }}>{loading ? '—' : s.value}</div>
            </div>
          );
        })}
      </div>

      <div style={card}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Recent Assigned Cases</span>
          <button onClick={() => navigate('/hcms/hr-manager-tickets')} style={{ background: 'transparent', border: 'none', color: '#3B82F6', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>View All</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
              {['TICKET ID', 'EMPLOYEE', 'SUBJECT', 'DEPARTMENT', 'PRIORITY', 'STATUS', 'ESCALATION LEVEL', 'SLA REMAINING'].map(h => (
                <th key={h} style={{ padding: '10px 20px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Loading...</td></tr>
            ) : recentCases.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No assigned cases found</td></tr>
            ) : (
              recentCases.map((c, i) => (
                <tr key={c.id} onClick={() => navigate(`/hcms/hr-manager-tickets/${c.id}`)}
                  style={{ borderBottom: i < recentCases.length - 1 ? '1px solid #F8FAFC' : 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '14px 20px', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{c.ticket_id || `#${c.id}`}</td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: '#475569' }}>{c.reporter_name || '—'}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1E293B' }}>
                      <span>{c.title || '—'}</span>
                      <RMBadge mode={c.reporting_mode} />
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: '#475569' }}>{c.department || '—'}</td>
                  <td style={{ padding: '14px 20px' }}>{getPriorityPill(c.priority)}</td>
                  <td style={{ padding: '14px 20px' }}>{getStatusPill(c.status)}</td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: '#475569' }}>{c.escalation_level || '—'}</td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: '#EF4444', fontWeight: 600 }}>{formatRemaining(c.resolution_sla_deadline)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
