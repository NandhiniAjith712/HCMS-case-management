import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCases } from '../services/caseApi';
import { StatusBadge, PriorityBadge } from '../components/UIComponents';

function TicketList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState({ status: '', priority: '' });

  useEffect(() => {
    loadCases();
  }, [filter, user]);

  const loadCases = async () => {
    setLoading(true);
    try {
      // Role-based filtering
      const params = { ...filter };
      
      if (user?.role === 'employee') {
        params.ownOnly = true;
      } else if (user?.role === 'department_head') {
        params.escalatedOnly = true;
      }
      // HR and admin see all cases by default
      
      const result = await getCases(params);
      if (result.success) {
        setCases(result.cases || []);
      } else {
        setError(result.message || 'Failed to load cases');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilter(prev => ({ ...prev, [name]: value }));
  };

  const canCreateCase = () => {
    return user?.role === 'employee' || user?.role === 'hr' || user?.role === 'admin';
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading cases...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2>Cases</h2>
        {canCreateCase() && (
          <button
            onClick={() => navigate('/hcms/tickets/new')}
            style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            New Case
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <select
          name="status"
          value={filter.status}
          onChange={handleFilterChange}
          style={{ padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>

        <select
          name="priority"
          value={filter.priority}
          onChange={handleFilterChange}
          style={{ padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
        >
          <option value="">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {error && <div style={{ color: 'red', padding: 8, background: '#fff0f0', borderRadius: 4, marginBottom: 16 }}>{error}</div>}

      {cases.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
          No cases found. {canCreateCase() ? 'Create your first case to get started.' : ''}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Ticket ID</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Title</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Status</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Priority</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Category</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {cases.map(c => (
              <tr
                key={c.id}
                onClick={() => navigate(`/hcms/tickets/${c.id}`)}
                style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
              >
                <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>#{c.id}</td>
                <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{c.title}</td>
                <td style={{ padding: 12 }}>
                  <StatusBadge status={c.status} />
                </td>
                <td style={{ padding: 12 }}>
                  <PriorityBadge priority={c.priority} />
                </td>
                <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>{c.category || '—'}</td>
                <td style={{ padding: 12, fontSize: 14, color: '#6b7280' }}>
                  {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default TicketList;
