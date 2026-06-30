import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, ChevronDown, X, AlertCircle } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";

const STATUSES = ['active', 'inactive'];

function Avatar({ initials, size = 32 }) {
  const colors = { R: '#DBEAFE', A: '#D1FAE5', V: '#FEF3C7', S: '#FEE2E2', P: '#EDE9FE', K: '#DBEAFE', D: '#D1FAE5' };
  const textColors = { R: '#3B82F6', A: '#22C55E', V: '#F59E0B', S: '#EF4444', P: '#8B5CF6', K: '#3B82F6', D: '#22C55E' };
  const first = initials?.[0] || 'U';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: colors[first] || '#F1F5F9',
      color: textColors[first] || '#64748B',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: f
    }}>{initials}</div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    'active': { bg: '#FEF3C7', color: '#D97706', dot: '#D97706', label: 'Active' },
    'inactive': { bg: '#F1F5F9', color: '#64748B', dot: '#94A3B8', label: 'Inactive' },
  };
  const s = styles[status] || styles['active'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: s.bg, color: s.color, fontSize: 12, fontWeight: 500 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {s.label}
    </span>
  );
}

function TicketsBadge({ count }) {
  if (count === 0) return <span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 500 }}>0</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: '#FEF3C7', color: '#D97706', fontSize: 12, fontWeight: 700 }}>
      {count}
    </span>
  );
}

function Dropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: value ? '#EFF6FF' : '#FFFFFF', color: value ? '#3B82F6' : '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: f }}>
        {value || label} <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 38, left: 0, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 50, minWidth: 160, padding: '4px 0' }}>
          <div onClick={() => { onChange(''); setOpen(false); }} style={{ padding: '8px 14px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>All</div>
          {options.map(o => (
            <div key={o} onClick={() => { onChange(o); setOpen(false); }} style={{ padding: '8px 14px', fontSize: 13, color: value === o ? '#3B82F6' : '#1E293B', background: value === o ? '#EFF6FF' : 'transparent', cursor: 'pointer', fontWeight: value === o ? 600 : 400 }}>{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HREmployees() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setLoading(true);
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        
        const params = new URLSearchParams();
        params.append('role', 'employee');
        if (search) params.append('search', search);
        if (deptFilter) params.append('department', deptFilter);
        if (statusFilter) params.append('status', statusFilter);

        const res = await fetch(`/api/admin/users?${params.toString()}`, { headers });
        if (!res.ok) throw new Error('Failed to fetch employees');
        const data = await res.json();
        setEmployees(data.data || []);
        
        const depts = [...new Set((data.data || []).map(e => e.department_name).filter(Boolean))];
        setDepartments(depts);
      } catch (err) {
        console.error('Error fetching employees:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchEmployees();
  }, [search, deptFilter, statusFilter]);

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const activeDepts = [...new Set(employees.filter(e => e.status === 'active').map(e => e.department_name))].length;
  const totalActiveTickets = employees.reduce((sum, e) => sum + (e.active_tickets_count || 0), 0);
  const hasFilters = search || deptFilter || statusFilter;

  const thStyle = { padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #E2E8F0', background: '#FFFFFF', whiteSpace: 'nowrap' };

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading employees...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading employees</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: f }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>Employees</h1>
          <p style={{ fontSize: 13, color: '#F59E0B', margin: 0, fontWeight: 500 }}>
            Directory of {employees.length} employees · {totalActiveTickets} active tickets across teams.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 12, border: '1px solid #E2E8F0', background: '#FFFFFF', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>Departments</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>{activeDepts} active</div>
          </div>
        </div>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        {/* Search & filters */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search by employee ID, name or department"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', height: 38, border: '1px solid #E2E8F0', borderRadius: 10, padding: '0 12px 0 36px', fontSize: 13, fontFamily: f, color: '#1E293B', background: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Dropdown label="Department" options={departments} value={deptFilter} onChange={setDeptFilter} />
              <Dropdown label="Status" options={STATUSES} value={statusFilter} onChange={setStatusFilter} />
            </div>
            {hasFilters && (
              <button onClick={() => { setSearch(''); setDeptFilter(''); setStatusFilter(''); }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: 0 }}>
                <X size={13} />Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Employee ID</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Department</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Phone</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Active Tickets</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No employees found</td>
              </tr>
            ) : (
              employees.map((emp, i) => (
                <tr key={emp.id} style={{ borderBottom: i < employees.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{emp.employee_id || `EMP-${emp.id}`}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar initials={getInitials(emp.name)} size={30} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{emp.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#475569' }}>{emp.department_name || '—'}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#475569' }}>{emp.email || '—'}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#475569', whiteSpace: 'nowrap' }}>{emp.phone || '—'}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}><TicketsBadge count={emp.active_tickets_count || 0} /></td>
                  <td style={{ padding: '14px 16px' }}><StatusBadge status={emp.status || 'active'} /></td>
                  <td style={{ padding: '14px 16px' }}></td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#94A3B8' }}>Showing {employees.length} employees</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 12, color: '#64748B', cursor: 'pointer' }}>Previous</button>
            <button style={{ height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 12, color: '#64748B', cursor: 'pointer' }}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
