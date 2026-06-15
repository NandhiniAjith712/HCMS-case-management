import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDateTimeIST } from '../../utils/dateTime';
import './TicketTemplate.css';
import TicketChat from './TicketChat';

const TicketTemplate = ({ 
  ticket, 
  userType = 'agent',
  showActions = true,
  showChat = true,
  showSLA = true,
  showTimestamps = true,
  showDescription = true,
  showDetails = true,
  showStatus = true,
  showCustomerInfo = true,
  showAgentInfo = true,
  showNavigation = true,
  showLogout = false,
  onStatusChange = null,
  onReplyAdded = null,
  customActions = null,
  customHeader = null,
  customFooter = null,
  className = '',
  style = {}
}) => {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [replies, setReplies] = useState([]);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyStatus, setReplyStatus] = useState('');
  const [openMediaId, setOpenMediaId] = useState(null);
  const navigate = useNavigate();

  // Fetch ticket replies when ticket changes
  useEffect(() => {
    if (ticket && ticket.id) {
      fetchTicketReplies();
    }
  }, [ticket]);

  const fetchTicketReplies = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/tickets/${ticket.id}/replies`, {
        method: 'GET',
        headers: headers
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setReplies(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching ticket replies:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('tickUser');
    localStorage.removeItem('agentData');
    localStorage.removeItem('agentToken');
    navigate('/');
  };

  const handleBackToDashboard = () => {
    // Navigate back based on userType
    let dashboardPath = '/';
    
    switch (userType) {
      case 'agent':
        dashboardPath = '/agent-dashboard';
        break;
      case 'admin':
        dashboardPath = '/admin-dashboard';
        break;
      case 'manager':
        dashboardPath = '/manager';
        break;
      case 'ceo':
        dashboardPath = '/ceo';
        break;
      case 'business':
        dashboardPath = '/business';
        break;
      default:
        dashboardPath = '/';
    }
    
    navigate(dashboardPath);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return formatDateTimeIST(dateString);
  };

  const handleReplyAdded = (ticketId) => {
    // Refresh ticket replies when a reply is added
    fetchTicketReplies();
    
    // Call parent callback if provided
    if (onReplyAdded) {
      onReplyAdded(ticketId);
    }
  };

  const handleResolveTicket = async () => {
    if (onStatusChange) {
      await onStatusChange(ticket.id, 'closed');
    }
  };

  const handleEscalateTicket = async () => {
    if (onStatusChange) {
      await onStatusChange(ticket.id, 'escalated');
    }
  };

  const handleReopenTicket = async () => {
    if (onStatusChange) {
      await onStatusChange(ticket.id, 'in_progress');
    }
  };

  const handleSendReply = async () => {
    if (!replyMessage.trim()) return;

    try {
      setReplyStatus('sending');
      
      // Send reply to WhatsApp/Email (automated)
      const headers = getAuthHeaders();
      const response = await fetch('/api/replies', {
        method: 'POST',
        headers: headers,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticketId: ticket.id,
          agentName: userType === 'agent' ? 'Agent' : 'Manager',
          message: replyMessage.trim(),
          type: 'whatsapp_email' // Indicates this is for WhatsApp/Email automation
        })
      });

      if (response.ok) {
        setReplyStatus('success');
        setReplyMessage('');
        
        // Show success message
        setTimeout(() => {
          setReplyStatus('');
        }, 3000);
        
        // Refresh replies
        fetchTicketReplies();
      } else {
        setReplyStatus('error');
        setTimeout(() => {
          setReplyStatus('');
        }, 3000);
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      setReplyStatus('error');
      setTimeout(() => {
        setReplyStatus('');
      }, 3000);
    }
  };

  const renderDefaultActions = () => {
    if (ticket.status === 'closed') {
      return (
        <button className="action-btn reopen-btn" onClick={handleReopenTicket}>
          🔄 Reopen Ticket
        </button>
      );
    }

    if (ticket.status === 'escalated') {
      return (
        <button className="action-btn resolve-btn" onClick={handleResolveTicket}>
          ✅ Resolve
        </button>
      );
    }

    return (
      <>
        <button className="action-btn resolve-btn" onClick={handleResolveTicket}>
          ✅ RESOLVE
        </button>
        <button className="action-btn escalate-btn" onClick={handleEscalateTicket}>
          🚨 ESCALATE
        </button>
      </>
    );
  };

  if (!ticket) {
    return (
      <div className="ticket-template-error">
        <p>No ticket data provided</p>
      </div>
    );
  }

  return (
    <div className={`ticket-template ${className}`} style={style}>
      {/* Header Section */}
      {showNavigation && (
        <div className="ticket-header">
          <div className="header-left">
            <button onClick={handleBackToDashboard} className="back-btn">
              ← Back to {userType === 'agent' ? 'Agent' : 
                         userType === 'admin' ? 'Admin' : 
                         userType === 'manager' ? 'Manager' :
                         userType === 'ceo' ? 'CEO' :
                         userType === 'business' ? 'Business' : 'Dashboard'}
            </button>
            {customHeader || <h1>🎫 Ticket #{ticket.id}</h1>}
          </div>
          {showLogout && (
            <button onClick={handleLogout} className="logout-btn">↗ Logout</button>
          )}
        </div>
      )}

      {/* Main Ticket Content */}
      <div className="ticket-main-content">
        {/* Escalated Notice Banner */}
        {ticket.status === 'escalated' && (
          <div className="escalated-notice">
            <p>🚨 This ticket has already breached its SLA. Please address it promptly.</p>
          </div>
        )}

        {/* Ticket Card Header */}
        <div className="ticket-card-header">
          <div className="ticket-info">
            <h3>{ticket.email || 'leo@gmail.com'}</h3>
            <span className="ticket-customer">{ticket.name || 'sri'}</span>
            {ticket.module && (
              <span className="ticket-module">📦 {ticket.module}</span>
            )}
          </div>
          <div className="right-section">
            {showStatus && (
              <span className={`status-badge ${ticket.status}`}>
                {ticket.status === 'new' ? 'NEW' :
                 ticket.status === 'in_progress' ? 'IN PROGRESS' :
                 ticket.status === 'escalated' ? 'ESCALATED' :
                 ticket.status === 'closed' ? 'CLOSED' : 'UNKNOWN'}
              </span>
            )}
            
            {/* Integrated SLA Timer */}
            {showSLA && (
              <div className="integrated-sla-timer">
                <div className="sla-header-small">
                  <span className="clock-icon-small">⏰</span>
                  <span className="sla-title-small">SLA Timer</span>
                  <span className="priority-badge-small">P2</span>
                </div>
                <div className="time-remaining-small">3h 2m remaining</div>
                <div className="sla-controls-small">
                  <button className="check-btn-small">✅</button>
                  <label className="auto-refresh-label-small">
                    <input 
                      type="checkbox" 
                      checked={autoRefresh} 
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                    />
                    Auto
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ticket Body */}
        <div className="ticket-body">
          {/* Ticket Details */}
          <div className="ticket-details">
            <div className="detail-row">
              <span className="detail-label">Issue Type:</span>
              <span className="detail-value">
                {ticket.issue_type === 'Other' && ticket.issue_type_other 
                  ? ticket.issue_type_other 
                  : ticket.issue_type || 'Account Access'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Issue Title:</span>
              <span className="detail-value">{ticket.issue_title || 'SHJK'}</span>
            </div>
            {ticket.product && (
              <div className="detail-row">
                <span className="detail-label">Product:</span>
                <span className="detail-value product-badge">{ticket.product}</span>
              </div>
            )}
            {ticket.module && (
              <div className="detail-row">
                <span className="detail-label">Module:</span>
                <span className="detail-value module-badge">{ticket.module}</span>
              </div>
            )}
          </div>

          {/* Other Issue Description */}
          {ticket.issue_type === 'Other' && ticket.issue_type_other && (
            <div className="other-issue-description">
              <strong>Other Issue Description:</strong>
              <div>{ticket.issue_type_other}</div>
            </div>
          )}

          {/* Main Description */}
          <p className="ticket-description">{ticket.description || 'DFGHJKL'}</p>

          {/* Attachment */}
          {ticket.attachment_name && ticket.attachment_type && (
            <div className="ticket-attachment">
              <button className="open-media-btn" onClick={() => setOpenMediaId(ticket.id)}>
                📎 Open Media
              </button>
              {openMediaId === ticket.id && (
                <div className="media-preview-modal">
                  <button className="close-media-btn" onClick={() => setOpenMediaId(null)}>&times;</button>
                  {ticket.attachment_type.startsWith('image/') ? (
                    <img 
                      src={`/api/tickets/${ticket.id}/attachment?cb=${Date.now()}`} 
                      alt={ticket.attachment_name} 
                      className="attachment-img-large" 
                    />
                  ) : ticket.attachment_type === 'application/pdf' ? (
                    <embed 
                      src={`/api/tickets/${ticket.id}/attachment?cb=${Date.now()}`} 
                      type="application/pdf" 
                      className="attachment-pdf" 
                    />
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Ticket Meta */}
          <div className="ticket-meta">
            <span className="meta-item">📅 {formatDate(ticket.created_at)}</span>
            {ticket.updated_at && ticket.updated_at !== ticket.created_at && (
              <span className="meta-item">🔄 Updated: {formatDate(ticket.updated_at)}</span>
            )}
            {showTimestamps && (
              <>
                <span className="meta-item">⏱️ Response Time: {ticket.response_time || '2h 15m'}</span>
                <span className="meta-item">🎯 Resolution Time: {ticket.resolution_time || '5h 30m'}</span>
              </>
            )}
          </div>
        </div>

        {/* Ticket Actions */}
        {showActions && (
          <div className="ticket-actions">
            <button className="action-btn small-btn">•</button>
            {customActions ? customActions(ticket) : renderDefaultActions()}
          </div>
        )}

        {/* Reply Box for WhatsApp/Email Automation */}
        <div className="reply-automation-section">
          <h3>📤 Send Reply (WhatsApp/Email)</h3>
          <div className="reply-box">
            <textarea
              className="reply-textarea"
              placeholder="Type your reply here... This will be sent to the user via WhatsApp and Email automatically."
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              rows={4}
            />
            <div className="reply-actions">
              <button 
                className="send-reply-btn"
                onClick={handleSendReply}
                disabled={!replyMessage.trim() || replyStatus === 'sending'}
              >
                {replyStatus === 'sending' ? '📤 Sending...' : '📤 Send Reply'}
              </button>
              {replyStatus === 'success' && (
                <span className="reply-status success">✅ Reply sent successfully!</span>
              )}
              {replyStatus === 'error' && (
                <span className="reply-status error">❌ Failed to send reply</span>
              )}
            </div>
          </div>
        </div>

        {/* Chat Room for User-Agent Communication */}
        {showChat && (
          <div className="chat-section">
            <h3>💬 Chat Room (User-Agent Communication)</h3>
            <div className="chat-room-container">
              <TicketChat
                ticket={ticket}
                userType={userType}
                onReplyAdded={handleReplyAdded}
                showReplySection={true}
                showActions={true}
              />
            </div>
          </div>
        )}

        {/* Custom Footer */}
        {customFooter && (
          <div className="custom-footer">
            {customFooter}
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketTemplate;
