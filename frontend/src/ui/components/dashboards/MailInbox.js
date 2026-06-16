import React, { useState, useEffect, useCallback } from 'react';
import { buildApiUrl, authenticatedFetch } from '../../utils/api';
import { formatDateTimeIST } from '../../utils/dateTime';
import './MailInbox.css';

const MailInbox = ({ onActionComplete }) => {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending'); // 'pending', 'continuation', or 'ticketed'
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [isReassigning, setIsReassigning] = useState(false);
  const [manualTicketId, setManualTicketId] = useState('');

  // Reset message selection when switching threads or tabs
  useEffect(() => {
    setIsReassigning(false);
    setManualTicketId('');
    if (selectedEmail && selectedEmail.emails.length > 0) {
      setExpandedThreads({
        [selectedEmail.emails[0].id]: true
      });
      if (tab === 'pending') {
        setSelectedMessageIds([selectedEmail.emails[0].id]);
      } else {
        setSelectedMessageIds([]);
      }
    } else {
      setSelectedMessageIds([]);
      setExpandedThreads({});
    }
  }, [selectedEmail?.id, tab]);

  const [expandedThreads, setExpandedThreads] = useState({});
  const [actionInProgress, setActionInProgress] = useState(false);
  const [notification, setNotification] = useState(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = tab === 'pending' ? '/api/mail-review' :
                       tab === 'ticketed' ? '/api/mail-review/ticketed' :
                       '/api/mail-review/continuation-queue';
      const response = await authenticatedFetch(buildApiUrl(endpoint));
      const result = await response.json();
      if (result.success) {
        const rawEmails = result.data || [];

        const groups = rawEmails.reduce((acc, email) => {
          const key = tab === 'continuation' ? email.id : (email.thread_id || email.sender_email);
          if (!acc[key]) {
            acc[key] = {
              id: key,
              sender_email: email.sender_email,
              sender_name: email.sender_name,
              latest_received_at: email.received_at,
              matched_ticket_id: email.matched_ticket_id,
              ticket_id: email.ticket_id,
              ticket_requester: email.ticket_requester,
              ticket_title: email.ticket_title,
              ticket_status: email.ticket_status,
              ticket_priority: email.ticket_priority,
              ticket_agent_name: email.ticket_agent_name,
              ai_confidence_score: email.ai_confidence_score,
              ai_continuation_reason: email.ai_continuation_reason,
              emails: []
            };
          }
          acc[key].emails.push(email);
          if (new Date(email.received_at) > new Date(acc[key].latest_received_at)) {
            acc[key].latest_received_at = email.received_at;
          }
          return acc;
        }, {});

        const sortedGroups = Object.values(groups).sort((a, b) =>
          new Date(b.latest_received_at) - new Date(a.latest_received_at)
        );

        setEmails(sortedGroups);
        if (onActionComplete) onActionComplete();

        if (sortedGroups.length > 0) {
          const stillExists = sortedGroups.find(g => g.id === selectedEmail?.id);
          setSelectedEmail(stillExists || sortedGroups[0]);
        } else {
          setSelectedEmail(null);
        }
      }
    } catch (error) {
      console.error('Error fetching emails:', error);
      showNotification('Failed to fetch emails', 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, selectedEmail?.id]);

  useEffect(() => {
    fetchEmails();
  }, [tab]);

  const toggleGroupSelection = (groupId, e) => {
    if (e) e.stopPropagation();
    setSelectedGroupIds(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const toggleMessageExpansion = (id) => {
    setExpandedThreads(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const toggleMessageSelection = (id) => {
    setSelectedMessageIds(prev =>
      prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]
    );
  };

  const toggleSelectAllInThread = () => {
    if (selectedMessageIds.length === selectedEmail?.emails.length) {
      setSelectedMessageIds([]);
    } else {
      setSelectedMessageIds(selectedEmail.emails.map(e => e.id));
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleApprove = async () => {
    // Priority 1: Multi-group selection from sidebar
    // Priority 2: Multi-message selection from current detail view
    let targets = [];
    if (selectedGroupIds.length > 0) {
      targets = emails.filter(g => selectedGroupIds.includes(g.id)).map(g => ({
        isGroup: true,
        ids: g.emails.map(e => e.id)
      }));
    } else if (selectedEmail) {
      targets = [{
        isGroup: selectedMessageIds.length > 1,
        ids: selectedMessageIds
      }];
    }

    if (targets.length === 0 || targets[0].ids.length === 0) {
      showNotification('No emails selected for conversion', 'error');
      return;
    }

    console.log('Approving targets:', targets);
    setActionInProgress(true);
    try {
      for (const target of targets) {
        const isBulk = target.ids.length > 1;
        const endpoint = isBulk ? '/api/mail-review/approve-thread-bulk' : `/api/mail-review/${target.ids[0]}/approve`;
        const body = isBulk ? JSON.stringify({ ids: target.ids }) : null;

        const response = await authenticatedFetch(buildApiUrl(endpoint), {
          method: 'POST',
          headers: isBulk ? { 'Content-Type': 'application/json' } : {},
          body
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.message || 'Approval failed');
      }
      showNotification(`Successfully processed ${targets.length} ${targets.length > 1 ? 'items' : 'item'}`);
      setSelectedGroupIds([]);
      setSelectedMessageIds([]);
      fetchEmails();
      if (onActionComplete) onActionComplete();
    } catch (error) {
      console.error('Approval Error:', error);
      showNotification(error.message || 'Error processing requests', 'error');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleIgnore = async (type = 'ignored') => {
    const targets = selectedGroupIds.length > 0
      ? emails.filter(g => selectedGroupIds.includes(g.id))
      : selectedEmail ? [selectedEmail] : [];

    if (targets.length === 0) return;
    setActionInProgress(true);
    try {
      for (const group of targets) {
        for (const email of group.emails) {
          await authenticatedFetch(buildApiUrl(`/api/mail-review/${email.id}/ignore`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type })
          });
        }
      }
      showNotification(`Items marked as ${type}`);
      setSelectedGroupIds([]);
      fetchEmails();
    } catch (error) {
      showNotification('Error processing requests', 'error');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleContinuationAction = async (emailId, action, params = {}) => {
    setActionInProgress(true);
    try {
      let url = '';
      let options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      };

      if (action === 'continue') {
        url = `/api/mail-review/${emailId}/continue-ticket`;
      } else if (action === 'new_ticket') {
        url = `/api/mail-review/${emailId}/new-ticket`;
      } else if (action === 'reassign') {
        url = `/api/mail-review/${emailId}/reassign-ticket`;
        options.body = JSON.stringify({ ticketId: params.ticketId });
      }

      const response = await authenticatedFetch(buildApiUrl(url), options);
      const result = await response.json();
      if (result.success) {
        showNotification(result.message || 'Action completed successfully');
        setSelectedEmail(null);
        setManualTicketId('');
        setIsReassigning(false);
        fetchEmails();
        if (onActionComplete) onActionComplete();
      } else {
        showNotification(result.message || 'Action failed', 'error');
      }
    } catch (error) {
      console.error('Error performing continuation action:', error);
      showNotification('Failed to perform action', 'error');
    } finally {
      setActionInProgress(false);
    }
  };

  const renderBadge = (email, groupLength, group) => {
    const badges = [];
    if (tab === 'continuation' && group?.ai_confidence_score) {
      const scorePercent = Math.round(group.ai_confidence_score * 100);
      badges.push(
        <span key="continuation-match" className="badge badge-orange" style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }}>
          Continuation Match ({scorePercent}%)
        </span>
      );
    }
    if (!email.existing_user_id) {
      badges.push(<span key="new" className="badge badge-purple">New User</span>);
    }
    if (groupLength > 1) {
      badges.push(<span key="sim" className="badge badge-orange">Thread ({groupLength} Mails)</span>);
    } else if (tab !== 'continuation') {
      badges.push(<span key="single" className="badge badge-blue">Single Mail</span>);
    }
    return badges;
  };

  return (
    <div className="mail-inbox-container">
      {/* Header & Tabs */}
      <div className="mail-inbox-header">
        <div className="mail-inbox-title-area">
          <h1 className="mail-inbox-title">
            <div className="mail-inbox-title-icon">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-3.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
            </div>
            Email Intake Inbox
          </h1>

          <div className="mail-inbox-tabs">
            <button
              onClick={() => setTab('pending')}
              className={`mail-inbox-tab ${tab === 'pending' ? 'active' : ''}`}
            >
              Pending Approval {tab === 'pending' && emails.length > 0 && `(${emails.length})`}
            </button>
            <button
              onClick={() => setTab('continuation')}
              className={`mail-inbox-tab ${tab === 'continuation' ? 'active' : ''}`}
            >
              Continuation Suggestions {tab === 'continuation' && emails.length > 0 && `(${emails.length})`}
            </button>
            <button
              onClick={() => setTab('ticketed')}
              className={`mail-inbox-tab ${tab === 'ticketed' ? 'active' : ''}`}
            >
              Previously Ticketed
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {selectedGroupIds.length > 0 && tab === 'pending' && (
            <div className="bulk-actions-toolbar">
              <span className="selection-count">{selectedGroupIds.length} items selected</span>
              <button
                onClick={handleApprove}
                disabled={actionInProgress}
                className="btn-approve-bulk"
              >
                Consolidate & Convert ({selectedGroupIds.length})
              </button>
              <button onClick={() => setSelectedGroupIds([])} className="btn-ghost">Cancel</button>
            </div>
          )}
          <button onClick={fetchEmails} className="btn-ghost" style={{ padding: '0.5rem' }}>
            <svg className={loading ? 'animate-spin' : ''} width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>
      </div>

      {notification && (
        <div className={`mail-notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* Main Content Area */}
      <div className="mail-inbox-main">
        {/* Left Sidebar: Email List */}
        <div className="mail-inbox-sidebar">
          <div className="mail-inbox-list">
            {loading && emails.length === 0 ? (
              <div className="empty-state">
                <div className="animate-spin" style={{ width: '2rem', height: '2rem', borderRadius: '50%', border: '2px solid #2563eb', borderBottomColor: 'transparent' }}></div>
              </div>
            ) : emails.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <h3>All clear!</h3>
              </div>
            ) : (
              emails.map(group => (
                <div
                  key={group.id}
                  onClick={() => setSelectedEmail(group)}
                  className={`mail-item ${selectedEmail?.id === group.id ? 'selected' : ''} ${group.emails.length > 1 ? 'is-thread' : 'is-single'}`}
                >
                  {tab === 'pending' && (
                    <div className="mail-item-selection-area">
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(group.id)}
                        onChange={(e) => toggleGroupSelection(group.id, e)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: 'pointer' }}
                      />
                    </div>
                  )}
                  <div className="mail-item-main-content">
                    <div className="mail-item-header">
                      <span className="mail-item-sender">{group.sender_name || group.sender_email}</span>
                      <span className="mail-item-time">{formatDateTimeIST(group.latest_received_at)}</span>
                    </div>
                    <h4 className="mail-item-subject">
                      {group.emails[0].subject}
                    </h4>
                    <p className="mail-item-preview">{group.emails[0].body}</p>
                    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                      {renderBadge(group.emails[0], group.emails.length, group)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Area: Detail View */}
        <div className="mail-inbox-content">
          {selectedEmail ? (
            <div className="mail-detail-scroll-area">
              {/* Detail Header */}
              <div className="mail-detail-header">
                <div className="mail-detail-title-row">
                  <div style={{ maxWidth: '70%' }}>
                    <h2 className="mail-detail-subject">{selectedEmail.emails[0].subject}</h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
                      <div className="mail-sender-pill">
                        <div className="mail-sender-avatar">
                          {selectedEmail.sender_name?.charAt(0) || 'U'}
                        </div>
                        <span style={{ fontWeight: 600 }}>{selectedEmail.sender_name || 'Sender'}</span>
                        <span style={{ color: '#9ca3af' }}>&lt;{selectedEmail.sender_email}&gt;</span>
                      </div>
                      <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>{selectedEmail.emails.length} related emails in this thread</span>
                    </div>
                  </div>

                  {tab === 'continuation' ? (
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      {isReassigning ? (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#f8fafc', padding: '0.375rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                          <input
                            type="text"
                            value={manualTicketId}
                            onChange={(e) => setManualTicketId(e.target.value)}
                            placeholder="Enter Ticket ID..."
                            style={{ padding: '0.25rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', width: '120px', fontSize: '0.75rem', outline: 'none' }}
                          />
                          <button
                            onClick={() => handleContinuationAction(selectedEmail.emails[0].id, 'reassign', { ticketId: manualTicketId })}
                            disabled={!manualTicketId.trim() || actionInProgress}
                            className="btn-approve"
                            style={{ padding: '0.25rem 0.75rem' }}
                          >
                            Assign
                          </button>
                          <button
                            onClick={() => setIsReassigning(false)}
                            className="btn-ghost"
                            style={{ padding: '0.25rem 0.5rem' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button
                            onClick={() => handleContinuationAction(selectedEmail.emails[0].id, 'continue')}
                            disabled={actionInProgress}
                            className="btn-approve"
                            style={{ background: '#d97706', boxShadow: 'none' }}
                          >
                            Accept & Attach
                          </button>
                          <button
                            onClick={() => handleContinuationAction(selectedEmail.emails[0].id, 'new_ticket')}
                            disabled={actionInProgress}
                            className="btn-approve"
                          >
                            Create New Ticket
                          </button>
                          <button
                            onClick={() => setIsReassigning(true)}
                            disabled={actionInProgress}
                            className="btn-ghost"
                          >
                            Manual Reassign
                          </button>
                          <button onClick={() => handleIgnore('ignored')} className="btn-ghost">Ignore</button>
                          <button onClick={() => handleIgnore('spam')} className="btn-ghost" style={{ color: '#dc2626' }}>Mark Spam</button>
                        </div>
                      )}
                    </div>
                  ) : tab === 'pending' ? (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button onClick={handleApprove} disabled={actionInProgress || selectedMessageIds.length === 0} className="btn-approve">
                        {actionInProgress ? (
                          <div className="animate-spin" style={{ width: '1rem', height: '1rem', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
                        ) : (
                          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        )}
                        {selectedMessageIds.length > 1 ? `Consolidate & Convert` : 'Convert to Ticket'}
                      </button>
                      <button onClick={() => handleIgnore('ignored')} className="btn-ghost">Ignore</button>
                      <button onClick={() => handleIgnore('spam')} className="btn-ghost" style={{ color: '#dc2626' }}>Mark Spam</button>
                    </div>
                  ) : (
                    <div style={{ background: '#f0fdf4', border: '1px solid #dcfce7', padding: '0.5rem 1rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ padding: '0.375rem', background: '#22c55e', borderRadius: '50%', color: 'white', display: 'flex' }}>
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.65rem', color: '#16a34a', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1 }}>Converted</div>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#14532d' }}>Ticket #{selectedEmail.emails[0].linked_ticket_id}</div>
                      </div>
                      <a href={`/manager/ticket/${selectedEmail.emails[0].linked_ticket_id}`} target="_blank" rel="noopener noreferrer" className="btn-outline-sm" style={{ padding: '0.25rem 0.625rem', fontSize: '0.7rem' }}>View Ticket</a>
                    </div>
                  )}
                </div>
              </div>

              {/* Insights Area */}
              <div className="mail-detail-insights-area">
                {tab === 'continuation' && (
                  <div style={{ margin: '1.5rem', padding: '1.5rem', background: 'linear-gradient(135deg, #fffbeb 0%, #fffbeb 100%)', border: '1px solid #fde68a', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(217, 119, 6, 0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                      <div style={{ padding: '0.5rem', background: '#d97706', color: 'white', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.5rem 0' }}>
                          AI Continuation Match Suggestion
                          <span style={{ fontSize: '0.75rem', fontWeight: 900, background: '#fef3c7', color: '#b45309', padding: '0.125rem 0.5rem', borderRadius: '0.25rem', border: '1px solid #fde68a' }}>
                            {selectedEmail.ai_confidence_score ? Math.round(selectedEmail.ai_confidence_score * 100) : 0}% Match
                          </span>
                        </h3>
                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#92400e', lineHeight: 1.5 }}>
                          <span style={{ fontWeight: 700 }}>AI Analysis: </span>{selectedEmail.ai_continuation_reason || "AI matched this email to an existing open ticket."}
                        </p>

                        {/* Matched Target Ticket Card */}
                        <div style={{ background: '#ffffff', border: '1px solid #fde68a', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Match Ticket</span>
                            <span className="badge" style={{
                              background: selectedEmail.ticket_status === 'new' ? '#eff6ff' : selectedEmail.ticket_status === 'in_progress' ? '#fff7ed' : '#faf5ff',
                              color: selectedEmail.ticket_status === 'new' ? '#1d4ed8' : selectedEmail.ticket_status === 'in_progress' ? '#c2410c' : '#7e22ce',
                              border: `1px solid ${selectedEmail.ticket_status === 'new' ? '#bfdbfe' : selectedEmail.ticket_status === 'in_progress' ? '#ffedd5' : '#e9d5ff'}`
                            }}>
                              {selectedEmail.ticket_status || 'Open'}
                            </span>
                          </div>
                          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>
                            Ticket #{selectedEmail.ticket_id}: {selectedEmail.ticket_title}
                          </h4>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.8125rem', color: '#64748b' }}>
                            <div><span style={{ fontWeight: 600, color: '#94a3b8' }}>Requester:</span> <span style={{ color: '#334155', fontWeight: 500 }}>{selectedEmail.ticket_requester}</span></div>
                            <div><span style={{ fontWeight: 600, color: '#94a3b8' }}>Agent:</span> <span style={{ color: '#334155', fontWeight: 500 }}>{selectedEmail.ticket_agent_name || 'Unassigned'}</span></div>
                            <div><span style={{ fontWeight: 600, color: '#94a3b8' }}>Priority:</span> <span style={{ color: '#334155', fontWeight: 700, textTransform: 'capitalize' }}>{selectedEmail.ticket_priority}</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'pending' && selectedEmail.emails[0].ai_extracted_fields && (
                  <div className="insights-bar" style={{ padding: '1rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      <svg width="20" height="20" style={{ color: '#2563eb' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                      <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#1e40af' }}>AI Insights:</span>
                    </div>

                    <span className="badge badge-blue">Category: {selectedEmail.emails[0].ai_extracted_fields.issueType || 'Incident'}</span>
                    <span className="badge badge-blue">Product: {selectedEmail.emails[0].ai_extracted_fields.product || 'IT Support'}</span>
                    <span className="badge badge-blue">Priority: {selectedEmail.emails[0].ai_extracted_fields.priority || 'Medium'}</span>
                    <span className="badge badge-orange">Threaded Conversation</span>
                  </div>
                )}

                {tab === 'pending' && selectedEmail.emails[0].ai_extracted_fields?.clean_description && (
                  <div className="ai-clean-description-box" style={{ margin: '0 1.5rem 1.5rem' }}>
                    <div className="ai-clean-label">
                      <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
                      AI Suggested Clean Description
                    </div>
                    <div className="ai-clean-content">
                      {selectedEmail.emails[0].ai_extracted_fields.clean_description}
                    </div>
                  </div>
                )}
              </div>

              {/* Compact Thread Container */}
              <div className="mail-thread-container compact">
                {/* Thread Header Toolbar - ONLY for Pending */}
                {tab === 'pending' && (
                  <div className="thread-toolbar">
                    <div className="thread-toolbar-left">
                      <div className="group-select-checkbox" onClick={toggleSelectAllInThread}>
                        <input
                          type="checkbox"
                          checked={selectedMessageIds.length === selectedEmail.emails.length && selectedEmail.emails.length > 0}
                          onChange={() => { }}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>Select All</span>
                      </div>
                      <span className="thread-count-indicator">{selectedEmail.emails.length} messages</span>
                    </div>
                    <div className="thread-toolbar-right">
                      {/* Sub-button removed as per user request to keep only top primary button */}
                    </div>
                  </div>
                )}

                {/* Compact Message List */}
                <div className="thread-message-list">
                  {selectedEmail.emails.map((email, idx) => {
                    const isSimilar = idx === 0 || email.subject.toLowerCase().includes(selectedEmail.emails[0].subject.split(' ').slice(0, 3).join(' ').toLowerCase());

                    return (
                      <div key={email.id} className={`thread-row-container ${expandedThreads[email.id] ? 'is-expanded' : ''} ${isSimilar ? 'is-similar-intent' : 'is-different-intent'}`}>
                        <div
                          className={`thread-row ${selectedMessageIds.includes(email.id) ? 'row-selected' : ''}`}
                          onClick={() => toggleMessageExpansion(email.id)}
                        >
                          {tab === 'pending' && (
                            <div className="thread-row-selection" onClick={(e) => { e.stopPropagation(); toggleMessageSelection(email.id); }}>
                              <input
                                type="checkbox"
                                checked={selectedMessageIds.includes(email.id)}
                                onChange={() => { }}
                              />
                            </div>
                          )}

                          <div className="thread-row-content">
                            <div className="thread-row-primary">
                              <svg
                                width="14" height="14"
                                className={`row-arrow ${expandedThreads[email.id] ? 'open' : ''}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="thread-row-subject">{email.subject}</span>
                              <span className="thread-row-preview">— {email.body.substring(0, 80)}</span>
                            </div>
                            <div className="thread-row-meta">
                              {idx === 0 ? (
                                <span className="latest-pill">Primary</span>
                              ) : isSimilar ? (
                                <span className="badge-similar">Similar</span>
                              ) : (
                                <span className="badge-different">Odd</span>
                              )}
                              <span className="thread-row-time">{formatDateTimeIST(email.received_at)}</span>
                            </div>
                          </div>
                        </div>

                        {expandedThreads[email.id] && (
                          <div className="thread-row-body-expanded">
                            <div className="expanded-body-header">
                              <div className="sender-info-compact">
                                <strong>{email.sender_name}</strong> <span>&lt;{email.sender_email}&gt;</span>
                              </div>
                              <span className="full-time">{formatDateTimeIST(email.received_at)}</span>
                            </div>
                            <div className="expanded-body-content">
                              {email.body}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
              </div>
              <h2 style={{ color: '#9ca3af' }}>No selection</h2>
              <p style={{ maxWidth: '300px', margin: '0 auto' }}>Select an email from the left sidebar to start reviewing incoming support requests.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MailInbox;
