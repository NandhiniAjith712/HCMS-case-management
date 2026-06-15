import React, { useState, useEffect, useRef } from 'react';
import { getAuthHeaders, getTenantId, fetchTicketReplySuggestions } from '../../utils/api';
import { formatDateIST, formatDateTimeIST, formatTimeIST } from '../../utils/dateTime';
import './TicketChat.css';

// Strip quoted/forwarded content from email body - keep only the user's reply
function stripQuotedDisplay(text) {
  if (!text || typeof text !== 'string') return text;
  // Match "On Mon, 9 Mar 2026..." or "ITSM Ticketing Support Team... wrote:" or similar
  const onWrote = text.search(/\s+On\s+[A-Za-z]{3},.+wrote:/i);
  if (onWrote > 0) return text.substring(0, onWrote).trim();
  const newlineOn = text.search(/\n\s*On\s+.+wrote:/i);
  if (newlineOn > 0) return text.substring(0, newlineOn).trim();
  const teamWrote = text.search(/\s+ITSM Ticketing Support Team[^>]*>?\s*wrote:/i);
  if (teamWrote > 0) return text.substring(0, teamWrote).trim();
  const fwd = text.search(/\n-{3,}\s*Forwarded message\s*-{3,}/i);
  if (fwd > 0) return text.substring(0, fwd).trim();
  // Remove common Gmail inline reply metadata at the end, e.g.
  // "On Mon, 20 Apr 2026, 11:29am Name, <email>"
  let cleaned = text;
  cleaned = cleaned.replace(/\s+On\s+[A-Za-z]{3},\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4},?\s+[\s\S]*?<[^>]+>\s*$/i, '').trim();
  // Also remove a trailing ", <email>" suffix if present.
  cleaned = cleaned.replace(/,\s*<[^>]+>\s*$/i, '').trim();

  // Clean regards, thanks, best regards, sincerely, etc. signatures from end of email
  const signatureRegex = /\n\s*(?:thanks|thank\s+you|regards|best\s+regards|warm\s+regards|kind\s+regards|sincerely|best|cheers|yours\s+sincerely|yours\s+faithfully|thanks\s*(?:&|and)\s*regards),?\s*[\r\n]+[\s\S]*$/i;
  cleaned = cleaned.replace(signatureRegex, '').trim();

  return cleaned;
}

/**
 * Parse email reply content that has "On date, time Sender Name, <email>" on one line.
 * Returns { line1, line2, line3 } for structured display, or null to show raw text.
 */
function formatEmailMessageLines(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  // Pattern: "message body" followed by " On <date>, <time> <Name>, <email>"
  const onMatch = trimmed.match(/\s+On\s+(.+),\s*<([^>]+)>$/);
  if (!onMatch) return null;
  const beforeOn = trimmed.slice(0, trimmed.length - onMatch[0].length).trim();
  const dateTimeAndName = onMatch[1].trim(); // e.g. "Wed, 18 Mar 2026, 12:49 pm Nandhini Ajith"
  const email = onMatch[2].trim();
  if (!beforeOn && !dateTimeAndName && !email) return null;
  return {
    line1: beforeOn || ' ',
    // Intentionally omit the metadata lines in UI (name/email/date) to keep chat clean.
    line2: '',
    line3: ''
  };
}

// Prevent duplicate rendering when websocket/fetch returns same message more than once
function mergeUniqueMessages(existing = [], incoming = []) {
  const byId = new Map();
  const seenFallback = new Set();
  const merged = [...existing, ...incoming];

  for (const msg of merged) {
    if (!msg) continue;
    if (msg.id != null) {
      // Prefer the latest copy for the same id
      byId.set(String(msg.id), msg);
      continue;
    }
    const fallbackKey = [
      msg.userType || '',
      msg.channel || '',
      (msg.message || '').trim(),
      msg.timestamp || ''
    ].join('::');
    if (seenFallback.has(fallbackKey)) continue;
    seenFallback.add(fallbackKey);
    byId.set(`fallback:${fallbackKey}`, msg);
  }

  return Array.from(byId.values()).sort((a, b) => {
    const ta = new Date(a?.timestamp || 0).getTime();
    const tb = new Date(b?.timestamp || 0).getTime();
    return ta - tb;
  });
}

function getQuickSmallTalkSuggestions(draft, role) {
  const t = String(draft || '').toLowerCase().trim().replace(/[.!?,]/g, '');
  if (!t) return null;
  const isCustomer = ['user', 'customer'].includes(String(role || '').toLowerCase());
  const userSet = {
    greeting: ['Hi, I need help with this ticket.', 'Hello, could you please check this issue?', 'Good day, I need an update on this ticket.'],
    thanks: ['Thank you for your support.', 'Thanks, I appreciate the quick update.', 'Thank you, this is helpful.'],
    ack: ['Okay, I will check and update.', 'Understood, I will try this and confirm.', 'Noted, I will get back to you shortly.'],
    bye: ['Thanks again, I will close this for now.', 'Okay, I will reconnect if needed.', 'Thank you. Have a good day.']
  };
  const staffSet = {
    greeting: ['Hello, how can I assist you today?', 'Hi, please share the issue details.', 'Hello, I am here to help with your ticket.'],
    thanks: ['You are welcome.', 'Glad to help.', 'Happy to assist.'],
    ack: ['Noted. We will proceed accordingly.', 'Understood. We are checking this now.', 'Okay. We will update you shortly.'],
    bye: ['Thank you. Reach out if you need further help.', 'Have a good day.', 'Closing this update for now.']
  };
  const set = isCustomer ? userSet : staffSet;
  if (/^(hi|hello|hey|hii|helo)\b/.test(t) || /\b(good morning|good afternoon|good evening)\b/.test(t)) return set.greeting;
  if (/\b(thanks|thank you|thankyou|thx|ty|welcome|you are welcome|happy to help|glad to help)\b/.test(t)) return set.thanks;
  if (/\b(ok|okay|kk|got it|gotcha|understood|alright|all right|noted|roger)\b/.test(t)) return set.ack;
  if (/\b(bye|goodbye|see you|cya|talk later)\b/.test(t)) return set.bye;
  return null;
}

const TicketChat = ({ ticket, onClose, onReplyAdded, onTicketUpdate, user = null, userType = 'agent', awsStyle = false, showChatButton = true }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const isManager = user && ['support_manager', 'manager', 'ceo'].includes(user.role);
  const canUseInternalNotes = userType === 'agent';
  const [agentName, setAgentName] = useState('');
  const [error, setError] = useState(null);
  const [replySuggestions, setReplySuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showChat, setShowChat] = useState(!showChatButton);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [maxReconnectAttempts] = useState(5);
  const getStaffLabel = (role, name) => {
    const clean = (name || '').trim() || 'Staff';
    const normalized = (role || '').toLowerCase();
    if (/^manager\s+/i.test(clean) || /^agent\s+/i.test(clean)) return clean;
    if (['support_manager', 'manager', 'ceo'].includes(normalized)) return `Manager ${clean}`;
    return `Agent ${clean}`;
  };

  
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const suggestionsDebounceRef = useRef(null);
  const suggestionsRequestSeqRef = useRef(0);
  
  const API_BASE = process.env.REACT_APP_API_URL || '/api';
  const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:5000/ws';

  useEffect(() => {
    if (ticket && (showChat || !showChatButton)) {
      fetchMessages();
      connectWebSocket();
    }

    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchMessages and connectWebSocket are stable
  }, [ticket, showChat, showChatButton]);

  // Handle showChatButton prop changes
  useEffect(() => {
    setShowChat(!showChatButton);
  }, [showChatButton]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Use logged-in agent's name when userType is agent
  useEffect(() => {
    if (userType === 'agent' && user) {
      setAgentName(getStaffLabel(user?.role, user.name || user.email || 'Agent'));
    }
  }, [user, userType]);

  const cleanup = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (suggestionsDebounceRef.current) {
      clearTimeout(suggestionsDebounceRef.current);
      suggestionsDebounceRef.current = null;
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Helper function to check if WebSocket is ready to send
  const isWebSocketReady = () => {
    return wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
  };

  const connectWebSocket = () => {
    try {
      console.log('🔌 Attempting WebSocket connection...');
      setError(null);
      
      wsRef.current = new WebSocket(WS_URL);
      
      wsRef.current.onopen = () => {
        console.log('🔌 WebSocket connected successfully');
        setIsConnected(true);
        setError(null);
        setReconnectAttempts(0);
        
        // Wait a moment to ensure connection is fully established
        setTimeout(() => {
          if (isWebSocketReady()) {
            // Join the ticket room
            try {
              const tenantId = ticket.tenant_id ?? getTenantId();
              wsRef.current.send(JSON.stringify({
                type: 'JOIN_TICKET',
                ticketId: ticket.id,
                userId: user?.id || null,
                userType: userType,
                tenantId
              }));
            } catch (error) {
              console.warn('⚠️ Failed to join ticket room:', error);
            }
          }
        }, 100);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        
        if (event.code !== 1000) { // Not a normal closure
          setError('Connection lost. Attempting to reconnect...');
          attemptReconnect();
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setIsConnected(false);
        setError('Connection error. Trying to reconnect...');
      };
    } catch (error) {
      console.error('❌ Failed to connect WebSocket:', error);
      setError('Failed to connect to chat server. Using fallback mode.');
      setIsConnected(false);
    }
  };

  const attemptReconnect = () => {
    if (reconnectAttempts < maxReconnectAttempts) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000); // Exponential backoff
      
      console.log(`🔄 Attempting reconnection ${reconnectAttempts + 1}/${maxReconnectAttempts} in ${delay}ms`);
      
      reconnectTimeoutRef.current = setTimeout(() => {
        setReconnectAttempts(prev => prev + 1);
        connectWebSocket();
      }, delay);
    } else {
      setError('Connection failed after multiple attempts. Using fallback mode.');
      setIsConnected(false);
    }
  };

  const handleWebSocketMessage = (data) => {
    console.log('📨 WebSocket message received:', data.type);
    
    switch (data.type) {
      case 'JOINED_ROOM':
        console.log('✅ Joined chat room:', data.message);
        setError(null);
        break;
        
      case 'NEW_MESSAGE':
        setMessages(prev => mergeUniqueMessages(prev, [{
          id: data.messageId || null,
          message: data.message,
          channel: data.channel || 'platform_chat',
          userType: data.userType,
          agentName: data.agentName,
          customerName: data.customerName,
          timestamp: data.timestamp,
          isNew: true
        }]));
        
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

      case 'TICKET_UPDATED':
        if (data.ticketId === ticket?.id && (data.priority || data.oldPriority)) {
          onTicketUpdate?.({ priority: data.priority, oldPriority: data.oldPriority });
        }
        break;

      case 'ERROR':
        console.error('❌ WebSocket error:', data.message);
        setError(data.message);
        break;
        
      default:
        console.log('📨 Unknown message type:', data.type);
    }
  };

  const fetchMessages = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/chat/messages/${ticket.id}`, {
        method: 'GET',
        headers: headers
      });
      const data = await response.json();
      
      if (data.success) {
        const formattedMessages = data.data.map(msg => {
          const rawMsg = msg.message || '';
          const cleanMsg = (msg.channel === 'email' ? stripQuotedDisplay(rawMsg) : rawMsg) || rawMsg;
          return {
            id: msg.id,
            message: cleanMsg,
            channel: msg.channel || 'platform_chat',
            userType: msg.sender_type,
            agentName: msg.sender_type === 'agent' ? msg.sender_name : null,
            senderRole: msg.sender_role || null,
            customerName: msg.sender_type === 'customer' ? msg.sender_name : null,
            timestamp: msg.created_at,
            isNew: false,
            isInternal: !!msg.is_internal
          };
        });
        
        setMessages(prev => mergeUniqueMessages([], mergeUniqueMessages(prev, formattedMessages)));
      } else {
        setError(data.message || 'Failed to fetch messages');
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      setError('Failed to load messages. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!newMessage.trim() || sending) return;
    
    const messageText = newMessage.trim();
    setNewMessage('');
    
    try {
      setSending(true);
      setError(null);
      
      // Staff internal notes use replies/dashboard API (staff-only, no customer notification)
      if (isInternalNote && canUseInternalNotes) {
        const headers = getAuthHeaders();
        const response = await fetch(`${API_BASE}/replies/dashboard`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ticket_id: ticket.id,
            message: messageText,
            is_internal: true
          })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Failed to add internal note');
        setMessages(prev => mergeUniqueMessages(prev, [{
          id: data.data.id,
          message: data.data.message,
          channel: data.data.channel || 'platform_chat',
          userType: 'agent',
          agentName: data.data.agent_name || agentName || user?.name || 'Agent',
          senderRole: user?.role || null,
          customerName: null,
          timestamp: data.data.sent_at || data.data.created_at,
          isNew: false,
          isInternal: true
        }]));
        setIsInternalNote(false);
        if (onReplyAdded) onReplyAdded();
        return;
      }
      
      if (isConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Send via WebSocket for real-time
        try {
          wsRef.current.send(JSON.stringify({
            type: 'SEND_MESSAGE',
            ticketId: ticket.id,
            message: messageText,
            userType: userType,
            agentName: userType === 'agent' ? (agentName || user?.name || user?.email || 'Agent') : null,
            customerName: userType === 'customer' ? (user?.name || user?.email) : null
          }));
        } catch (error) {
          console.warn('⚠️ WebSocket send failed, falling back to REST API:', error);
          // Fall through to REST API
          throw new Error('WebSocket send failed');
        }
      } else {
        // Fallback to REST API
        const headers = getAuthHeaders();
        const response = await fetch(`${API_BASE}/chat/messages`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            ticketId: ticket.id,
            senderType: userType,
            senderId: user?.id || null,
            senderName: userType === 'agent' ? (agentName || user?.name || user?.email || 'Agent') : (user?.name || user?.email),
            message: messageText
          })
        });
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.message || 'Failed to send message');
        }
        
        // Add message to local state
        setMessages(prev => mergeUniqueMessages(prev, [{
          id: data.data.id,
          message: data.data.message,
          channel: data.data.channel || 'platform_chat',
          userType: data.data.sender_type,
          agentName: data.data.sender_type === 'agent' ? data.data.sender_name : null,
          customerName: data.data.sender_type === 'customer' ? data.data.sender_name : null,
          timestamp: data.data.created_at,
          isNew: false,
          isInternal: !!data.data.is_internal
        }]));
      }
      
      if (onReplyAdded) {
        onReplyAdded();
      }
      setSuggestionsError('');
    } catch (error) {
      console.error('Error sending message:', error);
      setError(error.message || 'Failed to send message. Please try again.');
      // Restore the message if sending failed
      setNewMessage(messageText);
    } finally {
      setSending(false);
    }
  };

  const handleSuggestionClick = (text) => {
    setNewMessage(String(text || ''));
  };

  const handleTyping = (e) => {
    const value = e.target.value;
    setNewMessage(value);
    setSuggestionsError('');

    const draft = String(value || '').trim();
    if (suggestionsDebounceRef.current) {
      clearTimeout(suggestionsDebounceRef.current);
    }
    if (draft.length < 2 || !ticket?.id || sending) {
      setReplySuggestions([]);
      setSuggestionsLoading(false);
    } else {
      const quickSmallTalk = getQuickSmallTalkSuggestions(draft, user?.role);
      if (quickSmallTalk) {
        setReplySuggestions(quickSmallTalk.slice(0, 4));
        setSuggestionsLoading(false);
      } else {
      suggestionsDebounceRef.current = setTimeout(async () => {
        const reqId = suggestionsRequestSeqRef.current + 1;
        suggestionsRequestSeqRef.current = reqId;
        setSuggestionsLoading(true);
        try {
          const suggestions = await fetchTicketReplySuggestions(ticket.id, draft);
          if (suggestionsRequestSeqRef.current !== reqId) return;
          setReplySuggestions(Array.isArray(suggestions) ? suggestions.slice(0, 4) : []);
        } catch (_) {
          if (suggestionsRequestSeqRef.current !== reqId) return;
          setReplySuggestions([]);
        } finally {
          if (suggestionsRequestSeqRef.current === reqId) {
            setSuggestionsLoading(false);
          }
        }
      }, 420);
      }
    }
    
    // Only send typing indicators if WebSocket is fully connected
    if (isConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (!typingTimeoutRef.current) {
        try {
          wsRef.current.send(JSON.stringify({
            type: 'TYPING',
            ticketId: ticket.id,
            userType: userType,
            agentName: userType === 'agent' ? (agentName || user?.name || user?.email || 'Agent') : null,
            customerName: userType === 'customer' ? (user?.name || user?.email) : null
          }));
        } catch (error) {
          console.warn('⚠️ Failed to send typing indicator:', error);
        }
      }
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set new timeout
      typingTimeoutRef.current = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({
              type: 'STOP_TYPING',
              ticketId: ticket.id,
              userType: userType
            }));
          } catch (error) {
            console.warn('⚠️ Failed to send stop typing indicator:', error);
          }
        }
        typingTimeoutRef.current = null;
      }, 1000);
    }
  };

  const handleRetry = () => {
    setError(null);
    setReconnectAttempts(0);
    cleanup();
    fetchMessages();
    connectWebSocket();
  };

  const formatDate = (dateString) => {
    return formatDateTimeIST(dateString);
  };

  const formatDateTimeStamp = (dateString) => {
    const d = formatDateIST(dateString, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const t = formatTimeIST(dateString, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    return `${d} • ${t}`;
  };

  const formatDatePill = (dateString) => {
    return formatDateIST(dateString, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getDisplaySenderName = (msg) => {
    if (msg.userType === 'customer') {
      return msg.customerName || ticket.name || 'User';
    }
    const raw = (msg.agentName || 'Agent').trim();
    if (/^(agent|manager)\s+/i.test(raw)) return raw;
    // Backward compatibility for older messages that were saved without sender_role:
    // if the message sender name matches the currently logged-in manager, label it as Manager.
    if (!msg.senderRole && user && ['support_manager', 'manager', 'ceo'].includes((user.role || '').toLowerCase())) {
      const currentName = (user.name || '').trim().toLowerCase();
      if (currentName && raw.toLowerCase() === currentName) {
        return `Manager ${raw}`;
      }
    }
    return getStaffLabel(msg.senderRole, raw);
  };

  const openChat = () => {
    setShowChat(true);
  };

  if (!ticket) return null;
  
  return (
    <>
      {/* Chat Icon Button */}
      {showChatButton && (
        <button 
          className="chat-icon-btn"
          onClick={openChat}
          title="Open Chat"
        >
          💬
        </button>
      )}

      {/* Chat Window */}
      {(showChat || !showChatButton) && (
        <div className={`${showChatButton ? 'ticket-chat-overlay' : 'ticket-chat-inline'}`}>
          <div className="ticket-chat-container">
            {!awsStyle && (
              <div className="chat-status-bar">
                <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
                  {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
                </span>
                {wsRef.current && (
                  <span className="ws-state">
                    State: {wsRef.current.readyState === WebSocket.CONNECTING ? '🔄 Connecting' :
                           wsRef.current.readyState === WebSocket.OPEN ? '✅ Open' :
                           wsRef.current.readyState === WebSocket.CLOSING ? '🔄 Closing' : '❌ Closed'}
                  </span>
                )}
              </div>
            )}

            {/* Error Display */}
            {error && !awsStyle && (
              <div className="chat-error">
                <span className="error-icon">⚠️</span>
                <span className="error-message">{error}</span>
                <button 
                  className="retry-btn"
                  onClick={handleRetry}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Messages Area */}
            <div className={`chat-messages ${awsStyle ? 'chat-messages-modern' : ''}`}>
              {loading ? (
                <div className="loading-messages">
                  <div className="loading-spinner"></div>
                  <p>Loading conversation...</p>
                </div>
              ) : (
                <>
                  {awsStyle && (
                    <div className="chat-date-pill">{`Today, ${formatDatePill(ticket.created_at)}`}</div>
                  )}
                  {/* Original Ticket Message */}
                  <div className={`message customer-message ${awsStyle ? 'modern-style modern-left' : ''}`}>
                    {awsStyle ? (
                      // Modern bubble layout
                      <>
                        <div className="modern-avatar neutral">
                          {String(ticket.name || 'C').charAt(0).toUpperCase()}
                        </div>
                        <div className="modern-message-group">
                          <div className="modern-label">{ticket.name}</div>
                          <div className="modern-bubble customer">
                            <div className="message-text"><strong>Issue:</strong> {ticket.issue_title}</div>
                            <div className="message-text">
                              <strong>Type:</strong> {ticket.issue_type === 'Other' && ticket.issue_type_other
                                ? ticket.issue_type_other
                                : ticket.issue_type}
                            </div>
                            <div className="message-text"><strong>Description:</strong> {ticket.description}</div>
                            {ticket.product && <div className="message-text"><strong>Product:</strong> {ticket.product}</div>}
                            {ticket.module && <div className="message-text"><strong>Module:</strong> {ticket.module}</div>}
                          </div>
                          <div className="modern-time left">{formatTimeIST(ticket.created_at, { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </>
                    ) : (
                      // Original Layout
                      <>
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
                      </>
                    )}
                  </div>

                  {/* Chat Messages */}
                  {messages.map((msg) => {
                    const emailLines = msg.channel === 'email' ? formatEmailMessageLines(msg.message) : null;
                    if (msg.userType === 'system') {
                      return (
                        <div key={msg.id} className={`message system-message ${awsStyle ? 'modern-style' : ''}`}>
                          <div className="system-message-card">
                            <div className="system-message-text">{msg.message}</div>
                            <div className="system-message-time">
                              {formatTimeIST(msg.timestamp, { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                    <div
                      key={msg.id} 
                      className={`message ${msg.userType === 'customer' ? 'customer-message' : 'agent-message'} ${msg.isNew ? 'new-message' : ''} ${awsStyle ? `modern-style ${msg.userType === 'customer' ? 'modern-left' : 'modern-right'}` : ''}`}
                    >
                      {awsStyle ? (
                        // Modern bubble chat layout
                        <>
                          {msg.userType === 'customer' && (
                            <div className="modern-avatar neutral">
                              {String(msg.customerName || 'C').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="modern-message-group">
                            <div className={`modern-label ${msg.userType !== 'customer' ? 'right' : ''}`}>
                              {msg.userType === 'customer' ? (msg.customerName || ticket.name || 'Customer') : 'You'}
                              {!!msg.channel && (
                                <span className={`channel-badge channel-badge-${msg.channel}`} style={{ marginLeft: 8 }}>
                                  {msg.channel === 'email' ? 'Email' : msg.channel === 'whatsapp' ? 'WhatsApp' : 'App'}
                                </span>
                              )}
                              {!!msg.isInternal && (
                                <span className="channel-badge channel-badge-internal" style={{ marginLeft: 8 }} title="Internal note - staff only">
                                  Internal
                                </span>
                              )}
                            </div>
                            <div className={`modern-bubble ${msg.userType === 'customer' ? 'customer' : 'agent'}`}>
                              {emailLines ? (
                                <div className="message-text-email-structured">
                                  <div className="email-line email-line-body">{emailLines.line1}</div>
                                  <div className="email-line email-line-meta">{emailLines.line2}</div>
                                  <div className="email-line email-line-email">{emailLines.line3}</div>
                                </div>
                              ) : (
                                msg.message
                              )}
                            </div>
                            <div className={`modern-time ${msg.userType === 'customer' ? 'left' : 'right'}`}>
                              {formatTimeIST(msg.timestamp, { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          {msg.userType !== 'customer' && (
                            <div className="modern-avatar agent">
                              {String(msg.agentName || 'A').charAt(0).toUpperCase()}
                            </div>
                          )}
                        </>
                      ) : (
                        // Original Layout - sender + channel badge left, date/time + message right
                        <>
                          <div className="message-header">
                            <span className="sender-name">
                              {getDisplaySenderName(msg)}
                              {msg.isInternal && (
                                <span className="channel-badge channel-badge-internal" title="Internal note - staff only">
                                  Internal
                                </span>
                              )}
                              {msg.channel && (
                                <span className={`channel-badge channel-badge-${msg.channel}`}>
                                  {msg.channel === 'email' ? 'Email' : msg.channel === 'whatsapp' ? 'WhatsApp' : 'App'}
                                </span>
                              )}
                            </span>
                            <span className="message-time message-time-right">
                              {formatDate(msg.timestamp)}
                            </span>
                          </div>
                          <div className="message-content">
                            <div className="message-text">
                              {emailLines ? (
                                <div className="message-text-email-structured">
                                  <div className="email-line email-line-body">{emailLines.line1}</div>
                                  <div className="email-line email-line-meta">{emailLines.line2}</div>
                                  <div className="email-line email-line-email">{emailLines.line3}</div>
                                </div>
                              ) : (
                                msg.message
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ); })}
                  
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Reply Input */}
            <div className={`chat-input-container ${awsStyle ? 'chat-input-container-modern' : ''}`}>
              <form onSubmit={handleSendMessage} className="chat-input-form">
                {canUseInternalNotes && (
                  <div className="internal-note-toggle" style={{ marginBottom: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={isInternalNote}
                        onChange={(e) => setIsInternalNote(e.target.checked)}
                      />
                      <span>Internal note (staff only, not visible to customer)</span>
                    </label>
                  </div>
                )}
                <div className={`input-wrapper ${awsStyle ? 'input-wrapper-modern' : ''}`}>
                  <textarea
                    value={newMessage}
                    onChange={handleTyping}
                    placeholder={isConnected ? "Type your message..." : "Connecting..."}
                    className={`chat-input ${awsStyle ? 'chat-input-modern' : ''}`}
                    rows="3"
                    disabled={sending}
                  />
                  <button 
                    type="submit" 
                    className={`send-btn ${awsStyle ? 'send-btn-modern' : ''}`}
                    disabled={sending || !newMessage.trim()}
                  >
                    {sending ? '...' : (awsStyle ? '➤' : 'Send')}
                  </button>
                </div>
                {!!suggestionsError && (
                  <div className="suggestions-error-text">{suggestionsError}</div>
                )}
                {suggestionsLoading && (
                  <div className="suggestions-loading-text">Generating...</div>
                )}
                {replySuggestions.length > 0 && (
                  <div className="reply-suggestions-row">
                    {replySuggestions.map((suggestion, index) => (
                      <button
                        type="button"
                        key={`reply-suggestion-${index}`}
                        className="reply-suggestion-chip"
                        onClick={() => handleSuggestionClick(suggestion)}
                        title="Click to fill message box"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TicketChat; 