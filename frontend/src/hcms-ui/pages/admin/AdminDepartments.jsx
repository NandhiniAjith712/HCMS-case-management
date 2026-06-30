import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Pencil, Power, ChevronRight, X, Building2, AlertCircle, Trash2, CheckCircle } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";

const EMPTY_FORM = { name: '', desc: '', head: '', status: 'active', subcategories: '' };

function ConfirmModal({ title, message, confirmText = 'Delete', confirmColor = '#DC2626', onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, width: 420, padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: f }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 8px' }}>{title}</h3>
        <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 20px', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onCancel} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: f }}>Cancel</button>
          <button onClick={onConfirm} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: confirmColor, color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f }}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

function Modal({ onClose, onSave, initial = EMPTY_FORM, title = 'Add Department' }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, width: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: f }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>{title}</h2>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>{title === 'Add Department' ? 'Create a new department and assign a head.' : 'Update department details.'}</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#94A3B8' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Department Name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Talent Acquisition"
              style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', boxSizing: 'border-box', color: '#1E293B' }} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Description</label>
            <textarea value={form.desc} onChange={e => set('desc', e.target.value)} placeholder="Brief description of this department's scope" rows={3}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', resize: 'vertical', boxSizing: 'border-box', color: '#1E293B' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Department Head</label>
              <input value={form.head} onChange={e => set('head', e.target.value)} placeholder="Full name of department head"
                style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', boxSizing: 'border-box', color: '#1E293B' }} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', boxSizing: 'border-box', color: '#1E293B', cursor: 'pointer', appearance: 'auto' }}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Subcategories (comma separated)</label>
            <input value={form.subcategories} onChange={e => set('subcategories', e.target.value)} placeholder="e.g. Onboarding, Background Verification"
              style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', boxSizing: 'border-box', color: '#1E293B' }} />
          </div>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: f }}>Cancel</button>
          <button onClick={() => { if (form.name.trim()) { onSave(form); onClose(); } }} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: '#1E293B', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f }}>{title === 'Add Department' ? 'Create Department' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDepartments() {
  const navigate = useNavigate();
  const [depts, setDepts] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editDept, setEditDept] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [confirmModal, setConfirmModal] = useState(null);

  const getToken = () => sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
  const getHeaders = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const refresh = async () => {
    try {
      const res = await fetch('/api/admin/departments', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error('Failed to fetch departments');
      const data = await res.json();
      setDepts(data.data || []);
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        const res = await fetch('/api/admin/departments', { headers });
        if (!res.ok) throw new Error('Failed to fetch departments');
        const data = await res.json();
        setDepts(data.data || []);
      } catch (err) {
        console.error('Error fetching departments:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDepartments();
  }, []);

  const filtered = depts.filter(d => {
    const q = search.toLowerCase();
    return !q || d.name.toLowerCase().includes(q) || d.head_name?.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q);
  });

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleSave = async (form) => {
    try {
      const body = {
        name: form.name,
        description: form.desc,
        head_id: editDept ? editDept.head_id || null : null,
        head_title: form.head,
        status: form.status
      };

      const isEdit = !!editDept;
      const res = await fetch(isEdit ? `/api/admin/departments/${editDept.id}` : '/api/admin/departments', {
        method: isEdit ? 'PUT' : 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body)
      });

      const deptData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(deptData.error || deptData.message || (isEdit ? 'Failed to update department' : 'Failed to create department'));
      const deptId = isEdit ? editDept.id : deptData.id;

      // Add subcategories if provided (only for new departments; edit subcategories on detail page)
      if (!isEdit && form.subcategories) {
        const subcategories = form.subcategories.split(',').map(s => s.trim()).filter(s => s);
        for (const sub of subcategories) {
          await fetch(`/api/admin/departments/${deptId}/subcategories`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ name: sub })
          });
        }
      }

      await refresh();
      setEditDept(null);
      showSuccess(isEdit ? 'Department updated successfully' : 'Department created successfully');
    } catch (err) {
      console.error('Error saving department:', err);
      alert(err.message);
    }
  };

  const handleToggle = async (d, e) => {
    e.stopPropagation();
    try {
      const nextStatus = d.status === 'active' ? 'inactive' : 'active';
      const res = await fetch(`/api/admin/departments/${d.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ name: d.name, description: d.description, head_id: d.head_id, head_title: d.head_title, status: nextStatus })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to toggle status');
      await refresh();
      showSuccess(nextStatus === 'active' ? 'Department activated successfully' : 'Department deactivated successfully');
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const handleDelete = (d, e) => {
    e.stopPropagation();
    setConfirmModal({
      title: 'Delete Department',
      message: `Delete department "${d.name}" and all its subcategories? This action cannot be undone.`,
      confirmText: 'Delete',
      confirmColor: '#DC2626',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch(`/api/admin/departments/${d.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || data.message || 'Failed to delete department');
          await refresh();
          showSuccess('Department deleted successfully');
        } catch (err) {
          console.error(err);
          alert(err.message);
        }
      }
    });
  };

  const th = { padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #E2E8F0' };
  const actionBtn = { width: 28, height: 28, borderRadius: 6, border: '1px solid #E2E8F0', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading departments...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading departments</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: f }}>
      {successMsg && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 300, display: 'flex', alignItems: 'center', gap: 10, padding: '16px 24px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
          <CheckCircle size={20} color="#16A34A" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#16A34A' }}>{successMsg}</span>
        </div>
      )}
      {confirmModal && <ConfirmModal title={confirmModal.title} message={confirmModal.message} confirmText={confirmModal.confirmText} confirmColor={confirmModal.confirmColor} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} />}
      {showModal && <Modal onClose={() => setShowModal(false)} onSave={handleSave} />}
      {editDept && <Modal onClose={() => setEditDept(null)} onSave={handleSave} initial={{ name: editDept.name, desc: editDept.description || '', head: editDept.head_title || '', status: editDept.status || 'active', subcategories: '' }} title="Edit Department" />}

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>Departments & Categories</h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Configure departments, assign heads, and manage routing subcategories.</p>
        </div>
        <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px', borderRadius: 10, background: '#1E293B', color: '#FFFFFF', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f }}>
          <Plus size={14} />Add Department
        </button>
      </div>

      {/* Search */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        <Search size={15} color="#94A3B8" />
        <input type="text" placeholder="Search departments, heads, subcategories..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: f, color: '#1E293B', background: 'transparent' }} />
        <span style={{ fontSize: 12, color: '#94A3B8' }}>{filtered.length} of {depts.length}</span>
      </div>

      {/* Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            No departments found
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Department</th>
                <th style={th}>Description</th>
                <th style={th}>Department Head</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={d.id}
                  onClick={() => navigate(`/hcms/admin-departments/${d.id}`)}
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 8, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Building2 size={16} color="#94A3B8" />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{d.name}</div>
                        <div style={{ fontSize: 12, color: '#94A3B8' }}>{d.subcategory_count || 0} subcategories</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', maxWidth: 280 }}>
                    <p style={{ fontSize: 13, color: '#475569', margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.description || 'No description'}</p>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{d.head_name || 'Not assigned'}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>{d.head_title || 'Department Head'}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: d.status === 'active' ? '#D1FAE5' : '#FEE2E2', color: d.status === 'active' ? '#059669' : '#DC2626', fontSize: 12, fontWeight: 600 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.status === 'active' ? '#059669' : '#DC2626' }} />{d.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <button onClick={e => { e.stopPropagation(); setEditDept(d); }} style={actionBtn}><Pencil size={13} color="#64748B" /></button>
                      <button onClick={e => handleToggle(d, e)} style={actionBtn}><Power size={13} color={d.status === 'active' ? '#059669' : '#DC2626'} /></button>
                      <button onClick={e => handleDelete(d, e)} style={actionBtn}><Trash2 size={13} color="#EF4444" /></button>
                      <button onClick={e => { e.stopPropagation(); navigate(`/hcms/admin-departments/${d.id}`); }} style={actionBtn}><ChevronRight size={13} color="#94A3B8" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
