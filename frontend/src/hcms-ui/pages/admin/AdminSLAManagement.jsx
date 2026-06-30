import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Eye, Pencil, Trash2, CheckCircle, XCircle, ChevronDown, ShieldCheck, Clock, AlertTriangle } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";


export default function AdminSLAManagement() {
  const navigate = useNavigate();
  const [slaConfigs, setSlaConfigs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentSubcategories, setDepartmentSubcategories] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedSla, setSelectedSla] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [createForm, setCreateForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState({ open: false, type: 'info', title: '', message: '', onConfirm: null });

  const fetchSLAConfigs = async () => {
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const res = await fetch('/api/sla/configurations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSlaConfigs(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching SLA configs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const res = await fetch('/api/departments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  };

  const fetchDepartmentSubcategories = async (departmentId) => {
    if (!departmentId || departmentSubcategories[departmentId]) return;
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const res = await fetch(`/api/departments/${departmentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDepartmentSubcategories(prev => ({
          ...prev,
          [departmentId]: data.data?.subcategories || []
        }));
      }
    } catch (err) {
      console.error('Error fetching department subcategories:', err);
    }
  };

  useEffect(() => {
    fetchSLAConfigs();
    fetchDepartments();
  }, []);

  const handleCreate = async () => {
    if (!createForm.department_id || !createForm.response_time_minutes || !createForm.resolution_time_minutes) {
      setDialog({ open: true, type: 'error', title: 'Missing Fields', message: 'Department, Response Time, and Resolution Time are required', onConfirm: null });
      return;
    }
    setSaving(true);
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const res = await fetch('/api/sla/configurations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to create SLA configuration');
      }
      setShowCreateModal(false);
      setCreateForm({});
      fetchSLAConfigs();
      setDialog({ open: true, type: 'success', title: 'Success', message: 'SLA configuration created successfully', onConfirm: null });
    } catch (err) {
      setDialog({ open: true, type: 'error', title: 'Error', message: 'Failed to create SLA configuration: ' + err.message, onConfirm: null });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    setSaving(true);
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const res = await fetch(`/api/sla/configurations/${selectedSla.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to update SLA configuration');
      }
      setShowEditModal(false);
      setSelectedSla(null);
      setEditForm({});
      fetchSLAConfigs();
      setDialog({ open: true, type: 'success', title: 'Success', message: 'SLA configuration updated successfully', onConfirm: null });
    } catch (err) {
      setDialog({ open: true, type: 'error', title: 'Error', message: 'Failed to update SLA configuration: ' + err.message, onConfirm: null });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setDialog({
      open: true,
      type: 'confirm',
      title: 'Confirm Delete',
      message: 'Are you sure you want to delete this SLA configuration?',
      onConfirm: async () => {
        setDialog({ open: false, type: 'info', title: '', message: '', onConfirm: null });
        try {
          const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
          const res = await fetch(`/api/sla/configurations/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || 'Failed to delete SLA configuration');
          }
          fetchSLAConfigs();
          setDialog({ open: true, type: 'success', title: 'Success', message: 'SLA configuration deleted successfully', onConfirm: null });
        } catch (err) {
          setDialog({ open: true, type: 'error', title: 'Error', message: 'Failed to delete SLA configuration: ' + err.message, onConfirm: null });
        }
      }
    });
  };

  const handleToggleStatus = async (sla) => {
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const res = await fetch(`/api/sla/configurations/${sla.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sla, is_active: !sla.is_active })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to update SLA configuration');
      }
      fetchSLAConfigs();
    } catch (err) {
      setDialog({ open: true, type: 'error', title: 'Error', message: 'Failed to update SLA configuration: ' + err.message, onConfirm: null });
    }
  };

  const openEditModal = (sla) => {
    setSelectedSla(sla);
    setEditForm({
      department_id: sla.department_id,
      response_time_minutes: sla.response_time_minutes,
      resolution_time_minutes: sla.resolution_time_minutes,
      escalation_warning_threshold_minutes: sla.escalation_warning_threshold_minutes || (sla.response_time_minutes - 60),
      escalation_breach_threshold_minutes: sla.escalation_breach_threshold_minutes || sla.resolution_time_minutes,
      escalation_level: sla.escalation_level || 'department_head',
      is_active: sla.is_active
    });
    setShowEditModal(true);
  };

  const openViewModal = (sla) => {
    setSelectedSla(sla);
    setShowViewModal(true);
  };

  const filteredConfigs = slaConfigs.filter(sla => {
    const matchesSearch = sla.department_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDepartment = !filterDepartment || sla.department_id === Number(filterDepartment);
    const matchesStatus = !filterStatus || 
      (filterStatus === 'active' && sla.is_active) ||
      (filterStatus === 'inactive' && !sla.is_active);
    return matchesSearch && matchesDepartment && matchesStatus;
  });

  const configuredDepartmentIds = new Set(slaConfigs.map(sla => sla.department_id));
  const availableDepartments = departments.filter(d => !configuredDepartmentIds.has(d.id));

  return (
    <div style={{ padding: '24px 32px', fontFamily: f }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B', margin: 0 }}>SLA Management</h1>
          <p style={{ fontSize: 14, color: '#64748B', margin: '4px 0 0' }}>Configure and manage SLA policies for ticket resolution</p>
        </div>
        <button
          onClick={() => {
            setCreateForm({
              department_id: '',
              response_time_minutes: '',
              resolution_time_minutes: '',
              escalation_warning_threshold_minutes: '',
              escalation_breach_threshold_minutes: '',
              escalation_level: 'department_head',
              is_active: true
            });
            setShowCreateModal(true);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: '#0F172A',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <Plus size={18} />
          Create SLA
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 280 }}>
          <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search SLA configurations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              height: 40,
              padding: '0 12px 0 40px',
              border: '1px solid #E2E8F0',
              borderRadius: 10,
              fontSize: 14,
              outline: 'none',
              background: 'white'
            }}
          />
        </div>
        <select
          value={filterDepartment}
          onChange={(e) => setFilterDepartment(e.target.value)}
          style={{
            height: 40,
            padding: '0 12px',
            border: '1px solid #E2E8F0',
            borderRadius: 10,
            fontSize: 14,
            background: 'white',
            outline: 'none',
            minWidth: 160
          }}
        >
          <option value="">All Departments</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            height: 40,
            padding: '0 12px',
            border: '1px solid #E2E8F0',
            borderRadius: 10,
            fontSize: 14,
            background: 'white',
            outline: 'none',
            minWidth: 140
          }}
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#64748B' }}>Loading...</div>
        ) : filteredConfigs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#64748B' }}>No SLA configurations found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Department</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Response SLA</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Resolution SLA</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last Updated</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredConfigs.map(sla => (
                <tr key={sla.id} style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }} onClick={() => openViewModal(sla)}>
                  <td style={{ padding: '16px', fontSize: 14, fontWeight: 500, color: '#1E293B' }}>{sla.department_name || '—'}</td>
                  <td style={{ padding: '16px', fontSize: 14, color: '#64748B' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={14} />
                      {sla.response_time_minutes} min
                    </div>
                  </td>
                  <td style={{ padding: '16px', fontSize: 14, color: '#64748B' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={14} />
                      {sla.resolution_time_minutes} min
                    </div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span style={{ padding: '4px 10px', borderRadius: 999, background: sla.is_active ? '#D1FAE5' : '#F1F5F9', color: sla.is_active ? '#059669' : '#94A3B8', fontSize: 12, fontWeight: 600 }}>
                      {sla.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '16px', fontSize: 14, color: '#64748B' }}>
                    {sla.updated_at ? new Date(sla.updated_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => openViewModal(sla)}
                        style={{ padding: 6, border: '1px solid #E2E8F0', background: 'white', borderRadius: 6, cursor: 'pointer', color: '#64748B' }}
                        title="View"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => openEditModal(sla)}
                        style={{ padding: 6, border: '1px solid #E2E8F0', background: 'white', borderRadius: 6, cursor: 'pointer', color: '#64748B' }}
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(sla.id)}
                        style={{ padding: 6, border: '1px solid #E2E8F0', background: 'white', borderRadius: 6, cursor: 'pointer', color: '#DC2626' }}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: f }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>Create SLA Configuration</h2>
                <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Configure a new SLA policy for ticket resolution</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><Trash2 size={20} /></button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>Department *</label>
                  {availableDepartments.length === 0 ? (
                    <div style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: '#94A3B8', display: 'flex', alignItems: 'center', background: '#F8FAFC' }}>
                      No new departments available for SLA configuration
                    </div>
                  ) : (
                    <select
                      value={createForm.department_id || ''}
                      onChange={(e) => {
                        const deptId = Number(e.target.value);
                        setCreateForm({ ...createForm, department_id: deptId });
                      }}
                      style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none', background: 'white' }}
                    >
                      <option value="">Select Department</option>
                      {availableDepartments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>Response SLA (minutes) *</label>
                  <input
                    type="number"
                    value={createForm.response_time_minutes || ''}
                    onChange={(e) => setCreateForm({ ...createForm, response_time_minutes: Number(e.target.value) })}
                    style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none' }}
                    placeholder="e.g., 60"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>Resolution SLA (minutes) *</label>
                  <input
                    type="number"
                    value={createForm.resolution_time_minutes || ''}
                    onChange={(e) => setCreateForm({ ...createForm, resolution_time_minutes: Number(e.target.value) })}
                    style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none' }}
                    placeholder="e.g., 480"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>Escalation Warning (minutes)</label>
                  <input
                    type="number"
                    value={createForm.escalation_warning_threshold_minutes || (createForm.response_time_minutes ? createForm.response_time_minutes - 60 : '')}
                    onChange={(e) => setCreateForm({ ...createForm, escalation_warning_threshold_minutes: Number(e.target.value) })}
                    style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none' }}
                    placeholder="Auto: response_time - 60"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>Escalation Breach (minutes)</label>
                  <input
                    type="number"
                    value={createForm.escalation_breach_threshold_minutes || createForm.resolution_time_minutes || ''}
                    onChange={(e) => setCreateForm({ ...createForm, escalation_breach_threshold_minutes: Number(e.target.value) })}
                    style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none' }}
                    placeholder="Auto: resolution_time"
                  />
                </div>
              </div>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="isActive"
                  checked={createForm.is_active !== false}
                  onChange={(e) => setCreateForm({ ...createForm, is_active: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                <label htmlFor="isActive" style={{ fontSize: 14, color: '#1E293B' }}>Active</label>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ padding: '10px 20px', border: '1px solid #E2E8F0', background: 'white', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#64748B' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || availableDepartments.length === 0}
                style={{ padding: '10px 20px', background: '#0F172A', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving || availableDepartments.length === 0 ? 'not-allowed' : 'pointer', opacity: saving || availableDepartments.length === 0 ? 0.6 : 1 }}
              >
                {saving ? 'Creating...' : 'Create SLA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedSla && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: f }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>Edit SLA Configuration</h2>
                <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Update the SLA policy settings</p>
              </div>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><Trash2 size={20} /></button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>Department *</label>
                  <select
                    value={editForm.department_id || ''}
                    onChange={(e) => {
                      const deptId = Number(e.target.value);
                      setEditForm({ ...editForm, department_id: deptId });
                    }}
                    style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none', background: 'white' }}
                  >
                    <option value="">Select Department</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>Response SLA (minutes) *</label>
                  <input
                    type="number"
                    value={editForm.response_time_minutes || ''}
                    onChange={(e) => setEditForm({ ...editForm, response_time_minutes: Number(e.target.value) })}
                    style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>Resolution SLA (minutes) *</label>
                  <input
                    type="number"
                    value={editForm.resolution_time_minutes || ''}
                    onChange={(e) => setEditForm({ ...editForm, resolution_time_minutes: Number(e.target.value) })}
                    style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>Escalation Warning (minutes)</label>
                  <input
                    type="number"
                    value={editForm.escalation_warning_threshold_minutes || (editForm.response_time_minutes ? editForm.response_time_minutes - 60 : '')}
                    onChange={(e) => setEditForm({ ...editForm, escalation_warning_threshold_minutes: Number(e.target.value) })}
                    style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none' }}
                    placeholder="Auto: response_time - 60"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>Escalation Breach (minutes)</label>
                  <input
                    type="number"
                    value={editForm.escalation_breach_threshold_minutes || editForm.resolution_time_minutes || ''}
                    onChange={(e) => setEditForm({ ...editForm, escalation_breach_threshold_minutes: Number(e.target.value) })}
                    style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none' }}
                    placeholder="Auto: resolution_time"
                  />
                </div>
              </div>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={editForm.is_active !== false}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                <label htmlFor="editIsActive" style={{ fontSize: 14, color: '#1E293B' }}>Active</label>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ padding: '10px 20px', border: '1px solid #E2E8F0', background: 'white', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#64748B' }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={saving}
                style={{ padding: '10px 20px', background: '#0F172A', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Updating...' : 'Update SLA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedSla && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: f }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>SLA Configuration Details</h2>
                <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>View SLA policy information</p>
              </div>
              <button onClick={() => setShowViewModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><Trash2 size={20} /></button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Department</label>
                  <div style={{ fontSize: 14, color: '#1E293B', fontWeight: 500 }}>{selectedSla.department_name || '—'}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Response SLA</label>
                  <div style={{ fontSize: 14, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={14} />
                    {selectedSla.response_time_minutes} minutes
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Resolution SLA</label>
                  <div style={{ fontSize: 14, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={14} />
                    {selectedSla.resolution_time_minutes} minutes
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Status</label>
                  <span style={{ padding: '4px 10px', borderRadius: 999, background: selectedSla.is_active ? '#D1FAE5' : '#F1F5F9', color: selectedSla.is_active ? '#059669' : '#94A3B8', fontSize: 12, fontWeight: 600 }}>
                    {selectedSla.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Created By</label>
                  <div style={{ fontSize: 14, color: '#1E293B' }}>{selectedSla.created_by_name || (selectedSla.created_by ? `User #${selectedSla.created_by}` : '—')}</div>
                </div>
              </div>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 8 }}>Audit Information</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13, color: '#64748B' }}>
                  <div>Created: {selectedSla.created_at ? new Date(selectedSla.created_at).toLocaleString() : '—'}</div>
                  <div>Updated: {selectedSla.updated_at ? new Date(selectedSla.updated_at).toLocaleString() : '—'}</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowViewModal(false)}
                style={{ padding: '10px 20px', background: '#0F172A', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog Modal */}
      {dialog.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: 400, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: f, textAlign: 'center' }}>
            <div style={{ marginBottom: 16 }}>
              {dialog.type === 'success' && <CheckCircle size={48} color='#059669' />}
              {dialog.type === 'error' && <XCircle size={48} color='#DC2626' />}
              {dialog.type === 'confirm' && <AlertTriangle size={48} color='#D97706' />}
              {dialog.type === 'info' && <ShieldCheck size={48} color='#2563EB' />}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 8px' }}>{dialog.title}</h3>
            <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 24px' }}>{dialog.message}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {dialog.type === 'confirm' ? (
                <>
                  <button
                    onClick={() => setDialog({ open: false, type: 'info', title: '', message: '', onConfirm: null })}
                    style={{ padding: '10px 20px', border: '1px solid #E2E8F0', background: 'white', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#64748B' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (dialog.onConfirm) dialog.onConfirm();
                    }}
                    style={{ padding: '10px 20px', background: '#DC2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Confirm
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setDialog({ open: false, type: 'info', title: '', message: '', onConfirm: null })}
                  style={{ padding: '10px 20px', background: '#0F172A', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
