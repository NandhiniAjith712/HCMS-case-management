import React, { useState, useEffect } from 'react';
import { Search, Plus, ChevronRight, ChevronDown, ShieldCheck, Upload, Download, AlertCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";

const ROLE_COLORS = {
  'hr_executive':    { bg: '#EDE9FE', color: '#7C3AED', label: 'HR Executive' },
  'employee':        { bg: '#DBEAFE', color: '#2563EB', label: 'Employee' },
  'department_head': { bg: '#D1FAE5', color: '#059669', label: 'Department Head' },
  'system_admin':    { bg: '#FEF3C7', color: '#D97706', label: 'System Admin' },
  'support_manager': { bg: '#FEE2E2', color: '#DC2626', label: 'Support Manager' },
};

const USER_FORM = { name: '', email: '', role: '', department: '', phone: '', password: '', can_handle_confidential_cases: false };

function Toggle({ on, onChange, disabled }) {
  return (
    <div onClick={() => !disabled && onChange(!on)}
      style={{ width: 42, height: 24, borderRadius: 999, background: on ? '#1E293B' : '#E2E8F0', cursor: disabled ? 'default' : 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF', position: 'absolute', top: 3, left: on ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </div>
  );
}

function CreateRoleModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const input = { width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', boxSizing: 'border-box', color: '#1E293B' };
  const label = { fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Role name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, description: description.trim(), is_active: isActive })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to create role');
      onCreated(data.data?.name || trimmed);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, width: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: f }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>Create New Role</h2>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Add a new role to the system.</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#94A3B8' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={label}>Role Name <span style={{ color: '#EF4444' }}>*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Finance Manager" style={input} />
          </div>
          <div>
            <label style={label}>Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional role description" style={input} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>Active</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>Enable this role immediately</div>
            </div>
            <Toggle on={isActive} onChange={v => setIsActive(v)} />
          </div>
          {error && <div style={{ fontSize: 13, color: '#EF4444' }}>{error}</div>}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: f }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: '#1E293B', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f, opacity: saving ? 0.6 : 1 }}>{saving ? 'Creating...' : 'Create Role'}</button>
        </div>
      </div>
    </div>
  );
}

function AddUserModal({ deptOptions, roleOptions, currentUserRole, form, setForm, onClose, onSave, onCreateRole }) {
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const input = { width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', boxSizing: 'border-box', color: '#1E293B' };
  const select = { ...input, cursor: 'pointer', appearance: 'auto' };
  const label = { fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 };
  const canCreateRole = currentUserRole === 'system_admin';

  const handleRoleChange = (e) => {
    const value = e.target.value;
    if (value === '__create_new_role__') {
      if (canCreateRole) onCreateRole();
      return;
    }
    set('role', value);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.role) return;
    setSaving(true);
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          department: form.department || null,
          phone: form.phone || null,
          password: form.password || null,
          can_handle_confidential_cases: form.can_handle_confidential_cases
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Failed to create user');
      }
      onSave();
      onClose();
    } catch (err) {
      alert('Failed to create user: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, width: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: f }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>Add User</h2>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Create a new employee or admin account.</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#94A3B8' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div><label style={label}>Full Name</label><input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Jane Doe" style={input} /></div>
            <div><label style={label}>Email</label><input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@company.com" style={input} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={label}>Role</label>
              <select value={form.role} onChange={handleRoleChange} style={select}>
                <option value="">Select role</option>
                {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                {canCreateRole && <option value="__create_new_role__">+ Create New Role</option>}
              </select>
            </div>
            <div>
              <label style={label}>Department</label>
              <select value={form.department} onChange={e => set('department', e.target.value)} style={select}>
                <option value="">Select department</option>
                {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div><label style={label}>Phone</label><input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98765 43210" style={input} /></div>
            <div><label style={label}>Password (optional)</label><input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Leave blank to auto-generate" style={input} /></div>
          </div>
          {(form.role === 'hr_executive' || form.role === 'department_head') && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>Can Handle Confidential Cases</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Allow this user to participate in confidential case assignments</div>
              </div>
              <Toggle on={form.can_handle_confidential_cases} onChange={v => set('can_handle_confidential_cases', v)} />
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: f }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !form.name.trim() || !form.email.trim() || !form.role} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: '#1E293B', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f, opacity: saving || !form.name.trim() || !form.email.trim() || !form.role ? 0.6 : 1 }}>{saving ? 'Saving...' : 'Create User'}</button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, size = 32 }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#1E293B', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 700, flexShrink: 0, letterSpacing: '0.02em' }}>
      {initials}
    </div>
  );
}

function Dropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: value ? '#EFF6FF' : '#FFFFFF', color: value ? '#3B82F6' : '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: f, whiteSpace: 'nowrap' }}>
        {value || label} <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 40, left: 0, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 100, minWidth: 150, padding: '4px 0' }}>
          <div onClick={() => { onChange(''); setOpen(false); }} style={{ padding: '8px 14px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>All</div>
          {options.map(o => (
            <div key={o} onClick={() => { onChange(o); setOpen(false); }} style={{ padding: '8px 14px', fontSize: 13, color: value === o ? '#3B82F6' : '#1E293B', background: value === o ? '#EFF6FF' : 'transparent', cursor: 'pointer' }}>{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRole] = useState('');
  const [deptFilter, setDept] = useState('');
  const [statusFilter, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deptOptions, setDeptOptions] = useState([]);
  const [roleOptions, setRoleOptions] = useState([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false);
  const [userForm, setUserForm] = useState(USER_FORM);

  const getToken = () => sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');

  const fetchRoles = async () => {
    try {
      const token = getToken();
      const res = await fetch('/api/admin/roles', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const roles = (data.data || []).map(r => ({ value: r.name, label: r.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }));
        setRoleOptions(roles);
      }
    } catch (err) { console.error('Failed to fetch roles:', err); }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (roleFilter) params.append('role', roleFilter);
        if (deptFilter) params.append('department', deptFilter);
        if (statusFilter) params.append('status', statusFilter);

        const res = await fetch(`/api/admin/users?${params.toString()}`, { headers });
        if (!res.ok) throw new Error('Failed to fetch users');
        const data = await res.json();
        setUsers(data.data || []);
      } catch (err) {
        console.error('Error fetching users:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [search, roleFilter, deptFilter, statusFilter]);

  const refreshUsers = async () => {
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (roleFilter) params.append('role', roleFilter);
      if (deptFilter) params.append('department', deptFilter);
      if (statusFilter) params.append('status', statusFilter);
      const res = await fetch(`/api/admin/users?${params.toString()}`, { headers });
      if (res.ok) { const data = await res.json(); setUsers(data.data || []); }
    } catch (err) { console.error('Refresh failed:', err); }
  };

  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const res = await fetch('/api/admin/departments?limit=100', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) { const d = await res.json(); setDeptOptions(Array.from(new Set((d.data || []).map(x => x.name)))); }
      } catch {}
    };
    fetchDepts();
  }, []);

  const STATUSES = ['active', 'inactive'];

  const filtered = users;

  const th = { padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #E2E8F0' };
  const outBtn = (extra = {}) => ({ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: f, ...extra });

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading users...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading users</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: f }}>
      {showUserModal && (
        <AddUserModal
          deptOptions={deptOptions}
          roleOptions={roleOptions}
          currentUserRole={user?.role}
          form={userForm}
          setForm={setUserForm}
          onClose={() => setShowUserModal(false)}
          onSave={() => {
            setUserForm(USER_FORM);
            refreshUsers();
          }}
          onCreateRole={() => setShowCreateRoleModal(true)}
        />
      )}
      {showCreateRoleModal && (
        <CreateRoleModal
          onClose={() => setShowCreateRoleModal(false)}
          onCreated={async (newRoleName) => {
            await fetchRoles();
            setUserForm(prev => ({ ...prev, role: newRoleName }));
            setShowCreateRoleModal(false);
          }}
        />
      )}
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1E293B', margin: '0 0 3px' }}>User Management</h1>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Manage employees, HR executives, department heads, and admins.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => navigate('/hcms/admin-roles')} style={outBtn()}>
              <ShieldCheck size={14} color="#64748B" />Permissions
            </button>
            <button style={outBtn()}>
              <Upload size={14} color="#64748B" />Import
            </button>
            <button style={outBtn()}>
              <Download size={14} color="#64748B" />Export
            </button>
            <button onClick={() => { setUserForm(USER_FORM); setShowUserModal(true); }} style={{ ...outBtn(), background: '#1E293B', color: '#FFFFFF', border: 'none', fontWeight: 600 }}>
              <Plus size={14} />Add User
            </button>
          </div>
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '7px 14px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
          <Search size={14} color="#94A3B8" />
          <input type="text" placeholder="Search by name, email, employee ID..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: f, color: '#1E293B', background: 'transparent' }} />
        </div>
        <Dropdown label="Role"       value={roleFilter ? roleOptions.find(r => r.value === roleFilter)?.label : ''} options={roleOptions.map(r => r.label)} onChange={(val) => setRole(roleOptions.find(r => r.label === val)?.value || '')} />
        <Dropdown label="Department" value={deptFilter} options={deptOptions} onChange={setDept} />
        <Dropdown label="Status"     value={statusFilter ? (statusFilter === 'active' ? 'Active' : 'Inactive') : ''} options={['Active', 'Inactive']} onChange={(val) => setStatus(val === 'Active' ? 'active' : 'inactive')} />
        <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap' }}>{filtered.length} users</span>
      </div>

      {/* Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            No users found
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Employee ID</th>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Department</th>
                <th style={th}>Role</th>
                <th style={th}>Confidential Handler</th>
                <th style={th}>Status</th>
                <th style={{ ...th, width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const rc = ROLE_COLORS[u.role] || { bg: '#F1F5F9', color: '#64748B', label: u.role };
                return (
                  <tr key={u.id}
                    onClick={() => navigate(`/hcms/admin-users/${u.id}`)}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600, color: '#3B82F6' }}>{u.employee_id || '—'}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={u.full_name || u.name || 'User'} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{u.full_name || u.name || '—'}</div>
                          <div style={{ fontSize: 12, color: '#94A3B8' }}>Joined {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 13, color: '#475569' }}>{u.email || '—'}</td>
                    <td style={{ padding: '13px 16px', fontSize: 13, color: '#475569' }}>{u.department_name || '—'}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 999, background: rc.bg, color: rc.color, fontSize: 12, fontWeight: 600 }}>{rc.label}</span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {(u.role === 'hr_executive' || u.role === 'department_head') ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: u.can_handle_confidential_cases === 1 ? '#EDE9FE' : '#F1F5F9', color: u.can_handle_confidential_cases === 1 ? '#7C3AED' : '#94A3B8', fontSize: 12, fontWeight: 600 }}>
                          {u.can_handle_confidential_cases === 1 ? 'Yes' : 'No'}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#94A3B8' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: (u.is_active === 1 || u.account_status === 'active') ? '#D1FAE5' : '#F1F5F9', color: (u.is_active === 1 || u.account_status === 'active') ? '#059669' : '#94A3B8', fontSize: 12, fontWeight: 600 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: (u.is_active === 1 || u.account_status === 'active') ? '#059669' : '#94A3B8' }} />{(u.is_active === 1 || u.account_status === 'active') ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <ChevronRight size={16} color="#CBD5E1" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
