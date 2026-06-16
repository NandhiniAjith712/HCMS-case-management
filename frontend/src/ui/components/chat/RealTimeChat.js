import React, { useState, useEffect, useRef } from 'react';
import { getAuthHeaders, getTenantId, authenticatedFetch } from '../../utils/api';
import { formatDateIST, formatDateTimeIST } from '../../utils/dateTime';
import './RealTimeChat.css';

const RealTimeChat = ({ ticket, user, userType, onClose, onReplyAdded }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [sending, setSending] = useState(false);
  const [agentName, setAgentName] = useState('');
  
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  
  const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:5000';

  useEffect(() => {
    if (ticket) {
      connectWebSocket();
      fetchExistingMessages();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [ticket]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Use logged-in agent's name when userType is agent
  useEffect(() => {
    if (userType === 'agent' && user) {
      setAgentName(user.name || user.email || 'Agent');
    }
  }, [user, userType]);

  const connectWebSocket = () => {
    try {
      wsRef.current = new WebSocket(WS_URL);
      
      wsRef.current.onopen = () => {
        console.log('🔌 WebSocket connected');
        setIsConnected(true);
        
        // Join the ticket room
        const tenantId = ticket.tenant_id ?? getTenantId();
        wsRef.current.send(JSON.stringify({
          type: 'JOIN_TICKET',
          ticketId: ticket.id,
          userId: user.id,
          userType: userType,
          tenantId
        }));
      };

      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      };

      wsRef.current.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setIsConnected(false);
      };

      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setIsConnected(false);
      };
    } catch (error) {
      console.error('❌ Failed to connect WebSocket:', error);
    }
  };

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'JOINED_ROOM':
        console.log('✅ Joined chat room:', data.message);
        break;
        
      case 'NEW_MESSAGE':
        setMessages(prev => [...prev, {
          id: Date.now(),
          message: data.message,
          userType: data.userType,
          agentName: data.agentName,
          customerName: data.customerName,
          timestamp: data.timestamp,
          isNew: true
        }]);
        
        // Remove "new" flag after a moment
        setTimeout(() => {
          setMessages(prev => 
            prev.map(msg => ({ ...msg, isNew: false }))
          );
        }, 3000);
        break;
        
      case 'USER_TYPING':
        if (data.userType !== userType) {
          setTypingUsers(prev => {
            const userKey = data.userType === 'agent' ? data.agentName : data.customerName;
            if (!prev.includes(userKey)) {
              return [...prev, userKey];
            }
            return prev;
          });
        }
        break;
        
      case 'USER_STOPPED_TYPING':
        if (data.userType !== userType) {
          setTypingUsers(prev => prev.filter(user => user !== (data.userType === 'agent' ? data.agentName : data.customerName)));
        }
        break;
        
      default:
        console.log('📨 Unknown message type:', data.type);
    }
  };

  const fetchExistingMessages = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/chat/messages/${ticket.id}`, {
        method: 'GET',
        headers: headers
      });
      const data = await response.json();
      
      if (data.success) {
        const formattedMessages = data.data.map(msg => ({
          id: msg.id,
          message: msg.message,
          userType: msg.sender_type,
          agentName: msg.sender_type === 'agent' ? msg.sender_name : null,
          customerName: msg.sender_type === 'customer' ? msg.sender_name : null,
          timestamp: msg.created_at,
          isNew: false
        }));
        
        setMessages(formattedMessages);
      }
    } catch (error) {
      console.error('❌ Error fetching messages:', error);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !isConnected) return;
    
    try {
      setSending(true);
      
      // Send message via WebSocket
      wsRef.current.send(JSON.stringify({
        type: 'SEND_MESSAGE',
        ticketId: ticket.id,
        message: newMessage.trim(),
        userType: userType,
        agentName: userType === 'agent' ? (agentName || user?.name || user?.email || 'Agent') : null,
        customerName: userType === 'customer' ? (user.name || user.email) : null
      }));
      
      setNewMessage('');
      
      if (onReplyAdded) {
        onReplyAdded();
      }
    } catch (error) {
      console.error('❌ Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    
    if (!isTyping) {
      setIsTyping(true);
      wsRef.current.send(JSON.stringify({
        type: 'TYPING',
        ticketId: ticket.id,
        userType: userType,
        agentName: userType === 'agent' ? (agentName || user?.name || user?.email || 'Agent') : null,
        customerName: userType === 'customer' ? (user.name || user.email) : null
      }));
    }
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      wsRef.current.send(JSON.stringify({
        type: 'STOP_TYPING',
        ticketId: ticket.id,
        userType: userType
      }));
    }, 1000);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    <div className="realtime-chat-overlay">
      <div className="realtime-chat-container">
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
                <span className="customer-name">{ticket.name || 'Customer'}</span>
                <span className="separator">•</span>
                <span className="connection-status">
                  {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
                </span>
                <span className="separator">•</span>
                <span 
                  className="status-badge"
                  style={{ backgroundColor: getStatusColor(ticket.status) }}
                >
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
          <div className="chat-header-right">
            {userType === 'agent' && (
              <div className="agent-selector">
                <label>Agent:</label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="Agent Name"
                  className="agent-input"
                />
              </div>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div className="chat-messages">
          {/* Original Ticket Message */}
          <div className="message customer-message">
            <div className="message-header">
              <span className="sender-name">{ticket.name}</span>
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

          {/* Real-time Messages */}
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`message ${msg.userType === 'customer' ? 'customer-message' : 'agent-message'} ${msg.isNew ? 'new-message' : ''}`}
            >
              <div className="message-header">
                <span className="sender-name">
                  {msg.userType === 'customer' 
                    ? (msg.customerName || ticket.name)
                    : (msg.agentName || 'Agent')
                  }
                </span>
                <span className="message-time">
                  {formatDate(msg.timestamp)}
                </span>
              </div>
              <div className="message-content">
                <div className="message-text">{msg.message}</div>
              </div>
            </div>
          ))}
          
          {/* Typing Indicator */}
          {typingUsers.length > 0 && (
            <div className="typing-indicator">
              <div className="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className="typing-text">
                {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
              </span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Input */}
        <div className="chat-input-container">
          <form onSubmit={handleSendMessage} className="chat-input-form">
            <div className="input-wrapper">
              <textarea
                value={newMessage}
                onChange={handleTyping}
                placeholder="Type your message..."
                className="chat-input"
                rows="3"
                disabled={sending || !isConnected}
              />
              <button 
                type="submit" 
                className="send-btn"
                disabled={sending || !newMessage.trim() || !isConnected}
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

export default RealTimeChat; 