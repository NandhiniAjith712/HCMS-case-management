import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit, Trash2, UserPlus, UserMinus, Users, AlertCircle } from 'lucide-react';
import { STORAGE_KEYS } from '../../modules/auth/constants';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5100';

export default function AdminEscalationLevels() {
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({ level: '', name: '', description: '' });
  const [assignFormData, setAssignFormData] = useState({ user_id: '' });
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null });

  const loadLevels = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
      const response = await axios.get(`${API_BASE}/api/v2/escalation-levels`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setLevels(response.data.levels);
      } else {
        setError(response.data.message || 'Failed to load escalation levels');
      }
    } catch (err) {
      console.error('Load levels error:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load escalation levels');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const token = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
      const response = await axios.get(`${API_BASE}/api/v2/cases/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setUsers(response.data.users || []);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  useEffect(() => {
    loadLevels();
    loadUsers();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      setError(null);
      const token = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
      const response = await axios.post(`${API_BASE}/api/v2/escalation-levels`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setShowCreateModal(false);
        setFormData({ level: '', name: '', description: '' });
        loadLevels();
      } else {
        setError(response.data.message || 'Failed to create escalation level');
      }
    } catch (err) {
      console.error('Create level error:', err);
      setError(err.response?.data?.message || err.message || 'Failed to create escalation level');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const token = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
      const response = await axios.put(`${API_BASE}/api/v2/escalation-levels/${selectedLevel.id}`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setShowEditModal(false);
        setSelectedLevel(null);
        setFormData({ level: '', name: '', description: '' });
        loadLevels();
      } else {
        setError(response.data.message || 'Failed to update escalation level');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update escalation level');
    }
  };

  const handleDelete = (level) => {
    setConfirmModal({
      show: true,
      title: 'Delete Escalation Level',
      message: `Are you sure you want to delete ${level.name} (${level.level})?`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
        try {
          const token = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
          const response = await axios.delete(`${API_BASE}/api/v2/escalation-levels/${level.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.data.success) {
            loadLevels();
          }
        } catch (err) {
          setError(err.response?.data?.message || 'Failed to delete escalation level');
        }
      }
    });
  };

  const handleAssignUser = async (e) => {
    e.preventDefault();
    try {
      const token = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
      const response = await axios.post(
        `${API_BASE}/api/v2/escalation-levels/${selectedLevel.id}/assign`,
        { user_id: assignFormData.user_id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        setShowAssignModal(false);
        setAssignFormData({ user_id: '' });
        setSelectedLevel(null);
        loadLevels();
      } else {
        setError(response.data.message || 'Failed to assign user');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to assign user');
    }
  };

  const handleRemoveUser = (level, userId) => {
    setConfirmModal({
      show: true,
      title: 'Remove User',
      message: 'Are you sure you want to remove this user from this escalation level?',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
        try {
          const token = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
          const response = await axios.delete(
            `${API_BASE}/api/v2/escalation-levels/${level.id}/assign/${userId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (response.data.success) {
            loadLevels();
          }
        } catch (err) {
          setError(err.response?.data?.message || 'Failed to remove user');
        }
      }
    });
  };

  const openEditModal = (level) => {
    setSelectedLevel(level);
    setFormData({ level: level.level, name: level.name, description: level.description || '' });
    setShowEditModal(true);
  };

  const openAssignModal = (level) => {
    setSelectedLevel(level);
    setAssignFormData({ user_id: '' });
    setShowAssignModal(true);
  };

  const getLevelBadgeColor = (level) => {
    const colors = {
      L1: { bg: '#DBEAFE', text: '#3B82F6' },
      L2: { bg: '#FEF3C7', text: '#F59E0B' },
      L3: { bg: '#FEE2E2', text: '#EF4444' },
      L4: { bg: '#EDE9FE', text: '#7C3AED' },
      L5: { bg: '#FCE7F3', text: '#EC4899' }
    };
    return colors[level] || { bg: '#F1F5F9', text: '#64748B' };
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#64748B' }}>
        Loading escalation levels...
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B', margin: 0 }}>
            Escalation Level Configuration
          </h1>
          <p style={{ color: '#64748B', marginTop: 4 }}>
            Configure L1-L5 escalation hierarchy and assign users to each level
          </p>
        </div>
        <button
          onClick={() => {
            setFormData({ level: '', name: '', description: '' });
            setShowCreateModal(true);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: '#3B82F6',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <Plus size={16} />
          Create Level
        </button>
      </div>

      {error && (
        <div style={{
          padding: 12,
          background: '#FEE2E2',
          color: '#EF4444',
          borderRadius: 8,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
        {levels.map((level) => {
          const badgeColor = getLevelBadgeColor(level.level);
          return (
            <div
              key={level.id}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 12,
                padding: 20,
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: badgeColor.bg,
                    color: badgeColor.text,
                    fontSize: 12,
                    fontWeight: 700
                  }}>
                    {level.level}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1E293B', margin: 0 }}>
                      {level.name}
                    </h3>
                    {level.description && (
                      <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
                        {level.description}
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => openEditModal(level)}
                    style={{ padding: 6, background: '#F1F5F9', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  >
                    <Edit size={14} color="#64748B" />
                  </button>
                  <button
                    onClick={() => handleDelete(level)}
                    style={{ padding: 6, background: '#FEE2E2', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  >
                    <Trash2 size={14} color="#EF4444" />
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748B' }}>
                    <Users size={14} />
                    Assigned Users ({level.assignments?.length || 0})
                  </div>
                  <button
                    onClick={() => openAssignModal(level)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 12px',
                      background: '#3B82F6',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <UserPlus size={12} />
                    Assign
                  </button>
                </div>

                {level.assignments && level.assignments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {level.assignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: 8,
                          background: '#F8FAFC',
                          borderRadius: 6
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: '#E2E8F0',
                            color: '#64748B',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 600
                          }}>
                            {assignment.user_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>
                              {assignment.user_name}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748B' }}>
                              {assignment.user_email}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveUser(level, assignment.user_id)}
                          style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                          <UserMinus size={14} color="#EF4444" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 12, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
                    No users assigned to this level
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 28, width: 450 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 20px' }}>
              Create Escalation Level
            </h2>
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>
                  Level
                </label>
                <select
                  value={formData.level}
                  onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                >
                  <option value="">Select level</option>
                  <option value="L1">L1</option>
                  <option value="L2">L2</option>
                  <option value="L3">L3</option>
                  <option value="L4">L4</option>
                  <option value="L5">L5</option>
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., HR Executive"
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>
                  Description (optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe this escalation level..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    fontSize: 14,
                    resize: 'vertical'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#3B82F6',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Create Level
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#F1F5F9',
                    color: '#0F172A',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedLevel && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 28, width: 450 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 20px' }}>
              Edit Escalation Level
            </h2>
            <form onSubmit={handleUpdate}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>
                  Level
                </label>
                <select
                  value={formData.level}
                  onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                  required
                  disabled
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    fontSize: 14,
                    background: '#F1F5F9'
                  }}
                >
                  <option value="L1">L1</option>
                  <option value="L2">L2</option>
                  <option value="L3">L3</option>
                  <option value="L4">L4</option>
                  <option value="L5">L5</option>
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>
                  Description (optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    fontSize: 14,
                    resize: 'vertical'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#3B82F6',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Update Level
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#F1F5F9',
                    color: '#0F172A',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign User Modal */}
      {showAssignModal && selectedLevel && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 28, width: 450 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 20px' }}>
              Assign User to {selectedLevel.level}
            </h2>
            <form onSubmit={handleAssignUser}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>
                  Select User
                </label>
                <select
                  value={assignFormData.user_id}
                  onChange={(e) => setAssignFormData({ ...assignFormData, user_id: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                >
                  <option value="">Select a user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email}) - {user.role}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#3B82F6',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Assign User
                </button>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#F1F5F9',
                    color: '#0F172A',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.show && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 16,
            padding: 28,
            width: 420,
            maxWidth: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 12px' }}>
              {confirmModal.title}
            </h3>
            <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 24px' }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                style={{
                  padding: '10px 18px',
                  background: '#F1F5F9',
                  color: '#0F172A',
                  border: '1px solid #E2E8F0',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                style={{
                  padding: '10px 18px',
                  background: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
