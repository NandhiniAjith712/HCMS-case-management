import React, { useState, useEffect } from 'react';
import { getAuthHeaders, buildApiUrl, authenticatedFetch } from '../../utils/api';
import { formatDateTimeIST } from '../../utils/dateTime';

const ManagerEscalationRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [modalConfig, setModalConfig] = useState({ 
    isOpen: false, 
    requestId: null, 
    action: null, 
    comment: '',
    assignmentMode: 'auto',
    selectedAgentId: '',
    targetLevel: '',
    requestedBy: null
  });
  const [agentsAtLevel, setAgentsAtLevel] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [notification, setNotification] = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl('/api/tickets/escalation-requests'), { headers });
      const result = await response.json();
      if (result.success) {
        setRequests(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching escalation requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgentsByLevel = async (level) => {
    if (!level) return;
    setLoadingAgents(true);
    try {
      const response = await authenticatedFetch(buildApiUrl(`/api/agents/by-level/${level}`));
      const result = await response.json();
      if (result.success) {
        setAgentsAtLevel(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching agents by level:', error);
    } finally {
      setLoadingAgents(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    if (modalConfig.isOpen && modalConfig.action === 'approve') {
      // If escalation was to MANAGER, default to empty so "Keep with me" is selected.
      // Manager can optionally change to L1/L2/L3 to reassign to an agent.
      if (modalConfig.targetLevel === 'MANAGER') {
        setModalConfig(prev => ({ ...prev, targetLevel: '', selectedAgentId: '', assignmentMode: 'auto' }));
      } else if (modalConfig.targetLevel) {
        fetchAgentsByLevel(modalConfig.targetLevel);
      }
    }
  }, [modalConfig.isOpen, modalConfig.action, modalConfig.targetLevel]);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const openModal = (requestId, action, targetLevel = '', requestedBy = null) => {
    setModalConfig({ 
      isOpen: true, 
      requestId, 
      action, 
      comment: '', 
      assignmentMode: 'auto', 
      selectedAgentId: '',
      targetLevel,
      requestedBy
    });
    setAgentsAtLevel([]);
  };

  const closeModal = () => {
    setModalConfig({ 
      isOpen: false, 
      requestId: null, 
      action: null, 
      comment: '', 
      assignmentMode: 'auto', 
      selectedAgentId: '',
      targetLevel: '',
      requestedBy: null
    });
  };

  const handleSubmitAction = async () => {
    const { requestId, action, comment, assignmentMode, selectedAgentId, targetLevel } = modalConfig;
    if (!requestId || !action) return;

    // Manual agent required only when reassigning to an agent (targetLevel is set)
    if (action === 'approve' && targetLevel && assignmentMode === 'manual' && !selectedAgentId) {
      showNotification('Please select an agent for manual assignment.', 'error');
      return;
    }

    setActionInProgress(true);
    try {
      const headers = getAuthHeaders();
      const body = { manager_comment: comment };
      if (action === 'approve') {
        body.assignment_mode = targetLevel ? assignmentMode : 'keep';
        body.assigned_agent_id = selectedAgentId || null;
        body.target_level = targetLevel || 'MANAGER';
      }

      const response = await fetch(buildApiUrl(`/api/tickets/escalation-requests/${requestId}/${action}`), {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      const result = await response.json();
      if (result.success) {
        showNotification(`Request ${action}d successfully.`, 'success');
        closeModal();
        fetchRequests();
      } else {
        showNotification(result.message || `Failed to ${action} request.`, 'error');
      }
    } catch (error) {
      console.error(`Error ${action}ing request:`, error);
      showNotification(`Error ${action}ing request. Please try again.`, 'error');
    } finally {
      setActionInProgress(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading escalation requests...</div>;
  }

  return (
    <div className="mdr-extra" style={{ position: 'relative' }}>
      {notification && (
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
          backgroundColor: notification.type === 'error' ? '#fef2f2' : '#f0fdf4',
          color: notification.type === 'error' ? '#b91c1c' : '#15803d',
          border: `1px solid ${notification.type === 'error' ? '#f87171' : '#86efac'}`,
          padding: '12px 24px', borderRadius: '6px', fontWeight: '500', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          {notification.message}
        </div>
      )}

      <h2>Pending Escalation Requests</h2>
      {requests.length === 0 ? (
        <p>No pending escalation requests.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
          {requests.map(req => (
            <div key={req.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Ticket #{req.ticket_id} - {req.issue_title}</h3>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{formatDateTimeIST(req.created_at)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.9rem', marginBottom: '16px' }}>
                <div><strong>Requested By:</strong> {req.requester_name || `Agent #${req.requested_by}`}</div>
                <div><strong>Transition:</strong> {req.current_level} ➔ {req.requested_level}</div>
                <div style={{ gridColumn: '1 / -1' }}><strong>Reason:</strong> {req.escalation_reason}</div>
                <div style={{ gridColumn: '1 / -1' }}><strong>Work Done:</strong> {req.work_done}</div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => openModal(req.id, 'approve', req.requested_level, req.requested_by)}
                  style={{ padding: '8px 16px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                >
                  Approve
                </button>
                <button
                  onClick={() => openModal(req.id, 'reject')}
                  style={{ padding: '8px 16px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inline Modal for Action Confirmation */}
      {modalConfig.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '8px', padding: '24px',
            width: '100%', maxWidth: '400px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', textTransform: 'capitalize' }}>{modalConfig.action} Escalation Request</h3>
            <p style={{ marginBottom: '12px', fontSize: '0.95rem' }}>
              Please enter a comment for this action (optional):
            </p>
            <textarea
              value={modalConfig.comment}
              onChange={(e) => setModalConfig({ ...modalConfig, comment: e.target.value })}
              rows="3"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', marginBottom: '20px', resize: 'none' }}
              placeholder="Add your comments here..."
            />

            {modalConfig.action === 'approve' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '4px', color: '#475569' }}>
                  Target Support Level:
                </label>
                <select
                  value={modalConfig.targetLevel}
                  onChange={(e) => setModalConfig({ ...modalConfig, targetLevel: e.target.value, selectedAgentId: '', assignmentMode: 'auto' })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                >
                  <option value="">Keep with me (Manager)</option>
                  <option value="L1">L1 Support</option>
                  <option value="L2">L2 Support</option>
                  <option value="L3">L3 Support</option>
                </select>
              </div>
            )}

            {modalConfig.action === 'approve' && modalConfig.targetLevel && (
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginBottom: '20px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '4px', color: '#475569' }}>
                    Assignment Mode:
                  </label>
                  <select
                    value={modalConfig.assignmentMode}
                    onChange={(e) => setModalConfig({ ...modalConfig, assignmentMode: e.target.value, selectedAgentId: '' })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  >
                    <option value="auto">Automatic Assignment</option>
                    <option value="manual">Manual Assignment</option>
                  </select>
                </div>

                {modalConfig.assignmentMode === 'manual' && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '4px', color: '#475569' }}>
                      Select Agent ({modalConfig.targetLevel}):
                    </label>
                    <select
                      value={modalConfig.selectedAgentId}
                      onChange={(e) => setModalConfig({ ...modalConfig, selectedAgentId: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                      disabled={loadingAgents || agentsAtLevel.filter(a => a.id !== modalConfig.requestedBy).length === 0}
                    >
                      <option value="">
                        {loadingAgents 
                          ? 'Loading agents...' 
                          : agentsAtLevel.filter(a => a.id !== modalConfig.requestedBy).length === 0 
                            ? 'No agents available' 
                            : 'Choose an agent...'}
                      </option>
                      {agentsAtLevel
                        .filter(agent => agent.id !== modalConfig.requestedBy)
                        .map(agent => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} ({agent.availability_status})
                        </option>
                      ))}
                    </select>
                    {!loadingAgents && agentsAtLevel.filter(a => a.id !== modalConfig.requestedBy).length === 0 && (
                      <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '4px' }}>
                        No other agents found at this level for assignment.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={closeModal}
                disabled={actionInProgress}
                style={{ padding: '8px 16px', backgroundColor: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitAction}
                disabled={actionInProgress}
                style={{
                  padding: '8px 16px',
                  backgroundColor: modalConfig.action === 'approve' ? '#10b981' : '#ef4444',
                  color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600'
                }}
              >
                {actionInProgress ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerEscalationRequests;
