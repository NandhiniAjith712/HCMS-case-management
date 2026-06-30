import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, KeyRound, Lock, Power, Mail, Phone, Building2, ShieldCheck, Clock, Calendar, AlertCircle, X } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";

const ROLE_COLORS = {
  'hr_executive':    { bg: '#EDE9FE', color: '#7C3AED', label: 'HR Executive' },
  'user':            { bg: '#DBEAFE', color: '#2563EB', label: 'Employee' },
  'department_head': { bg: '#D1FAE5', color: '#059669', label: 'Department Head' },
  'system_admin':    { bg: '#FEF3C7', color: '#D97706', label: 'System Admin' },
  'support_manager': { bg: '#FEE2E2', color: '#DC2626', label: 'Support Manager' },
};

function Avatar({ name, size = 64 }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#1E293B', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.33, fontWeight: 700, flexShrink: 0, letterSpacing: '0.02em' }}>
      {initials}
    </div>
  );
}

function InfoRow({ Icon, label, value, blue }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={14} color="#64748B" />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: blue ? '#3B82F6' : '#1E293B' }}>{value}</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ flex: 1, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#1E293B', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#94A3B8' }}>{sub}</div>
    </div>
  );
}

function Toggle({ on, onChange, disabled }) {
  return (
    <div onClick={() => !disabled && onChange(!on)}
      style={{ width: 42, height: 24, borderRadius: 999, background: on ? '#1E293B' : '#E2E8F0', cursor: disabled ? 'default' : 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF', position: 'absolute', top: 3, left: on ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </div>
  );
}

export default function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: '', department: '', phone: '', can_handle_confidential_cases: false });
  const [passwordForm, setPasswordForm] = useState({ new_password: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        const res = await fetch(`/api/admin/users/${id}`, { headers });
        if (!res.ok) throw new Error('Failed to fetch user');
        const data = await res.json();
        setUser(data.data);
        setEditForm({
          name: data.data.name || data.data.full_name || '',
          email: data.data.email || '',
          role: data.data.role || '',
          department: data.data.department || '',
          phone: data.data.phone || '',
          can_handle_confidential_cases: data.data.can_handle_confidential_cases === 1
        });
      } catch (err) {
        console.error('Error fetching user:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [id]);

  const handleEdit = async () => {
    setSaving(true);
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          can_handle_confidential_cases: editForm.can_handle_confidential_cases
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Failed to update user');
      }
      const data = await res.json();
      setUser({ ...user, ...editForm, can_handle_confidential_cases: editForm.can_handle_confidential_cases ? 1 : 0 });
      setShowEditModal(false);
      alert('User updated successfully');
    } catch (err) {
      alert('Failed to update user: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!passwordForm.new_password) {
      alert('Please enter a new password');
      return;
    }
    setSaving(true);
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const res = await fetch(`/api/admin/users/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: passwordForm.new_password })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Failed to reset password');
      }
      setShowPasswordModal(false);
      setPasswordForm({ new_password: '' });
      alert('Password reset successfully');
    } catch (err) {
      alert('Failed to reset password: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const actionBtn = (extra = {}) => ({ height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: f, ...extra });

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading user details...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading user</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>User not found</div>
        </div>
      </div>
    );
  }

  const rc = ROLE_COLORS[user.role] || { bg: '#F1F5F9', color: '#64748B', label: user.role };

  return (
    <div style={{ fontFamily: f }}>
      {/* Breadcrumb */}
      <button onClick={() => navigate('/hcms/admin-users')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 20, fontFamily: f }}>
        <ArrowLeft size={14} />Back to Users
      </button>

      {/* Profile card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, padding: '24px 28px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Avatar name={user.full_name || user.name || 'User'} size={64} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{user.employee_id || '—'}</div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B', margin: '0 0 8px' }}>{user.full_name || user.name || '—'}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ padding: '3px 10px', borderRadius: 999, background: rc.bg, color: rc.color, fontSize: 12, fontWeight: 600 }}>{rc.label}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: user.status === 'active' ? '#D1FAE5' : '#F1F5F9', color: user.status === 'active' ? '#059669' : '#94A3B8', fontSize: 12, fontWeight: 600 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: user.status === 'active' ? '#059669' : '#94A3B8' }} />{user.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowEditModal(true)} style={actionBtn()}><Pencil size={13} />Edit</button>
            <button onClick={() => setShowPasswordModal(true)} style={actionBtn()}><KeyRound size={13} />Reset Password</button>
            <button style={actionBtn({ color: '#EF4444', borderColor: '#FECACA', background: '#FFF5F5' })}><Power size={13} />Disable</button>
          </div>
        </div>

        {/* Info grid - 2 columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <InfoRow Icon={Mail}       label="Email"       value={user.email || '—'} blue />
          <InfoRow Icon={ShieldCheck} label="Role"       value={rc.label} />
          <InfoRow Icon={Phone}      label="Phone"       value={user.phone || '—'} />
          <InfoRow Icon={Building2}  label="Department"  value={user.department_name || user.department || '—'} blue />
          <InfoRow Icon={Calendar}   label="Joined On"   value={user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'} />
        </div>
      </div>

      {/* Stat cards - only show Tickets Raised for employees */}
      <div style={{ display: 'flex', gap: 16 }}>
        {(user.role === 'user' || user.role === 'employee') && (
          <StatCard label="Tickets Raised"  value={user.ticket_count || 0}        sub="Lifetime activity" />
        )}
        <StatCard label="Failed Attempts" value={user.failed_login_attempts || 0} sub="In the last 24 hours" />
      </div>

      {/* Edit User Modal */}
      {showEditModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: f }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>Edit User</h2>
                <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Update user information.</p>
              </div>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#94A3B8' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Full Name</label><input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', boxSizing: 'border-box', color: '#1E293B' }} /></div>
              <div><label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Email</label><input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', boxSizing: 'border-box', color: '#1E293B' }} /></div>
              <div><label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Role</label><input value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', boxSizing: 'border-box', color: '#1E293B' }} /></div>
              <div><label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Department</label><input value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', boxSizing: 'border-box', color: '#1E293B' }} /></div>
              <div><label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Phone</label><input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', boxSizing: 'border-box', color: '#1E293B' }} /></div>
              {(editForm.role === 'hr_executive' || editForm.role === 'department_head') && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>Can Handle Confidential Cases</div>
                    <div style={{ fontSize: 12, color: '#64748B' }}>Allow this user to participate in confidential case assignments</div>
                  </div>
                  <Toggle on={editForm.can_handle_confidential_cases} onChange={v => setEditForm(f => ({ ...f, can_handle_confidential_cases: v }))} />
                </div>
              )}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowEditModal(false)} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: f }}>Cancel</button>
              <button onClick={handleEdit} disabled={saving} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: '#1E293B', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showPasswordModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: f }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>Reset Password</h2>
                <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Set a new password for this user.</p>
              </div>
              <button onClick={() => setShowPasswordModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#94A3B8' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>New Password</label><input type="password" value={passwordForm.new_password} onChange={e => setPasswordForm(f => ({ ...f, new_password: e.target.value }))} placeholder="Enter new password" style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', boxSizing: 'border-box', color: '#1E293B' }} /></div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowPasswordModal(false)} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: f }}>Cancel</button>
              <button onClick={handleResetPassword} disabled={saving} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: '#1E293B', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f, opacity: saving ? 0.6 : 1 }}>{saving ? 'Resetting...' : 'Reset Password'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
