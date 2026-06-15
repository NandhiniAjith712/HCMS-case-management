import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders, authenticatedFetch } from '../../utils/api';
import { formatDateTimeIST } from '../../utils/dateTime';
import './TicketCard.css';
import TicketChat from '../chat/TicketChat';

const TicketCard = ({ 
  ticket, 
  userType = 'agent', 
  onStatusChange, 
  onReplyAdded,
  showActions = true,
  showChat = true,
  customActions = null,
  showReplyInput = false // New prop to control reply input visibility
}) => {
  const [openMediaId, setOpenMediaId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const navigate = useNavigate();

  const formatDate = (dateString) => {
    return formatDateTimeIST(dateString);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'new': return '#3b82f6';
      case 'in_progress': return '#f59e0b';
      case 'escalated': return '#ef4444';
      case 'closed': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'new': return 'NEW';
      case 'in_progress': return 'IN PROGRESS';
      case 'escalated': return 'ESCALATED';
      case 'closed': return 'CLOSED';
      default: return status.toUpperCase();
    }
  };

  const handleResolveTicket = async (ticketId) => {
    if (onStatusChange) {
      await onStatusChange(ticketId, 'closed');
    }
  };

  const handleEscalateTicket = async (ticketId) => {
    if (onStatusChange) {
      await onStatusChange(ticketId, 'escalated');
    }
  };

  const handleReopenTicket = async (ticketId) => {
    if (onStatusChange) {
      await onStatusChange(ticketId, 'in_progress');
    }
  };

  const handleTicketClick = () => {
    // Navigate to ticket detail page with current dashboard context
    let fromPage = 'tickets';
    let activeTab = 'overview';
    
    // Set context based on userType
    switch (userType) {
      case 'agent':
        fromPage = 'agent-dashboard';
        activeTab = 'new';
        break;
      case 'manager':
        fromPage = 'manager-dashboard';
        activeTab = 'overview';
        break;
      case 'admin':
        fromPage = 'admin-dashboard';
        activeTab = 'table';
        break;
      case 'ceo':
        fromPage = 'ceo-dashboard';
        activeTab = 'overview';
        break;
      case 'business':
        fromPage = 'business-dashboard';
        activeTab = 'overview';
        break;
      default:
        fromPage = 'tickets';
        activeTab = 'overview';
    }
    
    navigate(`/ticket/${ticket.id}`, {
      state: {
        from: fromPage,
        activeTab: activeTab,
        selectedProduct: 'all'
      }
    });
  };

  const renderDefaultActions = () => {
    if (ticket.status === 'closed') {
      return (
        <button className="reopen-btn" onClick={() => handleReopenTicket(ticket.id)}>
          Reopen Ticket
        </button>
      );
    }

    if (ticket.status === 'escalated') {
      return (
        <button className="resolve-btn" onClick={() => handleResolveTicket(ticket.id)}>
          Resolve
        </button>
      );
    }

    return (
      <>
        <button className="resolve-btn" onClick={() => handleResolveTicket(ticket.id)}>
          Resolve
        </button>
        <button className="escalate-btn" onClick={() => handleEscalateTicket(ticket.id)}>
          Escalate
        </button>
      </>
    );
  };

  // Handle customer reply submission
  const handleCustomerReply = async (e) => {
    e.preventDefault();
    
    if (!replyText.trim()) {
      alert('Please enter a reply message');
      return;
    }

    setSendingReply(true);

    try {
      const headers = getAuthHeaders();
      const response = await fetch('http://localhost:5000/api/replies', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          ticketId: ticket.id,
          message: replyText.trim(),
          isCustomerReply: true,
          customerName: ticket.name
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Customer reply sent successfully:', result);
        
        // Clear reply form
        setReplyText('');
        
        // Notify parent component about new reply
        if (onReplyAdded) {
          onReplyAdded(ticket.id);
        }
        
        // Show success message
        alert('Reply sent successfully!');
      } else {
        const errorData = await response.json();
        console.error('Failed to send reply:', errorData);
        alert(`Failed to send reply: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      alert(`Error sending reply: ${error.message}`);
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className={`ticket-card ${ticket.status}`} onClick={handleTicketClick}>
      {/* Ticket Header */}
      <div className="ticket-header">
        <div className="ticket-info">
          <h3>{ticket.email}</h3>
          <span className="ticket-customer">{ticket.name}</span>
          {ticket.module && (
            <span className="ticket-module">📦 {ticket.module}</span>
          )}
        </div>
        <span className={`status-badge ${ticket.status}`}>
          {getStatusLabel(ticket.status)}
        </span>
      </div>

      {/* Ticket Body */}
      <div className="ticket-body">
        <div className="ticket-details">
          <div className="detail-row">
            <span className="detail-label">Issue Type:</span>
            <span className="detail-value">
              {ticket.issue_type === 'Other' && ticket.issue_type_other 
                ? ticket.issue_type_other 
                : ticket.issue_type}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Issue Title:</span>
            <span className="detail-value">{ticket.issue_title}</span>
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
        <p className="ticket-description">{ticket.description}</p>

        {/* Attachment */}
        {ticket.attachment_name && ticket.attachment_type && (
          <div className="ticket-attachment">
            <button className="open-media-btn" onClick={() => setOpenMediaId(ticket.id)}>
              Open Media
            </button>
            {openMediaId === ticket.id && (
              <div className="media-preview-modal">
                <button className="close-media-btn" onClick={() => setOpenMediaId(null)}>&times;</button>
                {ticket.attachment_type.startsWith('image/') ? (
                  <img 
                    src={`http://localhost:5000/api/tickets/${ticket.id}/attachment?cb=${Date.now()}`} 
                    alt={ticket.attachment_name} 
                    className="attachment-img-large" 
                  />
                ) : ticket.attachment_type === 'application/pdf' ? (
                  <embed 
                    src={`http://localhost:5000/api/tickets/${ticket.id}/attachment?cb=${Date.now()}`} 
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
        </div>
      </div>

      {/* Customer Reply Input Section */}
      {showReplyInput && userType === 'customer' && (
        <div className="customer-reply-section">
          <form onSubmit={handleCustomerReply} className="reply-form">
            <div className="reply-input-wrapper">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply message here..."
                className="reply-textarea"
                rows="3"
                disabled={sendingReply}
                onClick={(e) => e.stopPropagation()} // Prevent ticket click when clicking on input
              />
              <button 
                type="submit" 
                className="send-reply-btn"
                disabled={sendingReply || !replyText.trim()}
                onClick={(e) => e.stopPropagation()} // Prevent ticket click when clicking on button
              >
                {sendingReply ? 'Sending...' : 'Send Reply'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Ticket Actions */}
      {showActions && (
        <div className="ticket-actions">
          {/* Chat Icon */}
          {showChat && (
            <TicketChat
              ticket={ticket}
              user={{ id: userType, name: userType === 'agent' ? 'Agent' : 'Manager' }}
              userType={userType}
              onClose={() => {}}
              onReplyAdded={() => {
                if (onReplyAdded) {
                  onReplyAdded(ticket.id);
                }
              }}
            />
          )}

          {/* Custom Actions or Default Actions */}
          {customActions ? customActions(ticket) : renderDefaultActions()}
        </div>
      )}
    </div>
  );
};

export default TicketCard;
