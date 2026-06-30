import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Pencil, Plus, CheckCircle, Trash2, AlertCircle, X, Power } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";

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

export default function AdminDepartmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dept, setDept] = useState(null);
  const [subcats, setSubcats] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [editSubcat, setEditSubcat] = useState(null);
  const [editSubcatName, setEditSubcatName] = useState('');
  const [editDept, setEditDept] = useState(false);
  const [editDeptForm, setEditDeptForm] = useState({ name: '', description: '', head_title: '', status: 'active' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [confirmModal, setConfirmModal] = useState(null);

  const getToken = () => sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
  const getHeaders = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  useEffect(() => {
    const fetchDepartment = async () => {
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        const res = await fetch(`/api/admin/departments/${id}`, { headers });
        if (!res.ok) throw new Error('Failed to fetch department');
        const data = await res.json();
        setDept(data);
        setSubcats(data.subcategories || []);
      } catch (err) {
        console.error('Error fetching department:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDepartment();
  }, [id]);

  const handleAdd = async () => {
    if (newCat.trim()) {
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        const res = await fetch(`/api/admin/departments/${id}/subcategories`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: newCat.trim() })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to add subcategory');

        // Refresh subcategories
        const deptRes = await fetch(`/api/admin/departments/${id}`, { headers });
        const deptData = await deptRes.json();
        setSubcats(deptData.subcategories || []);

        setNewCat('');
        setAdding(false);
        showSuccess('Subcategory added successfully');
      } catch (err) {
        console.error('Error adding subcategory:', err);
        alert('Failed to add subcategory: ' + err.message);
      }
    }
  };

  const handleDelete = (subId) => {
    setConfirmModal({
      title: 'Delete Subcategory',
      message: 'Delete this subcategory? This action cannot be undone.',
      confirmText: 'Delete',
      confirmColor: '#DC2626',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch(`/api/admin/departments/${id}/subcategories/${subId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${getToken()}` }
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || data.message || 'Failed to delete subcategory');
          await refresh();
          showSuccess('Subcategory deleted successfully');
        } catch (err) {
          console.error('Error deleting subcategory:', err);
          alert('Failed to delete subcategory: ' + err.message);
        }
      }
    });
  };

  const handleEditSubcat = (cat) => {
    setEditSubcat(cat);
    setEditSubcatName(cat.name);
  };

  const handleUpdateSubcat = async () => {
    if (!editSubcat || !editSubcatName.trim()) return;
    try {
      const res = await fetch(`/api/admin/departments/${id}/subcategories/${editSubcat.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ name: editSubcatName.trim(), description: editSubcat.description || '', display_order: editSubcat.display_order || 0, is_active: editSubcat.is_active !== 0 ? 1 : 0 })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to update subcategory');
      setEditSubcat(null);
      setEditSubcatName('');
      await refresh();
      showSuccess('Subcategory updated successfully');
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const handleDeptUpdate = async () => {
    try {
      const res = await fetch(`/api/admin/departments/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          name: editDeptForm.name,
          description: editDeptForm.description,
          head_id: dept.head_id || null,
          head_title: editDeptForm.head_title,
          status: editDeptForm.status
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to update department');
      setEditDept(false);
      await refresh();
      showSuccess('Department updated successfully');
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const handleDeptToggle = async () => {
    try {
      const nextStatus = dept.status === 'active' ? 'inactive' : 'active';
      const res = await fetch(`/api/admin/departments/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          name: dept.name,
          description: dept.description,
          head_id: dept.head_id || null,
          head_title: dept.head_title,
          status: nextStatus
        })
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

  const refresh = async () => {
    try {
      const res = await fetch(`/api/admin/departments/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error('Failed to fetch department');
      const data = await res.json();
      setDept(data);
      setSubcats(data.subcategories || []);
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading department...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading department</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!dept) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Department not found</div>
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
      {/* Breadcrumb */}
      <button onClick={() => navigate('/hcms/admin-departments')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 20, fontFamily: f }}>
        <ArrowLeft size={14} />Back to Departments
      </button>

      {/* Header card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, padding: '22px 28px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Building2 size={24} color="#94A3B8" />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Tenant: Acme Corp</div>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1E293B', margin: '0 0 6px' }}>{dept.name}</h1>
              <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>{dept.description || 'No description'}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => { setEditDept(true); setEditDeptForm({ name: dept.name, description: dept.description || '', head_title: dept.head_title || '', status: dept.status || 'active' }); }} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: f }}>
              <Pencil size={13} />Edit
            </button>
            <button onClick={handleDeptToggle} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 13, fontWeight: 600, color: dept.status === 'active' ? '#DC2626' : '#059669', cursor: 'pointer', fontFamily: f }}>
              <Power size={13} />{dept.status === 'active' ? 'Deactivate' : 'Activate'}
            </button>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 14px', borderRadius: 8, background: dept.status === 'active' ? '#D1FAE5' : '#FEE2E2', color: dept.status === 'active' ? '#059669' : '#DC2626', fontSize: 13, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dept.status === 'active' ? '#059669' : '#DC2626' }} />{dept.status === 'active' ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        {editDept && (
          <div style={{ marginTop: 18, padding: 18, border: '1px solid #E2E8F0', borderRadius: 12, background: '#FAFBFC' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Edit Department</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input value={editDeptForm.name} onChange={e => setEditDeptForm(f => ({ ...f, name: e.target.value }))} placeholder="Department name" style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', color: '#1E293B' }} />
              <textarea value={editDeptForm.description} onChange={e => setEditDeptForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" rows={2} style={{ width: '100%', padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', color: '#1E293B', resize: 'vertical' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <input value={editDeptForm.head_title} onChange={e => setEditDeptForm(f => ({ ...f, head_title: e.target.value }))} placeholder="Head title" style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', color: '#1E293B' }} />
                <select value={editDeptForm.status} onChange={e => setEditDeptForm(f => ({ ...f, status: e.target.value }))} style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', color: '#1E293B', cursor: 'pointer' }}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditDept(false)} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: f }}>Cancel</button>
                <button onClick={handleDeptUpdate} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: '#1E293B', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f }}>Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Info row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderTop: '1px solid #F1F5F9', paddingTop: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Department Head</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 2 }}>{dept.head_name || 'Not assigned'}</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>{dept.head_title || 'Department Head'}</div>
          </div>
          <div style={{ borderLeft: '1px solid #F1F5F9', paddingLeft: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Status</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 999, background: dept.status === 'active' ? '#D1FAE5' : '#FEE2E2', color: dept.status === 'active' ? '#059669' : '#DC2626', fontSize: 13, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dept.status === 'active' ? '#059669' : '#DC2626' }} />{dept.status === 'active' ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div style={{ borderLeft: '1px solid #F1F5F9', paddingLeft: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Subcategories</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1E293B' }}>{subcats.length}</div>
          </div>
        </div>
      </div>

      {/* Subcategories card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, padding: '22px 28px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>Subcategories</h2>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Ticket routing categories under {dept.name}</p>
          </div>
          <button onClick={() => setAdding(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 8, background: '#1E293B', color: '#FFFFFF', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f }}>
            <Plus size={14} />Add Subcategory
          </button>
        </div>

        {/* Add input */}
        {adding && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input autoFocus value={newCat} onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
              placeholder="New subcategory name..."
              style={{ flex: 1, height: 36, padding: '0 12px', border: '1px solid #3B82F6', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', color: '#1E293B' }} />
            <button onClick={handleAdd} style={{ height: 36, padding: '0 14px', borderRadius: 8, background: '#1E293B', color: '#FFFFFF', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f }}>Add</button>
            <button onClick={() => setAdding(false)} style={{ height: 36, padding: '0 14px', borderRadius: 8, background: '#FFFFFF', color: '#64748B', border: '1px solid #E2E8F0', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f }}>Cancel</button>
          </div>
        )}

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {subcats.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              No subcategories yet
            </div>
          ) : (
            subcats.map((cat, idx) => (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: idx < subcats.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                <span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600, minWidth: 22 }}>{idx + 1}</span>
                <CheckCircle size={16} color="#059669" />
                {editSubcat?.id === cat.id ? (
                  <>
                    <input autoFocus value={editSubcatName} onChange={e => setEditSubcatName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleUpdateSubcat(); if (e.key === 'Escape') { setEditSubcat(null); setEditSubcatName(''); } }} style={{ flex: 1, height: 34, padding: '0 10px', border: '1px solid #3B82F6', borderRadius: 6, fontSize: 13, fontFamily: f, color: '#1E293B' }} />
                    <button onClick={handleUpdateSubcat} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#059669' }}><CheckCircle size={16} /></button>
                    <button onClick={() => { setEditSubcat(null); setEditSubcatName(''); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#94A3B8' }}><X size={16} /></button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#1E293B' }}>{cat.name}</span>
                    <button onClick={() => handleEditSubcat(cat)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#94A3B8' }}><Pencil size={15} /></button>
                    <button onClick={() => handleDelete(cat.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#EF4444' }}><Trash2 size={15} /></button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
