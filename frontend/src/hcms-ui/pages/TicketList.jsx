import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCases } from '../services/caseApi';
import { StatusBadge } from '../components/UIComponents';
import { ChevronRight, Filter, Calendar } from 'lucide-react';

const TAB_CONFIG = [
  { key: '', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' }
];

function TicketList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    loadCases();
  }, [activeTab, user?.id]);

  const loadCases = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (activeTab) params.status = activeTab;

      if (user?.role === 'employee') {
        params.ownOnly = true;
      } else if (user?.role === 'department_head') {
        params.escalatedOnly = true;
      }

      const result = await getCases(params);
      if (result.success) {
        setCases(result.cases || []);
      } else {
        setError(result.message || 'Failed to load cases');
      }
    } catch (err) {
      console.error('[TicketList] Failed to load cases:', err);
      setError(err.response?.data?.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusCount = (status) => {
    if (!status) return cases.length;
    return cases.filter(c => c.status === status).length;
  };

  const filteredCases = cases.filter(c => {
    const matchesSearch = !searchQuery ||
      (c.ticket_id || c.id).toString().toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.category?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !categoryFilter || c.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(cases.map(c => c.category).filter(Boolean))];

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#64748B', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>Loading tickets...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      {/* Filter Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: 6 }}>
          {TAB_CONFIG.map(tab => {
            const count = getStatusCount(tab.key);
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 999,
                  background: isActive ? '#0F172A' : '#F1F5F9',
                  color: isActive ? '#FFFFFF' : '#64748B',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: 999,
                  background: isActive ? 'rgba(255,255,255,0.15)' : '#E5E7EB',
                  color: isActive ? '#FFFFFF' : '#64748B',
                  fontSize: 11,
                  fontWeight: 600
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filters Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {/* Category Filter */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Filter size={12} color="#64748B" strokeWidth={2} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Category</span>
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{
                  width: 130,
                  height: 40,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  fontSize: 13,
                  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                  color: '#0F172A',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">All</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Date Filter */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Calendar size={12} color="#64748B" strokeWidth={2} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Date</span>
              </div>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                style={{
                  width: 130,
                  height: 40,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  fontSize: 13,
                  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                  color: '#0F172A',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">Any time</option>
                <option value="today">Today</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
                <option value="year">This year</option>
              </select>
            </div>
          </div>

          <div style={{ fontSize: 13, color: '#64748B' }}>
            Showing {filteredCases.length} of {cases.length}
          </div>
        </div>
      </div>

      {error && <div style={{ padding: 12, background: '#FEF2F2', color: '#EF4444', borderRadius: 10, fontSize: 13 }}>{error}</div>}

      {/* Table Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              {['TICKET ID', 'SUBJECT', 'CATEGORY', 'STATUS', 'UPDATED', ''].map((h, i) => (
                <th key={i} style={{
                  padding: '14px 18px',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: '#64748B',
                  textAlign: 'left',
                  letterSpacing: '1px',
                  whiteSpace: 'nowrap'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredCases.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13 }}>No tickets found</td>
              </tr>
            ) : (
              filteredCases.map(c => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/hcms/tickets/${c.id}`)}
                  style={{
                    borderBottom: '1px solid #E2E8F0',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                    height: 64
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#FAFBFC'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
                >
                  <td style={{ padding: '0 18px', fontSize: 13, color: '#64748B', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    TKT-{c.ticket_id || String(c.id).padStart(4, '0')}
                  </td>
                  <td style={{ padding: '0 18px', fontSize: 14, fontWeight: 600, color: '#0F172A' }}>
                    {c.title}
                  </td>
                  <td style={{ padding: '0 18px', fontSize: 13, color: '#64748B', fontWeight: 400 }}>
                    {c.category || '—'}
                  </td>
                  <td style={{ padding: '0 18px' }}>
                    <StatusBadge status={c.status} />
                  </td>
                  <td style={{ padding: '0 18px', fontSize: 13, color: '#64748B', whiteSpace: 'nowrap' }}>
                    {c.updated_at ? formatDate(c.updated_at) : '—'}
                  </td>
                  <td style={{ padding: '0 18px', textAlign: 'right' }}>
                    <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button style={{
          height: 36,
          padding: '0 14px',
          borderRadius: 10,
          background: '#FFFFFF',
          color: '#64748B',
          border: '1px solid #E2E8F0',
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
          cursor: 'pointer',
          transition: 'background 0.15s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
        >
          Previous
        </button>
        <button style={{
          height: 36,
          padding: '0 14px',
          borderRadius: 10,
          background: '#FFFFFF',
          color: '#64748B',
          border: '1px solid #E2E8F0',
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
          cursor: 'pointer',
          transition: 'background 0.15s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

export default TicketList;
