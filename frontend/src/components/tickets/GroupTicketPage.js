import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAuthHeaders, buildApiUrl } from '../../utils/api';
import './TicketDetailPage.css';

const GroupTicketPage = () => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [creatingTasks, setCreatingTasks] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupInternalNote, setGroupInternalNote] = useState('');
  const [ticketEtaDueAt, setTicketEtaDueAt] = useState('');
  const [taskDrafts, setTaskDrafts] = useState([{ assigned_agent_id: '', assigned_work: '' }]);
  const [noticeModal, setNoticeModal] = useState({ open: false, title: '', message: '' });

  const showNotice = (title, message) => {
    setNoticeModal({ open: true, title: title || 'Notice', message: message || '' });
  };

  const fetchTicket = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl(`/api/tickets/${ticketId}`), { headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok && data.success) {
        setTicket(data.data);
      } else {
        setError(data.message || 'Ticket not found');
      }
    } catch {
      setError('Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  const fetchTeamAgents = useCallback(async () => {
    setAgentsLoading(true);
    const headers = getAuthHeaders();
    try {
      const teamRes = await fetch(buildApiUrl('/api/agents/team'), { headers });
      const teamData = await teamRes.json();
      const teamAgents = teamData.data || teamData.agents || [];
      if (teamAgents.length > 0) {
        setAgents(teamAgents);
        return;
      }
      const allRes = await fetch(buildApiUrl('/api/agents'), { headers });
      const allData = await allRes.json();
      const list = allData.data || allData.agents || [];
      setAgents(list.filter((a) => ['support_agent', 'agent'].includes((a.role || '').toLowerCase())));
    } catch {
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);
  useEffect(() => {
    fetchTeamAgents();
  }, [fetchTeamAgents]);

  const addTaskDraft = () => {
    setTaskDrafts((prev) => [...prev, { assigned_agent_id: '', assigned_work: '' }]);
  };
  const updateTaskDraft = (idx, field, value) => {
    setTaskDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d)));
  };
  const removeTaskDraft = (idx) => {
    setTaskDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    const title = (groupTitle || '').trim();
    if (!title) {
      showNotice('Required field', 'Group name / title is required.');
      return;
    }
    const rows = taskDrafts
      .map((d) => ({
        assigned_agent_id: d.assigned_agent_id ? Number(d.assigned_agent_id) : null,
        assigned_work: (d.assigned_work || '').trim()
      }))
      .filter((d) => d.assigned_agent_id && d.assigned_work);
    if (!rows.length) {
      showNotice('Agent rows', 'Add at least one agent with assigned work for each row.');
      return;
    }

    const primaryId = Number(ticket?.assigned_to || 0);
    if (primaryId && !rows.some((r) => Number(r.assigned_agent_id) === primaryId)) {
      showNotice(
        'Include the assigned agent',
        `Add a row for the current assignee (${ticket?.assigned_to_name || `Agent #${primaryId}`}) with the work they own in this group.`
      );
      return;
    }

    const tasksPayload = rows.map((r) => {
      const agent = agents.find((a) => Number(a.id) === Number(r.assigned_agent_id));
      const agentLabel = agent?.name || `Agent ${r.assigned_agent_id}`;
      return {
        task_name: `Assignment — ${agentLabel}`,
        description: r.assigned_work,
        assigned_agent_id: r.assigned_agent_id,
        category: null
      };
    });

    setCreatingTasks(true);
    try {
      const res = await fetch(buildApiUrl(`/api/ticket-tasks/ticket/${ticketId}`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          groupTitle: title,
          groupInternalNote: (groupInternalNote || '').trim() || null,
          ...(ticketEtaDueAt.trim()
            ? { ticketEtaDueAt: new Date(ticketEtaDueAt).toISOString() }
            : {}),
          tasks: tasksPayload
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        navigate(`/manager/ticket/${ticketId}`, {
          replace: true,
          state: { groupedCreated: true }
        });
      } else {
        showNotice('Could not create group', data.message || 'Failed to create grouped ticket');
      }
    } catch {
      showNotice('Could not create group', 'Failed to create grouped ticket');
    } finally {
      setCreatingTasks(false);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  if (loading) {
    return (
      <div className="ticket-detail-loading">
        <div className="loading-spinner" />
        <p>Loading…</p>
      </div>
    );
  }
  if (error || !ticket) {
    return (
      <div className="ticket-detail-error">
        <h2>Cannot group ticket</h2>
        <p>{error || 'Not found'}</p>
        <button type="button" onClick={handleBack} className="td-btn td-btn-secondary">
          ← Back
        </button>
      </div>
    );
  }

  const raw = (ticket.status || 'new').toLowerCase();
  if (!['new', 'in_progress', 'escalated'].includes(raw)) {
    return (
      <div className="ticket-detail-modern-page" style={{ padding: 24 }}>
        <p className="td-muted">This ticket cannot be converted to grouped in its current status.</p>
        <button type="button" onClick={handleBack} className="td-btn td-btn-secondary">
          ← Back to ticket
        </button>
      </div>
    );
  }

  return (
    <div className="ticket-detail-modern-page" style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      {noticeModal.open && (
        <div className="td-confirm-modal-overlay" onClick={() => setNoticeModal((m) => ({ ...m, open: false }))}>
          <div className="td-confirm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3>{noticeModal.title}</h3>
            <p>{noticeModal.message}</p>
            <div className="td-confirm-actions">
              <button
                type="button"
                className="td-btn td-btn-primary"
                onClick={() => setNoticeModal((m) => ({ ...m, open: false }))}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="ticket-detail-toolbar" style={{ marginBottom: 20 }}>
        <button type="button" onClick={handleBack} className="td-btn td-btn-secondary">
          ← Back
        </button>
      </div>

      <div className="ticket-detail-modern-card td-grouped-ticket-card">
        <h2 style={{ marginTop: 0 }}>Group ticket #{ticketId}</h2>
        <p className="td-muted" style={{ marginBottom: 16 }}>
          {ticket.issue_title || 'No title'} — add a group name, optional internal note, and one row per agent (including{' '}
          <strong>{ticket.assigned_to_name || 'the current assignee'}</strong>
          ) with their specific work.
        </p>

        <div className="td-grouped-form-grid" style={{ marginTop: 12 }}>
          <label className="td-grouped-field">
            <span className="td-label">Group name / title</span>
            <input
              type="text"
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder="e.g. Payroll module — Q4 fixes"
            />
          </label>
          <label className="td-grouped-field">
            <span className="td-label">Internal note (optional)</span>
            <textarea
              value={groupInternalNote}
              onChange={(e) => setGroupInternalNote(e.target.value)}
              placeholder="Visible to staff only"
              rows={2}
            />
          </label>
          <label className="td-grouped-field">
            <span className="td-label">Overall ETA (optional)</span>
            <input
              type="datetime-local"
              value={ticketEtaDueAt}
              onChange={(e) => setTicketEtaDueAt(e.target.value)}
            />
            <span className="td-muted" style={{ display: 'block', marginTop: 6, fontSize: '0.8125rem' }}>
              Sets the customer-facing ticket ETA and the same deadline on each new assignment. You can adjust per task later.
            </span>
          </label>
        </div>

        <div className="td-task-draft-list" style={{ marginTop: 16 }}>
          {agentsLoading ? (
            <p className="td-muted">Loading agents…</p>
          ) : (
            taskDrafts.map((draft, idx) => (
              <div key={`draft-${idx}`} className="td-task-draft-row td-task-draft-row-grouped">
                <select
                  value={draft.assigned_agent_id}
                  onChange={(e) => updateTaskDraft(idx, 'assigned_agent_id', e.target.value)}
                >
                  <option value="">Agent</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <textarea
                  placeholder="Assigned work for this agent (required)"
                  value={draft.assigned_work}
                  onChange={(e) => updateTaskDraft(idx, 'assigned_work', e.target.value)}
                  rows={2}
                />
                <button
                  type="button"
                  className="td-btn td-btn-secondary"
                  onClick={() => removeTaskDraft(idx)}
                  disabled={taskDrafts.length === 1}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        <div className="td-actions-row" style={{ marginTop: 16 }}>
          <button type="button" className="td-btn td-btn-secondary" onClick={addTaskDraft}>
            + Add agent row
          </button>
          <button type="button" className="td-btn td-btn-primary" disabled={creatingTasks} onClick={handleSubmit}>
            {creatingTasks ? 'Creating…' : 'Create grouped ticket'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupTicketPage;
