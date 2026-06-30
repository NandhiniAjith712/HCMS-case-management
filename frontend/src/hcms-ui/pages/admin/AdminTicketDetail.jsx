import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Clock, Download, Paperclip, Send, CheckCircle, XCircle, FileSearch, FileText, RotateCcw, MessageSquare, AlertCircle, AlertTriangle, ArrowUp, RefreshCw, UserPlus, X, Lock } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";
const card = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' };

function Avatar({ initials, s = 32 }) {
  return <div style={{ width: s, height: s, borderRadius: '50%', background: '#F1F5F9', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: s < 32 ? 10 : 12, fontWeight: 700, flexShrink: 0 }}>{initials}</div>;
}

function SBadge({ status }) {
  const m = {
    'pending_approval': { bg: '#FEF3C7', color: '#D97706', label: 'Pending Approval' },
    'under_investigation': { bg: '#EDE9FE', color: '#7C3AED', label: 'Under Investigation' },
    'resolved': { bg: '#D1FAE5', color: '#059669', label: 'Resolved' },
    'closed': { bg: '#E2E8F0', color: '#475569', label: 'Closed' },
    'rejected': { bg: '#FEE2E2', color: '#DC2626', label: 'Rejected' },
    'returned_to_hr': { bg: '#DBEAFE', color: '#2563EB', label: 'Returned to HR' },
    'escalated_to_admin': { bg: '#FEE2E2', color: '#DC2626', label: 'Escalated to Admin' },
    'escalated': { bg: '#FEF3C7', color: '#D97706', label: 'Escalated' }
  };
  const s = m[status] || { bg: '#F1F5F9', color: '#64748B', label: status };
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 999, background: s.bg, color: s.color, fontSize: 13, fontWeight: 600 }}>{s.label}</span>;
}

function RMBadge({ mode }) {
  const styles = {
    normal: { bg: '#F1F5F9', color: '#64748B', label: 'Normal' },
    confidential: { bg: '#FEF3C7', color: '#B45309', label: 'Confidential' },
    sensitive: { bg: '#E0E7FF', color: '#4338CA', label: 'Sensitive' },
    anonymous: { bg: '#F3E8FF', color: '#7E22CE', label: 'Anonymous' }
  };
  const s = styles[mode] || styles.normal;
  return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: s.bg, color: s.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{s.label}</span>;
}

const ACTIONS = [
  { key: 'resolve', label: 'Mark as Resolved', Icon: CheckCircle, primary: true },
  { key: 'investigate', label: 'Request Investigation', Icon: FileSearch },
  { key: 'reject', label: 'Reject', Icon: XCircle, danger: true },
];

const ACTIONABLE_STATUSES = ['pending_approval', 'under_investigation', 'escalated_to_admin', 'escalated'];

// Helper function to format timeline descriptions
function tIcon(a) {
  const i = {
    created: FileText,
    updated: RefreshCw,
    status_changed: RefreshCw,
    assigned: UserPlus,
    commented: MessageSquare,
    escalated: ArrowUp,
    resolved: CheckCircle,
    closed: XCircle,
    reopened: RotateCcw,
    edited: FileText,
    attachments_uploaded: Paperclip,
    attachment_deleted: X,
    info_requested: AlertCircle,
    returned_to_hr: RotateCcw,
    under_investigation: FileSearch,
    escalated_to_admin: ArrowUp,
    rejected: XCircle,
    pending_approval: Clock
  };
  return i[a] || FileText;
}
function tClr(a) {
  const c = {
    created: '#3B82F6',
    updated: '#64748B',
    status_changed: '#F59E0B',
    assigned: '#3B82F6',
    commented: '#3B82F6',
    escalated: '#EF4444',
    resolved: '#22C55E',
    closed: '#22C55E',
    reopened: '#3B82F6',
    edited: '#64748B',
    attachments_uploaded: '#3B82F6',
    attachment_deleted: '#EF4444',
    info_requested: '#F59E0B',
    returned_to_hr: '#3B82F6',
    under_investigation: '#7C3AED',
    escalated_to_admin: '#EF4444',
    rejected: '#EF4444',
    pending_approval: '#F59E0B'
  };
  return c[a] || '#64748B';
}
function tBg(a) {
  const b = {
    created: '#DBEAFE',
    updated: '#F1F5F9',
    status_changed: '#FEF3C7',
    assigned: '#DBEAFE',
    commented: '#DBEAFE',
    escalated: '#FEE2E2',
    resolved: '#D1FAE5',
    closed: '#D1FAE5',
    reopened: '#DBEAFE',
    edited: '#F1F5F9',
    attachments_uploaded: '#DBEAFE',
    attachment_deleted: '#FEE2E2',
    info_requested: '#FEF3C7',
    returned_to_hr: '#DBEAFE',
    under_investigation: '#EDE9FE',
    escalated_to_admin: '#FEE2E2',
    rejected: '#FEE2E2',
    pending_approval: '#FEF3C7'
  };
  return b[a] || '#F1F5F9';
}
function tTitle(a) {
  const t = {
    created: 'Ticket created',
    updated: 'Updated',
    status_changed: 'Status changed',
    assigned: 'Assigned',
    commented: 'Employee replied',
    escalated: 'Escalated',
    resolved: 'Resolved',
    closed: 'Closed',
    reopened: 'Reopened',
    edited: 'Edited',
    attachments_uploaded: 'Attachments uploaded',
    attachment_deleted: 'Attachment deleted',
    info_requested: 'Information requested',
    returned_to_hr: 'Returned to HR',
    under_investigation: 'Under investigation',
    escalated_to_admin: 'Escalated to admin',
    rejected: 'Rejected',
    pending_approval: 'Pending approval'
  };
  return t[a] || (a ? a.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Activity');
}
function fd(d) {
  const date = new Date(d);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${m[date.getMonth()]} · ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function formatTimelineDesc(item) {
  let actor = item.performed_by_name || item.user_name;
  if (!actor || actor === 'Unknown User' || actor === 'null') {
    if (item.action === 'created') {
      actor = 'System';
    } else if (item.performed_by) {
      actor = 'User #' + item.performed_by;
    } else {
      actor = 'System';
    }
  }
  const details = item.details || {};
  
  if (item.action === 'created') {
    return `Raised by ${actor} via Employee Portal.`;
  }
  if (item.action === 'assigned') {
    const assignee = details.assignee_name || details.assignee || 'an agent';
    return `${actor} assigned this to ${assignee}.`;
  }
  if (item.action === 'reassigned') {
    const assignee = details.assignee_name || details.assignee || 'an agent';
    return `${actor} reassigned this to ${assignee}.`;
  }
  if (item.action === 'commented') {
    return `${actor} posted a new message.`;
  }
  if (item.action === 'escalated') {
    const prev = details.previous_level || 'L1';
    const next = details.new_level || 'L2';
    return `Escalated from ${prev} to ${next} by ${actor}.`;
  }
  if (item.action === 'info_requested') {
    const message = details.message;
    return message ? `${actor} requested: ${message}` : `${actor} requested more information.`;
  }
  if (item.action === 'status_changed') {
    const fmt = s => s ? s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '';
    const st = details.status || {};
    if (st.old && st.new) {
      return `${actor} changed status from ${fmt(st.old)} to ${fmt(st.new)}.`;
    }
    return `${actor} changed status to ${fmt(st.new)}.`;
  }
  if (item.action === 'edited') {
    const fields = details.fields;
    if (Array.isArray(fields) && fields.length > 0) {
      const fieldNames = fields.join(', ');
      return `${actor} edited: ${fieldNames}.`;
    }
    return `${actor} edited this ticket.`;
  }
  if (item.action === 'resolved') {
    const reason = details.reason;
    return reason ? `${actor} resolved this ticket. Reason: ${reason}` : `${actor} resolved this ticket.`;
  }
  if (item.action === 'closed') {
    const reason = details.reason;
    return reason ? `${actor} closed this ticket. Reason: ${reason}` : `${actor} closed this ticket.`;
  }
  if (item.action === 'reopened') {
    const reason = details.reason;
    return reason ? `${actor} reopened this ticket. Reason: ${reason}` : `${actor} reopened this ticket.`;
  }
  if (item.action === 'internal_note' || item.action === 'note') {
    const note = details.note || item.comment || details.message;
    return note ? `${actor} added an internal note.` : `${actor} added a note.`;
  }
  if (item.action === 'attachments_uploaded') {
    return `${actor} uploaded attachments.`;
  }
  if (item.action === 'attachment_deleted') {
    return `${actor} deleted an attachment.`;
  }
  if (item.action === 'return' || item.action === 'returned_to_hr') {
    return `${actor} returned this to HR.`;
  }
  if (item.action === 'investigate' || item.action === 'under_investigation') {
    return `${actor} marked this as under investigation.`;
  }
  if (item.action === 'escalated_to_admin') {
    return `${actor} escalated this to System Admin.`;
  }
  if (item.action === 'resolve' || item.action === 'resolved') {
    return `${actor} marked this as resolved.`;
  }
  if (item.action === 'reject' || item.action === 'rejected') {
    return `${actor} rejected this ticket.`;
  }
  if (item.action === 'pending_approval') {
    return `${actor} moved this to pending approval.`;
  }
  
  return `${actor} performed this action.`;
}

export default function AdminTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [newNote, setNewNote] = useState('');
  const [notes, setNotes] = useState(null);
  const [caseAttachments, setCaseAttachments] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [commentAttachments, setCommentAttachments] = useState([]);

  const API_BASE = `/api/admin/system-admin-tickets`;

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        setLoading(true);
        const token = sessionStorage.getItem('hcmsToken') || localStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        const res = await fetch(`${API_BASE}/${id}`, { headers });
        if (!res.ok) throw new Error('Failed to fetch ticket');
        const data = await res.json();
        setTicket(data.data || null);
        setNotes(data.data?.internal_notes || []);
        setCaseAttachments(data.data?.attachments || []);
      } catch (err) {
        console.error('Error fetching admin ticket:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTicket();
  }, [id]);

  const isSpecialCase = (t) => t?.reporting_mode === 'confidential' || t?.reporting_mode === 'sensitive' || t?.reporting_mode === 'anonymous';
  const hasPerm = (t, key) => t?.permissions?.[key] ?? !isSpecialCase(t);
  const canViewEmployee = (t) => hasPerm(t, 'can_view_employee_details');
  const canComment = (t) => hasPerm(t, 'can_comment');
  const canPerformActions = (t) => hasPerm(t, 'can_perform_actions');
  const canResolve = (t) => hasPerm(t, 'can_resolve');

  const handleActionClick = (actionKey) => {
    if (actionKey === 'reject') {
      setConfirmModal({
        action: 'reject',
        title: 'Reject Ticket',
        message: 'Are you sure you want to reject this ticket? The employee will be notified with the reason below.',
        confirmLabel: 'Confirm Rejection',
        requireReason: true,
        placeholder: 'Enter the reason for rejection...'
      });
    } else {
      performAction(actionKey);
    }
  };

  const performAction = async (actionKey, reason) => {
    try {
      setActionLoading(actionKey);
      const token = sessionStorage.getItem('hcmsToken') || localStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${API_BASE}/${id}/action`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: actionKey, reason: reason || '' })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to perform action');
      }
      const refreshed = await fetch(`${API_BASE}/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (refreshed.ok) {
        const data = await refreshed.json();
        setTicket(data.data || ticket);
        setNotes(data.data?.internal_notes || []);
        setCaseAttachments(data.data?.attachments || []);
      }
    } catch (err) {
      console.error('Error performing action:', err);
      alert(err.message || 'Failed to perform action');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmAction = () => {
    if (!confirmModal) return;
    const reason = confirmModal.requireReason ? (confirmModal.reasonInput || '').trim() : '';
    if (confirmModal.requireReason && !reason) return;
    performAction(confirmModal.action, reason);
    setConfirmModal(null);
  };

  const handleDownload = async (attachmentId, fileName) => {
    try {
      const token = sessionStorage.getItem('hcmsToken') || localStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
      const res = await fetch(`/api/v2/cases/${id}/attachments/${attachmentId}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to download');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'attachment';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download attachment');
    }
  };

  const handleCommentAttachmentSelect = (e) => {
    const files = Array.from(e.target.files);
    setCommentAttachments(prev => [...prev, ...files]);
  };

  const handleRemoveCommentAttachment = (index) => {
    setCommentAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleNote = async () => {
    if (!newNote.trim()) return;
    try {
      const token = sessionStorage.getItem('hcmsToken') || localStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${API_BASE}/${id}/notes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: newNote.trim() })
      });
      if (!res.ok) throw new Error('Failed to add note');
      const data = await res.json();
      setNotes(data.data || []);
      setNewNote('');
    } catch (err) {
      console.error('Error adding note:', err);
      alert('Failed to add note');
    }
  };

  const handleComment = async () => {
    if (!newComment.trim()) return;
    try {
      const token = sessionStorage.getItem('hcmsToken') || localStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${API_BASE}/${id}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: newComment.trim() })
      });
      if (!res.ok) throw new Error('Failed to add comment');
      const data = await res.json();
      const messageId = data.data?.message_id || data.data?.conversation?.slice(-1)[0]?.id;
      if (commentAttachments.length > 0 && messageId) {
        const formData = new FormData();
        commentAttachments.forEach(file => formData.append('files', file));
        formData.append('message_id', messageId);
        await fetch(`/api/v2/cases/${id}/attachments`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
      }
      setTicket(data.data || ticket);
      setCaseAttachments(data.data?.attachments || []);
      setNewComment('');
      setCommentAttachments([]);
    } catch (err) {
      console.error('Error adding comment:', err);
      alert('Failed to add comment');
    }
  };

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading ticket details...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading ticket</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!ticket) return (
    <div style={{ fontFamily: f, padding: 40, textAlign: 'center', color: '#64748B' }}>
      <button onClick={() => navigate('/hcms/admin-tickets')} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', padding: 0 }}>
        <ChevronLeft size={16} />Back to tickets
      </button>
      Ticket not found.
    </div>
  );

  const internalNotes = notes || ticket.internal_notes || [];
  const conversation = ticket.conversation || [];
  const timeline = (ticket.timeline || []).map(t => ({
    ...t,
    icon: tIcon(t.action),
    iconColor: tClr(t.action),
    iconBg: tBg(t.action),
    title: tTitle(t.action),
    time: t.created_at ? fd(t.created_at) : '—'
  }));

  const ticketStatus = ticket.dept_review_status || ticket.status;
  const canAct = ACTIONABLE_STATUSES.includes(ticketStatus) && canPerformActions(ticket);

  return (
    <div style={{ fontFamily: f }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 13, color: '#64748B' }}>
        <button onClick={() => navigate('/hcms/admin-tickets')} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', padding: 0 }}>
          <ChevronLeft size={15} />Tickets
        </button>
        <span>/</span>
        <span style={{ color: '#1E293B', fontWeight: 600 }}>{ticket.ticket_id || `TKT-${ticket.id}`}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Ticket {ticket.ticket_id || `TKT-${ticket.id}`}</h1>
            <SBadge status={ticket.status || 'escalated'} />
            <RMBadge mode={ticket.reporting_mode} />
          </div>
          <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>{ticket.title || '—'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748B', fontSize: 13 }}>
          <Clock size={14} color="#94A3B8" />
          <span>SLA: </span><span style={{ fontWeight: 600, color: '#EF4444' }}>{ticket.sla || '—'}</span>
        </div>
      </div>

      {!canAct && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: '#F1F5F9', border: '1px solid #E2E8F0', marginBottom: 20, fontSize: 13, color: '#64748B' }}>
          <Lock size={15} color="#94A3B8" />
          This ticket is view-only. Actions are disabled because the ticket is not currently in an actionable state.
        </div>
      )}

      {ticket.pendingEscalationConsent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: '#FEF3C7', border: '1px solid #FDE68A', marginBottom: 20, fontSize: 13, color: '#92400E' }}>
          <AlertCircle size={15} color="#D97706" />
          Awaiting employee consent for escalation to {ticket.pendingEscalationConsent.requested_level}. The case will be escalated once the employee approves.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {caseAttachments.length > 0 && (
            <div style={card}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Paperclip size={16} color="#64748B" />
                <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Ticket Attachments</h2>
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {caseAttachments.map(att => (
                  <div key={att.id} onClick={() => handleDownload(att.id, att.file_name || att.name)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                    <Paperclip size={18} color="#64748B" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.file_name || att.name}</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>{att.file_type || att.type}{att.file_size || att.size ? ` · ${(att.file_size || att.size) > 1048576 ? ((att.file_size || att.size) / 1048576).toFixed(2) + ' MB' : ((att.file_size || att.size) / 1024).toFixed(2) + ' KB'}` : ''}</div>
                    </div>
                    <Download size={16} color="#64748B" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Ticket Information</h2>
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', rowGap: 20, columnGap: 24 }}>
              {[
                { label: 'TICKET ID', value: ticket.ticket_id || `TKT-${ticket.id}` },
                { label: 'CATEGORY', value: ticket.category || '—' },
                { label: 'SUBCATEGORY', value: ticket.subcategory || '—' },
                { label: 'EMPLOYEE', value: ticket.reporter_name || '—' },
                { label: 'REPORTING MODE', value: <RMBadge mode={ticket.reporting_mode} />, isBadge: true },
                { label: 'PRIORITY', value: ticket.priority || 'medium', isPriority: true },
                { label: 'STATUS', value: ticket.status || 'escalated', isStatus: true },
                { label: 'ESCALATION REASON', value: ticket.escalation_reason || '—' },
                { label: 'ASSIGNED TO', value: ticket.assigned_to_name || '—' },
                { label: 'SLA', value: ticket.sla || '—', slaColor: true },
                { label: 'CREATED DATE', value: ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : '—' },
              ].map(({ label, value, isPriority, isStatus, isBadge, slaColor }) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
                  {isStatus ? <SBadge status={value} /> :
                    isPriority ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: value === 'high' ? '#EF4444' : value === 'medium' ? '#F59E0B' : '#94A3B8' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: value === 'high' ? '#EF4444' : value === 'medium' ? '#F59E0B' : '#94A3B8' }} />{value}</span> :
                    isBadge ? value :
                    <div style={{ fontSize: 13, fontWeight: 600, color: slaColor ? '#64748B' : '#1E293B' }}>{value}</div>}
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Description</h2>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{ticket.description || 'No description provided.'}</p>
            </div>
          </div>

          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Conversation</h2>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {conversation.length === 0 ? (
                <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>No messages yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {conversation.map((c) => (
                    <div key={c.id} style={{ display: 'flex', gap: 12 }}>
                      <Avatar initials={c.initials || (c.name || 'U')[0]} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{c.name || 'Unknown'}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: c.tagBg, color: c.tagColor }}>{c.roleTag}</span>
                          <span style={{ fontSize: 12, color: '#94A3B8' }}>{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.message || c.text}</div>
                        {c.attachments && c.attachments.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                            {c.attachments.map(att => (
                              <div key={att.id} onClick={() => handleDownload(att.id, att.file_name || att.name)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: '#F1F5F9', cursor: 'pointer' }}>
                                <Paperclip size={12} color="#64748B" />
                                <span style={{ fontSize: 12, color: '#0F172A', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.file_name || att.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {canComment(ticket) && (
                <>
                  {commentAttachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                      {commentAttachments.map((file, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#F1F5F9', borderRadius: 8, fontSize: 12, color: '#0F172A' }}>
                          <Paperclip size={12} color="#64748B" />
                          <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                          <button onClick={() => handleRemoveCommentAttachment(i)} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <input
                      type="text"
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      onKeyDown={e => e.key === 'Enter' && handleComment()}
                      style={{ flex: 1, height: 40, border: '1px solid #E2E8F0', borderRadius: 8, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: f }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="file" multiple onChange={handleCommentAttachmentSelect} style={{ display: 'none' }} id="admin-comment-attachment-input" />
                      <label htmlFor="admin-comment-attachment-input" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', padding: 0 }}>
                        <Paperclip size={15} />
                      </label>
                      <button onClick={handleComment} disabled={!newComment.trim()} style={{ height: 40, padding: '0 16px', borderRadius: 8, border: 'none', background: '#1E293B', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Send size={14} />Send
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Actions</h2>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ACTIONS.filter(({ key }) => {
                if (key === 'resolve') return canResolve(ticket);
                return canPerformActions(ticket);
              }).map(({ key, label, Icon, primary, danger }) => {
                const disabled = !canAct || actionLoading === key || actionLoading;
                return (
                  <button
                    key={key}
                    onClick={() => handleActionClick(key)}
                    disabled={disabled}
                    style={{
                      height: 40,
                      borderRadius: 8,
                      border: primary ? 'none' : danger ? '1px solid #FECACA' : '1px solid #E2E8F0',
                      background: primary ? '#1E293B' : danger ? '#FEF2F2' : '#FFFFFF',
                      color: primary ? '#FFFFFF' : danger ? '#DC2626' : '#374151',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8
                    }}
                  >
                    <Icon size={16} />
                    {actionLoading === key ? 'Processing...' : label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ticket Details */}
          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Ticket Details</h2>
            </div>
            <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Subject', value: ticket.title || '—' },
                { label: 'Description', value: ticket.description || '—' },
                { label: 'Category', value: ticket.category || '—' },
                { label: 'Subcategory', value: ticket.subcategory || '—' },
                { label: 'Employee', value: ticket.reporter_name || '—' },
                { label: 'Reporting Mode', value: <RMBadge mode={ticket.reporting_mode} />, isBadge: true },
                { label: 'Priority', value: ticket.priority || 'medium', isPriority: true },
                { label: 'Status', value: ticket.status || 'escalated', isStatus: true },
                { label: 'Escalation Reason', value: ticket.escalation_reason || '—' },
                { label: 'Created Date', value: ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : '—' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {item.isPriority ? <AlertTriangle size={14} color="#64748B" /> : item.isStatus ? <CheckCircle size={14} color="#64748B" /> : <FileText size={14} color="#64748B" />}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', wordBreak: 'break-word' }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Internal Notes</h2>
              <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>Visible only to Department Head, HR, and System Admin</p>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {canComment(ticket) && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <input
                    type="text"
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    placeholder="Add an internal note..."
                    onKeyDown={e => e.key === 'Enter' && handleNote()}
                    style={{ flex: 1, height: 36, border: '1px solid #E2E8F0', borderRadius: 8, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: f }}
                  />
                  <button onClick={handleNote} disabled={!newNote.trim()} style={{ height: 36, padding: '0 12px', borderRadius: 8, border: 'none', background: '#1E293B', color: '#FFFFFF', fontSize: 13, cursor: 'pointer' }}>
                    <MessageSquare size={14} />
                  </button>
                </div>
              )}
              {internalNotes.length === 0 ? (
                <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center' }}>No internal notes</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {internalNotes.map(n => (
                    <div key={n.id} style={{ padding: 12, borderRadius: 8, background: '#F8FAFC' }}>
                      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>{n.author} · {n.created_at ? new Date(n.created_at).toLocaleString() : ''}</div>
                      <div style={{ fontSize: 13, color: '#1E293B' }}>{n.note || n.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Activity Timeline</h2>
              <p style={{ fontSize: 12, color: '#64748B', margin: '3px 0 0' }}>Automatically generated history.</p>
            </div>
            <div style={{ padding: '14px 20px' }}>
              {timeline.length === 0 ? (
                <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center' }}>No activity yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {timeline.map((t, i) => (
                    <div key={t.id} style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: t.iconBg || '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {t.icon ? <t.icon size={13} color={t.iconColor || '#3B82F6'} /> : <FileText size={13} color="#3B82F6" />}
                        </div>
                        {i < timeline.length - 1 && <div style={{ width: 2, flex: 1, background: '#E2E8F0', marginTop: 4 }} />}
                      </div>
                      <div style={{ flex: 1, paddingBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 2 }}>{t.title || 'Activity'}</div>
                        <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, marginBottom: 2 }}>{formatTimelineDesc(t)}</div>
                        <div style={{ fontSize: 12, color: '#94A3B8' }}>{t.time || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: 440, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>{confirmModal.title}</h2>
              <button onClick={() => setConfirmModal(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px' }}>{confirmModal.message}</p>
            {confirmModal.requireReason && (
              <textarea
                value={confirmModal.reasonInput || ''}
                onChange={e => setConfirmModal({ ...confirmModal, reasonInput: e.target.value })}
                placeholder={confirmModal.placeholder}
                rows={4}
                style={{ width: '100%', padding: 10, border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, outline: 'none', resize: 'vertical', marginBottom: 16 }}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setConfirmModal(null)} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleConfirmAction} disabled={confirmModal.requireReason && !(confirmModal.reasonInput || '').trim()} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: confirmModal.action === 'reject' ? '#DC2626' : '#1E293B', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{confirmModal.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
