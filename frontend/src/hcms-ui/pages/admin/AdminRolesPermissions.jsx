import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Pencil, RotateCcw, Save, AlertCircle } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";

const PERMISSION_GROUPS = [
  {
    group: 'TICKETS',
    items: [
      { id: 'create_ticket',  label: 'Create Ticket' },
      { id: 'reply_ticket',   label: 'Reply Ticket' },
      { id: 'update_status',  label: 'Update Status' },
      { id: 'escalate',       label: 'Escalate' },
    ]
  },
  {
    group: 'WORKFLOW',
    items: [
      { id: 'approve',  label: 'Approve' },
      { id: 'reject',   label: 'Reject' },
    ]
  },
  {
    group: 'ADMINISTRATION',
    items: [
      { id: 'manage_users',       label: 'Manage Users' },
      { id: 'manage_routing',     label: 'Manage Routing' },
      { id: 'manage_permissions', label: 'Manage Permissions' },
    ]
  },
];

function Toggle({ on, onChange, disabled }) {
  return (
    <div onClick={() => !disabled && onChange(!on)}
      style={{ width: 42, height: 24, borderRadius: 999, background: on ? '#1E293B' : '#E2E8F0', cursor: disabled ? 'default' : 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF', position: 'absolute', top: 3, left: on ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </div>
  );
}

export default function AdminRolesPermissions() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [perms, setPerms] = useState({});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch roles
        const rolesRes = await fetch('/api/admin/roles', { headers });
        if (!rolesRes.ok) throw new Error('Failed to fetch roles');
        const rolesData = await rolesRes.json();
        setRoles(rolesData.data || []);

        if (rolesData.data && rolesData.data.length > 0) {
          setSelectedRole(rolesData.data[0].id);
        }
      } catch (err) {
        console.error('Error fetching roles:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!selectedRole) return;
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const res = await fetch(`/api/admin/permissions/${selectedRole}`, { headers });
        if (!res.ok) throw new Error('Failed to fetch permissions');
        const data = await res.json();
        setPerms(data.data || {});
      } catch (err) {
        console.error('Error fetching permissions:', err);
        setError(err.message);
      }
    };
    fetchPermissions();
  }, [selectedRole]);

  const currentPerms = perms || {};
  const enabledCount = Object.values(currentPerms).filter(Boolean).length;
  const totalCount = PERMISSION_GROUPS.reduce((acc, pg) => acc + pg.items.length, 0);

  const toggle = (permId) => {
    if (!editing) return;
    setPerms(prev => ({ ...prev, [permId]: !prev[permId] }));
  };

  const handleReset = async () => {
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`/api/admin/permissions/${selectedRole}`, { headers });
      if (!res.ok) throw new Error('Failed to reset permissions');
      const data = await res.json();
      setPerms(data.data || {});
    } catch (err) {
      console.error('Error resetting permissions:', err);
      alert('Failed to reset permissions: ' + err.message);
    }
  };

  const handleSave = async () => {
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      const res = await fetch(`/api/admin/permissions/${selectedRole}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ permissions: perms })
      });
      if (!res.ok) throw new Error('Failed to save permissions');
      setEditing(false);
    } catch (err) {
      console.error('Error saving permissions:', err);
      alert('Failed to save permissions: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading roles and permissions...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading permissions</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: f }}>
      {/* Breadcrumb */}
      <button onClick={() => navigate('/hcms/admin-users')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 20, fontFamily: f }}>
        <ArrowLeft size={14} />Back to Users
      </button>

      {/* Page title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Tenant: Acme Corp</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>Roles &amp; Permissions</h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Configure what each role can do across the workspace.</p>
        </div>
        <button onClick={() => setEditing(e => !e)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid #E2E8F0', background: editing ? '#1E293B' : '#FFFFFF', color: editing ? '#FFFFFF' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f }}>
          <Pencil size={13} />Edit Permission
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Left: role list */}
        <div style={{ width: 200, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)', flexShrink: 0 }}>
          <div style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #F1F5F9' }}>Role</div>
          {roles.length === 0 ? (
            <div style={{ padding: '20px 14px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              No roles found
            </div>
          ) : (
            roles.map(r => {
              const active = selectedRole === r.id;
              const rolePermsCount = Object.values(perms).filter(Boolean).length;
              return (
                <div key={r.id} onClick={() => setSelectedRole(r.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', cursor: 'pointer', background: active ? '#1E293B' : 'transparent', borderBottom: '1px solid #F1F5F9' }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#F8FAFC'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={14} color={active ? '#FFFFFF' : '#94A3B8'} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#FFFFFF' : '#1E293B' }}>{r.name}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#FFFFFF' : '#94A3B8' }}>{active ? rolePermsCount : r.user_count || 0}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Right: permissions */}
        <div style={{ flex: 1 }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)', marginBottom: 16 }}>
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ padding: '5px 14px', background: '#F1F5F9', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                {roles.find(r => r.id === selectedRole)?.name || 'Select Role'}
                <span style={{ color: '#94A3B8', fontSize: 12 }}>▾</span>
              </div>
              <span style={{ fontSize: 13, color: '#64748B' }}>{enabledCount} of {totalCount} permissions enabled</span>
            </div>

            {/* Permissions table */}
            <div style={{ padding: '0 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Allowed</span>
              </div>

              {PERMISSION_GROUPS.map(pg => (
                <div key={pg.group}>
                  <div style={{ padding: '12px 0 6px', fontSize: 11, fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{pg.group}</div>
                  {pg.items.map((item, idx) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #F8FAFC' }}>
                      <span style={{ fontSize: 13, color: '#1E293B' }}>{item.label}</span>
                      <Toggle on={currentPerms[item.id] || false} onChange={() => toggle(item.id)} disabled={!editing} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Save / Reset */}
          {editing && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: f }}>
                <RotateCcw size={13} />Reset
              </button>
              <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: '#1E293B', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f }}>
                <Save size={13} />Save Changes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
