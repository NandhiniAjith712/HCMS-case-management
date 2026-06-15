import React, { useState, useEffect, useRef } from 'react';
import { getAuthHeaders, authenticatedFetch } from '../../utils/api';
import { formatDateIST, formatDateTimeIST } from '../../utils/dateTime';
import './CustomerTicketChat.css';

const CustomerTicketChat = ({ ticket, user, onClose, onReplyAdded }) => {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);
  const API_BASE = process.env.REACT_APP_API_URL || '/api';

  useEffect(() => {
    if (ticket) {
      fetchReplies();
    }
  }, [ticket]);

  useEffect(() => {
    scrollToBottom();
  }, [replies]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchReplies = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/replies/${ticket.id}`, {
        method: 'GET',
        headers: headers
      });
      const data = await response.json();
      
      if (data.success) {
        setReplies(data.data);
      } else {
        console.error('Failed to fetch replies:', data.message);
      }
    } catch (error) {
      console.error('Error fetching replies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    
    if (!newMessage.trim()) return;
    
    try {
      setSending(true);
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/replies`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          ticketId: ticket.id,
          message: newMessage.trim(),
          isCustomerReply: true,
          customerName: user.name || user.email
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setNewMessage('');
        await fetchReplies(); // Refresh replies
        if (onReplyAdded) {
          onReplyAdded();
        }
      } else {
        alert(`Failed to send reply: ${data.message}`);
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      alert('Failed to send reply. Please try again.');
    } finally {
      setSending(false);
    }
  };

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
      case 'new': return 'New';
      case 'in_progress': return 'In Progress';
      case 'escalated': return 'Escalated';
      case 'closed': return 'Closed';
      default: return status;
    }
  };

  if (!ticket) return null;

  return (
    <div className="customer-chat-overlay">
      <div className="customer-chat-container">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-left">
            <button className="close-btn" onClick={onClose}>
              ✕
            </button>
            <div className="ticket-info">
              <h3>Ticket #{ticket.id}</h3>
              <p className="ticket-title">{ticket.issue_title}</p>
              <div className="ticket-meta">
                <span className="customer-name">{ticket.name || user?.name || 'Customer'}</span>
                <span className="separator">•</span>
                <span className="status-badge" style={{ backgroundColor: getStatusColor(ticket.status) }}>
                  {getStatusLabel(ticket.status)}
                </span>
                <span className="separator">•</span>
                <span className="ticket-date">
                  {formatDateIST(ticket.created_at)}
                </span>
                {ticket.issue_type && (
                  <>
                    <span className="separator">•</span>
                    <span className="issue-type">{ticket.issue_type === 'Other' && ticket.issue_type_other 
                      ? ticket.issue_type_other 
                      : ticket.issue_type}</span>
                  </>
                )}
                {ticket.product && (
                  <>
                    <span className="separator">•</span>
                    <span className="product-info">{ticket.product}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="chat-messages">
          {loading ? (
            <div className="loading-messages">
              <div className="loading-spinner"></div>
              <p>Loading conversation...</p>
            </div>
          ) : (
            <>
              {/* Original Ticket Message */}
              <div className="message customer-message">
                <div className="message-header">
                  <span className="sender-name">You</span>
                  <span className="message-time">
                    {formatDate(ticket.created_at)}
                  </span>
                </div>
                <div className="message-content">
                  <div className="message-text">
                    <strong>Issue:</strong> {ticket.issue_title}
                  </div>
                  <div className="message-text">
                    <strong>Type:</strong> {ticket.issue_type === 'Other' && ticket.issue_type_other 
                      ? ticket.issue_type_other 
                      : ticket.issue_type}
                  </div>
                  <div className="message-text">
                    <strong>Description:</strong> {ticket.description}
                  </div>
                  {ticket.product && (
                    <div className="message-text">
                      <strong>Product:</strong> {ticket.product}
                    </div>
                  )}
                  {ticket.module && (
                    <div className="message-text">
                      <strong>Module:</strong> {ticket.module}
                    </div>
                  )}
                </div>
              </div>

              {/* Replies */}
              {replies.map((reply) => (
                <div 
                  key={reply.id} 
                  className={`message ${reply.is_customer_reply ? 'customer-message' : 'agent-message'}`}
                >
                  <div className="message-header">
                    <span className="sender-name">
                      {reply.is_customer_reply 
                        ? 'You'
                        : (reply.agent_name || 'Support Agent')
                      }
                    </span>
                    <span className="message-time">
                      {formatDate(reply.sent_at)}
                    </span>
                  </div>
                  <div className="message-content">
                    <div className="message-text">{reply.message}</div>
                  </div>
                </div>
              ))}
              
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Reply Input */}
        <div className="chat-input-container">
          <form onSubmit={handleSendReply} className="chat-input-form">
            <div className="input-wrapper">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your reply..."
                className="chat-input"
                rows="3"
                disabled={sending}
              />
              <button 
                type="submit" 
                className="send-btn"
                disabled={sending || !newMessage.trim()}
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CustomerTicketChat; 